import { Request } from 'express';
import { getClientIp } from './securityMiddleware';

// ─── Security Event Logger ────────────────────────────────────────────────────
// Implements OWASP A09: Security Logging & Monitoring Failures
// All events include: timestamp, IP, user-agent, user ID (when available)
// NEVER log passwords, tokens, or PII beyond email/userId

function formatEvent(level: 'INFO' | 'WARN' | 'ERROR', event: string, data: Record<string, any>): string {
  return `[SECURITY] [${level}] [${new Date().toISOString()}] ${event} ${JSON.stringify(data)}`;
}

export const securityLogger = {
  /**
   * Log a successful login
   */
  loginSuccess(req: Request, user: { id: string; email: string; role: string }) {
    const ip = getClientIp(req);
    console.info(formatEvent('INFO', 'LOGIN_SUCCESS', {
      userId: user.id,
      email: user.email,
      role: user.role,
      ip,
      userAgent: req.get('user-agent') || 'unknown',
      requestId: (req as any).id,
    }));
  },

  /**
   * Log a failed login attempt
   */
  loginFailure(req: Request, reason: string, email?: string) {
    const ip = getClientIp(req);
    console.warn(formatEvent('WARN', 'LOGIN_FAILURE', {
      email: email ? email.replace(/(?<=.{2}).(?=.*@)/g, '*') : 'unknown', // partial mask
      reason,
      ip,
      userAgent: req.get('user-agent') || 'unknown',
      requestId: (req as any).id,
    }));
  },

  /**
   * Log a registration event
   */
  registration(req: Request, user: { id: string; email: string; role: string }) {
    const ip = getClientIp(req);
    console.info(formatEvent('INFO', 'REGISTRATION', {
      userId: user.id,
      role: user.role,
      ip,
      userAgent: req.get('user-agent') || 'unknown',
      requestId: (req as any).id,
    }));
  },

  /**
   * Log an authorization / permission denied event
   */
  permissionDenied(req: Request, resource: string, action: string, userId?: string) {
    const ip = getClientIp(req);
    console.warn(formatEvent('WARN', 'PERMISSION_DENIED', {
      userId: userId || (req as any).user?.id || 'unauthenticated',
      ip,
      resource,
      action,
      path: req.originalUrl,
      method: req.method,
      requestId: (req as any).id,
    }));
  },

  /**
   * Log account lockout
   */
  accountLockout(req: Request, email: string, attempts: number) {
    const ip = getClientIp(req);
    console.error(formatEvent('ERROR', 'ACCOUNT_LOCKED', {
      email: email.replace(/(?<=.{2}).(?=.*@)/g, '*'),
      failedAttempts: attempts,
      ip,
      userAgent: req.get('user-agent') || 'unknown',
      requestId: (req as any).id,
    }));
  },

  /**
   * Log suspicious activity (rate limit breaches, token reuse, brute force, SSRF attempts)
   */
  suspiciousActivity(req: Request, type: string, details: Record<string, any>) {
    const ip = getClientIp(req);
    const payload = {
      type,
      ...details,
      ip,
      path: req.originalUrl,
      method: req.method,
      userAgent: req.get('user-agent') || 'unknown',
      requestId: (req as any).id,
    };
    console.error(formatEvent('ERROR', 'SUSPICIOUS_ACTIVITY', payload));

    // Threshold alerts: log to stderr with a distinct prefix for log-based alerting
    if (
      type === 'BRUTE_FORCE_DETECTED' ||
      type === 'ACCOUNT_LOCKED' ||
      type === 'SSRF_ATTEMPT' ||
      type === 'TOKEN_REUSE' ||
      type === 'PRICE_MANIPULATION'
    ) {
      console.error(`🚨 [ALERT] ${type} from ${ip} — ${JSON.stringify(details)}`);
    }
  },

  /**
   * Log password reset token generation
   */
  passwordResetRequested(req: Request, email: string) {
    const ip = getClientIp(req);
    console.info(formatEvent('INFO', 'PASSWORD_RESET_REQUESTED', {
      email: email.replace(/(?<=.{2}).(?=.*@)/g, '*'),
      ip,
      requestId: (req as any).id,
    }));
  },
};

export default securityLogger;
