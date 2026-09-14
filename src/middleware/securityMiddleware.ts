import { Request, Response, NextFunction } from 'express';
import securityEngine from '../security/securityEngine';

// Helper to extract true client IP
export function getClientIp(req: Request): string {
  const cfIp = req.headers['cf-connecting-ip'];
  if (typeof cfIp === 'string' && cfIp.trim()) return cfIp.trim();

  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    const first = forwarded.split(',')[0].trim();
    if (first) return first;
  }

  const remote = req.socket.remoteAddress || req.ip || '127.0.0.1';
  // Strip IPv6 prefix if mapped IPv4
  if (remote.startsWith('::ffff:')) {
    return remote.replace('::ffff:', '');
  }
  return remote;
}

// Helper to parse specific cookie from cookie header
function getCookie(req: Request, name: string): string | undefined {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return undefined;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

export function securityMiddleware(req: Request, res: Response, next: NextFunction) {
  const reqPath = req.path || req.originalUrl || '/';

  // 1. Unconditional bypass for preflight OPTIONS, core health checks & challenge verification endpoints
  const isExcluded = 
    req.method === 'OPTIONS' ||
    reqPath === '/' ||
    reqPath === '/health' ||
    reqPath === '/healthy' ||
    reqPath === '/ping' ||
    reqPath === '/api' ||
    reqPath === '/api/health' ||
    reqPath === '/api/healthy' ||
    reqPath === '/api/ping' ||
    reqPath === '/api/db-health' ||
    reqPath.startsWith('/api/security/challenge') ||
    reqPath.startsWith('/images/') ||
    reqPath.startsWith('/uploads/') ||
    reqPath.includes('webhook'); // Never block payment gateway webhooks (ABA, Bakong, Cutluy)

  if (isExcluded) {
    return next();
  }

  const clientIp = getClientIp(req);
  const clearanceCookie = getCookie(req, 'dara_cf_clearance') || (req.headers['x-dara-clearance'] as string | undefined);
  const queryStr = req.url.includes('?') ? req.url.split('?')[1] : '';
  const userAgent = req.headers['user-agent'] || '';

  const inspection = securityEngine.inspectRequest({
    ip: clientIp,
    path: reqPath,
    method: req.method,
    query: queryStr,
    body: req.body,
    userAgent,
    clearanceCookie,
  });

  if (inspection.action === 'BLOCK') {
    if (inspection.retryAfter) {
      res.setHeader('Retry-After', String(inspection.retryAfter));
    }
    return res.status(inspection.status || 403).json({
      error: inspection.reason || 'Forbidden: Blocked by DARA Shield Security System',
      shield: 'DARA_SHIELD_DDOS_PROTECTION',
      retryAfter: inspection.retryAfter,
    });
  }

  if (inspection.action === 'RATE_LIMIT') {
    res.setHeader('Retry-After', String(inspection.retryAfter || 10));
    return res.status(429).json({
      error: inspection.reason || 'Too Many Requests: Rate limit exceeded. Please slow down.',
      shield: 'DARA_SHIELD_RATE_LIMIT',
      retryAfter: inspection.retryAfter || 10,
    });
  }

  if (inspection.action === 'CHALLENGE_REQUIRED') {
    return res.status(403).json({
      error: 'Emergency Under Attack Mode is currently active on DARA-TOPUP.',
      challengeRequired: true,
      shield: 'DARA_SHIELD_UNDER_ATTACK',
      ip: clientIp,
    });
  }

  // Permitted!
  next();
}

export default securityMiddleware;
