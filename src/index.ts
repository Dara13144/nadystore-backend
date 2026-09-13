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
import securityMiddleware from './middleware/securityMiddleware';
import { verifyAbaKhqrPayment, processVerifiedPayment, expireOldOrders } from './utils/paymentVerification';
import { runDatabaseStartup } from './utils/startup';

const app = express();
const PORT = process.env.PORT || 5000;

// ─── Security Middleware ───────────────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false,
}));

// ─── CORS ─────────────────────────────────────────────────────────────────────
app.use(cors({
  origin: (origin, callback) => {
    callback(null, true); // Allow all origins — works for Vercel, Render, and local dev
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Length', 'X-Request-Id'],
  optionsSuccessStatus: 200,
}));

// Handle all OPTIONS preflight requests
app.options('*', cors());

// ─── Body Parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── Professional Anti-DDoS & WAF Protection System ───────────────────────────
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
    dbStatus = 'error: ' + err.message;
  }

  return res.status(200).json({
    status: 'healthy',
    message: 'DaraTopup Backend API Server is running successfully!',
    timestamp: new Date().toISOString(),
    sandbox: process.env.SANDBOX_MODE === 'true',
    db: dbStatus,
    ...apiDirectory,
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
    res.status(500).json({
      database: 'disconnected',
      status: 'unhealthy',
      error: err.message,
    });
  }
});

// ─── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/auth', authRouter);
app.use('/api/products', productsRouter);
app.use('/api/packages', packagesRouter);
app.use('/api/package', packagesRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/admin', adminRouter);
app.use('/api/security', securityRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/payment', paymentsRouter);
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

// ─── 404 Catch-all ────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    error: `Route not found: ${req.method} ${req.path}`,
    availableRoutes: [
      'GET /',
      'GET /api/health',
      'GET /api/products',
      'GET /api/products/:slug',
      'POST /api/auth/login',
      'POST /api/auth/register',
      'POST /api/orders',
      'GET /api/orders/status/:txnId',
    ],
  });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[Error]', err.constructor?.name, '-', err.message);
  if (err.stack) console.error(err.stack.split('\n').slice(0, 5).join('\n'));
  res.status(500).json({
    error: 'Internal Server Error',
    ...(process.env.NODE_ENV !== 'production' && { details: err.message }),
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
      where: { paymentStatus: 'PENDING', createdAt: { gte: cutoff } },
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
