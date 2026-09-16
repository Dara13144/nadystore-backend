import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import multer from 'multer';
import prisma from './prisma';

// Load environmental variables FIRST — before any other imports
dotenv.config();

// Ensure DIRECT_URL is available for Prisma PostgreSQL pooling
if (!process.env.DIRECT_URL && process.env.DATABASE_URL) {
  process.env.DIRECT_URL = process.env.DATABASE_URL.replace('?pgbouncer=true', '').replace('&pgbouncer=true', '');
}

// Route Imports
import authRouter from './routes/auth';
import productsRouter from './routes/products';
import packagesRouter from './routes/packages';
import ordersRouter from './routes/orders';
import adminRouter from './routes/admin';
import paymentsRouter from './routes/payments';
import webhookRouter from './routes/webhook';
import securityRouter from './routes/security';
import contactRouter from './routes/contact';
import securityMiddleware from './middleware/securityMiddleware';
import { verifyAbaKhqrPayment, processVerifiedPayment, expireOldOrders } from './utils/paymentVerification';
import { runDatabaseStartup } from './utils/startup';
import { assertSafeProviderUrl } from './middleware/ssrfProtection';

import crypto from 'crypto';

const app = express();
const PORT = process.env.PORT || 5000;

// Disable server framework banner
app.disable('x-powered-by');

// ─── 1. Request ID Middleware ──────────────────────────────────────────────────
app.use((req, res, next) => {
  const incoming = req.headers['x-request-id'];
  const requestId = (typeof incoming === 'string' && incoming.trim()) ? incoming.trim() : crypto.randomUUID();
  (req as any).id = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
});

// ─── 2. HTTP Method Protection ────────────────────────────────────────────────
const ALLOWED_HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'];
app.use((req, res, next) => {
  if (!ALLOWED_HTTP_METHODS.includes(req.method)) {
    return res.status(405).json({
      success: false,
      message: `Method ${req.method} not allowed`,
    });
  }
  next();
});

// ─── 3. Sanitized Request Logging (Metadata Only, Never Bodies or Tokens) ─────
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const reqPath = req.originalUrl || req.url;
    if (!reqPath.startsWith('/uploads')) {
      console.log(`[HTTP] [${(req as any).id}] ${req.method} ${reqPath} ${res.statusCode} (${duration}ms)`);
    }
  });
  next();
});

// ─── 4. Security Middleware (Helmet + Headers) ────────────────────────────────
// Protect API headers without breaking local development with upgrade-insecure-requests
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false,
  hsts: process.env.NODE_ENV === 'production' ? {
    maxAge: 31536000,          // 1 year
    includeSubDomains: true,
    preload: true,
  } : false,
  xContentTypeOptions: true,
  xFrameOptions: { action: 'sameorigin' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  xXssProtection: true,
}));

// ─── HTTPS Redirect (Production only) ─────────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    const proto = req.header('x-forwarded-proto');
    if (proto && proto !== 'https') {
      return res.redirect(301, `https://${req.header('host')}${req.url}`);
    }
    next();
  });
}

// ─── 5. Robust CORS Configuration ─────────────────────────────────────────────
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5000',
  'http://localhost:5001',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5177',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5000',
  'http://127.0.0.1:5001',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5177',
  process.env.FRONTEND_URL,
  process.env.NEXT_PUBLIC_APP_URL,
].filter(Boolean) as string[];

const isProduction = process.env.NODE_ENV === 'production';

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Allow non-browser callers (mobile apps, curl, server-to-server, webhooks)
    if (!origin) return callback(null, true);

    const isExplicitlyAllowed =
      allowedOrigins.includes(origin) ||
      origin.startsWith('http://localhost:') ||
      origin === 'http://localhost' ||
      origin.startsWith('http://127.0.0.1:') ||
      origin === 'http://127.0.0.1' ||
      origin.endsWith('.vercel.app') ||
      origin.endsWith('.onrender.com') ||
      origin.endsWith('.pages.dev') ||
      origin.endsWith('.netlify.app');

    if (isExplicitlyAllowed) {
      return callback(null, true);
    }

    // OWASP A05: In production, reject unknown origins. In dev/staging, allow all.
    if (isProduction) {
      console.warn(`[CORS] Rejected unknown origin: ${origin}`);
      return callback(new Error(`CORS policy: origin not allowed — ${origin}`));
    }

    // Non-production: allow all (for previews, staging, etc.)
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'x-dara-clearance',
    'x-request-id',
    'Cache-Control',
    'Pragma'
  ],
  exposedHeaders: ['Content-Length', 'X-Request-Id', 'Retry-After'],
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));

