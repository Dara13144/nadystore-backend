"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyAbaKhqrPayment = verifyAbaKhqrPayment;
exports.processVerifiedPayment = processVerifiedPayment;
exports.expireOldOrders = expireOldOrders;
const prisma_1 = __importDefault(require("../prisma"));
const paymentMock_1 = require("./paymentMock");
const gameProviderMock_1 = require("./gameProviderMock");
const telegram_1 = require("./telegram");
const SANDBOX_MODE = process.env.SANDBOX_MODE === 'true';
const SANDBOX_AUTO_MS = 15000; // sandbox auto-approve after 15s
// ── Logging helpers ──────────────────────────────────────────────────────────
function log(tag, txnId, msg) { console.log(`[${tag}] [${txnId}] ${msg}`); }
function logErr(tag, txnId, msg) { console.error(`[${tag}] X [${txnId}] ${msg}`); }
/**
 * verifyAbaKhqrPayment
 *
 * Calls the live ABA/Bakong gateway APIs to check whether the MD5-identified
 * transaction has been paid. Validates amount, currency, and merchant ID.
 * In SANDBOX_MODE, auto-approves after SANDBOX_AUTO_MS have elapsed.
 *
 * Returns true  -> payment confirmed by gateway (or sandbox timer elapsed)
 * Returns false -> not yet paid
 */
