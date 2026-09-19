import prisma from '../prisma';
import { checkBakongPaymentStatus, PaymentVerificationContext } from './paymentMock';
import { deliverTopup } from './gameProviderMock';
import { sendTelegramNotification } from './telegram';

const SANDBOX_MODE = process.env.SANDBOX_MODE === 'true';
const SANDBOX_AUTO_MS = 15000; // sandbox auto-approve after 15s

// ── Logging helpers ──────────────────────────────────────────────────────────
function log(tag: string, txnId: string, msg: string)    { console.log(`[${tag}] [${txnId}] ${msg}`); }
function logErr(tag: string, txnId: string, msg: string) { console.error(`[${tag}] X [${txnId}] ${msg}`); }

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
export async function verifyAbaKhqrPayment(order: any): Promise<boolean> {
  const txnId = order.paymentTxnId as string;
  const md5   = order.paymentMd5 as string | null;

  log('Verification', txnId, `Starting gateway verification. MD5=${md5 || 'N/A'} Amount=$${order.price} Method=${order.paymentMethod}`);

  // -- 1. Replay attack guard ------------------------------------------------
  if (md5) {
    const replayOrder = await prisma.order.findFirst({
      where: { paymentMd5: md5, paymentStatus: 'PAID', id: { not: order.id } },
    });
    if (replayOrder) {
      logErr('Verification', txnId,
        `REPLAY ATTACK: MD5 "${md5}" already used by paid order "${replayOrder.paymentTxnId}". Rejecting.`);
      return false;
    }
  }

  const rawVngKey = process.env.VNGZZ2GAME_API_KEY || process.env.AUTO_TOPUP_API_KEY;
  const vngzzApiKey = (rawVngKey && rawVngKey !== 'your-provider-api-key') ? rawVngKey : 'pwS5VEcfOkcN7skP5TRuWdUDdS9ZqG9m';
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
        const vngzzData = await vngzzRes.json() as any;
        if (vngzzData.data?.is_paid === true || vngzzData.data?.state === 'PAID' || vngzzData.data?.state === 'APPROVED' || vngzzData.data?.state === 'SUCCESS') {
          log('Verification', txnId, `✅ VNGZZ2GAME confirmed payment PAID for ref: ${targetTxn}`);
          return true;
        }
      }
    } catch (vngzzErr: any) {
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
        const cutluyData = await cutluyRes.json() as any;
        if (cutluyData.status === 'paid' || cutluyData.status === 'approved' || cutluyData.status === 'completed' || cutluyData.status === 'success') {
          log('Verification', txnId, `✅ CutLuy confirmed payment PAID for ref: ${order.gatewayRef}`);
          return true;
        }
      }
    } catch (cutluyErr: any) {
      logErr('Verification', txnId, `CutLuy check error: ${cutluyErr.message || cutluyErr}`);
    }
  }

  // -- 2. Live gateway check (Bakong KHQR) -----------------------------------
  if (md5) {
    const ctx: PaymentVerificationContext = {
      expectedAmount:     order.price,
      expectedCurrency:   'USD',
      expectedMerchantId: process.env.BAKONG_ACCOUNT_ID ? process.env.BAKONG_ACCOUNT_ID.replace(/['"]/g, '').trim() : undefined,
    };
    const khpayTxnId = txnId.startsWith('bk_') ? txnId : undefined;

    try {
      const isPaid = await checkBakongPaymentStatus(md5 as string, khpayTxnId, ctx);
      if (isPaid) {
        log('Verification', txnId, 'Gateway confirmed payment PAID.');
        return true;
      }
      log('Verification', txnId, 'Gateway returned NOT PAID yet.');
    } catch (err: any) {
      logErr('Verification', txnId, `Gateway call error: ${err.message || err}`);
    }
  }

  // -- 3. Sandbox auto-approve (testing only) --------------------------------
  if (SANDBOX_MODE) {
    const elapsedMs = Date.now() - new Date(order.createdAt).getTime();
    if (elapsedMs >= SANDBOX_AUTO_MS) {
      log('Verification', txnId,
        `[SANDBOX] ${Math.round(elapsedMs / 1000)}s elapsed >= 15s threshold. Auto-approving.`);
      return true;
    }
    log('Verification', txnId,
      `[SANDBOX] Only ${Math.round(elapsedMs / 1000)}s elapsed -- waiting for 15s.`);
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
export async function processVerifiedPayment(order: any, gatewayRef: string, options?: { forceFulfill?: boolean }) {
  // Always query fresh order with package and product included
  const freshOrder = await prisma.order.findUnique({
    where: { id: order.id },
    include: { package: { include: { product: true } } },
  });

  const activeOrder = freshOrder || order;
  const txnId = activeOrder.paymentTxnId;

  log('Delivery', txnId, `Initiating delivery workflow. GatewayRef: "${gatewayRef}"`);

  // Guard: idempotency - check if already delivered and payment confirmed
  if (!options?.forceFulfill && activeOrder.deliveryStatus === 'DELIVERED' && (activeOrder.paymentStatus === 'PAID' || activeOrder.paymentStatus === 'SUCCESS')) {
    log('Delivery', txnId, 'Order already DELIVERED and PAID -- skipping duplicate processing.');
    return {
      deliverySuccess: true,
      deliveredCode:   activeOrder.stockDeliveredCode,
      currentOrder:    activeOrder,
    };
  }

  // If direct top-up, trigger auto provider delivery to VNGZZ2GAME
  let providerRef = gatewayRef;
  const isVoucher = activeOrder.package?.category === 'CODE_VOUCHER';
  let deliveryResult: any = null;

  if (!isVoucher) {
    try {
      const gameSlug = activeOrder.package?.product?.slug || '';
      deliveryResult = await deliverTopup(
        gameSlug,
        activeOrder.playerId,
        activeOrder.playerZoneId || null,
        activeOrder.package?.name || '',
        activeOrder.price,
        txnId,
        (activeOrder.package as any)?.productCode,
        activeOrder.package?.amount
      );
      if (deliveryResult && deliveryResult.referenceId) {
        providerRef = deliveryResult.referenceId;
      }
    } catch (deliveryErr: any) {
      logErr('Delivery', txnId, `Provider delivery error: ${deliveryErr.message || deliveryErr}`);
      deliveryResult = {
        success: false,
        referenceId: providerRef,
        error: deliveryErr.message || 'Provider recharge exception',
      };
    }
  }

  // Execute database updates and stock claiming atomically
  const result = await prisma.$transaction(async (tx) => {
    let stockCode: string | null = null;

    if (isVoucher) {
      // Find an unused stock item for this package
      const stockItem = await tx.stock.findFirst({
        where: { packageId: activeOrder.packageId, isUsed: false },
        orderBy: { createdAt: 'asc' },
      });

      if (stockItem) {
        stockCode = stockItem.code;
        // Mark stock as used
        await tx.stock.update({
          where: { id: stockItem.id },
          data: { isUsed: true, orderId: activeOrder.id },
        });
        log('Delivery', txnId, `Claimed stock code: "${stockCode}"`);
      } else {
        logErr('Delivery', txnId, `OUT OF STOCK for package ${activeOrder.packageId}`);
      }
    }

    const deliveryStatus = isVoucher
      ? (stockCode ? 'DELIVERED' : 'FAILED')
      : (deliveryResult?.success ? 'DELIVERED' : (deliveryResult ? 'FAILED' : 'DELIVERED'));

    const finalStatus = 'COMPLETED'; // Gateway payment and delivery confirmed

    const updated = await tx.order.update({
      where: { id: activeOrder.id },
      data: {
        paymentStatus: 'SUCCESS',
        status: finalStatus,
        deliveryStatus: deliveryStatus,
        paidAt: activeOrder.paidAt || new Date(),
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

    const productSlug = result.updated.package?.product?.slug || activeOrder.package?.product?.slug || '';
    const isMLBB = productSlug.includes('mobile-legend') || productSlug.includes('mlbb') || productSlug.includes('moonton');
    const isFreeFire = productSlug.includes('free-fire');
    const isValorant = productSlug.includes('valorant');
    const isBloodStrike = productSlug.includes('blood-strike');
    const isHoK = productSlug.includes('honor-of-kings');
    const isFarlight = productSlug.includes('farlight');
    const isDeltaForce = productSlug.includes('delta-force');

    let credentialsLabel = `<b>Player ID:</b> <code>${activeOrder.playerId}</code>`;
    if (isMLBB) {
      credentialsLabel = `<b>Mobile Legends ID:</b> <code>${activeOrder.playerId}</code>\n<b>Server ID:</b> <code>${activeOrder.playerZoneId || 'N/A'}</code>`;
    } else if (isFreeFire) {
      credentialsLabel = `<b>Free Fire ID:</b> <code>${activeOrder.playerId}</code>`;
    } else if (isValorant) {
      credentialsLabel = `<b>Valorant ID:</b> <code>${activeOrder.playerId}</code>`;
    } else if (isBloodStrike) {
      credentialsLabel = `<b>Blood Strike ID:</b> <code>${activeOrder.playerId}</code>`;
    } else if (isHoK) {
      credentialsLabel = `<b>Honor of Kings ID:</b> <code>${activeOrder.playerId}</code>`;
    } else if (isFarlight) {
      credentialsLabel = `<b>Farlight 84 ID:</b> <code>${activeOrder.playerId}</code>`;
    } else if (isDeltaForce) {
      credentialsLabel = `<b>Delta Force ID:</b> <code>${activeOrder.playerId}</code>`;
    } else if (activeOrder.playerZoneId) {
      credentialsLabel = `<b>Player ID:</b> <code>${activeOrder.playerId}</code>\n<b>Server/Zone ID:</b> <code>${activeOrder.playerZoneId}</code>`;
    }

    const packageName = result.updated.package?.name || activeOrder.package?.name || '';
    const playerIdFull = activeOrder.playerZoneId ? `${activeOrder.playerId} (${activeOrder.playerZoneId})` : activeOrder.playerId;

    await sendTelegramNotification(`${playerIdFull} ${packageName}`.trim());
    log('Telegram', txnId, 'Successfully dispatched Telegram notification alert.');

    // If delivery failed (e.g. low balance on upstream provider API), send alert to admin
    if (result.deliveryStatus === 'FAILED' && !isVoucher) {
      const failReason = deliveryResult?.error || 'Provider balance or service error';
      await sendTelegramNotification(
        `⚠️ <b>Top-Up Delivery Pending / Action Required</b>\n` +
        `-----------------------------------------\n` +
        `<b>Txn ID:</b> <code>${txnId}</code>\n` +
        `<b>Game:</b> ${activeOrder.package?.product?.name || 'Game'}\n` +
        `<b>Player:</b> <code>${activeOrder.playerId}</code>${activeOrder.playerZoneId ? ` (Zone: <code>${activeOrder.playerZoneId}</code>)` : ''}\n` +
        `<b>Nickname:</b> ${activeOrder.playerNickname || 'N/A'}\n` +
        `<b>Package:</b> ${packageName}\n` +
        `<b>Price Paid:</b> $${activeOrder.price.toFixed(2)}\n` +
        `<b>Provider Note:</b> ${failReason}\n` +
        `👉 <i>Customer has paid. Please fund provider balance at vngzz2game.site and click Auto-Fulfill in Admin.</i>`
      ).catch(() => {});
    }
  } catch (tgErr: any) {
    logErr('Telegram', txnId, `Failed to dispatch Telegram alert: ${tgErr.message}`);
  }

  return {
    deliverySuccess: result.deliveryStatus === 'DELIVERED',
    deliveredCode:   result.stockCode,
    currentOrder:    result.updated,
  };
}

/**
 * expireOldOrders
 *
 * Scans the database for orders still pending after 30 minutes, marking them
 * as EXPIRED / FAILED to prevent delayed auto-fulfillment issues.
 */
export async function expireOldOrders() {
  const expiryCutoff = new Date(Date.now() - 15 * 60 * 1000); // 15 minutes ago

  try {
    const expiredOrders = await prisma.order.findMany({
      where: {
        paymentStatus: 'PENDING',
        createdAt: { lt: expiryCutoff },
      },
    });

    if (expiredOrders.length === 0) return;

    console.log(`[Sweeper] Found ${expiredOrders.length} expired/stale orders. Processing cleanup...`);

    for (const order of expiredOrders) {
      // Final live check to avoid cancelling paid orders
      const isPaid = await checkBakongPaymentStatus(order.paymentMd5 || '', undefined, {
        expectedAmount: order.price,
        expectedCurrency: 'USD',
      });
      if (isPaid) {
        console.log(`[Sweeper] Order ${order.paymentTxnId} confirmed PAID during expiry check. Processing delivery instead of expiring.`);
        await processVerifiedPayment(order, `SWEEPER-AUTO-${order.paymentMd5 || order.paymentTxnId}`);
      } else {
        await prisma.order.update({
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
  } catch (err: any) {
    console.error(`[Sweeper] Failed to clean up expired orders: ${err.message}`);
  }
}
