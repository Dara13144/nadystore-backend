import { Request, Response, NextFunction } from 'express';
import dns from 'dns';
import { promisify } from 'util';
import securityLogger from './securityLogger';

const dnsLookup = promisify(dns.lookup);

// ─── Private / Reserved IP Ranges (RFC 1918, loopback, link-local, etc.) ─────
const PRIVATE_IP_REGEXES = [
  /^127\./,                              // 127.0.0.0/8 — loopback
  /^10\./,                               // 10.0.0.0/8 — private
  /^192\.168\./,                         // 192.168.0.0/16 — private
  /^172\.(1[6-9]|2\d|3[01])\./,         // 172.16.0.0/12 — private
  /^169\.254\./,                         // 169.254.0.0/16 — APIPA / AWS metadata
  /^0\.0\.0\.0/,                         // 0.0.0.0 — unspecified
  /^::1$/,                               // IPv6 loopback
  /^fc[0-9a-f]{2}:/i,                   // IPv6 ULA
  /^fe80:/i,                             // IPv6 link-local
  /^fd[0-9a-f]{2}:/i,                   // IPv6 ULA range
  /^metadata\.google\.internal$/i,       // GCP metadata endpoint
];

/**
 * Returns true if the given hostname or resolved IP is a private/internal address.
 */
export function isPrivateIP(hostname: string): boolean {
  return PRIVATE_IP_REGEXES.some((re) => re.test(hostname));
}

/**
 * Validates a URL against an allowlist of domains AND blocks private IP ranges.
 * Resolves the hostname via DNS to guard against DNS rebinding attacks.
 */
export async function isAllowedUrl(url: string, allowedDomains: string[] = []): Promise<{ allowed: boolean; reason?: string }> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { allowed: false, reason: 'Invalid URL format' };
  }

  // Only allow HTTP and HTTPS
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { allowed: false, reason: `Protocol not allowed: ${parsed.protocol}` };
  }

  const hostname = parsed.hostname;

  // Reject immediately if hostname looks like a private IP
  if (isPrivateIP(hostname)) {
    return { allowed: false, reason: `Private/reserved hostname blocked: ${hostname}` };
  }

  // Resolve hostname to IP (DNS rebinding protection)
  try {
    const resolved = await dnsLookup(hostname);
    if (isPrivateIP(resolved.address)) {
      return { allowed: false, reason: `Hostname resolves to private IP: ${resolved.address}` };
    }
  } catch {
    return { allowed: false, reason: `DNS resolution failed for hostname: ${hostname}` };
  }

  // If an allowlist is provided, check against it
  if (allowedDomains.length > 0) {
    const isAllowed = allowedDomains.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
    );
    if (!isAllowed) {
      return { allowed: false, reason: `Hostname not in allowlist: ${hostname}` };
    }
  }

  return { allowed: true };
}

// ─── Trusted external domains for the provider proxy ─────────────────────────
const PROVIDER_ALLOWED_DOMAINS = [
  'vngzz2game.site',
  'www.vngzz2game.site',
  'oauth2.googleapis.com',
  'www.googleapis.com',
];

/**
 * Express middleware that validates the `url` field in req.body against SSRF rules.
 * Attaches the validation result to req for use in route handlers.
 */
export function ssrfGuard(allowedDomains: string[] = PROVIDER_ALLOWED_DOMAINS) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const targetUrl: string | undefined = req.body?.url || req.query?.url as string;

    if (!targetUrl) {
      return next(); // No URL to validate — let the route handle missing input
    }

    const check = await isAllowedUrl(targetUrl, allowedDomains);

    if (!check.allowed) {
      securityLogger.suspiciousActivity(req, 'SSRF_ATTEMPT', {
        targetUrl: targetUrl.substring(0, 200), // truncate for log safety
        reason: check.reason,
      });
      return res.status(403).json({
        success: false,
        error: 'Request to that URL is not permitted.',
        detail: check.reason,
      });
    }

    next();
  };
}

/**
 * Validate a provider API URL before making an outbound fetch.
 * Throws if SSRF check fails — for use inside route handlers.
 */
export async function assertSafeProviderUrl(url: string, req: Request): Promise<void> {
  const check = await isAllowedUrl(url, PROVIDER_ALLOWED_DOMAINS);
  if (!check.allowed) {
    securityLogger.suspiciousActivity(req, 'SSRF_ATTEMPT', {
      targetUrl: url.substring(0, 200),
      reason: check.reason,
    });
    throw new Error(`SSRF blocked: ${check.reason}`);
  }
}

export default ssrfGuard;
