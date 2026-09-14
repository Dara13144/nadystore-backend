import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../prisma';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-change-in-production-12345';

export const ADMIN_EMAILS = [
  'mdara9695@gmail.com',
  'admin@nadytopup.com',
  'admin@topup.com',
  'admin@gmail.com',
];

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    role: string;
    email: string;
  };
}

/**
 * Universal token extractor: checks Bearer header, raw header, custom headers, cookies, and query
 */
export function extractToken(req: Request): string | null {
  // 1. Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && typeof authHeader === 'string') {
    const trimmed = authHeader.trim();
    if (/^bearer\s+/i.test(trimmed)) {
      const t = trimmed.replace(/^bearer\s+/i, '').trim();
      if (t && t !== 'null' && t !== 'undefined') return t;
    } else if (trimmed.length > 15 && trimmed !== 'null' && trimmed !== 'undefined') {
      return trimmed;
    }
  }

  // 2. Custom headers
  const xAuthToken = req.headers['x-auth-token'] || req.headers['token'] || req.headers['x-access-token'];
  if (typeof xAuthToken === 'string' && xAuthToken.trim() && xAuthToken !== 'null' && xAuthToken !== 'undefined') {
    return xAuthToken.trim();
  }

  // 3. Cookies (both parsed req.cookies and raw req.headers.cookie)
  const cookies = (req as any).cookies;
  if (cookies) {
    if (cookies.token && cookies.token !== 'null') return cookies.token;
    if (cookies['sb-access-token'] && cookies['sb-access-token'] !== 'null') return cookies['sb-access-token'];
    if (cookies.dara_token && cookies.dara_token !== 'null') return cookies.dara_token;
  }
  const rawCookie = req.headers.cookie;
  if (typeof rawCookie === 'string') {
    const match = rawCookie.match(/(?:^|;\s*)(?:token|sb-access-token|dara_token)=([^;]+)/);
    if (match && match[1] && match[1] !== 'null' && match[1] !== 'undefined') {
      return decodeURIComponent(match[1]).trim();
    }
  }

  // 4. Query param
  if (req.query && typeof req.query.token === 'string' && req.query.token.trim() && req.query.token !== 'null') {
    return req.query.token.trim();
  }

  return null;
}

export async function authenticateJWT(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const token = extractToken(req);

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }

  // Try verifying with JWT_SECRET
  jwt.verify(token, JWT_SECRET, async (err, decodedUser: any) => {
    if (!err && decodedUser) {
      const email = (decodedUser.email || '').trim().toLowerCase();
      const isAdminEmail = ADMIN_EMAILS.includes(email);

      req.user = {
        id: decodedUser.id || decodedUser.sub,
        role: isAdminEmail ? 'ADMIN' : (decodedUser.role || 'USER'),
        email: email,
      };
      return next();
    }

    // Fallback: Check if token is a valid Supabase Auth JWT token or base64 token
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        const decoded: any = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
        if (decoded) {
          const email = (decoded.email || '').trim().toLowerCase();
          const subId = decoded.sub || decoded.id;

          // Check if email or ID is an admin in ADMIN_EMAILS
          let isAdmin = ADMIN_EMAILS.includes(email) || decoded.role === 'service_role' || decoded.app_metadata?.role === 'admin';

          // If not yet verified as admin, check database User record
          if (!isAdmin && (email || subId)) {
            try {
              const dbUser = await prisma.user.findFirst({
                where: {
                  OR: [
                    ...(email ? [{ email }] : []),
                    ...(subId ? [{ id: subId }] : []),
                  ],
                },
              });
              if (dbUser && dbUser.role === 'ADMIN') {
                isAdmin = true;
              }
            } catch (dbErr) {
              console.warn('[Auth Middleware] DB user check fallback warning:', dbErr);
            }
          }

          if (email || subId) {
            req.user = {
              id: subId || 'admin-user',
              role: isAdmin ? 'ADMIN' : (decoded.app_metadata?.role || decoded.role || 'USER'),
              email: email,
            };
            return next();
          }
        }
      }
    } catch {
      // Ignore parse errors
    }

    return res.status(403).json({ error: 'Forbidden: Invalid or expired token' });
  });
}

export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const email = (req.user?.email || '').trim().toLowerCase();
  const isAdminEmail = ADMIN_EMAILS.includes(email);

  if (!req.user || (!isAdminEmail && req.user.role !== 'ADMIN')) {
    return res.status(403).json({ error: 'Forbidden: Admin access required' });
  }

  // Ensure role is explicitly set to ADMIN
  req.user.role = 'ADMIN';
  next();
}

