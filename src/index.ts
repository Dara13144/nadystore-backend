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

// ─── 4. Security Middleware (Helmet) ──────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false,
  xContentTypeOptions: true,
  xFrameOptions: { action: 'sameorigin' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  xXssProtection: true,
}));

// ─── 5. CORS Allowlist ────────────────────────────────────────────────────────
const allowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5001',
  'http://127.0.0.1:5001',
  process.env.FRONTEND_URL,
  process.env.NEXT_PUBLIC_APP_URL,
].filter(Boolean) as string[];

app.use(cors({
  origin: (origin, callback) => {
    // Allow non-browser callers (mobile apps, curl, server-to-server, webhooks)
    if (!origin) return callback(null, true);

    const isAllowed = allowedOrigins.includes(origin) ||
      origin.endsWith('.vercel.app') ||
      origin.includes('localhost') ||
      origin.includes('127.0.0.1');

    if (isAllowed) {
      return callback(null, true);
    }
    return callback(new Error(`CORS policy violation: Origin ${origin} not permitted.`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'x-dara-clearance', 'x-request-id'],
  exposedHeaders: ['Content-Length', 'X-Request-Id', 'Retry-After'],
  optionsSuccessStatus: 200,
}));

// Handle all OPTIONS preflight requests
app.options('*', cors());

// ─── 6. Body Parsing with Strict 1MB Limits ───────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

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
    status: 'healthy',
    message: 'DaraTopup Backend API Server is running successfully!',
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
  max: 50, // max 50 orders per 15 mins per IP
  standardHeaders: true,
  legacyHeaders: false,
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
const SWEEP_INTERVAL_MS = 30_000; // 30 seconds
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

  app.listen(PORT, () => {
    console.log(`\n✅ Server ready on port ${PORT}`);
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
