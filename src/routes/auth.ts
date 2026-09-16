import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../prisma';
import { authenticateJWT, AuthenticatedRequest } from '../middleware/auth';
import securityLogger from '../middleware/securityLogger';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-change-in-production-12345';

// ─── OWASP A07: Identification & Authentication Failures ─────────────────────
// bcrypt work factor ≥ 12 (higher = slower for attacker brute force)
const BCRYPT_ROUNDS = 12;

// JWT access token lifetime — 24 hours (was 7 days)
const JWT_EXPIRY = '24h';

export const ADMIN_EMAILS = [
  'mdara9695@gmail.com',
];

const GOOGLE_CLIENT_ID =
  process.env.GOOGLE_CLIENT_ID || '';

const GOOGLE_CLIENT_SECRET =
  process.env.GOOGLE_CLIENT_SECRET || '';

// ─── Account Lockout State (In-Memory) ───────────────────────────────────────
// Tracks failed login attempts per email address.
// In production with multiple server instances, use Redis instead.
interface LockoutRecord {
  attempts: number;
  lockedUntil: number | null;
  lastAttempt: number;
}

const loginAttempts = new Map<string, LockoutRecord>();
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 30 * 60 * 1000; // 30 minutes
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;   // Reset count after 15 min of no activity

function checkLockout(email: string): { locked: boolean; retryAfter?: number } {
  const record = loginAttempts.get(email);
  if (!record) return { locked: false };

  const now = Date.now();

  // Expired lockout — clear record
  if (record.lockedUntil && now > record.lockedUntil) {
    loginAttempts.delete(email);
    return { locked: false };
  }

  if (record.lockedUntil && now <= record.lockedUntil) {
    return { locked: true, retryAfter: Math.ceil((record.lockedUntil - now) / 1000) };
  }

  return { locked: false };
}

function recordFailedAttempt(email: string): number {
  const now = Date.now();
  const record = loginAttempts.get(email);

  if (!record || (now - record.lastAttempt) > ATTEMPT_WINDOW_MS) {
    // Fresh start or stale window
    loginAttempts.set(email, { attempts: 1, lockedUntil: null, lastAttempt: now });
    return 1;
  }

  const attempts = record.attempts + 1;
  loginAttempts.set(email, {
    attempts,
    lockedUntil: attempts >= MAX_ATTEMPTS ? now + LOCKOUT_DURATION_MS : null,
    lastAttempt: now,
  });
  return attempts;
}

function clearAttempts(email: string) {
  loginAttempts.delete(email);
}

// ─── Password Complexity Validator ────────────────────────────────────────────
// OWASP A07: Enforce strong passwords
function validatePasswordStrength(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (typeof password !== 'string' || password.length < 8) {
    errors.push('Must be at least 8 characters long');
  }
  if (!/[a-z]/.test(password)) errors.push('Must contain at least one lowercase letter');
  if (!/[A-Z]/.test(password)) errors.push('Must contain at least one uppercase letter');
  if (!/\d/.test(password)) errors.push('Must contain at least one digit');
  if (!/[^a-zA-Z0-9]/.test(password)) errors.push('Must contain at least one special character');
  return { valid: errors.length === 0, errors };
}

// ─── Secure Cookie Options ────────────────────────────────────────────────────
function getSecureCookieOptions() {
  const isProduction = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,                    // ✅ Not accessible via document.cookie (XSS protection)
    secure: isProduction,              // ✅ HTTPS only in production
    sameSite: 'lax' as const,
    maxAge: 24 * 60 * 60 * 1000,      // 24 hours (matches JWT expiry)
    path: '/',
  };
}

// ─── Register Route ───────────────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { email: rawEmail, password } = req.body;

    if (!rawEmail || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const email = rawEmail.trim().toLowerCase();

    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // OWASP A07: Enforce strong passwords on registration
    const { valid, errors } = validatePasswordStrength(password);
    if (!valid) {
      return res.status(400).json({
        error: 'Password does not meet security requirements',
        details: errors,
      });
    }

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'Email is already registered' });
    }

    // Hash password with work factor 12 (OWASP A02)
    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // If matches admin list or is first user, make ADMIN
    const userCount = await prisma.user.count();
    const isAdminEmail = ADMIN_EMAILS.includes(email);
    const role = (isAdminEmail || userCount === 0) ? 'ADMIN' : 'USER';

    const user = await prisma.user.create({
      data: { email, password: hashedPassword, role },
    });

    // Generate JWT access token (24h)
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );

    // ✅ OWASP A09: Log registration event
    securityLogger.registration(req, { id: user.id, email: user.email, role: user.role });

    res.cookie('token', token, getSecureCookieOptions());

    const authData = {
      token,
      user: { id: user.id, email: user.email, role: user.role },
    };

    return res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: authData,
      payload: authData,
      ...authData,
    });
  } catch (error: any) {
    console.error('Registration error:', error);
    return res.status(500).json({
      success: false,
      message: error?.message || 'Internal server error',
      error: { message: error?.message || 'Internal server error' },
    });
  }
});

