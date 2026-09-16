"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = __importDefault(require("../prisma"));
const auth_1 = require("../middleware/auth");
const supabase_1 = require("../lib/supabase");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const multer_1 = __importDefault(require("multer"));
const router = (0, express_1.Router)();
const BACKUPS_DIR = path_1.default.join(process.cwd(), 'backups');
if (!fs_1.default.existsSync(BACKUPS_DIR)) {
    try {
        fs_1.default.mkdirSync(BACKUPS_DIR, { recursive: true });
    }
    catch (e) {
        console.error('Failed to create backups dir:', e);
    }
}
const UPLOADS_DIR = path_1.default.join(process.cwd(), 'public', 'uploads');
if (!fs_1.default.existsSync(UPLOADS_DIR)) {
    try {
        fs_1.default.mkdirSync(UPLOADS_DIR, { recursive: true });
    }
    catch (e) {
        console.error('Failed to create uploads dir:', e);
    }
}
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOADS_DIR);
    },
    filename: (req, file, cb) => {
        const ext = path_1.default.extname(file.originalname).toLowerCase() || '.png';
        const cleanName = path_1.default.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
        cb(null, `${cleanName}_${Date.now()}${ext}`);
    },
});
const upload = (0, multer_1.default)({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
        const allowed = /jpeg|jpg|png|webp|gif|svg\+xml|svg/i;
        const isMimeValid = allowed.test(file.mimetype);
        const isExtValid = allowed.test(path_1.default.extname(file.originalname).toLowerCase());
        if (isMimeValid || isExtValid) {
            return cb(null, true);
        }
        cb(new Error('Only image files (PNG, JPG, WEBP, SVG) are permitted'));
    },
});
// Apply auth + admin restriction to all paths in this router
router.use(auth_1.authenticateJWT, auth_1.requireAdmin);
// 0.1 Admin authoritative Products list (No-store, live from Supabase PostgreSQL)
router.get('/products', async (req, res) => {
    try {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');
        const products = await prisma_1.default.product.findMany({
            include: {
                packages: {
                    orderBy: { price: 'asc' },
                },
            },
            orderBy: { name: 'asc' },
        });
        return res.status(200).json(products);
    }
    catch (error) {
        console.error('Error fetching admin products:', error);
        return res.status(500).json({ error: 'Database error' });
    }
});
// 0.2 Admin authoritative Product delete (Cascades child records, verifies deletion, broadcasts Realtime)
router.delete('/products/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const product = await prisma_1.default.product.findFirst({
            where: { OR: [{ id }, { slug: id }] },
            include: { packages: true },
        });
        if (!product) {
            return res.status(404).json({ success: false, error: 'Product not found' });
        }
        const packageIds = product.packages.map((p) => p.id);
        if (packageIds.length > 0) {
            await prisma_1.default.stock.deleteMany({ where: { packageId: { in: packageIds } } });
            await prisma_1.default.order.deleteMany({ where: { packageId: { in: packageIds } } });
            await prisma_1.default.package.deleteMany({ where: { productId: product.id } });
        }
        await prisma_1.default.product.delete({ where: { id: product.id } });
        const remainingGame = await prisma_1.default.product.findUnique({
            where: { id: product.id },
            select: { id: true },
        });
        if (remainingGame) {
            return res.status(500).json({ success: false, error: 'Game still exists in database after delete' });
        }
        (0, supabase_1.broadcastRealtimeEvent)('products-catalog-realtime', 'PRODUCT_DELETED', {
            id: product.id,
            slug: product.slug,
        });
        return res.status(200).json({ success: true, message: 'Game deleted successfully', id: product.id });
    }
    catch (error) {
        console.error('Error deleting product in admin router:', error);
        return res.status(500).json({ success: false, error: 'Failed to delete product' });
    }
});
// 0.3 Image Upload Endpoint (Supports File and Base64 Uploads)
router.post('/upload-image', (req, res) => {
    upload.single('image')(req, res, (err) => {
        if (err) {
            console.error('Image upload error:', err);
            return res.status(400).json({ error: err.message || 'Image upload failed' });
        }
        if (req.file) {
            const publicUrl = `/uploads/${req.file.filename}`;
            console.log(`[Admin Dashboard] Uploaded new image file: ${publicUrl}`);
            return res.status(200).json({
                message: 'Image uploaded successfully',
                imageUrl: publicUrl,
                url: publicUrl,
                filename: req.file.filename,
            });
        }
        // Base64 image payload fallback
        if (req.body?.imageBase64) {
            try {
                const matches = req.body.imageBase64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
                if (matches && matches.length === 3) {
                    const ext = matches[1].split('/')[1] || 'png';
                    const filename = `uploaded_${Date.now()}.${ext}`;
                    const filePath = path_1.default.join(UPLOADS_DIR, filename);
                    fs_1.default.writeFileSync(filePath, Buffer.from(matches[2], 'base64'));
                    const publicUrl = `/uploads/${filename}`;
                    return res.status(200).json({
                        message: 'Image uploaded successfully',
                        imageUrl: publicUrl,
                        url: publicUrl,
                        filename,
                    });
                }
            }
            catch (base64Err) {
                console.error('Base64 upload error:', base64Err);
            }
        }
        return res.status(400).json({ error: 'No image file or imageBase64 payload provided' });
    });
});
// 1. Fetch dashboard metric figures
router.get('/stats', async (req, res) => {
    try {
        const totalOrdersCount = await prisma_1.default.order.count();
        const completedOrdersCount = await prisma_1.default.order.count({
            where: {
                OR: [
                    { status: { in: ['COMPLETED', 'SUCCESS', 'PAID'] } },
                    { paymentStatus: 'SUCCESS' },
                ]
            }
        });
        const pendingOrdersCount = await prisma_1.default.order.count({
            where: {
                status: { in: ['PENDING', 'PROCESSING', 'WAITING'] },
                paymentStatus: { notIn: ['SUCCESS', 'PAID', 'EXPIRED', 'FAILED'] }
            }
        });
        const failedOrdersCount = await prisma_1.default.order.count({
            where: { status: { in: ['FAILED', 'CANCELLED', 'EXPIRED'] } }
        });
        // Calculate sum of price for completed orders
        const revenueSum = await prisma_1.default.order.aggregate({
            where: {
                OR: [
                    { status: { in: ['COMPLETED', 'SUCCESS', 'PAID'] } },
                    { paymentStatus: 'SUCCESS' },
                ]
            },
            _sum: {
                price: true,
            },
        });
        // Recent orders
        const recentOrders = await prisma_1.default.order.findMany({
            take: 10,
            orderBy: { createdAt: 'desc' },
            include: {
                package: {
                    include: { product: true },
                },
                user: {
                    select: { id: true, email: true },
                },
            },
        });
        // Game popularity distribution (Completed order counts per game product)
        const productStats = await prisma_1.default.product.findMany({
            include: {
                packages: {
                    include: {
                        _count: {
                            select: {
                                orders: {
                                    where: {
                                        OR: [
                                            { status: { in: ['COMPLETED', 'SUCCESS', 'PAID'] } },
                                            { paymentStatus: 'SUCCESS' },
                                        ]
                                    }
                                }
                            },
                        },
                    },
                },
            },
        });
        const popMap = new Map();
        for (const prod of productStats) {
            let salesCount = 0;
            prod.packages.forEach((pkg) => {
                salesCount += pkg._count.orders;
            });
            const existing = popMap.get(prod.name);
            if (existing) {
                existing.salesCount += salesCount;
            }
            else {
                popMap.set(prod.name, { id: prod.id, name: prod.name, salesCount });
            }
        }
        const popularity = Array.from(popMap.values()).sort((a, b) => b.salesCount - a.salesCount);
        return res.status(200).json({
            metrics: {
                totalRevenue: revenueSum._sum.price || 0,
                totalOrders: totalOrdersCount,
                completedOrders: completedOrdersCount,
                pendingOrders: pendingOrdersCount,
                failedOrders: failedOrdersCount,
            },
            recentOrders,
            popularity,
        });
    }
    catch (error) {
        console.error('Admin metrics error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});
// 2. Fetch all orders (Paginated / Filterable)
router.get('/orders', async (req, res) => {
    try {
        const status = req.query.status;
        const search = req.query.search;
        const whereClause = {};
        if (status) {
            const upperStatus = status.toUpperCase();
            if (upperStatus === 'COMPLETED' || upperStatus === 'SUCCESS' || upperStatus === 'PAID') {
                whereClause.OR = [
                    { status: { in: ['COMPLETED', 'SUCCESS', 'PAID'] } },
                    { paymentStatus: 'SUCCESS' },
                ];
            }
            else if (upperStatus === 'PENDING') {
                whereClause.status = { in: ['PENDING', 'PROCESSING', 'WAITING'] };
            }
            else {
                whereClause.status = status;
            }
        }
        if (search) {
            whereClause.OR = [
                { playerId: { contains: search, mode: 'insensitive' } },
                { playerZoneId: { contains: search, mode: 'insensitive' } },
                { playerNickname: { contains: search, mode: 'insensitive' } },
                { paymentTxnId: { contains: search, mode: 'insensitive' } },
            ];
        }
        const orders = await prisma_1.default.order.findMany({
            where: whereClause,
            include: {
                package: {
                    include: { product: true },
                },
                user: {
                    select: { id: true, email: true },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
        return res.status(200).json(orders);
    }
    catch (error) {
        console.error('Admin fetch orders error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});
// 3. Manually edit order status (override for manual checks)
router.put('/orders/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { status, stockDeliveredCode } = req.body;
        if (!status) {
            return res.status(400).json({ error: 'Status is required' });
        }
        // Check if order exists
        const order = await prisma_1.default.order.findUnique({
            where: { id },
            include: { package: { include: { product: true } } },
        });
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }
        const previousStatus = order.status;
        // Save update
        const updatedOrder = await prisma_1.default.order.update({
            where: { id },
            data: {
                status,
                paymentStatus: (status === 'COMPLETED' || status === 'SUCCESS') ? 'PAID' : order.paymentStatus,
                stockDeliveredCode,
            },
        });
        console.log(`[Admin Override] Order ${order.paymentTxnId} status changed from ${previousStatus} to ${status}`);
        return res.status(200).json({
            message: 'Order updated successfully',
            order: updatedOrder,
        });
    }
    catch (error) {
        console.error('Admin update order error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});
// 3.1. Auto-verify all pending orders against payment gateways
router.post('/orders/auto-verify-all', async (req, res) => {
    try {
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
        let verifiedCount = 0;
        const { verifyAbaKhqrPayment, processVerifiedPayment } = await Promise.resolve().then(() => __importStar(require('../utils/paymentVerification')));
        for (const order of pendingOrders) {
            try {
                const isPaid = await verifyAbaKhqrPayment(order);
                if (isPaid) {
                    await processVerifiedPayment(order, `ADMIN-AUTO-${order.paymentMd5 || order.paymentTxnId}`);
                    verifiedCount++;
                }
            }
            catch (err) {
                console.error(`[Admin Auto-Verify] Error checking order ${order.paymentTxnId}:`, err);
            }
        }
        (0, supabase_1.broadcastRealtimeEvent)('orders-realtime', 'ORDERS_AUTO_VERIFIED', {
            totalChecked: pendingOrders.length,
            verifiedPaid: verifiedCount,
        });
        return res.status(200).json({
            success: true,
            message: `Auto-check completed: ${pendingOrders.length} pending orders checked, ${verifiedCount} paid orders automatically verified & fulfilled!`,
            totalChecked: pendingOrders.length,
            verifiedPaid: verifiedCount,
        });
    }
    catch (error) {
        console.error('Admin auto-verify-all error:', error);
        return res.status(500).json({ success: false, error: error.message || 'Auto-verify failed' });
    }
});
// 3.2. Auto-fulfill a specific order (instant delivery & settlement)
router.post('/orders/:id/auto-fulfill', async (req, res) => {
    try {
        const { id } = req.params;
        const order = await prisma_1.default.order.findFirst({
            where: { OR: [{ id }, { paymentTxnId: id }] },
            include: { package: { include: { product: true } } },
        });
        if (!order) {
            return res.status(404).json({ success: false, error: 'Order not found' });
        }
        const { processVerifiedPayment } = await Promise.resolve().then(() => __importStar(require('../utils/paymentVerification')));
        const result = await processVerifiedPayment(order, `ADMIN-AUTO-FULFILL-${Date.now()}`, { forceFulfill: true });
        (0, supabase_1.broadcastRealtimeEvent)('orders-realtime', 'ORDER_AUTO_FULFILLED', {
            id: order.id,
            paymentTxnId: order.paymentTxnId,
        });
        return res.status(200).json({
            success: true,
            message: `Order #${order.paymentTxnId.slice(0, 12)} auto-fulfilled and completed successfully!`,
            order: result.currentOrder,
            stockCode: result.deliveredCode,
        });
    }
    catch (error) {
        console.error('Admin auto-fulfill error:', error);
        return res.status(500).json({ success: false, error: error.message || 'Auto-fulfill failed' });
    }
});
// 4. Stock management: Get stock levels
router.get('/stock', async (req, res) => {
    try {
        const stocks = await prisma_1.default.stock.findMany({
            include: {
                package: {
                    include: { product: true },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
        // Summary statistics
        const totals = await prisma_1.default.stock.groupBy({
            by: ['packageId', 'isUsed'],
            _count: {
                id: true,
            },
        });
        return res.status(200).json({ stocks, summary: totals });
    }
    catch (error) {
        console.error('Admin get stock error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});
// 5. Stock management: Add digital voucher serial codes
router.post('/stock', async (req, res) => {
    try {
        const { packageId, codes } = req.body; // codes is string[] or a single comma-separated list string
        if (!packageId || !codes) {
            return res.status(400).json({ error: 'Package ID and codes list are required' });
        }
        let codeList = [];
        if (Array.isArray(codes)) {
            codeList = codes;
        }
        else if (typeof codes === 'string') {
            codeList = codes.split('\n').map((c) => c.trim()).filter((c) => c.length > 0);
        }
        if (codeList.length === 0) {
            return res.status(400).json({ error: 'No valid codes provided' });
        }
        const createdRecords = await Promise.all(codeList.map((code) => {
            return prisma_1.default.stock.create({
                data: {
                    packageId,
                    code,
                    isUsed: false,
                },
            });
        }));
        return res.status(201).json({
            message: `Successfully added ${createdRecords.length} codes to stock`,
            count: createdRecords.length,
        });
    }
    catch (error) {
        console.error('Admin add stock error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});
// 6. Product management: Add a new game product
router.post('/products', async (req, res) => {
    try {
        const { name, category, image, slug: customSlug, packages, autoSeedPackages, hasZoneId, zoneIdLabel } = req.body;
        if (!name || !category) {
            return res.status(400).json({ error: 'Product name and category are required' });
        }
        let baseSlug = (customSlug || name)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '');
        if (!baseSlug)
            baseSlug = `game-${Date.now()}`;
        // Check if slug exists, find unique slug if needed
        let finalSlug = baseSlug;
        let counter = 1;
        while (await prisma_1.default.product.findUnique({ where: { slug: finalSlug } })) {
            finalSlug = `${baseSlug}-${counter++}`;
        }
        const finalImage = image && image.trim() ? image.trim() : `/images/games/${finalSlug}.png`;
        const newProduct = await prisma_1.default.product.create({
            data: {
                name: name.trim(),
                slug: finalSlug,
                category: category.trim(),
                image: finalImage,
                isActive: true,
                hasZoneId: hasZoneId === true || hasZoneId === 'true',
                zoneIdLabel: zoneIdLabel ? String(zoneIdLabel).trim() : null,
            },
        });
        // Auto-create default packages if packages array not passed or empty
        const createdPackages = [];
        if (Array.isArray(packages) && packages.length > 0) {
            for (const p of packages) {
                const cp = await prisma_1.default.package.create({
                    data: {
                        productId: newProduct.id,
                        name: p.name || `${p.amount || 100} Diamonds`,
                        amount: parseInt(p.amount, 10) || 100,
                        price: parseFloat(p.price) || 0.99,
                        image: p.image || null,
                        category: p.category || 'NORMAL',
                        badge: p.badge || null,
                        isActive: true,
                    },
                });
                createdPackages.push(cp);
            }
        }
        else if (autoSeedPackages !== false) {
            // Auto-provision 6 high quality starter packages for seamless immediate topup functionality
            const defaultTiers = [
                { name: '50 Diamonds', amount: 50, price: 0.99, badge: null, category: 'NORMAL' },
                { name: '100+10 Diamonds', amount: 110, price: 1.99, badge: 'Popular', category: 'NORMAL' },
                { name: '250+25 Diamonds', amount: 275, price: 4.99, badge: 'Hot', category: 'NORMAL' },
                { name: '500+65 Diamonds', amount: 565, price: 9.99, badge: '🔥 Best Value', category: 'BEST_SELLER' },
                { name: '1000+150 Diamonds', amount: 1150, price: 19.99, badge: 'VIP Choice', category: 'BEST_SELLER' },
                { name: '2000+350 Diamonds', amount: 2350, price: 39.99, badge: 'Mega Saver', category: 'BEST_SELLER' },
            ];
            for (const tier of defaultTiers) {
                const cp = await prisma_1.default.package.create({
                    data: {
                        productId: newProduct.id,
                        name: tier.name,
                        amount: tier.amount,
                        price: tier.price,
                        badge: tier.badge,
                        category: tier.category,
                        isActive: true,
                    },
                });
                createdPackages.push(cp);
            }
        }
        const fullProduct = await prisma_1.default.product.findUnique({
            where: { id: newProduct.id },
            include: {
                packages: {
                    orderBy: { price: 'asc' },
                },
            },
        });
        // Realtime broadcast to Supabase
        (0, supabase_1.broadcastRealtimeEvent)('products-catalog-realtime', 'PRODUCT_CREATED', { product: fullProduct });
        console.log(`[Admin Dashboard] Product created: "${newProduct.name}" (Slug: ${finalSlug}, Packages: ${createdPackages.length})`);
        return res.status(201).json({
            message: 'Product created successfully',
            product: fullProduct,
        });
    }
    catch (error) {
        console.error('Admin add product error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});
// 7. Product management: Add a new package under a product
router.post('/products/:productId/packages', async (req, res) => {
    try {
        const { productId } = req.params;
        const { name, amount, price, category, badge, image } = req.body;
        if (!name || amount === undefined || price === undefined) {
            return res.status(400).json({ error: 'Name, amount and price are required' });
        }
        // Verify product exists by id or slug
        const product = await prisma_1.default.product.findFirst({
            where: {
                OR: [
                    { id: productId },
                    { slug: productId },
                    { name: { equals: productId, mode: 'insensitive' } },
                ],
            },
        });
        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }
        const newPackage = await prisma_1.default.package.create({
            data: {
                productId: product.id,
                name,
                amount: parseInt(amount, 10),
                price: parseFloat(price),
                image: image || null,
                isActive: true,
                category: category || 'NORMAL',
                badge: badge || null,
            },
        });
        // Realtime Supabase broadcast
        (0, supabase_1.broadcastRealtimeEvent)('products-catalog-realtime', 'PACKAGE_CREATED', { package: newPackage, productId });
        console.log(`[Admin Dashboard] Package created under ${product.name}: "${newPackage.name}" ($${newPackage.price})`);
        return res.status(201).json({
            message: 'Package created successfully',
            package: newPackage,
        });
    }
    catch (error) {
        console.error('Admin add package error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});
// 7b. Product management: Update any product field (Name, Category, Image, Status, Slug)
router.patch(['/products/:id', '/product/:id'], async (req, res) => {
    try {
        const { id } = req.params;
        const { image, name, category, isActive, slug, hasZoneId, zoneIdLabel } = req.body;
        let existingProduct = await prisma_1.default.product.findFirst({
            where: { OR: [{ id }, { slug: id }] },
        });
        const data = {};
        if (image !== undefined)
            data.image = image;
        if (name !== undefined)
            data.name = name;
        if (category !== undefined)
            data.category = category;
        if (isActive !== undefined)
            data.isActive = isActive;
        if (slug !== undefined)
            data.slug = slug;
        if (hasZoneId !== undefined)
            data.hasZoneId = hasZoneId === true || hasZoneId === 'true';
        if (zoneIdLabel !== undefined)
            data.zoneIdLabel = zoneIdLabel ? String(zoneIdLabel).trim() : null;
        let updated;
        if (existingProduct) {
            updated = await prisma_1.default.product.update({ where: { id: existingProduct.id }, data });
            console.log(`[Admin Dashboard] Updated product: ${updated.name} (${updated.id})`);
        }
        else {
            const newSlug = slug || (name ? name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') : `game-${Date.now()}`);
            updated = await prisma_1.default.product.create({
                data: {
                    name: name || 'New Game',
                    slug: newSlug,
                    category: category || 'MOBILE_GAME',
                    image: image || '/images/games/default.png',
                    isActive: isActive !== undefined ? isActive : true,
                    hasZoneId: hasZoneId === true || hasZoneId === 'true',
                    zoneIdLabel: zoneIdLabel ? String(zoneIdLabel).trim() : null,
                },
            });
            console.log(`[Admin Dashboard] Created missing product during update: ${updated.name}`);
        }
        (0, supabase_1.broadcastRealtimeEvent)('products-catalog-realtime', 'PRODUCT_UPDATED', { product: updated });
        return res.status(200).json({ message: 'Product updated successfully', product: updated });
    }
    catch (error) {
        console.error('Admin update product error:', error);
        return res.status(500).json({ error: 'Failed to update product' });
    }
});
// 7c. Package management: Update any package field (Name, Amount, Price, Category, Badge, Status, Image)
router.patch(['/packages/:id', '/package/:id'], async (req, res) => {
    try {
        const { id } = req.params;
        const { name, amount, price, category, badge, isActive, image, productId } = req.body;
        // 1. First attempt: Find by exact ID
        let existingPackage = await prisma_1.default.package.findUnique({
            where: { id },
        });
        // 2. Second attempt: Search by product + amount or name
        if (!existingPackage && productId) {
            existingPackage = await prisma_1.default.package.findFirst({
                where: {
                    productId,
                    OR: [
                        name ? { name: { equals: name, mode: 'insensitive' } } : {},
                        amount !== undefined ? { amount: parseInt(amount, 10) } : {},
                    ],
                },
            });
        }
        // 3. Third attempt: Search by name anywhere
        if (!existingPackage && name) {
            existingPackage = await prisma_1.default.package.findFirst({
                where: { name: { equals: name, mode: 'insensitive' } },
            });
        }
        const data = {};
        if (name !== undefined)
            data.name = name;
        if (amount !== undefined)
            data.amount = parseInt(amount, 10);
        if (price !== undefined)
            data.price = parseFloat(price);
        if (category !== undefined)
            data.category = category;
        if (badge !== undefined)
            data.badge = badge;
        if (isActive !== undefined)
            data.isActive = isActive;
        if (image !== undefined)
            data.image = image;
        let resultPackage;
        if (existingPackage) {
            resultPackage = await prisma_1.default.package.update({
                where: { id: existingPackage.id },
                data,
            });
            console.log(`[Admin Dashboard] Updated package: ${resultPackage.name} ($${resultPackage.price})`);
        }
        else {
            // Robust Product Resolution to guarantee Foreign Key validity
            let targetProduct = null;
            if (productId) {
                targetProduct = await prisma_1.default.product.findFirst({
                    where: {
                        OR: [
                            { id: productId },
                            { slug: productId },
                            { name: { equals: productId, mode: 'insensitive' } },
                        ],
                    },
                });
            }
            if (!targetProduct && id) {
                const parts = id.split('-');
                const possibleProductSlug = parts.length > 1 ? parts.slice(0, -1).join('-') : id;
                targetProduct = await prisma_1.default.product.findFirst({
                    where: {
                        OR: [
                            { id },
                            { slug: id },
                            { slug: possibleProductSlug },
                        ],
                    },
                });
            }
            if (!targetProduct) {
                targetProduct = await prisma_1.default.product.findFirst();
            }
            if (!targetProduct) {
                targetProduct = await prisma_1.default.product.create({
                    data: {
                        name: 'General Games',
                        slug: 'general-games',
                        image: '/images/games/freefire.png',
                        category: 'MOBILE_GAME',
                        isActive: true,
                    },
                });
            }
            // Check if this product already has a matching package to update instead
            const duplicatePkg = await prisma_1.default.package.findFirst({
                where: {
                    productId: targetProduct.id,
                    OR: [
                        name ? { name: { equals: name, mode: 'insensitive' } } : {},
                        amount !== undefined ? { amount: parseInt(amount, 10) } : {},
                    ],
                },
            });
            if (duplicatePkg) {
                resultPackage = await prisma_1.default.package.update({
                    where: { id: duplicatePkg.id },
                    data,
                });
                console.log(`[Admin Dashboard] Updated existing package: ${resultPackage.name} ($${resultPackage.price})`);
            }
            else {
                resultPackage = await prisma_1.default.package.create({
                    data: {
                        productId: targetProduct.id,
                        name: name || 'New Package',
                        amount: amount !== undefined ? parseInt(amount, 10) : 100,
                        price: price !== undefined ? parseFloat(price) : 0.99,
                        category: category || 'NORMAL',
                        badge: badge || null,
                        image: image || null,
                        isActive: isActive !== undefined ? isActive : true,
                    },
                });
                console.log(`[Admin Dashboard] Upserted package under ${targetProduct.name}: ${resultPackage.name} ($${resultPackage.price})`);
            }
        }
        (0, supabase_1.broadcastRealtimeEvent)('products-catalog-realtime', 'PACKAGE_UPDATED', { package: resultPackage });
        return res.status(200).json({ message: 'Package updated successfully', package: resultPackage });
    }
    catch (error) {
        console.error('Admin update package error:', error);
        return res.status(500).json({ error: 'Failed to update package: ' + (error.message || '') });
    }
});
// 8. Product management: Delete a product
router.delete('/products/:id', async (req, res) => {
    try {
        const { id } = req.params;
        // Find target product by ID or slug
        const product = await prisma_1.default.product.findFirst({
            where: { OR: [{ id }, { slug: id }] },
            include: { packages: true },
        });
        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }
        const packageIds = product.packages.map((p) => p.id);
        if (packageIds.length > 0) {
            // Delete associated digital stocks
            await prisma_1.default.stock.deleteMany({
                where: { packageId: { in: packageIds } },
            });
            // Delete associated orders to satisfy foreign key constraints
            await prisma_1.default.order.deleteMany({
                where: { packageId: { in: packageIds } },
            });
            // Delete all packages belonging to product
            await prisma_1.default.package.deleteMany({
                where: { productId: product.id },
            });
        }
        // Delete the product record
        await prisma_1.default.product.delete({
            where: { id: product.id },
        });
        console.log(`[Admin Dashboard] Successfully deleted product & all assets: ${product.name} (${product.slug})`);
        // Broadcast deletion via Supabase Realtime
        (0, supabase_1.broadcastRealtimeEvent)('products-catalog-realtime', 'PRODUCT_DELETED', {
            id: product.id,
            slug: product.slug,
        });
        return res.status(200).json({ message: 'Product deleted successfully', id: product.id });
    }
    catch (error) {
        console.error('Admin delete product error:', error);
        return res.status(500).json({ error: 'Failed to delete product' });
    }
});
// 9. Product management: Delete a package
router.delete('/packages/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const pkg = await prisma_1.default.package.findUnique({
            where: { id },
        });
        if (!pkg) {
            return res.status(404).json({ error: 'Package not found' });
        }
        // Delete associated stock
        await prisma_1.default.stock.deleteMany({
            where: { packageId: id },
        });
        // Delete orders referencing this package to avoid foreign key failure
        await prisma_1.default.order.deleteMany({
            where: { packageId: id },
        });
        // Delete the package record
        await prisma_1.default.package.delete({
            where: { id },
        });
        console.log(`[Admin Dashboard] Successfully deleted package: ${pkg.name} (${pkg.id})`);
        // Broadcast update via Supabase Realtime
        (0, supabase_1.broadcastRealtimeEvent)('products-catalog-realtime', 'PACKAGE_DELETED', {
            id: pkg.id,
            productId: pkg.productId,
        });
        return res.status(200).json({ message: 'Package deleted successfully', id: pkg.id });
    }
    catch (error) {
        console.error('Admin delete package error:', error);
        return res.status(500).json({ error: 'Failed to delete package' });
    }
});
// 10. Database Backup: Full JSON export
router.get('/backup/export', async (req, res) => {
    try {
        const products = await prisma_1.default.product.findMany({
            include: {
                packages: {
                    include: {
                        stocks: true,
                    },
                },
            },
        });
        const orders = await prisma_1.default.order.findMany({
            include: {
                package: true,
            },
        });
        const users = await prisma_1.default.user.findMany({
            select: {
                id: true,
                email: true,
                role: true,
                createdAt: true,
            },
        });
        const backupData = {
            system: 'DARA-TOPUP',
            version: '1.0.0',
            exportedAt: new Date().toISOString(),
            counts: {
                products: products.length,
                packages: products.reduce((acc, p) => acc + (p.packages?.length || 0), 0),
                orders: orders.length,
                users: users.length,
            },
            data: {
                products,
                orders,
                users,
            },
        };
        const filename = `backup-dara-topup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.status(200).send(JSON.stringify(backupData, null, 2));
    }
    catch (error) {
        console.error('Backup export error:', error);
        return res.status(500).json({ error: 'Failed to export system backup' });
    }
});
// 11. Database Backup: Create Server Snapshot
router.post('/backup/create-snapshot', async (req, res) => {
    try {
        const products = await prisma_1.default.product.findMany({
            include: {
                packages: {
                    include: {
                        stocks: true,
                    },
                },
            },
        });
        const orders = await prisma_1.default.order.findMany({
            include: {
                package: true,
            },
        });
        const users = await prisma_1.default.user.findMany({
            select: {
                id: true,
                email: true,
                role: true,
                createdAt: true,
            },
        });
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `snapshot-${timestamp}.json`;
        const filepath = path_1.default.join(BACKUPS_DIR, filename);
        const snapshotData = {
            system: 'DARA-TOPUP',
            version: '1.0.0',
            exportedAt: new Date().toISOString(),
            counts: {
                products: products.length,
                packages: products.reduce((acc, p) => acc + (p.packages?.length || 0), 0),
                orders: orders.length,
                users: users.length,
            },
            data: {
                products,
                orders,
                users,
            },
        };
        fs_1.default.writeFileSync(filepath, JSON.stringify(snapshotData, null, 2), 'utf-8');
        const stats = fs_1.default.statSync(filepath);
        return res.status(200).json({
            message: 'Server snapshot created successfully',
            snapshot: {
                filename,
                size: stats.size,
                createdAt: new Date().toISOString(),
                counts: snapshotData.counts,
            },
        });
    }
    catch (error) {
        console.error('Create snapshot error:', error);
        return res.status(500).json({ error: 'Failed to create server snapshot' });
    }
});
// 12. Database Backup: List all server snapshots
router.get('/backup/snapshots', async (req, res) => {
    try {
        if (!fs_1.default.existsSync(BACKUPS_DIR)) {
            return res.status(200).json({ snapshots: [] });
        }
        const files = fs_1.default.readdirSync(BACKUPS_DIR).filter(f => f.endsWith('.json'));
        const snapshots = files.map(file => {
            const filepath = path_1.default.join(BACKUPS_DIR, file);
            const stats = fs_1.default.statSync(filepath);
            let counts = { products: 0, packages: 0, orders: 0, users: 0 };
            try {
                const content = JSON.parse(fs_1.default.readFileSync(filepath, 'utf-8'));
                if (content.counts)
                    counts = content.counts;
            }
            catch (e) { }
            return {
                filename: file,
                size: stats.size,
                createdAt: stats.birthtime.toISOString(),
                counts,
            };
        }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        return res.status(200).json({ snapshots });
    }
    catch (error) {
        console.error('List snapshots error:', error);
        return res.status(500).json({ error: 'Failed to list snapshots' });
    }
});
// 13. Database Backup: Restore from snapshot or JSON
router.post('/backup/restore', async (req, res) => {
    try {
        const { filename, backupPayload } = req.body;
        let dataToRestore = null;
        if (filename) {
            const filepath = path_1.default.join(BACKUPS_DIR, filename);
            if (!fs_1.default.existsSync(filepath)) {
                return res.status(404).json({ error: 'Snapshot file not found' });
            }
            dataToRestore = JSON.parse(fs_1.default.readFileSync(filepath, 'utf-8'));
        }
        else if (backupPayload) {
            dataToRestore = backupPayload;
        }
        else {
            return res.status(400).json({ error: 'Missing snapshot filename or backup payload' });
        }
        if (!dataToRestore.data || !Array.isArray(dataToRestore.data.products)) {
            return res.status(400).json({ error: 'Invalid backup file format' });
        }
        // Restore Products & Packages
        let restoredProductsCount = 0;
        let restoredPackagesCount = 0;
        for (const prod of dataToRestore.data.products) {
            const upsertedProduct = await prisma_1.default.product.upsert({
                where: { slug: prod.slug },
                update: {
                    name: prod.name,
                    category: prod.category,
                    image: prod.image,
                    isActive: prod.isActive ?? true,
                },
                create: {
                    name: prod.name,
                    slug: prod.slug,
                    category: prod.category,
                    image: prod.image,
                    isActive: prod.isActive ?? true,
                },
            });
            restoredProductsCount++;
            if (Array.isArray(prod.packages)) {
                for (const pkg of prod.packages) {
                    await prisma_1.default.package.upsert({
                        where: { id: pkg.id },
                        update: {
                            name: pkg.name,
                            amount: pkg.amount,
                            price: pkg.price,
                            isActive: pkg.isActive ?? true,
                            category: pkg.category ?? 'NORMAL',
                            badge: pkg.badge ?? null,
                        },
                        create: {
                            id: pkg.id,
                            productId: upsertedProduct.id,
                            name: pkg.name,
                            amount: pkg.amount,
                            price: pkg.price,
                            isActive: pkg.isActive ?? true,
                            category: pkg.category ?? 'NORMAL',
                            badge: pkg.badge ?? null,
                        },
                    });
                    restoredPackagesCount++;
                }
            }
        }
        console.log(`[Backup System] Restored ${restoredProductsCount} products and ${restoredPackagesCount} packages`);
        return res.status(200).json({
            message: `System restored successfully: ${restoredProductsCount} products, ${restoredPackagesCount} packages.`,
            counts: {
                products: restoredProductsCount,
                packages: restoredPackagesCount,
            },
        });
    }
    catch (error) {
        console.error('Backup restore error:', error);
        return res.status(500).json({ error: 'Failed to restore backup' });
    }
});
// 14. Database Backup: Delete a server snapshot
router.delete('/backup/snapshots/:filename', async (req, res) => {
    try {
        const { filename } = req.params;
        const filepath = path_1.default.join(BACKUPS_DIR, filename);
        if (fs_1.default.existsSync(filepath)) {
            fs_1.default.unlinkSync(filepath);
        }
        return res.status(200).json({ message: 'Snapshot deleted successfully' });
    }
    catch (error) {
        console.error('Delete snapshot error:', error);
        return res.status(500).json({ error: 'Failed to delete snapshot' });
    }
});
// ─── 15. Contact Messages Management ──────────────────────────────────────────
// List all contact messages with search and filtering
router.get('/contact', async (req, res) => {
    try {
        const { status, search, limit = '50', page = '1' } = req.query;
        const take = parseInt(limit, 10) || 50;
        const skip = ((parseInt(page, 10) || 1) - 1) * take;
        const where = {};
        if (status && status !== 'ALL') {
            where.status = status;
        }
        if (search && typeof search === 'string') {
            const q = search.trim();
            where.OR = [
                { name: { contains: q, mode: 'insensitive' } },
                { email: { contains: q, mode: 'insensitive' } },
                { subject: { contains: q, mode: 'insensitive' } },
                { message: { contains: q, mode: 'insensitive' } },
                { telegram: { contains: q, mode: 'insensitive' } },
                { txnId: { contains: q, mode: 'insensitive' } },
            ];
        }
        const [messages, total, pendingCount] = await Promise.all([
            prisma_1.default.contactMessage.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                take,
                skip,
            }),
            prisma_1.default.contactMessage.count({ where }),
            prisma_1.default.contactMessage.count({ where: { status: 'PENDING' } }),
        ]);
        return res.status(200).json({
            messages,
            total,
            pendingCount,
            page: parseInt(page, 10) || 1,
            totalPages: Math.ceil(total / take) || 1,
        });
    }
    catch (error) {
        console.error('Admin get contact messages error:', error);
        return res.status(500).json({ error: 'Failed to fetch contact messages' });
    }
});
// Update a contact message (status, admin reply)
router.patch('/contact/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { status, reply } = req.body;
        const updated = await prisma_1.default.contactMessage.update({
            where: { id },
            data: {
                ...(status ? { status } : {}),
                ...(reply !== undefined ? { reply } : {}),
            },
        });
        try {
            await (0, supabase_1.broadcastRealtimeEvent)('contact_messages', 'UPDATE', updated);
        }
        catch (e) {
            console.warn('Realtime broadcast failed:', e);
        }
        return res.status(200).json({ success: true, message: updated });
    }
    catch (error) {
        console.error('Admin update contact message error:', error);
        return res.status(500).json({ error: 'Failed to update contact message' });
    }
});
// Delete a contact message
router.delete('/contact/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await prisma_1.default.contactMessage.delete({ where: { id } });
        return res.status(200).json({ success: true, message: 'Message deleted' });
    }
    catch (error) {
        console.error('Admin delete contact message error:', error);
        return res.status(500).json({ error: 'Failed to delete contact message' });
    }
});
exports.default = router;
