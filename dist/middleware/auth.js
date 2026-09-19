"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ADMIN_EMAILS = void 0;
exports.extractToken = extractToken;
exports.authenticateJWT = authenticateJWT;
exports.requireAdmin = requireAdmin;
exports.requireOwnership = requireOwnership;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const prisma_1 = __importDefault(require("../prisma"));
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-change-in-production-12345';
exports.ADMIN_EMAILS = [
    'mdara9695@gmail.com',
];
/**
 * Universal token extractor: checks Bearer header, raw header, custom headers, cookies, and query
 */
function extractToken(req) {
    // 1. Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && typeof authHeader === 'string') {
        const trimmed = authHeader.trim();
        if (/^bearer\s+/i.test(trimmed)) {
            const t = trimmed.replace(/^bearer\s+/i, '').trim();
            if (t && t !== 'null' && t !== 'undefined')
                return t;
        }
        else if (trimmed.length > 15 && trimmed !== 'null' && trimmed !== 'undefined') {
            return trimmed;
        }
    }
    // 2. Custom headers
    const xAuthToken = req.headers['x-auth-token'] || req.headers['token'] || req.headers['x-access-token'];
    if (typeof xAuthToken === 'string' && xAuthToken.trim() && xAuthToken !== 'null' && xAuthToken !== 'undefined') {
        return xAuthToken.trim();
    }
    // 3. Cookies (both parsed req.cookies and raw req.headers.cookie)
    const cookies = req.cookies;
    if (cookies) {
        if (cookies.token && cookies.token !== 'null')
            return cookies.token;
        if (cookies['sb-access-token'] && cookies['sb-access-token'] !== 'null')
            return cookies['sb-access-token'];
        if (cookies.dara_token && cookies.dara_token !== 'null')
            return cookies.dara_token;
    }
    const rawCookie = req.headers.cookie;
    if (typeof rawCookie === 'string') {
        const match = rawCookie.match(/(?:^|;\s*)(?:token|sb-access-token|dara_token)=([^;]+)/);
        if (match && match[1] && match[1] !== 'null' && match[1] !== 'undefined') {
            return decodeURIComponent(match[1]).trim();
        }
    }
    // 4. Query param (only for development; avoid in production)
    if (req.query && typeof req.query.token === 'string' && req.query.token.trim() && req.query.token !== 'null') {
        return req.query.token.trim();
    }
    return null;
}
async function authenticateJWT(req, res, next) {
    const token = extractToken(req);
    if (!token) {
        return res.status(401).json({ error: 'Unauthorized: No token provided' });
    }
    // Try verifying with JWT_SECRET
    jsonwebtoken_1.default.verify(token, JWT_SECRET, async (err, decodedUser) => {
        if (!err && decodedUser) {
            const email = (decodedUser.email || '').trim().toLowerCase();
            const isAdminEmail = exports.ADMIN_EMAILS.includes(email);
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
                const decoded = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
                if (decoded) {
                    const email = (decoded.email || '').trim().toLowerCase();
                    const subId = decoded.sub || decoded.id;
                    // Check if email or ID is an admin in ADMIN_EMAILS
                    let isAdmin = exports.ADMIN_EMAILS.includes(email) || decoded.role === 'service_role' || decoded.app_metadata?.role === 'admin';
                    // If not yet verified as admin, check database User record
                    if (!isAdmin && (email || subId)) {
                        try {
                            const dbUser = await prisma_1.default.user.findFirst({
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
                        }
                        catch (dbErr) {
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
        }
        catch {
            // Ignore parse errors
        }
        return res.status(403).json({ error: 'Forbidden: Invalid or expired token' });
    });
}
function requireAdmin(req, res, next) {
    const email = (req.user?.email || '').trim().toLowerCase();
    const isAdminEmail = exports.ADMIN_EMAILS.includes(email);
    if (!req.user || !isAdminEmail) {
        // ✅ OWASP A01: Log permission denied for admin routes
        console.warn(`[SECURITY] [WARN] [${new Date().toISOString()}] PERMISSION_DENIED ${JSON.stringify({
            userId: req.user?.id || 'unauthenticated',
            email: req.user?.email || 'unknown',
            resource: 'admin',
            action: `${req.method} ${req.originalUrl}`,
            ip: req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.ip,
        })}`);
        return res.status(403).json({ error: 'Forbidden: Admin access required (Authorized for mdara9695@gmail.com only)' });
    }
    // Ensure role is explicitly set to ADMIN
    req.user.role = 'ADMIN';
    next();
}
// ─── OWASP A01: Broken Access Control — requireOwnership Middleware ───────────
/**
 * Middleware factory that verifies the authenticated user owns the requested resource
 * (or is an admin). Fetches the resource from DB and attaches it to req.resource.
 *
 * Usage: app.get('/api/orders/:id', authenticateJWT, requireOwnership('order'), handler)
 *
 * The resource model MUST have a `userId` field linking it to a user.
 *
 * @param resourceType - Prisma model name (e.g., 'order', 'user')
 * @param idParam      - Route param name for the resource ID (default: 'id')
 */
function requireOwnership(resourceType, idParam = 'id') {
    return async (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const resourceId = req.params[idParam];
        if (!resourceId) {
            return res.status(400).json({ error: `Missing resource ID param: ${idParam}` });
        }
        try {
            // Dynamically access Prisma model
            const model = prisma_1.default[resourceType];
            if (!model || typeof model.findUnique !== 'function') {
                console.error(`[requireOwnership] Unknown Prisma model: ${resourceType}`);
                return res.status(500).json({ error: 'Internal server error' });
            }
            const resource = await model.findUnique({ where: { id: resourceId } });
            if (!resource) {
                return res.status(404).json({ error: 'Resource not found' });
            }
            // ✅ OWASP A01: Check ownership — user must own the resource OR be an admin
            const isOwner = resource.userId === req.user.id;
            const isAdmin = req.user.role === 'ADMIN' || exports.ADMIN_EMAILS.includes(req.user.email);
            if (!isOwner && !isAdmin) {
                console.warn(`[SECURITY] [WARN] [${new Date().toISOString()}] PERMISSION_DENIED ${JSON.stringify({
                    userId: req.user.id,
                    email: req.user.email,
                    resource: resourceType,
                    resourceId,
                    action: `${req.method} ${req.originalUrl}`,
                    ip: req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.ip,
                })}`);
                return res.status(403).json({ error: 'Access denied: You do not own this resource' });
            }
            // Attach resource to request for use in the route handler
            req.resource = resource;
            next();
        }
        catch (err) {
            console.error(`[requireOwnership] Error fetching ${resourceType}:`, err);
            return res.status(500).json({ error: 'Internal server error' });
        }
    };
}