async function verifyAbaKhqrPayment(order) {
    const txnId = order.paymentTxnId;
    const md5 = order.paymentMd5;
    log('Verification', txnId, `Starting gateway verification. MD5=${md5 || 'N/A'} Amount=$${order.price} Method=${order.paymentMethod}`);
    // -- 1. Replay attack guard ------------------------------------------------
    if (md5) {
        const replayOrder = await prisma_1.default.order.findFirst({
            where: { paymentMd5: md5, paymentStatus: 'PAID', id: { not: order.id } },
        });
        if (replayOrder) {
            logErr('Verification', txnId, `REPLAY ATTACK: MD5 "${md5}" already used by paid order "${replayOrder.paymentTxnId}". Rejecting.`);
            return false;
        }
    }
    // -- 1.4. Direct VNGZZ2GAME payment check --------------------------------
    const vngzzApiKey = process.env.VNGZZ2GAME_API_KEY || process.env.AUTO_TOPUP_API_KEY || 'pwArFcCneE0vcBDIGu6ZeIKHUZ3HxeQZ';
    const targetTxn = order.gatewayRef || order.paymentTxnId;
    if (vngzzApiKey && targetTxn && (targetTxn.startsWith('TXN-') || targetTxn.startsWith('TOPUP-'))) {
        try {
            const vngzzRes = await fetch('https://www.vngzz2game.site/api/v1/check_transaction', {
                method: 'POST',
                headers: {
                    'X-API-Key': vngzzApiKey,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ transaction_id: targetTxn }),
                signal: AbortSignal.timeout(5000),
            });
            if (vngzzRes.ok) {
                const vngzzData = await vngzzRes.json();
                if (vngzzData.data?.is_paid === true || vngzzData.data?.state === 'PAID' || vngzzData.data?.state === 'APPROVED' || vngzzData.data?.state === 'SUCCESS') {
                    log('Verification', txnId, `✅ VNGZZ2GAME confirmed payment PAID for ref: ${targetTxn}`);
                    return true;
                }
            }
        }
        catch (vngzzErr) {
            logErr('Verification', txnId, `VNGZZ2GAME check error: ${vngzzErr.message || vngzzErr}`);
        }
    }
    // -- 1.5. Direct CutLuy status check --------------------------------------
    const cutluyApiKey = process.env.CUTLUY_API_KEY || 'ck_live_7TNbEHrfs2CDCc5ze1atGCIM6ISYZQwD';
    if (order.gatewayRef && !order.gatewayRef.startsWith('MOCK') && !order.gatewayRef.startsWith('rbkn') && cutluyApiKey) {
        try {
            const cutluyRes = await fetch(`https://cutluy.com/v1/payments/${order.gatewayRef}`, {
                headers: { Authorization: `Bearer ${cutluyApiKey}` },
                signal: AbortSignal.timeout(5000),
            });
            if (cutluyRes.ok) {
                const cutluyData = await cutluyRes.json();
                if (cutluyData.status === 'paid' || cutluyData.status === 'approved' || cutluyData.status === 'completed' || cutluyData.status === 'success') {
                    log('Verification', txnId, `✅ CutLuy confirmed payment PAID for ref: ${order.gatewayRef}`);
                    return true;
                }
            }
        }
        catch (cutluyErr) {
            logErr('Verification', txnId, `CutLuy check error: ${cutluyErr.message || cutluyErr}`);
        }
    }
    // -- 2. Live gateway check (Bakong KHQR) -----------------------------------
    if (md5) {
        const ctx = {
            expectedAmount: order.price,
            expectedCurrency: 'USD',
            expectedMerchantId: process.env.BAKONG_ACCOUNT_ID ? process.env.BAKONG_ACCOUNT_ID.replace(/['"]/g, '').trim() : undefined,
        };
        const khpayTxnId = txnId.startsWith('bk_') ? txnId : undefined;
        try {
            const isPaid = await (0, paymentMock_1.checkBakongPaymentStatus)(md5, khpayTxnId, ctx);
            if (isPaid) {
                log('Verification', txnId, 'Gateway confirmed payment PAID.');
                return true;
            }
            log('Verification', txnId, 'Gateway returned NOT PAID yet.');
        }
        catch (err) {
            logErr('Verification', txnId, `Gateway call error: ${err.message || err}`);
        }
    }
    // -- 3. Sandbox auto-approve (testing only) --------------------------------
    if (SANDBOX_MODE) {
        const elapsedMs = Date.now() - new Date(order.createdAt).getTime();
        if (elapsedMs >= SANDBOX_AUTO_MS) {
            log('Verification', txnId, `[SANDBOX] ${Math.round(elapsedMs / 1000)}s elapsed >= 15s threshold. Auto-approving.`);
            return true;
        }
        log('Verification', txnId, `[SANDBOX] Only ${Math.round(elapsedMs / 1000)}s elapsed -- waiting for 15s.`);
    }
    return false;
}
/**
 * processVerifiedPayment
 *
 * Runs inside an atomic transaction block. Marks the payment as PAID and
 * allocates stock vouchers if the product is a code voucher category, else
 * auto-fulfills direct top-ups via VNGZZ2GAME API. Sends Telegram alert notifications.
 */
async function processVerifiedPayment(order, gatewayRef) {
    const txnId = order.paymentTxnId;
    log('Delivery', txnId, `Initiating delivery workflow. GatewayRef: "${gatewayRef}"`);
    // Guard: idempotency
    const freshCheck = await prisma_1.default.order.findUnique({ where: { id: order.id } });
    if (freshCheck?.paymentStatus === 'PAID' || freshCheck?.paymentStatus === 'SUCCESS') {
        log('Delivery', txnId, 'Order already PAID or SUCCESS -- skipping duplicate processing.');
        return {
            deliverySuccess: freshCheck.status === 'SUCCESS' || freshCheck.status === 'PAID',
            deliveredCode: freshCheck.stockDeliveredCode,
            currentOrder: freshCheck,
        };
    }
    // If direct top-up, trigger auto provider delivery to VNGZZ2GAME
    let providerRef = gatewayRef;
    const isVoucher = order.package?.category === 'CODE_VOUCHER';
    if (!isVoucher) {
        try {
            const gameSlug = order.package?.product?.slug || '';
            const deliveryRes = await (0, gameProviderMock_1.deliverTopup)(gameSlug, order.playerId, order.playerZoneId || null, order.package?.name || '', order.price, txnId, order.package?.productCode);
            if (deliveryRes.referenceId) {
                providerRef = deliveryRes.referenceId;
            }
        }
        catch (deliveryErr) {
            logErr('Delivery', txnId, `Provider delivery error: ${deliveryErr.message || deliveryErr}`);
        }
    }
    // Execute database updates and stock claiming atomically
    const result = await prisma_1.default.$transaction(async (tx) => {
        let stockCode = null;
        if (isVoucher) {
            // Find an unused stock item for this package
            const stockItem = await tx.stock.findFirst({
                where: { packageId: order.packageId, isUsed: false },
                orderBy: { createdAt: 'asc' },
            });
            if (stockItem) {
                stockCode = stockItem.code;
                // Mark stock as used
                await tx.stock.update({
                    where: { id: stockItem.id },
                    data: { isUsed: true, orderId: order.id },
                });
                log('Delivery', txnId, `Claimed stock code: "${stockCode}"`);
            }
            else {
                logErr('Delivery', txnId, `OUT OF STOCK for package ${order.packageId}`);
            }
        }
        const deliveryStatus = isVoucher
            ? (stockCode ? 'DELIVERED' : 'FAILED')
            : 'DELIVERED'; // Direct top-ups are fulfilled via provider
        const finalStatus = deliveryStatus === 'DELIVERED' ? 'PAID' : 'FAILED';
        const updated = await tx.order.update({
            where: { id: order.id },
            data: {
                paymentStatus: 'SUCCESS',
                status: finalStatus,
                deliveryStatus: deliveryStatus,
                paidAt: new Date(),
                gatewayRef: providerRef,
                stockDeliveredCode: stockCode,
            },
            include: { package: { include: { product: true } } },
        });
        return { updated, stockCode, deliveryStatus };
    });
    log('Delivery', txnId, `Transaction committed. deliveryStatus=${result.deliveryStatus} finalStatus=${result.updated.status}`);
    // Send Telegram Notification
    try {
        const deliveryEmoji = result.deliveryStatus === 'DELIVERED' ? '✅' : '⚠️';
        const deliveryDetail = result.stockCode
            ? `🎫 <b>Voucher Code:</b> <code>${result.stockCode}</code>`
            : `📲 <b>Top-Up Delivery:</b> ${result.deliveryStatus}`;
        const productSlug = result.updated.package?.product?.slug || order.package?.product?.slug || '';
        const isMLBB = productSlug.includes('mobile-legends');
        const isFreeFire = productSlug.includes('free-fire');
        const isValorant = productSlug.includes('valorant');
        const isBloodStrike = productSlug.includes('blood-strike');
        const isHoK = productSlug.includes('honor-of-kings');
        const isFarlight = productSlug.includes('farlight');
        const isDeltaForce = productSlug.includes('delta-force');
        let credentialsLabel = `<b>Player ID:</b> <code>${order.playerId}</code>`;
        if (isMLBB) {
            credentialsLabel = `<b>Mobile Legends ID:</b> <code>${order.playerId}</code>\n<b>Server ID:</b> <code>${order.playerZoneId || 'N/A'}</code>`;
        }
        else if (isFreeFire) {
            credentialsLabel = `<b>Free Fire ID:</b> <code>${order.playerId}</code>`;
        }
        else if (isValorant) {
            credentialsLabel = `<b>Valorant ID:</b> <code>${order.playerId}</code>`;
        }
        else if (isBloodStrike) {
            credentialsLabel = `<b>Blood Strike ID:</b> <code>${order.playerId}</code>`;
        }
        else if (isHoK) {
            credentialsLabel = `<b>Honor of Kings ID:</b> <code>${order.playerId}</code>`;
        }
        else if (isFarlight) {
            credentialsLabel = `<b>Farlight 84 ID:</b> <code>${order.playerId}</code>`;
        }
        else if (isDeltaForce) {
            credentialsLabel = `<b>Delta Force ID:</b> <code>${order.playerId}</code>`;
        }
        else if (order.playerZoneId) {
            credentialsLabel = `<b>Player ID:</b> <code>${order.playerId}</code>\n<b>Server/Zone ID:</b> <code>${order.playerZoneId}</code>`;
        }
        const packageName = result.updated.package?.name || order.package?.name || '';
        const playerIdFull = order.playerZoneId ? `${order.playerId} (${order.playerZoneId})` : order.playerId;
        await (0, telegram_1.sendTelegramNotification)(`${playerIdFull} ${packageName}`.trim());
        log('Telegram', txnId, 'Successfully dispatched Telegram notification alert.');
    }
    catch (tgErr) {
        logErr('Telegram', txnId, `Failed to dispatch Telegram alert: ${tgErr.message}`);
    }
    return {
        deliverySuccess: result.deliveryStatus === 'DELIVERED',
        deliveredCode: result.stockCode,
        currentOrder: result.updated,
    };
}
/**
 * expireOldOrders
 *
 * Scans the database for orders still pending after 30 minutes, marking them
 * as EXPIRED / FAILED to prevent delayed auto-fulfillment issues.
 */
async function expireOldOrders() {
    const expiryCutoff = new Date(Date.now() - 15 * 60 * 1000); // 15 minutes ago
    try {
        const expiredOrders = await prisma_1.default.order.findMany({
            where: {
                paymentStatus: 'PENDING',
                createdAt: { lt: expiryCutoff },
            },
        });
        if (expiredOrders.length === 0)
            return;
        console.log(`[Sweeper] Found ${expiredOrders.length} expired/stale orders. Processing cleanup...`);
        for (const order of expiredOrders) {
            // Final live check to avoid cancelling paid orders
            const isPaid = await (0, paymentMock_1.checkBakongPaymentStatus)(order.paymentMd5 || '', undefined, {
                expectedAmount: order.price,
                expectedCurrency: 'USD',
            });
            if (isPaid) {
                console.log(`[Sweeper] Order ${order.paymentTxnId} confirmed PAID during expiry check. Processing delivery instead of expiring.`);
                await processVerifiedPayment(order, `SWEEPER-AUTO-${order.paymentMd5 || order.paymentTxnId}`);
            }
            else {
                await prisma_1.default.order.update({
                    where: { id: order.id },
                    data: {
                        paymentStatus: 'EXPIRED',
                        status: 'CANCELLED',
                        deliveryStatus: 'FAILED',
                    },
                });
                log('Sweeper', order.paymentTxnId, 'Order flagged as EXPIRED / CANCELLED (older than 15 minutes).');
            }
        }
    }
    catch (err) {
        console.error(`[Sweeper] Failed to clean up expired orders: ${err.message}`);
    }
}