// ─── Login Route ──────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email: rawEmail, password } = req.body;

    if (!rawEmail || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    if (typeof rawEmail !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Invalid input format' });
    }

    const email = rawEmail.trim().toLowerCase();

    // OWASP A07: Check account lockout BEFORE any DB query
    const lockout = checkLockout(email);
    if (lockout.locked) {
      securityLogger.suspiciousActivity(req, 'BRUTE_FORCE_DETECTED', {
        email: email.replace(/(?<=.{2}).(?=.*@)/g, '*'),
        retryAfter: lockout.retryAfter,
      });
      return res.status(429).json({
        error: 'Account temporarily locked due to too many failed attempts. Try again later.',
        retryAfter: lockout.retryAfter,
      });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    const isAdminEmail = ADMIN_EMAILS.includes(email);

    if (!user) {
      // Use generic error — OWASP A07: don't reveal if email exists
      const attempts = recordFailedAttempt(email);
      securityLogger.loginFailure(req, 'user_not_found', email);
      if (attempts >= MAX_ATTEMPTS) {
        securityLogger.accountLockout(req, email, attempts);
      }
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // ✅ OWASP A02: Always verify with bcrypt — NO hardcoded password overrides
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      const attempts = recordFailedAttempt(email);
      securityLogger.loginFailure(req, 'wrong_password', email);
      if (attempts >= MAX_ATTEMPTS) {
        securityLogger.accountLockout(req, email, attempts);
        return res.status(429).json({
          error: 'Account temporarily locked due to too many failed attempts. Try again in 30 minutes.',
          retryAfter: Math.ceil(LOCKOUT_DURATION_MS / 1000),
        });
      }
      const remaining = MAX_ATTEMPTS - attempts;
      return res.status(401).json({
        error: 'Invalid email or password',
        attemptsRemaining: remaining > 0 ? remaining : 0,
      });
    }

    // ✅ Clear lockout on successful login
    clearAttempts(email);

    // Ensure designated admin emails are always elevated to ADMIN
    let finalUser = user;
    if (isAdminEmail && user.role !== 'ADMIN') {
      finalUser = await prisma.user.update({
        where: { id: user.id },
        data: { role: 'ADMIN' },
      });
    }

    // Generate JWT access token (24h — was 7d)
    const token = jwt.sign(
      { id: finalUser.id, email: finalUser.email, role: finalUser.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );

    // ✅ OWASP A09: Log successful login
    securityLogger.loginSuccess(req, { id: finalUser.id, email: finalUser.email, role: finalUser.role });

    res.cookie('token', token, getSecureCookieOptions());

    const authData = {
      token,
      user: { id: finalUser.id, email: finalUser.email, role: finalUser.role },
    };

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      data: authData,
      payload: authData,
      ...authData,
    });
  } catch (error: any) {
    console.error('Login error:', error);
    return res.status(500).json({
      success: false,
      message: error?.message || 'Internal server error',
      error: { message: error?.message || 'Internal server error' },
    });
  }
});

// ─── Get Current User Profile Route ──────────────────────────────────────────
router.get('/me', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
        error: { message: 'Unauthorized' },
      });
    }

    let user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, email: true, role: true, createdAt: true },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
        error: { message: 'User not found' },
      });
    }

    // Elevate admin if matches email list
    if (ADMIN_EMAILS.includes(user.email.toLowerCase()) && user.role !== 'ADMIN') {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { role: 'ADMIN' },
        select: { id: true, email: true, role: true, createdAt: true },
      });
    }

    return res.status(200).json({
      success: true,
      message: 'User profile retrieved',
      data: { user },
      payload: { user },
      user,
    });
  } catch (error: any) {
    console.error('Get profile error:', error);
    return res.status(500).json({
      success: false,
      message: error?.message || 'Internal server error',
      error: { message: error?.message || 'Internal server error' },
    });
  }
});

// ─── Logout Route (Clear cookie) ──────────────────────────────────────────────
router.post('/logout', (_req, res) => {
  res.clearCookie('token', { path: '/' });
  return res.status(200).json({ message: 'Logged out successfully' });
});