// Handle all OPTIONS preflight requests globally
app.options('*', cors(corsOptions));

// ─── 6. Body Parsing with Strict 1MB Limits ───────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ─── 6b. Development API Request Debugging Middleware ─────────────────────────
const sanitizeLogData = (data: any): any => {
  if (!data || typeof data !== 'object') return data;
  if (Array.isArray(data)) return data.map(sanitizeLogData);
  const sensitiveKeys = ['password', 'currentpassword', 'newpassword', 'token', 'secret', 'jwt_secret', 'service_role_key', 'apikey', 'authorization', 'credential', 'privatekey', 'hash'];
  const sanitized: Record<string, any> = {};
  for (const [key, val] of Object.entries(data)) {
    if (sensitiveKeys.some((s) => key.toLowerCase().includes(s))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof val === 'object' && val !== null) {
      sanitized[key] = sanitizeLogData(val);
    } else {
      sanitized[key] = val;
    }
  }
  return sanitized;
};

if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    const reqPath = req.originalUrl || req.url;
    if (!reqPath.startsWith('/uploads') && req.method !== 'OPTIONS') {
      console.log('========== API REQUEST ==========');
      console.log('METHOD:', req.method);
      console.log('URL:', reqPath);
      if (req.body && Object.keys(req.body).length > 0) {
        console.log('BODY:', sanitizeLogData(req.body));
      }
      if (req.query && Object.keys(req.query).length > 0) {
        console.log('QUERY:', sanitizeLogData(req.query));
      }
      if (req.params && Object.keys(req.params).length > 0) {
        console.log('PARAMS:', sanitizeLogData(req.params));
      }
      console.log('=================================');
    }
    next();
  });
}

// ─── 7. Professional Anti-DDoS & WAF Protection System ────────────────────────
app.use(securityMiddleware);

// ─── Static Files ─────────────────────────────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, '..', 'public', 'uploads')));

// ─── Health & Root Routes ─────────────────────────────────────────────────────
const apiDirectory = {
  name: 'DaraTopup API Server',
  version: '1.0.2',
  endpoints: {
    health: [
      { method: 'GET', path: '/healthy', description: 'System health check' },
      { method: 'GET', path: '/health', description: 'System health check' },
      { method: 'GET', path: '/api/health', description: 'API health check' },
      { method: 'GET', path: '/api/db-health', description: 'Database connectivity test' },
    ],
    products: [
      { method: 'GET', path: '/api/products', description: 'List all available games and categories' },
      { method: 'GET', path: '/api/products/:slug', description: 'Get product packages and details by slug' },
    ],
    auth: [
      { method: 'POST', path: '/api/auth/register', description: 'Register new user account' },
      { method: 'POST', path: '/api/auth/login', description: 'User login (returns JWT token)' },
      { method: 'POST', path: '/api/auth/google', description: 'Google OAuth login / verification' },
      { method: 'GET', path: '/api/auth/me', description: 'Get current authenticated user profile' },
    ],
    orders: [
      { method: 'POST', path: '/api/orders', description: 'Create topup order and generate KHQR' },
      { method: 'GET', path: '/api/orders/:orderId', description: 'Get order details by order ID' },
      { method: 'GET', path: '/api/orders/status/:txnId', description: 'Check payment status by transaction ID' },
      { method: 'GET', path: '/api/orders/user/history', description: 'Get user order history (Authenticated)' },
    ],
    payments: [
      { method: 'POST', path: '/api/payments/verify-khqr', description: 'Verify Bakong KHQR transaction' },
      { method: 'POST', path: '/api/payments/aba/webhook', description: 'ABA PayWay payment webhook callback' },
    ],
    admin: [
      { method: 'GET', path: '/api/admin/dashboard', description: 'Admin statistics & sales overview' },
      { method: 'GET', path: '/api/admin/orders', description: 'List and filter all orders' },
      { method: 'POST', path: '/api/admin/upload-image', description: 'Upload game banners and icons' },
    ],
  },
};

