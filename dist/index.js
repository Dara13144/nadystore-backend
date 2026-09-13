"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const helmet_1 = __importDefault(require("helmet"));
const path_1 = __importDefault(require("path"));
const multer_1 = __importDefault(require("multer"));
const prisma_1 = __importDefault(require("./prisma"));
// Load environmental variables FIRST — before any other imports
dotenv_1.default.config();
// Ensure DIRECT_URL is available for Prisma PostgreSQL pooling
if (!process.env.DIRECT_URL && process.env.DATABASE_URL) {
    process.env.DIRECT_URL = process.env.DATABASE_URL.replace('?pgbouncer=true', '').replace('&pgbouncer=true', '');
}
// Route Imports
const auth_1 = __importDefault(require("./routes/auth"));
const products_1 = __importDefault(require("./routes/products"));
const orders_1 = __importDefault(require("./routes/orders"));
const admin_1 = __importDefault(require("./routes/admin"));
const payments_1 = __importDefault(require("./routes/payments"));
const webhook_1 = __importDefault(require("./routes/webhook"));
const security_1 = __importDefault(require("./routes/security"));
const securityMiddleware_1 = __importDefault(require("./middleware/securityMiddleware"));
const paymentVerification_1 = require("./utils/paymentVerification");
const startup_1 = require("./utils/startup");
const app = (0, express_1.default)();
const PORT = process.env.PORT || 5000;
// ─── Security Middleware ───────────────────────────────────────────────────────
app.use((0, helmet_1.default)({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: false,
}));
// ─── CORS ─────────────────────────────────────────────────────────────────────
app.use((0, cors_1.default)({
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
app.options('*', (0, cors_1.default)());
// ─── Body Parsing ─────────────────────────────────────────────────────────────
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
// ─── Professional Anti-DDoS & WAF Protection System ───────────────────────────
app.use(securityMiddleware_1.default);
// ─── Static Files ─────────────────────────────────────────────────────────────
app.use('/uploads', express_1.default.static(path_1.default.join(__dirname, '..', 'public', 'uploads')));
// ─── Health & Root Routes ─────────────────────────────────────────────────────
const healthHandler = async (req, res) => {
    try {
        // Quick DB ping to verify connectivity
        await prisma_1.default.$queryRaw `SELECT 1`;
        return res.status(200).json({
            status: 'healthy',
            message: 'DaraTopup Backend API Server is running successfully!',
            timestamp: new Date().toISOString(),
            sandbox: process.env.SANDBOX_MODE === 'true',
            db: 'connected',
            version: '1.0.2',
        });
    }
    catch (err) {
        return res.status(200).json({
            status: 'healthy',
            message: 'DaraTopup Backend API Server is running successfully!',
            timestamp: new Date().toISOString(),
            sandbox: process.env.SANDBOX_MODE === 'true',
            db: 'error: ' + err.message,
            version: '1.0.2',
        });
    }
};
app.get(['/', '/health', '/healthy', '/healthz', '/ping', '/api', '/api/health', '/api/healthy', '/api/healthz', '/api/ping'], healthHandler);
app.get('/api/db-health', async (req, res) => {
    try {
        await prisma_1.default.$queryRaw `SELECT 1`;
        res.status(200).json({
            database: 'connected',
        });
    }
    catch (err) {
        res.status(500).json({
            database: 'disconnected',
            error: err.message,
        });
    }
});
// ─── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/auth', auth_1.default);
app.use('/api/products', products_1.default);
app.use('/api/orders', orders_1.default);
app.use('/api/admin', admin_1.default);
app.use('/api/security', security_1.default);
app.use('/api/payments', payments_1.default);
app.use('/api/payment', payments_1.default);
app.use('/api/webhook', webhook_1.default);
app.use('/api/payments/webhook', webhook_1.default);
app.use('/api/payment/webhook', webhook_1.default);
app.use('/webhooks/cutluy', webhook_1.default);
app.use('/api/webhooks/cutluy', webhook_1.default);
// ─── Product Image Upload ─────────────────────────────────────────────────────
const auth_2 = require("./middleware/auth");
const storage = multer_1.default.diskStorage({
    destination: path_1.default.join(__dirname, '..', 'public', 'uploads', 'products'),
    filename: (_req, file, cb) => {
        const ext = path_1.default.extname(file.originalname);
        const base = path_1.default.basename(file.originalname, ext).replace(/[^a-z0-9]/gi, '-').toLowerCase();
        cb(null, `${base}-${Date.now()}${ext}`);
    },
});
const upload = (0, multer_1.default)({ storage, limits: { fileSize: 5 * 1024 * 1024 } });
app.post('/api/admin/upload-image', auth_2.authenticateJWT, auth_2.requireAdmin, upload.single('image'), (req, res) => {
    if (!req.file)
        return res.status(400).json({ error: 'No file uploaded' });
    return res.status(200).json({ imageUrl: `/uploads/products/${req.file.filename}` });
});
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
app.use((err, req, res, next) => {
    console.error('[Error]', err.constructor?.name, '-', err.message);
    if (err.stack)
        console.error(err.stack.split('\n').slice(0, 5).join('\n'));
    res.status(500).json({
        error: 'Internal Server Error',
        ...(process.env.NODE_ENV !== 'production' && { details: err.message }),
    });
});
// ─── BACKGROUND PAYMENT SWEEPER ───────────────────────────────────────────────
const SWEEP_INTERVAL_MS = 30_000; // 30 seconds
let sweepRunning = false;
async function runPaymentSweep() {
    if (sweepRunning)
        return;
    sweepRunning = true;
    try {
        await (0, paymentVerification_1.expireOldOrders)();
        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const pendingOrders = await prisma_1.default.order.findMany({
            where: { paymentStatus: 'PENDING', createdAt: { gte: cutoff } },
            include: { package: { include: { product: true } } },
        });
        if (pendingOrders.length > 0) {
            console.log(`[Sweeper] Checking ${pendingOrders.length} pending orders...`);
            for (const order of pendingOrders) {
                try {
                    const isPaid = await (0, paymentVerification_1.verifyAbaKhqrPayment)(order);
                    if (isPaid) {
                        console.log(`[Sweeper] ✅ Payment confirmed for ${order.paymentTxnId}`);
                        await (0, paymentVerification_1.processVerifiedPayment)(order, `SWEEP-${order.paymentMd5 || order.paymentTxnId}`);
                    }
                }
                catch (err) {
                    console.error(`[Sweeper] Error checking order ${order.paymentTxnId}:`, err);
                }
            }
        }
    }
    catch (err) {
        console.error('[Sweeper] Fatal sweep error:', err);
    }
    finally {
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
    await (0, startup_1.runDatabaseStartup)();
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