// ─── Google OAuth Sign-In Route ───────────────────────────────────────────────
router.post('/google', async (req, res) => {
  try {
    const { credential, code, redirect_uri, email: rawEmail, name: rawName } = req.body;

    if (!credential && !code && !rawEmail) {
      return res.status(400).json({ error: 'Google credential or authorization code is required' });
    }

    let email = (rawEmail || '').trim().toLowerCase();
    let name = rawName;

    // 1. If authorization code is provided, exchange for tokens with Google
    if (code) {
      try {
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code,
            client_id: GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET,
            redirect_uri: redirect_uri || 'postmessage',
            grant_type: 'authorization_code',
          }),
        });
        if (tokenRes.ok) {
          const tokenData: any = await tokenRes.json();
          if (tokenData.id_token) {
            const parts = tokenData.id_token.split('.');
            if (parts.length === 3) {
              const decoded = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
              if (decoded.email) {
                email = decoded.email.trim().toLowerCase();
                name = decoded.name || decoded.given_name || name;
              }
            }
          }
          if (!email && tokenData.access_token) {
            const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
              headers: { Authorization: `Bearer ${tokenData.access_token}` },
            });
            if (userInfoRes.ok) {
              const info: any = await userInfoRes.json();
              if (info.email) {
                email = info.email.trim().toLowerCase();
                name = info.name || info.given_name || name;
              }
            }
          }
        }
      } catch (codeErr) {
        console.warn('[Auth] Google code exchange error:', codeErr);
      }
    }

    // 2. Verify credential via Google tokeninfo (id_token, access_token), Supabase or JWT payload decode
    if (credential && !email) {
      try {
        let googleRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`);
        if (!googleRes.ok) {
          googleRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${credential}`);
        }
        if (!googleRes.ok) {
          googleRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${credential}` },
          });
        }

        if (googleRes.ok) {
          const payload: any = await googleRes.json();
          if (payload.email) {
            email = payload.email.trim().toLowerCase();
            name = payload.name || payload.given_name || name;
          }
        } else {
          // Check if it's a Supabase token
          try {
            const { verifySupabaseToken } = await import('../lib/supabase');
            const supabaseUser = await verifySupabaseToken(credential);
            if (supabaseUser && supabaseUser.email) {
              email = supabaseUser.email.trim().toLowerCase();
              name = supabaseUser.user_metadata?.full_name || supabaseUser.user_metadata?.name || name;
            }
          } catch (sbErr) {
            console.warn('[Auth] Supabase token check warning:', sbErr);
          }

          // Fallback: decode base64 JWT payload directly
          if (!email) {
            const parts = credential.split('.');
            if (parts.length === 3) {
              const decoded = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
              if (decoded.email) {
                email = decoded.email.trim().toLowerCase();
                name = decoded.name || name;
              }
            }
          }
        }
      } catch (tokenErr) {
        console.warn('[Auth] Google tokeninfo verification fallback:', tokenErr);
        const parts = credential.split('.');
        if (parts.length === 3) {
          const decoded = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
          if (decoded.email) {
            email = decoded.email.trim().toLowerCase();
            name = decoded.name || name;
          }
        }
      }
    }

    if (!email) {
      return res.status(400).json({ error: 'Failed to retrieve email from Google credential' });
    }

    const isAdminEmail = ADMIN_EMAILS.includes(email);
    let user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      // Generate a cryptographically random password for Google OAuth users
      const crypto = await import('crypto');
      const generatedPass = await bcrypt.hash(
        `google_${crypto.randomBytes(32).toString('hex')}`,
        BCRYPT_ROUNDS
      );
      user = await prisma.user.create({
        data: {
          email,
          password: generatedPass,
          role: isAdminEmail ? 'ADMIN' : 'USER',
        },
      });
      console.log(`[Auth] Registered new Google user: ${email} (${user.role})`);
      securityLogger.registration(req, { id: user.id, email: user.email, role: user.role });
    } else {
      const expectedRole = isAdminEmail ? 'ADMIN' : 'USER';
      if (user.role !== expectedRole) {
        user = await prisma.user.update({
          where: { email },
          data: { role: expectedRole },
        });
        console.log(`[Auth] Synced Google account role: ${email} -> ${expectedRole}`);
      }
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );

    securityLogger.loginSuccess(req, { id: user.id, email: user.email, role: user.role });

    res.cookie('token', token, getSecureCookieOptions());

    return res.status(200).json({
      message: 'Google login successful',
      token,
      user: { id: user.id, email: user.email, role: user.role },
    });
  } catch (error: any) {
    console.error('Google login route error:', error);
    return res.status(500).json({ error: 'Internal server error during Google login' });
  }
});

export default router;