const healthHandler = async (req: express.Request, res: express.Response) => {
  let dbStatus = 'connected';
  try {
    // Quick DB ping to verify connectivity
    await prisma.$queryRaw`SELECT 1`;
  } catch (err: any) {
    console.error('[Health] DB ping error:', err.message);
    dbStatus = 'disconnected';
  }

  return res.status(200).json({
    success: true,
    status: 'healthy',
    message: 'API is running',
    timestamp: new Date().toISOString(),
    sandbox: process.env.SANDBOX_MODE === 'true',
    db: dbStatus,
  });
};

app.get(['/', '/health', '/healthy', '/healthz', '/ping', '/api', '/api/health', '/api/healthy', '/api/healthz', '/api/ping'], healthHandler);

app.get('/api/db-health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({
      database: 'connected',
      status: 'healthy',
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('[Health] DB health check failure:', err.message);
    res.status(500).json({
      database: 'disconnected',
      status: 'unhealthy',
      error: 'Database connection check failed',
    });
  }
});

// ─── Production Rate Limiters ──────────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // max 20 login/register attempts per 15 mins per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts from this IP. Please try again after 15 minutes.' },
});

const ordersLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200, // accommodate busy shared carrier IPs
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1',
  message: { error: 'Order creation rate limit exceeded. Please wait a few minutes before trying again.' },
});

const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60, // max 60 payment checks per 15 mins per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Payment verification rate limit exceeded. Please wait a moment.' },
});

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 250, // max 250 admin requests per 15 mins
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Admin API rate limit exceeded.' },
});

const generalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600, // max 600 catalog queries per 15 mins
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'API request rate limit exceeded. Please slow down.' },
});

// ─── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/auth', authLimiter, authRouter);
app.use('/api/products', generalApiLimiter, productsRouter);
app.use('/api/games', generalApiLimiter, productsRouter);
app.use('/api/packages', generalApiLimiter, packagesRouter);
app.use('/api/package', generalApiLimiter, packagesRouter);
app.use('/api/orders', ordersLimiter, ordersRouter);
app.use('/api/admin', adminLimiter, adminRouter);
app.use('/api/contact', generalApiLimiter, contactRouter);
app.use('/api/security', securityRouter);
app.use('/api/payments', paymentLimiter, paymentsRouter);
app.use('/api/payment', paymentLimiter, paymentsRouter);

// Payment webhooks bypass rate limits so provider callbacks are never dropped
app.use('/api/webhook', webhookRouter);
app.use('/api/payments/webhook', webhookRouter);
app.use('/api/payment/webhook', webhookRouter);
app.use('/webhooks/cutluy', webhookRouter);
app.use('/api/webhooks/cutluy', webhookRouter);

// ─── VNGZZ2GAME Provider Routes (/api/v1/game/*, /api/v1/game2/*, /api/v2/game/*, /api/provider/*) ──
import {
  lookupPlayerNickname,
  deliverTopup,
  checkTopupOrderStatus,
  fetchProviderProfile,
  fetchProviderCategories,
  fetchProviderProducts,
  depositProviderBalance
} from './utils/gameProviderMock';

import { getDynamicApiKeySync, getDynamicStockBasesSync, getDynamicApiSettings } from './utils/apiConfig';

const getStockBases = (reqPath: string): string[] => {
  return getDynamicStockBasesSync(reqPath);
};

const getApiKey = (req: express.Request) => {
  const reqKey = (req.headers['x-api-key'] as string) || (req.headers['authorization'] as string)?.replace(/^Bearer\s+/i, '');
  if (reqKey && reqKey !== 'your-provider-api-key' && reqKey !== 'default') {
    return reqKey;
  }
  return getDynamicApiKeySync();
};

