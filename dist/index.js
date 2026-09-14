"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const helmet_1 = __importDefault(require("helmet"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
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
const packages_1 = __importDefault(require("./routes/packages"));
const orders_1 = __importDefault(require("./routes/orders"));
const admin_1 = __importDefault(require("./routes/admin"));
const payments_1 = __importDefault(require("./routes/payments"));
const webhook_1 = __importDefault(require("./routes/webhook"));
const security_1 = __importDefault(require("./routes/security"));
const contact_1 = __importDefault(require("./routes/contact"));
const securityMiddleware_1 = __importDefault(require("./middleware/securityMiddleware"));
const paymentVerification_1 = require("./utils/paymentVerification");
const startup_1 = require("./utils/startup");
const crypto_1 = __importDefault(require("crypto"));
const app = (0, express_1.default)();
const PORT = process.env.PORT || 5000;
// Disable server framework banner
app.disable('x-powered-by');
// ─── 1. Request ID Middleware ──────────────────────────────────────────────────
app.use((req, res, next) => {
    const incoming = req.headers['x-request-id'];
    const requestId = (typeof incoming === 'string' && incoming.trim()) ? incoming.trim() : crypto_1.default.randomUUID();
    req.id = requestId;
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
            console.log(`[HTTP] [${req.id}] ${req.method} ${reqPath} ${res.statusCode} (${duration}ms)`);
        }
    });
    next();
});
// ─── 4. Security Middleware (Helmet) ──────────────────────────────────────────
app.use((0, helmet_1.default)({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: false,
    xContentTypeOptions: true,
    xFrameOptions: { action: 'sameorigin' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    xXssProtection: true,
}));
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
].filter(Boolean);
const corsOptions = {
    origin: (origin, callback) => {
        // Allow non-browser callers (mobile apps, curl, server-to-server, webhooks)
        if (!origin)
            return callback(null, true);
        const isExplicitlyAllowed = allowedOrigins.includes(origin) ||
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
        // Allow the request to prevent browser "Failed to fetch" on custom domains/previews
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
app.use((0, cors_1.default)(corsOptions));
// Handle all OPTIONS preflight requests globally
app.options('*', (0, cors_1.default)(corsOptions));
// ─── 6. Body Parsing with Strict 1MB Limits ───────────────────────────────────
app.use(express_1.default.json({ limit: '1mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '1mb' }));
// ─── 7. Professional Anti-DDoS & WAF Protection System ────────────────────────
app.use(securityMiddleware_1.default);
// ─── Static Files ─────────────────────────────────────────────────────────────
app.use('/uploads', express_1.default.static(path_1.default.join(__dirname, '..', 'public', 'uploads')));
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
const healthHandler = async (req, res) => {
    let dbStatus = 'connected';
    try {
        // Quick DB ping to verify connectivity
        await prisma_1.default.$queryRaw `SELECT 1`;
    }
    catch (err) {
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
        await prisma_1.default.$queryRaw `SELECT 1`;
        res.status(200).json({
            database: 'connected',
            status: 'healthy',
            timestamp: new Date().toISOString(),
        });
    }
    catch (err) {
        console.error('[Health] DB health check failure:', err.message);
        res.status(500).json({
            database: 'disconnected',
            status: 'unhealthy',
            error: 'Database connection check failed',
        });
    }
});
// ─── Production Rate Limiters ──────────────────────────────────────────────────
const authLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // max 20 login/register attempts per 15 mins per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many authentication attempts from this IP. Please try again after 15 minutes.' },
});
const ordersLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 200, // accommodate busy shared carrier IPs
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1',
    message: { error: 'Order creation rate limit exceeded. Please wait a few minutes before trying again.' },
});
const paymentLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 60, // max 60 payment checks per 15 mins per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Payment verification rate limit exceeded. Please wait a moment.' },
});
const adminLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 250, // max 250 admin requests per 15 mins
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Admin API rate limit exceeded.' },
});
const generalApiLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 600, // max 600 catalog queries per 15 mins
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'API request rate limit exceeded. Please slow down.' },
});
// ─── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/auth', authLimiter, auth_1.default);
app.use('/api/products', generalApiLimiter, products_1.default);
app.use('/api/games', generalApiLimiter, products_1.default);
app.use('/api/packages', generalApiLimiter, packages_1.default);
app.use('/api/package', generalApiLimiter, packages_1.default);
app.use('/api/orders', ordersLimiter, orders_1.default);
app.use('/api/admin', adminLimiter, admin_1.default);
app.use('/api/contact', generalApiLimiter, contact_1.default);
app.use('/api/security', security_1.default);
app.use('/api/payments', paymentLimiter, payments_1.default);
app.use('/api/payment', paymentLimiter, payments_1.default);
// Payment webhooks bypass rate limits so provider callbacks are never dropped
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
// ─── 404 Catch-all (Safe, Non-Enumerating) ───────────────────────────────────
app.use((req, res) => {
    return res.status(404).json({
        success: false,
        message: 'Resource not found',
    });
});
// ─── Global Error Handler (Sanitized, Request ID Correlated) ──────────────────
app.use((err, req, res, next) => {
    const requestId = req.id || req.headers['x-request-id'] || 'N/A';
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
    if (sweepRunning)
        return;
    sweepRunning = true;
    try {
        await (0, paymentVerification_1.expireOldOrders)();
        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const pendingOrders = await prisma_1.default.order.findMany({
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
