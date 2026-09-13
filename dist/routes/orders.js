"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = __importDefault(require("../prisma"));
const gameProviderMock_1 = require("../utils/gameProviderMock");
const paymentMock_1 = require("../utils/paymentMock");
const telegram_1 = require("../utils/telegram");
const paymentVerification_1 = require("../utils/paymentVerification");
const router = (0, express_1.Router)();
// 1. Create a top-up order (Public / Authenticated)
// Matches route POST /api/orders/
router.post('/', async (req, res) => {
    try {
        const { packageId, playerId, playerZoneId, paymentMethod, email, gameSlug, productSlug, packageName, price, amount } = req.body;
        if ((!packageId && !packageName) || !playerId || !paymentMethod) {
            return res.status(400).json({ error: 'Required fields missing' });
        }
        let normalizedMethod = (paymentMethod || '').toUpperCase().trim();
        if (normalizedMethod === 'KHQR' || normalizedMethod === 'BAKONG_KHQR')
            normalizedMethod = 'BAKONG';
        if (normalizedMethod === 'ABA_PAYWAY')
            normalizedMethod = 'ABA';
        if (!['ABA', 'BAKONG', 'CANADIA', 'CUTLUY', 'WALLET'].includes(normalizedMethod)) {
            normalizedMethod = 'BAKONG'; // Default to Bakong KHQR
        }
        const resolvedMethod = normalizedMethod;
        // Resilient Package Resolution
        let pkg = null;
        if (packageId) {
            pkg = await prisma_1.default.package.findUnique({
                where: { id: packageId },
                include: { product: true },
            }).catch(() => null);
        }
        if (!pkg && packageId) {
            pkg = await prisma_1.default.package.findFirst({
                where: {
                    OR: [
                        { id: packageId },
                        { name: packageId },
                    ],
                },
                include: { product: true },
            }).catch(() => null);
        }
        const targetSlug = productSlug || gameSlug;
        if (!pkg && targetSlug) {
            const prod = await prisma_1.default.product.findFirst({
                where: {
                    OR: [
                        { slug: targetSlug },
                        { id: targetSlug },
                        { name: { equals: targetSlug, mode: 'insensitive' } },
                    ],
                },
                include: { packages: true },
            }).catch(() => null);
            if (prod) {
                if (packageName) {
                    pkg = prod.packages.find((p) => p.name.toLowerCase() === packageName.toLowerCase()) || null;
                }
                if (!pkg && price) {
                    pkg = prod.packages.find((p) => Math.abs(p.price - parseFloat(price)) < 0.05) || null;
                }
                if (!pkg && prod.packages.length > 0) {
                    pkg = prod.packages[0];
                }
                if (pkg) {
                    pkg = await prisma_1.default.package.findUnique({
                        where: { id: pkg.id },
                        include: { product: true },
                    }).catch(() => null);
                }
                else {
                    // If no package exists yet, create on the fly
                    const newPkg = await prisma_1.default.package.create({
                        data: {
                            productId: prod.id,
                            name: packageName || `${amount || 60} Diamonds`,
                            amount: parseInt(amount || 60, 10),
                            price: parseFloat(price || 0.99),
                            category: 'NORMAL',
                        },
                        include: { product: true },
                    }).catch(() => null);
                    pkg = newPkg;
                }
            }
        }
        if (!pkg) {
            return res.status(404).json({ error: 'Package not found' });
        }
        // Validate Player ID and retrieve nickname (non-blocking)
        let nickname = 'Player';
        try {
            const lookup = await (0, gameProviderMock_1.lookupPlayerNickname)(pkg.product.slug, playerId, playerZoneId);
            if (lookup && lookup.nickname) {
                nickname = lookup.nickname;
            }
        }
        catch {
            nickname = 'Player';
        }
        // Generate unique payment transaction ID
        const timeCode = Date.now().toString().slice(-6);
        const randCode = Math.floor(1000 + Math.random() * 9000);
        let paymentTxnId = `TOPUP-${timeCode}-${randCode}`;
        // Map order to logged-in user if available
        let userId = null;
        let contactEmail = email || 'guest@topup.com';
        // Check if auth token header exists
        if (req.headers.authorization) {
            const authHeader = req.headers.authorization;
            const token = authHeader.split(' ')[1];
            const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-change-in-production-12345';
            try {
                const decoded = require('jsonwebtoken').verify(token, JWT_SECRET);
                userId = decoded.id;
                contactEmail = decoded.email || contactEmail;
            }
            catch (err) {
                // Fallback: Check if token is a Supabase Auth or Google JWT token
                try {
                    const parts = token.split('.');
                    if (parts.length === 3) {
                        const decoded = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
                        if (decoded) {
                            userId = decoded.sub || decoded.id || null;
                            contactEmail = decoded.email || contactEmail;
                        }
                    }
                }
                catch {
                    // Ignore invalid token and create as guest
                }
            }
        }
        // Safely verify if userId exists in PostgreSQL DB to avoid foreign key violations
        if (userId) {
            try {
                const userExists = await prisma_1.default.user.findUnique({ where: { id: userId }, select: { id: true } });
                if (!userExists) {
                    if (contactEmail && contactEmail !== 'guest@topup.com') {
                        const userByEmail = await prisma_1.default.user.findUnique({ where: { email: contactEmail }, select: { id: true } });
                        userId = userByEmail ? userByEmail.id : null;
                    }
                    else {
                        userId = null;
                    }
                }
            }
            catch {
                userId = null;
            }
        }
        // Generate payment details depending on gateway choice
        let paymentDetails = {};
        let paymentQrCode = null;
        let paymentMd5 = null;
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        if (resolvedMethod === 'ABA') {
            const abaMerchantId = process.env.ABA_PAYWAY_MERCHANT_ID || 'MOCK_MERCHANT';
            const abaApiKey = process.env.ABA_PAYWAY_API_KEY || 'MOCK_KEY';
            paymentDetails = (0, paymentMock_1.generateABAMockPayment)(paymentTxnId, pkg.price, `${pkg.product.name} - ${pkg.name}`, abaMerchantId, abaApiKey, baseUrl);
        }
        else if (resolvedMethod === 'CANADIA') {
            const qrData = `00020101021230480012canadia_topup0110topup@cnb5204599953038405404${pkg.price.toFixed(2)}5802KH5919CANADIA BANK PLC.6008Phnom Penh62180710${paymentTxnId}6304E5F6`;
            const md5 = require('crypto').createHash('md5').update(qrData).digest('hex');
            paymentQrCode = qrData;
            paymentMd5 = md5;
            paymentDetails = {
                qrCode: qrData,
                md5,
                txnId: paymentTxnId,
                bankName: 'Canadia Bank',
                logo: '/images/payments/canadia.png'
            };
        }
        else {
            const bakongQr = await (0, paymentMock_1.generateBakongKHQR)(paymentTxnId, pkg.price, `${pkg.product.name} - ${pkg.name}`);
            paymentQrCode = bakongQr.qrCode;
            paymentMd5 = bakongQr.md5;
            // Use the khpay transaction_id (bk_...) if returned, else keep local ID
            if (bakongQr.txnId && bakongQr.txnId !== paymentTxnId) {
                paymentTxnId = bakongQr.txnId;
            }
            paymentDetails = bakongQr;
        }
        // Create Order in Database
        const order = await prisma_1.default.order.create({
            data: {
                userId,
                packageId: pkg.id,
                playerId,
                playerZoneId: playerZoneId || null,
                playerNickname: nickname,
                price: pkg.price,
                status: 'PENDING',
                paymentMethod: resolvedMethod,
                paymentStatus: 'PENDING',
                paymentTxnId,
                paymentQrCode,
                paymentMd5,
                gatewayRef: paymentDetails?.gatewayRef || null,
                deliveryStatus: 'WAITING',
            },
        });
        // Send Telegram Alert for new order
        const currentProductSlug = pkg.product.slug || '';
        const isMLBB = currentProductSlug.includes('mobile-legends');
        const isFreeFire = currentProductSlug.includes('free-fire');
        const isValorant = currentProductSlug.includes('valorant');
        const isBloodStrike = currentProductSlug.includes('blood-strike');
        const isHoK = currentProductSlug.includes('honor-of-kings');
        const isFarlight = currentProductSlug.includes('farlight');
        const isDeltaForce = currentProductSlug.includes('delta-force');
        let credentialsLabel = `<b>Player ID:</b> <code>${playerId}</code>`;
        if (isMLBB) {
            credentialsLabel = `<b>Mobile Legends ID:</b> <code>${playerId}</code>\n<b>Server ID:</b> <code>${playerZoneId || 'N/A'}</code>`;
        }
        else if (isFreeFire) {
            credentialsLabel = `<b>Free Fire ID:</b> <code>${playerId}</code>`;
        }
        else if (isValorant) {
            credentialsLabel = `<b>Valorant ID:</b> <code>${playerId}</code>`;
        }
        else if (isBloodStrike) {
            credentialsLabel = `<b>Blood Strike ID:</b> <code>${playerId}</code>`;
        }
        else if (isHoK) {
            credentialsLabel = `<b>Honor of Kings ID:</b> <code>${playerId}</code>`;
        }
        else if (isFarlight) {
            credentialsLabel = `<b>Farlight 84 ID:</b> <code>${playerId}</code>`;
        }
        else if (isDeltaForce) {
            credentialsLabel = `<b>Delta Force ID:</b> <code>${playerId}</code>`;
        }
        else if (playerZoneId) {
            credentialsLabel = `<b>Player ID:</b> <code>${playerId}</code>\n<b>Server/Zone ID:</b> <code>${playerZoneId}</code>`;
        }
        const playerIdFull = playerZoneId ? `${playerId} (${playerZoneId})` : playerId;
        const telegramMessage = `${playerIdFull} ${pkg.name}`.trim();
        await (0, telegram_1.sendTelegramNotification)(telegramMessage);
        return res.status(201).json({
            message: 'Order created successfully',
            order: {
                id: order.id,
                paymentTxnId,
                price: order.price,
                status: order.status,
                paymentStatus: order.paymentStatus,
                playerNickname: nickname,
            },
            paymentDetails,
        });
    }
    catch (error) {
        console.error('Order creation error:', error);
        return res.status(500).json({ error: error.message || 'Internal server error' });
    }
});
// 2. Fetch specific order status (Public - used by polling)
// GET /api/orders/status/:txnId
router.get('/status/:txnId', async (req, res) => {
    try {
        const { txnId } = req.params;
        let order = await prisma_1.default.order.findUnique({
            where: { paymentTxnId: txnId },
            include: { package: { include: { product: true } } },
        });
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }
        // Auto payment checking for pending orders (server-side only, gateway validated)
        if ((order.paymentStatus === 'PENDING') && (order.paymentMethod === 'BAKONG' || order.paymentMethod === 'ABA')) {
            const isPaid = await (0, paymentVerification_1.verifyAbaKhqrPayment)(order);
            if (isPaid) {
                console.log(`[Status Polling] Order ${txnId} payment confirmed. Processing delivery...`);
                const result = await (0, paymentVerification_1.processVerifiedPayment)(order, `POLL-AUTO-${order.paymentMd5 || txnId}`);
                const updatedOrder = await prisma_1.default.order.findUnique({
                    where: { paymentTxnId: txnId },
                    include: { package: { include: { product: true } } },
                });
                if (updatedOrder)
                    order = updatedOrder;
            }
        }
        let abaPayload = null;
        let abaApiUrl = null;
        if (order.paymentMethod === 'ABA') {
            const abaMerchantId = process.env.ABA_PAYWAY_MERCHANT_ID || 'MOCK_MERCHANT';
            const abaApiKey = process.env.ABA_PAYWAY_API_KEY || 'MOCK_KEY';
            const baseUrl = `${req.protocol}://${req.get('host')}`;
            const paymentDetails = (0, paymentMock_1.generateABAMockPayment)(order.paymentTxnId, order.price, `${order.package.product.name} - ${order.package.name}`, abaMerchantId, abaApiKey, baseUrl);
            abaPayload = paymentDetails.payload;
            abaApiUrl = process.env.ABA_PAYWAY_API_URL || 'https://checkout-sandbox.ababank.com/api/payment-gateway/v1/payments/purchase';
        }
        const deepLink = order.paymentQrCode ? `abamobilebank://ababank.com?type=payway&qrcode=${encodeURIComponent(order.paymentQrCode)}` : null;
        const payUrl = order.gatewayRef && order.gatewayRef.startsWith('TXN-') ? `https://www.vngzz2game.site/pay/${order.gatewayRef}` : null;
        const qrImageUrl = order.paymentQrCode ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=4&data=${encodeURIComponent(order.paymentQrCode)}` : null;
        return res.status(200).json({
            id: order.id,
            paymentTxnId: order.paymentTxnId,
            gameName: order.package.product.name,
            gameSlug: order.package.product.slug,
            packageName: order.package.name,
            playerId: order.playerId,
            playerNickname: order.playerNickname,
            price: order.price,
            status: order.status,
            paymentStatus: order.paymentStatus,
            paymentMethod: order.paymentMethod,
            stockDeliveredCode: order.stockDeliveredCode,
            paymentQrCode: order.paymentQrCode,
            paymentMd5: order.paymentMd5,
            deepLink,
            payUrl,
            qrImageUrl,
            createdAt: order.createdAt,
            merchantName: process.env.BAKONG_MERCHANT_NAME || 'NA-DY TOPUP',
            abaPayload,
            abaApiUrl,
        });
    }
    catch (error) {
        console.error('Fetch order status error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});
// 2b. Force-verify payment now (called when user clicks "I've Paid")
// POST /api/orders/verify/:txnId
router.post('/verify/:txnId', async (req, res) => {
    try {
        const { txnId } = req.params;
        console.log(`[Verify] Manual verify request for order: ${txnId}`);
        const order = await prisma_1.default.order.findUnique({
            where: { paymentTxnId: txnId },
            include: { package: { include: { product: true } } },
        });
        if (!order) {
            return res.status(404).json({ verified: false, error: 'Order not found' });
        }
        // Already paid — return success immediately
        if (order.paymentStatus === 'PAID' || order.paymentStatus === 'SUCCESS') {
            return res.status(200).json({
                verified: true,
                status: order.status,
                paymentStatus: order.paymentStatus,
                message: 'Payment already verified',
            });
        }
        if (order.paymentStatus === 'EXPIRED') {
            return res.status(410).json({ verified: false, error: 'Order has expired. Please create a new order.' });
        }
        // Expire orders older than 15 minutes
        const orderAgeMs = Date.now() - new Date(order.createdAt).getTime();
        if (orderAgeMs > 15 * 60 * 1000) {
            await prisma_1.default.order.update({
                where: { id: order.id },
                data: { paymentStatus: 'EXPIRED', status: 'CANCELLED', deliveryStatus: 'FAILED' },
            });
            return res.status(410).json({ verified: false, error: 'Order has expired. Please create a new order.' });
        }
        if (order.paymentMethod !== 'BAKONG' && order.paymentMethod !== 'ABA' && process.env.SANDBOX_MODE !== 'true') {
            return res.status(400).json({ verified: false, error: 'Verify only supports BAKONG/ABA orders' });
        }
        // Delegate verification to paymentVerification service
        const isPaid = await (0, paymentVerification_1.verifyAbaKhqrPayment)(order);
        if (!isPaid) {
            return res.status(200).json({
                verified: false,
                status: order.status,
                paymentStatus: order.paymentStatus,
                message: 'Payment not yet confirmed. Please wait and try again.',
            });
        }
        console.log(`[Verify] Payment confirmed for order ${txnId}. Processing delivery...`);
        const result = await (0, paymentVerification_1.processVerifiedPayment)(order, `VERIFY-${order.paymentMd5 || txnId}`);
        return res.status(200).json({
            verified: true,
            status: result.currentOrder.status,
            paymentStatus: result.currentOrder.paymentStatus,
            deliverySuccess: result.deliverySuccess,
            deliveredCode: result.deliveredCode,
            message: result.deliverySuccess
                ? 'Payment verified and product delivered!'
                : 'Payment verified but delivery failed. Please contact support.',
        });
    }
    catch (error) {
        console.error('[Verify] Error:', error);
        return res.status(500).json({ verified: false, error: 'Internal server error' });
    }
});
// 3. User Order History (Public or Auth)
router.get('/history/:emailOrId', async (req, res) => {
    try {
        const { emailOrId } = req.params;
        // Find all orders linked to either user ID or user email
        const orders = await prisma_1.default.order.findMany({
            where: {
                OR: [
                    { userId: emailOrId },
                    { user: { email: emailOrId } }
                ]
            },
            include: {
                package: {
                    include: { product: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });
        return res.status(200).json(orders);
    }
    catch (error) {
        console.error('History fetch error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});
// 4. MOCK PAYMENT WEBHOOK CALLBACK (Simulated payment trigger)
// Anyone can call this to simulate a successful payment trigger for testing.
router.post('/simulate-callback', async (req, res) => {
    try {
        const { txnId, paymentStatus } = req.body;
        if (!txnId) {
            return res.status(400).json({ error: 'Transaction ID (txnId) is required' });
        }
        const order = await prisma_1.default.order.findUnique({
            where: { paymentTxnId: txnId },
            include: { package: { include: { product: true } } },
        });
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }
        if (order.paymentStatus === 'PAID') {
            return res.status(400).json({ error: 'Order has already been paid and processed' });
        }
        const statusValue = paymentStatus || 'PAID';
        if (statusValue !== 'PAID') {
            // Simulate failed/cancelled payment
            const updatedOrder = await prisma_1.default.order.update({
                where: { id: order.id },
                data: {
                    paymentStatus: 'EXPIRED',
                    status: 'FAILED',
                    deliveryStatus: 'FAILED',
                },
            });
            await (0, telegram_1.sendTelegramNotification)(`❌ <b>Payment Cancelled/Expired</b>\n` +
                `-----------------------------------------\n` +
                `<b>Txn ID:</b> <code>${txnId}</code>\n` +
                `<b>Amount:</b> $${order.price.toFixed(2)}\n` +
                `<b>Gateway:</b> ${order.paymentMethod}`);
            return res.status(200).json({ message: 'Order payment status set to failed', order: updatedOrder });
        }
        // Process order payment using the verification service
        const ref = `REF-${Math.floor(100000 + Math.random() * 900000)}`;
        console.log(`[Payment Callback] Payment successful for order ${txnId}. Processing top-up...`);
        const result = await (0, paymentVerification_1.processVerifiedPayment)(order, ref);
        return res.status(200).json({
            message: 'Simulated payment callback executed successfully',
            delivery: {
                success: result.deliverySuccess,
                code: result.deliveredCode,
                error: '',
            },
            order: result.currentOrder,
        });
    }
    catch (error) {
        console.error('Mock callback processing error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});
// 5. REAL BAKONG KHQR PAYMENT WEBHOOK (Production)
router.post('/bakong-callback', async (req, res) => {
    try {
        console.log('[Bakong Webhook] 📥 Received callback request.');
        console.log('[Bakong Webhook] Request headers:', JSON.stringify(req.headers));
        console.log('[Bakong Webhook] Request body:', JSON.stringify(req.body, null, 2));
        // Resolve MD5 using all possible paths
        const rawMd5 = req.body.md5 ||
            req.body.md5Hash ||
            req.body.req_khqr?.md5 ||
            req.body.data?.md5 ||
            req.body.data?.md5Hash;
        const sanitizedMd5 = rawMd5 ? rawMd5.toLowerCase().trim() : '';
        // Resolve Transaction ID using all possible paths
        const transactionId = req.body.transactionId ||
            req.body.transaction_id ||
            req.body.trans_id ||
            req.body.bill_number ||
            req.body.req_khqr?.bill_number ||
            req.body.data?.bill_number ||
            req.body.data?.transaction_id ||
            req.body.data?.trans_id;
        // Resolve Session ID
        const sessionId = req.body.session_id ||
            req.body.data?.session_id ||
            req.body.id;
        // Resolve Status using all possible paths
        const rawStatus = req.body.status ||
            req.body.paymentStatus ||
            req.body.data?.status;
        // Resolve Amount using all possible paths
        const amount = req.body.amount ||
            req.body.req_khqr?.amount ||
            req.body.data?.amount;
        // Resolve Currency using all possible paths
        const currency = req.body.currency ||
            req.body.req_khqr?.currency ||
            req.body.data?.currency;
        console.log(`[Bakong Webhook] Parsed variables: MD5="${sanitizedMd5}", TxnID="${transactionId || 'N/A'}", SessionID="${sessionId || 'N/A'}", Status="${rawStatus || 'N/A'}", Amount="${amount || 'N/A'}", Currency="${currency || 'N/A'}"`);
        const signature = req.headers['x-bakong-signature'];
        const bakongApiKey = process.env.BAKONG_API_KEY || '';
        // Webhook signature verification
        if (bakongApiKey && signature) {
            const isValid = (0, paymentMock_1.verifyBakongWebhook)(rawMd5 || '', transactionId || '', signature, bakongApiKey);
            if (!isValid) {
                console.warn('[Bakong Webhook] ⚠️ Invalid signature! Rejecting.');
                return res.status(401).json({ error: 'Invalid webhook signature' });
            }
            console.log('[Bakong Webhook] ✅ Signature verified.');
        }
        else {
            console.log('[Bakong Webhook] ⚠️ BAKONG_API_KEY not set — skipping signature verification (sandbox mode).');
        }
        if (!transactionId && !sanitizedMd5 && !sessionId) {
            console.warn('[Bakong Webhook] ❌ Error: Neither transactionId, md5, nor sessionId is present.');
            return res.status(400).json({ error: 'transactionId, md5, or session_id is required' });
        }
        // Find Order
        let order = null;
        if (sessionId) {
            order = await prisma_1.default.order.findFirst({
                where: { gatewayRef: sessionId },
                include: { package: { include: { product: true } } },
            });
        }
        if (!order && transactionId) {
            order = await prisma_1.default.order.findUnique({
                where: { paymentTxnId: transactionId },
                include: { package: { include: { product: true } } },
            });
        }
        if (!order && sanitizedMd5) {
            order = await prisma_1.default.order.findFirst({
                where: {
                    OR: [
                        { paymentMd5: sanitizedMd5 },
                        { paymentMd5: sanitizedMd5.toUpperCase() }
                    ]
                },
                include: { package: { include: { product: true } } },
            });
        }
        if (!order) {
            console.warn(`[Bakong Webhook] ❌ Order NOT found for sessionId: "${sessionId || 'N/A'}", txnId: "${transactionId || 'N/A'}" or md5: "${sanitizedMd5 || 'N/A'}"`);
            return res.status(200).json({ message: 'Order not found, acknowledged' });
        }
        if (order.paymentStatus === 'PAID') {
            console.log(`[Bakong Webhook] Order ${order.paymentTxnId} already marked PAID. Skipping.`);
            return res.status(200).json({ message: 'Order already processed' });
        }
        // Verify Amount and Currency
        if (amount) {
            const parsedAmount = parseFloat(amount);
            const webhookCurrency = currency ? currency.toString().toUpperCase().trim() : 'USD';
            let isAmountMatch = false;
            if (webhookCurrency === 'KHR') {
                const expectedKhr = Math.round(order.price * 4100);
                isAmountMatch = Math.abs(parsedAmount - expectedKhr) <= 10;
                if (!isAmountMatch) {
                    console.warn(`[Bakong Webhook] ❌ Amount mismatch (KHR)! Webhook=${parsedAmount}, Order expected KHR=${expectedKhr} (Order price USD=${order.price})`);
                }
            }
            else {
                isAmountMatch = Math.abs(parsedAmount - order.price) <= 0.05;
                if (!isAmountMatch) {
                    console.warn(`[Bakong Webhook] ❌ Amount mismatch (USD)! Webhook=${parsedAmount}, Order expected USD=${order.price}`);
                }
            }
            if (!isAmountMatch) {
                return res.status(400).json({ error: 'Amount mismatch' });
            }
        }
        if (currency) {
            const normalizedCurrency = currency.toString().toUpperCase().trim();
            if (normalizedCurrency !== 'USD' && normalizedCurrency !== 'KHR') {
                console.warn(`[Bakong Webhook] ❌ Currency not supported! Webhook currency=${normalizedCurrency}`);
                return res.status(400).json({ error: 'Currency not supported' });
            }
        }
        const isSuccess = typeof rawStatus === 'string' &&
            ['PAID', 'SUCCESS', 'paid', 'success'].includes(rawStatus.toUpperCase());
        if (!isSuccess) {
            console.warn(`[Bakong Webhook] ⚠️ Payment reported unsuccessful. Raw status: "${rawStatus}"`);
            await prisma_1.default.order.update({
                where: { id: order.id },
                data: { paymentStatus: 'FAILED', status: 'FAILED', deliveryStatus: 'FAILED' },
            });
            await (0, telegram_1.sendTelegramNotification)(`❌ <b>Bakong Payment Failed</b>\n` +
                `-----------------------------------------\n` +
                `<b>Txn ID:</b> <code>${order.paymentTxnId}</code>\n` +
                `<b>Status from Bakong:</b> ${rawStatus}\n` +
                `<b>Amount:</b> $${order.price.toFixed(2)}`);
            return res.status(200).json({ message: 'Payment failure recorded' });
        }
        // Replay attack check
        const replayCheck = await prisma_1.default.order.findFirst({
            where: {
                paymentMd5: sanitizedMd5 || order.paymentMd5 || '',
                paymentStatus: 'PAID',
                id: { not: order.id }
            }
        });
        if (replayCheck) {
            console.warn(`[Bakong Webhook] ❌ Replay attack detected! MD5 "${sanitizedMd5}" already used by paid order "${replayCheck.paymentTxnId}".`);
            return res.status(409).json({ error: 'Transaction already used' });
        }
        const ref = `BAKONG-${sanitizedMd5 || Date.now()}`;
        console.log(`[Bakong Webhook] ✅ Payment confirmed for order "${order.paymentTxnId}". Processing delivery...`);
        const result = await (0, paymentVerification_1.processVerifiedPayment)(order, ref);
        console.log(`[Bakong Webhook] Order update complete. finalStatus="${result.currentOrder.status}"`);
        return res.status(200).json({
            message: 'Bakong payment processed and top-up delivered',
            status: result.currentOrder.status,
        });
    }
    catch (error) {
        console.error('[Bakong Webhook] ❌ Unhandled error processing callback:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});
exports.default = router;