// 0. Root Gateway Info (/api/v2/game, /api/v1/game, /api/v1/game2, /api/provider)
app.get(
  ['/api/v2/game', '/api/v1/game', '/api/v1/game2', '/api/provider'],
  generalApiLimiter,
  async (req: express.Request, res: express.Response) => {
    const version = req.path.includes('v2') ? 'v2' : 'v1';
    const sub = req.path.includes('game2') ? 'game2' : 'game';
    return res.json({
      status: 'SUCCESS',
      gateway: `VngZz 2 Game API Gateway (${version.toUpperCase()})`,
      provider: 'https://www.vngzz2game.site',
      endpoints: {
        profile: `/api/${version}/${sub}/profile`,
        check_id: `/api/${version}/${sub}/check_id`,
        categories: `/api/${version}/${sub}/categories`,
        products: `/api/${version}/${sub}/products`,
        create_order: `/api/${version}/${sub}/create_order`,
        check_order: `/api/${version}/${sub}/check_order`,
        deposit: `/api/${version}/${sub}/deposit`,
      },
    });
  }
);

// 0.1 Public Active API Settings (For Frontend lookup & status)
app.get(
  '/api/settings/public',
  generalApiLimiter,
  async (_req: express.Request, res: express.Response) => {
    try {
      const s = await getDynamicApiSettings();
      return res.json({
        success: true,
        providerActiveUrl: s.providerActiveUrl,
        providerActiveStock: s.providerActiveStock,
        providerAutoDelivery: s.providerAutoDelivery,
        bakongMerchantName: s.bakongMerchantName,
        updatedAt: s.updatedAt,
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }
);

// 1. Profile (Check reseller balance & statistics)
app.get(
  ['/api/v1/game/profile', '/api/v1/game2/profile', '/api/v2/game/profile', '/api/provider/profile'],
  generalApiLimiter,
  async (req: express.Request, res: express.Response) => {
    const bases = getStockBases(req.originalUrl || req.path);
    const apiKey = getApiKey(req);
    for (const base of bases) {
      try {
        const upRes = await fetch(`${base}/profile`, {
          headers: { 'X-API-Key': apiKey, 'Accept': 'application/json' },
          signal: AbortSignal.timeout(6000),
        });
        if (upRes.ok) {
          const data: any = await upRes.json();
          if (data && data.status !== 404 && data.code !== 'NOT_FOUND') {
            return res.json(data);
          }
        }
      } catch (e: any) {
        console.warn('[Profile] Upstream direct error on', base, e.message);
      }
    }
    try {
      const data = await fetchProviderProfile();
      return res.status(data.status === 'FAILED' ? 503 : 200).json(data);
    } catch (err: any) {
      return res.status(503).json({ success: false, error: `Provider unreachable: ${err.message}` });
    }
  }
);

// 2. Validate Player ID (Check ID)
app.get(
  ['/api/v1/game/check_id', '/api/v1/game2/check_id', '/api/v2/game/check_id', '/api/provider/check-id'],
  generalApiLimiter,
  async (req: express.Request, res: express.Response) => {
    const game = ((req.query.game || req.query.game_code || '') as string).trim();
    const userid = ((req.query.id || req.query.userid || req.query.user_id || req.query.game_user_id || req.query.playerId || '') as string).trim();
    const serverid = ((req.query.zone_id || req.query.server_id || req.query.serverid || req.query.serverId || req.query.playerZoneId || '') as string).trim();

    if (!game || !userid) {
      return res.status(400).json({ success: false, status: 'FAILED', message: 'game and userid/id are required' });
    }

    const bases = getStockBases(req.originalUrl || req.path);
    const apiKey = getApiKey(req);

    // 1. Direct query to live upstream provider
    for (const stockBase of bases) {
      try {
        let upstreamUrl = `${stockBase}/check_id?game=${encodeURIComponent(game)}&game_code=${encodeURIComponent(game)}&userid=${encodeURIComponent(userid)}&game_user_id=${encodeURIComponent(userid)}&id=${encodeURIComponent(userid)}`;
        if (serverid) {
          upstreamUrl += `&zone_id=${encodeURIComponent(serverid)}&server_id=${encodeURIComponent(serverid)}&serverid=${encodeURIComponent(serverid)}`;
        }
        const upRes = await fetch(upstreamUrl, {
          headers: { 'X-API-Key': apiKey, 'Accept': 'application/json' },
          signal: AbortSignal.timeout(6000),
        });
        if (upRes.ok) {
          const data: any = await upRes.json();
          if (data && (data.status === 'APPROVED' || data.valid === true || data.username)) {
            return res.json(data);
          }
        }
      } catch (err: any) {
        console.warn('[Check ID] Upstream provider query note on', stockBase, err.message);
      }
    }

    // 2. Fallback to our robust multi-provider lookup
    try {
      const result = await lookupPlayerNickname(game, userid, serverid);
      if (result.success) {
        return res.json({
          status: 'APPROVED',
          valid: true,
          message: 'Player ID successfully verified',
          username: result.nickname,
          region: result.region || 'SG',
          game_title: game,
          level: result.level,
          playerId: result.playerId,
          playerZoneId: result.playerZoneId,
          avatarUrl: result.avatarUrl,
        });
      } else {
        return res.status(400).json({
          status: 'FAILED',
          valid: false,
          message: result.error || 'Player ID not found',
        });
      }
    } catch (err: any) {
      return res.status(503).json({ success: false, error: `Validation unreachable: ${err.message}` });
    }
  }
);

// 3. Categories (List of game categories)
app.get(
  ['/api/v1/game/categories', '/api/v1/game2/categories', '/api/v2/game/categories', '/api/provider/categories'],
  generalApiLimiter,
  async (req: express.Request, res: express.Response) => {
    const bases = getStockBases(req.originalUrl || req.path);
    const apiKey = getApiKey(req);
    for (const stockBase of bases) {
      try {
        const upRes = await fetch(`${stockBase}/categories`, {
          headers: { 'X-API-Key': apiKey, 'Accept': 'application/json' },
          signal: AbortSignal.timeout(6000),
        });
        if (upRes.ok) {
          const data: any = await upRes.json();
          if (data && data.status !== 404 && data.code !== 'NOT_FOUND') {
            return res.json(data);
          }
        }
      } catch (e: any) {}
    }
    try {
      const data = await fetchProviderCategories();
      return res.status(data.status === 'FAILED' ? 503 : 200).json(data);
    } catch (err: any) {
      return res.status(503).json({ success: false, error: `Categories unreachable: ${err.message}` });
    }
  }
);

// 4. Products (Packages & prices for a game)
app.get(
  ['/api/v1/game/products', '/api/v1/game2/products', '/api/v2/game/products', '/api/provider/products'],
  generalApiLimiter,
  async (req: express.Request, res: express.Response) => {
    const gameCode = ((req.query.game_code || req.query.game || '') as string).trim();
    if (!gameCode) {
      return res.status(400).json({ success: false, code: 'MISSING_FIELDS', message: 'game_code is required' });
    }
    const bases = getStockBases(req.originalUrl || req.path);
    const apiKey = getApiKey(req);
    for (const stockBase of bases) {
      try {
        const upRes = await fetch(`${stockBase}/products?game_code=${encodeURIComponent(gameCode)}`, {
          headers: { 'X-API-Key': apiKey, 'Accept': 'application/json' },
          signal: AbortSignal.timeout(6000),
        });
        if (upRes.ok) {
          const data: any = await upRes.json();
          if (data && data.status !== 404 && data.code !== 'NOT_FOUND') {
            return res.json(data);
          }
        }
      } catch (e: any) {}
    }
    try {
      const data = await fetchProviderProducts(gameCode);
      return res.status(data.status === 'FAILED' ? 503 : 200).json(data);
    } catch (err: any) {
      return res.status(503).json({ success: false, error: `Products unreachable: ${err.message}` });
    }
  }
);

// 5. Create Order (Place top-up)
app.post(
  ['/api/v1/game/create_order', '/api/v1/game2/create_order', '/api/v2/game/create_order', '/api/provider/create-order'],
  generalApiLimiter,
  async (req: express.Request, res: express.Response) => {
    const { product_code, game_user_id, server_id, zone_id, reference } = req.body || {};
    if (!product_code || !game_user_id || !reference) {
      return res.status(400).json({
        status: 'FAILED',
        code: 'MISSING_FIELDS',
        message: 'product_code, game_user_id, and reference are required',
      });
    }

    const bases = getStockBases(req.originalUrl || req.path);
    const apiKey = getApiKey(req);

    // Direct live upstream call to provider
    for (const stockBase of bases) {
      try {
        const payload: any = {
          product_code,
          game_user_id: String(game_user_id).trim(),
          reference: String(reference).trim(),
        };
        if (server_id || zone_id) {
          payload.server_id = String(server_id || zone_id).trim();
          payload.zone_id = String(server_id || zone_id).trim();
        }
        const upRes = await fetch(`${stockBase}/create_order`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': apiKey,
            'Accept': 'application/json',
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(10000),
        });
        const data = await upRes.json();
        if (upRes.status !== 404 && (data as any)?.code !== 'NOT_FOUND') {
          return res.status(upRes.status).json(data);
        }
      } catch (err: any) {
        console.warn('[Create Order] Upstream direct call note on', stockBase, err.message);
      }
    }

    // Fallback to deliverTopup
    try {
      const result = await deliverTopup(
        'direct',
        String(game_user_id).trim(),
        server_id || zone_id || null,
        product_code,
        0,
        reference,
        product_code
      );
      if (result.success) {
        return res.json({
          status: 'SUCCESS',
          message: 'Successful Orders',
          reference: result.referenceId || reference,
          amount: 0,
          balance_after: 0,
        });
      } else {
        return res.status(400).json({
          status: 'FAILED',
          message: result.error || 'Provider order placement failed',
          reference,
        });
      }
    } catch (err: any) {
      return res.status(503).json({ success: false, error: `Order delivery unreachable: ${err.message}` });
    }
  }
);

// 6. Check Order Status
app.get(
  ['/api/v1/game/check_order', '/api/v1/game2/check_order', '/api/v2/game/check_order', '/api/provider/check-order'],
  generalApiLimiter,
  async (req: express.Request, res: express.Response) => {
    const reference = ((req.query.reference || req.query.ref || '') as string).trim();
    if (!reference) {
      return res.status(400).json({ success: false, code: 'MISSING_FIELDS', message: 'reference is required' });
    }
    const bases = getStockBases(req.originalUrl || req.path);
    const apiKey = getApiKey(req);
    for (const stockBase of bases) {
      try {
        const upRes = await fetch(`${stockBase}/check_order?reference=${encodeURIComponent(reference)}`, {
          headers: { 'X-API-Key': apiKey, 'Accept': 'application/json' },
          signal: AbortSignal.timeout(6000),
        });
        const data: any = await upRes.json();
        if (upRes.ok) return res.json(data);
        if (upRes.status === 404 && data?.message && !data.message.includes('No route for')) {
          return res.status(404).json(data);
        }
      } catch (e: any) {}
    }
    try {
      const data = await checkTopupOrderStatus(reference);
      if (data) {
        return res.json(data);
      }
      return res.status(404).json({ success: false, message: 'Order reference not found on provider' });
    } catch (err: any) {
      return res.status(503).json({ success: false, error: `Order check unreachable: ${err.message}` });
    }
  }
);

// 7. Deposit Balance
app.post(
  ['/api/v1/game/deposit', '/api/v1/game2/deposit', '/api/v2/game/deposit', '/api/provider/deposit'],
  generalApiLimiter,
  async (req: express.Request, res: express.Response) => {
    const amount = Number(req.body?.amount);
    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, code: 'INVALID_AMOUNT', message: 'Please enter an amount greater than 0.' });
    }
    try {
      const data = await depositProviderBalance(amount, req.body?.currency || 'USD');
      return res.status(data.status === 'FAILED' ? 503 : 200).json(data);
    } catch (err: any) {
      return res.status(503).json({ success: false, error: `Deposit unreachable: ${err.message}` });
    }
  }
);

