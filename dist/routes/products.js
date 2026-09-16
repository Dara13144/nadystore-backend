"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = __importDefault(require("../prisma"));
const auth_1 = require("../middleware/auth");
const gameProviderMock_1 = require("../utils/gameProviderMock");
const supabase_1 = require("../lib/supabase");
const router = (0, express_1.Router)();
// 1. Get all products with active packages (Public)
router.get('/', async (req, res) => {
    try {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');
        const products = await prisma_1.default.product.findMany({
            where: { isActive: true },
            include: {
                packages: {
                    where: { isActive: true },
                    orderBy: { price: 'asc' },
                },
            },
            orderBy: { name: 'asc' },
        });
        return res.status(200).json(products);
    }
    catch (error) {
        console.error("DATABASE ERROR:", error);
        return res.status(500).json({
            error: "Internal database error",
        });
    }
});
// 2. Lookup Player Nickname by Game and Player ID (Public)
// IMPORTANT: This route MUST be before /:slug to avoid Express matching 'lookup' as a slug.
const handlePlayerLookup = async (req, res) => {
    try {
        const gameSlug = req.params.gameSlug || req.params.slug || req.body?.gameSlug || req.body?.slug || '';
        const playerId = req.query.playerId || req.body?.playerId || '';
        const playerZoneId = req.query.playerZoneId || req.body?.playerZoneId || req.body?.zoneId || '';
        if (!playerId.trim()) {
            return res.status(400).json({ success: false, error: 'Player ID is required' });
        }
        const result = await (0, gameProviderMock_1.lookupPlayerNickname)(gameSlug, playerId, playerZoneId);
        if (result && result.success && result.nickname) {
            return res.status(200).json({
                success: true,
                nickname: result.nickname,
                region: result.region || 'Cambodia (Asia)',
                level: result.level || 45,
                avatarUrl: result.avatarUrl || '/images/games/mlbb.png',
                playerId: result.playerId || playerId.trim(),
                playerZoneId: result.playerZoneId || (playerZoneId ? playerZoneId.trim() : null),
            });
        }
        return res.status(200).json({
            success: false,
            nickname: null,
            error: result?.error || 'Player not found'
        });
    }
    catch (error) {
        console.error('Nickname lookup error:', error);
        return res.status(500).json({ success: false, error: 'Internal lookup error' });
    }
};
router.get('/lookup/:gameSlug', handlePlayerLookup);
router.post('/lookup/:gameSlug', handlePlayerLookup);
router.get('/:slug/check-name', handlePlayerLookup);
router.post('/:slug/check-name', handlePlayerLookup);
router.post('/check-player', handlePlayerLookup);
// In-memory cache for Stock 2 categories
let stock2CategoriesCache = [];
let stock2CategoriesCacheTime = 0;
// 2b. Get all Game Stock 2 categories (Public)
router.get(['/stock2/categories', '/game2/categories'], async (_req, res) => {
    const now = Date.now();
    if (stock2CategoriesCache.length > 0 && now - stock2CategoriesCacheTime < 5 * 60 * 1000) {
        return res.status(200).json({ status: 'SUCCESS', count: stock2CategoriesCache.length, categories: stock2CategoriesCache });
    }
    const apiKey = process.env.VNGZZ2GAME_API_KEY || 'pwArFcCneE0vcBDIGu6ZeIKHUZ3HxeQZ';
    try {
        const upstreamRes = await fetch('https://www.vngzz2game.site/api/v1/game2/categories', {
            headers: { 'X-API-Key': apiKey, 'Accept': 'application/json' },
            signal: AbortSignal.timeout(8000),
        });
        if (upstreamRes.ok) {
            const data = await upstreamRes.json();
            if (data && data.categories && Array.isArray(data.categories)) {
                stock2CategoriesCache = data.categories;
                stock2CategoriesCacheTime = now;
                return res.status(200).json({ status: 'SUCCESS', count: stock2CategoriesCache.length, categories: stock2CategoriesCache });
            }
        }
    }
    catch (err) {
        console.warn('[Products] Stock 2 categories error:', err.message);
    }
    if (stock2CategoriesCache.length > 0) {
        return res.status(200).json({ status: 'SUCCESS', count: stock2CategoriesCache.length, categories: stock2CategoriesCache });
    }
    return res.status(503).json({ success: false, error: 'Failed to fetch Game Stock 2 categories' });
});
// 3. Get specific product by slug (Public)
router.get('/:slug', async (req, res) => {
    try {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');
        const rawSlug = decodeURIComponent(req.params.slug).trim();
        const slug = rawSlug.toLowerCase();
        let product = await prisma_1.default.product.findFirst({
            where: {
                OR: [
                    { slug: slug },
                    { slug: rawSlug },
                    { id: rawSlug },
                    ...(slug === 'telegram' ? [{ slug: 'telegram-premium' }] : []),
                    ...(slug === 'telegram-premium' ? [{ slug: 'telegram' }] : []),
                ],
                isActive: true,
            },
            include: {
                packages: {
                    where: { isActive: true },
                    orderBy: { price: 'asc' },
                },
            },
        });
        if (!product) {
            // Check if it is a Stock 2 game!
            const cleanCode = slug.replace(/^(stock2-|game2-)/i, '').trim();
            const apiKey = process.env.VNGZZ2GAME_API_KEY || 'pwArFcCneE0vcBDIGu6ZeIKHUZ3HxeQZ';
            try {
                const stock2Res = await fetch(`https://www.vngzz2game.site/api/v1/game2/products?game_code=${encodeURIComponent(cleanCode)}`, {
                    headers: { 'X-API-Key': apiKey, 'Accept': 'application/json' },
                    signal: AbortSignal.timeout(7000),
                });
                if (stock2Res.ok) {
                    const s2Data = await stock2Res.json();
                    if (s2Data && s2Data.status === 'SUCCESS' && s2Data.game) {
                        const game = s2Data.game;
                        const pkgs = (s2Data.products || s2Data.data || []).map((p) => ({
                            id: `pkg-${p.code || p.product_code}`,
                            name: p.name,
                            price: Number(p.sell_price || p.price || p.base_price || 0),
                            originalPrice: Number(p.cost_price || p.base_price || p.price),
                            productCode: p.product_code || p.code,
                            description: `Game Stock 2 · Instant Delivery`,
                            isActive: true,
                            productId: `stock2-${game.game_code || cleanCode}`,
                        }));
                        return res.status(200).json({
                            id: `stock2-${game.game_code || cleanCode}`,
                            name: game.name,
                            slug: `stock2-${game.game_code || cleanCode}`,
                            category: 'MOBILE_GAME',
                            description: game.description || 'Game Stock 2 Instant Delivery',
                            imageUrl: game.image_url || '/images/games/default.png',
                            bannerUrl: game.image_url || null,
                            isActive: true,
                            packages: pkgs,
                            fields: game.fields || ['User ID'],
                            inputs: game.inputs || [],
                            need_server: !!game.need_server,
                            stock: 'Stock 2',
                        });
                    }
                }
            }
            catch (s2Err) {
                console.warn('[Products] Stock 2 lookup warning:', s2Err?.message);
            }
        }
        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }
        return res.status(200).json(product);
    }
    catch (error) {
        console.error('Error fetching product details:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});
// ADMIN ONLY CRUD ROUTES BELOW
// 4. Create Product
router.post('/', auth_1.authenticateJWT, auth_1.requireAdmin, async (req, res) => {
    try {
        const { name, slug: customSlug, image, category, isActive, packages, autoSeedPackages } = req.body;
        if (!name || !category) {
            return res.status(400).json({ error: 'Product name and category are required' });
        }
        let baseSlug = (customSlug || name)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '');
        if (!baseSlug)
            baseSlug = `game-${Date.now()}`;
        let finalSlug = baseSlug;
        let counter = 1;
        while (await prisma_1.default.product.findUnique({ where: { slug: finalSlug } })) {
            finalSlug = `${baseSlug}-${counter++}`;
        }
        const finalImage = image && image.trim() ? image.trim() : `/images/games/${finalSlug}.png`;
        const product = await prisma_1.default.product.create({
            data: {
                name: name.trim(),
                slug: finalSlug,
                image: finalImage,
                category: category.trim(),
                isActive: isActive !== undefined ? isActive : true,
            },
        });
        if (Array.isArray(packages) && packages.length > 0) {
            for (const p of packages) {
                await prisma_1.default.package.create({
                    data: {
                        productId: product.id,
                        name: p.name || `${p.amount || 100} Diamonds`,
                        amount: parseInt(p.amount, 10) || 100,
                        price: parseFloat(p.price) || 0.99,
                        image: p.image || null,
                        category: p.category || 'NORMAL',
                        badge: p.badge || null,
                        isActive: true,
                    },
                });
            }
        }
        else if (autoSeedPackages !== false) {
            const defaultTiers = [
                { name: '50 Diamonds', amount: 50, price: 0.99, badge: null, category: 'NORMAL' },
                { name: '100+10 Diamonds', amount: 110, price: 1.99, badge: 'Popular', category: 'NORMAL' },
                { name: '250+25 Diamonds', amount: 275, price: 4.99, badge: 'Hot', category: 'NORMAL' },
                { name: '500+65 Diamonds', amount: 565, price: 9.99, badge: '🔥 Best Value', category: 'BEST_SELLER' },
                { name: '1000+150 Diamonds', amount: 1150, price: 19.99, badge: 'VIP Choice', category: 'BEST_SELLER' },
                { name: '2000+350 Diamonds', amount: 2350, price: 39.99, badge: 'Mega Saver', category: 'BEST_SELLER' },
            ];
            for (const tier of defaultTiers) {
                await prisma_1.default.package.create({
                    data: {
                        productId: product.id,
                        name: tier.name,
                        amount: tier.amount,
                        price: tier.price,
                        badge: tier.badge,
                        category: tier.category,
                        isActive: true,
                    },
                });
            }
        }
        const fullProduct = await prisma_1.default.product.findUnique({
            where: { id: product.id },
            include: {
                packages: {
                    orderBy: { price: 'asc' },
                },
            },
        });
        (0, supabase_1.broadcastRealtimeEvent)('products-catalog-realtime', 'PRODUCT_CREATED', { product: fullProduct });
        return res.status(201).json(fullProduct);
    }
    catch (error) {
        console.error('Error creating product:', error);
        return res.status(500).json({ error: 'Failed to create product' });
    }
});
// 5. Update Product
router.put('/:id', auth_1.authenticateJWT, auth_1.requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, slug, image, category, isActive } = req.body;
        const product = await prisma_1.default.product.update({
            where: { id },
            data: { name, slug, image, category, isActive },
        });
        return res.status(200).json(product);
    }
    catch (error) {
        console.error('Error updating product:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});
// 6. Delete Product
router.delete('/:id', auth_1.authenticateJWT, auth_1.requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const product = await prisma_1.default.product.findFirst({
            where: { OR: [{ id }, { slug: id }] },
            include: { packages: true },
        });
        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }
        const packageIds = product.packages.map((p) => p.id);
        if (packageIds.length > 0) {
            // 1. Delete stocks
            await prisma_1.default.stock.deleteMany({
                where: { packageId: { in: packageIds } },
            });
            // 2. Delete linked orders to prevent foreign key errors
            await prisma_1.default.order.deleteMany({
                where: { packageId: { in: packageIds } },
            });
            // 3. Delete packages
            await prisma_1.default.package.deleteMany({
                where: { productId: product.id },
            });
        }
        // 4. Delete product
        await prisma_1.default.product.delete({
            where: { id: product.id },
        });
        // 5. Verification: verify record is truly gone from database
        const remainingGame = await prisma_1.default.product.findUnique({
            where: { id: product.id },
            select: { id: true },
        });
        if (remainingGame) {
            return res.status(500).json({
                success: false,
                error: 'Product still exists in database after delete operation',
            });
        }
        (0, supabase_1.broadcastRealtimeEvent)('products-catalog-realtime', 'PRODUCT_DELETED', {
            id: product.id,
            slug: product.slug,
        });
        return res.status(200).json({ success: true, message: 'Product deleted successfully', id: product.id });
    }
    catch (error) {
        console.error('Error deleting product:', error);
        return res.status(500).json({ error: 'Failed to delete product' });
    }
});
// 7. Add Package to Product
router.post('/:productId/packages', auth_1.authenticateJWT, auth_1.requireAdmin, async (req, res) => {
    try {
        const { productId } = req.params;
        const { name, amount, price, isActive, category, badge } = req.body;
        if (!name || amount === undefined || price === undefined) {
            return res.status(400).json({ error: 'Required fields missing' });
        }
        const newPackage = await prisma_1.default.package.create({
            data: {
                productId,
                name,
                amount: parseInt(amount),
                price: parseFloat(price),
                category: category || 'NORMAL',
                badge: badge || null,
                isActive: isActive !== undefined ? isActive : true,
            },
        });
        return res.status(201).json(newPackage);
    }
    catch (error) {
        console.error('Error creating package:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});
// 8. Update Package
router.put('/packages/:packageId', auth_1.authenticateJWT, auth_1.requireAdmin, async (req, res) => {
    try {
        const { packageId } = req.params;
        const { name, amount, price, isActive, category, badge } = req.body;
        const updatedPackage = await prisma_1.default.package.update({
            where: { id: packageId },
            data: {
                name,
                amount: amount !== undefined ? parseInt(amount) : undefined,
                price: price !== undefined ? parseFloat(price) : undefined,
                category: category !== undefined ? category : undefined,
                badge: badge !== undefined ? badge : undefined,
                isActive,
            },
        });
        return res.status(200).json(updatedPackage);
    }
    catch (error) {
        console.error('Error updating package:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});
// 9. Delete Package
router.delete('/packages/:packageId', auth_1.authenticateJWT, auth_1.requireAdmin, async (req, res) => {
    try {
        const { packageId } = req.params;
        await prisma_1.default.package.delete({
            where: { id: packageId },
        });
        return res.status(200).json({ message: 'Package deleted successfully' });
    }
    catch (error) {
        console.error('Error deleting package:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});
exports.default = router;