// Legacy proxy route for backward compatibility
app.get('/api/provider/orders', generalApiLimiter, async (_req: express.Request, res: express.Response) => {
  try {
    const data = await fetchProviderProfile();
    return res.status(200).json(data);
  } catch (err: any) {
    return res.status(503).json({ success: false, error: `Provider unreachable: ${err.message}` });
  }
});


// ─── Product Image Upload ─────────────────────────────────────────────────────
import { authenticateJWT, requireAdmin } from './middleware/auth';

const storage = multer.diskStorage({
  destination: path.join(__dirname, '..', 'public', 'uploads', 'products'),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/[^a-z0-9]/gi, '-').toLowerCase();
    cb(null, `${base}-${Date.now()}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

app.post(
  '/api/admin/upload-image',
  authenticateJWT,
  requireAdmin,
  upload.single('image'),
  (req: any, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    return res.status(200).json({ imageUrl: `/uploads/products/${req.file.filename}` });
  }
);

// ─── 404 Catch-all (Safe, Non-Enumerating) ───────────────────────────────────
app.use((req, res) => {
  return res.status(404).json({
    success: false,
    message: 'Resource not found',
  });
});

// ─── Global Error Handler (Sanitized, Request ID Correlated) ──────────────────
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  const requestId = (req as any).id || (req.headers['x-request-id'] as string) || 'N/A';
  console.error(`[Error] [${requestId}] ${err.constructor?.name || 'Server Error'}:`, err.message || err);

  if (res.headersSent) {
    return next(err);
  }

  const status = typeof err.status === 'number' ? err.status : (typeof err.statusCode === 'number' ? err.statusCode : 500);
  const isClientError = status >= 400 && status < 500;

  return res.status(status).json({
    success: false,
    message: isClientError ? (err.message || 'Bad request') : 'Internal server error',
    reference: requestId,
  });
});

// ─── BACKGROUND PAYMENT SWEEPER ───────────────────────────────────────────────
const SWEEP_INTERVAL_MS = 5_000; // 5 seconds continuous auto-check
let sweepRunning = false;

async function runPaymentSweep() {
  if (sweepRunning) return;
  sweepRunning = true;
  try {
    await expireOldOrders();

    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const pendingOrders = await prisma.order.findMany({
      where: {
        OR: [
          { status: 'PENDING' },
          { paymentStatus: 'PENDING' },
          { paymentStatus: 'UNPAID' },
        ],
        createdAt: { gte: cutoff },
      },
      include: { package: { include: { product: true } } },
    });

    if (pendingOrders.length > 0) {
      console.log(`[Sweeper] Checking ${pendingOrders.length} pending orders...`);
      for (const order of pendingOrders) {
        try {
          const isPaid = await verifyAbaKhqrPayment(order);
          if (isPaid) {
            console.log(`[Sweeper] ✅ Payment confirmed for ${order.paymentTxnId}`);
            await processVerifiedPayment(order, `SWEEP-${order.paymentMd5 || order.paymentTxnId}`);
          }
        } catch (err) {
          console.error(`[Sweeper] Error checking order ${order.paymentTxnId}:`, err);
        }
      }
    }
  } catch (err) {
    console.error('[Sweeper] Fatal sweep error:', err);
  } finally {
    sweepRunning = false;
  }
}

// ─── Start Server ─────────────────────────────────────────────────────────────
async function startServer() {
  console.log('===============================================');
  console.log('🚀 DaraTopup Backend starting...');
  console.log(`🛠️  Mode: ${process.env.SANDBOX_MODE === 'true' ? 'SANDBOX' : 'PRODUCTION'}`);
  console.log(`🗄️  DB: ${process.env.DATABASE_URL?.includes('postgresql') ? 'PostgreSQL' : 'SQLite (dev.db)'}`);
  console.log('===============================================');

  // Run DB migrations and auto-seed before serving traffic
  await runDatabaseStartup();

  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`\n✅ Server ready on 0.0.0.0:${PORT}`);
    console.log(`🌐 URL: ${process.env.BACKEND_URL || `http://localhost:${PORT}`}`);
    console.log(`🔗 API: ${process.env.BACKEND_URL || `http://localhost:${PORT}`}/api/products\n`);

    // Start background payment sweeper
    setInterval(runPaymentSweep, SWEEP_INTERVAL_MS);
    console.log(`🔄 Payment sweeper started — checking every ${SWEEP_INTERVAL_MS / 1000}s`);
  });
}

startServer().catch((err) => {
  console.error('❌ Fatal startup error:', err);
  process.exit(1);
});
