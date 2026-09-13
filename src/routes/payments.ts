import { Router, Response } from 'express';
import prisma from '../prisma';
import { AuthenticatedRequest } from '../middleware/auth';
import { lookupPlayerNickname } from '../utils/gameProviderMock';
import { generateABAMockPayment, generateBakongKHQR } from '../utils/paymentMock';
import { sendTelegramNotification } from '../utils/telegram';
import { verifyAbaKhqrPayment, processVerifiedPayment } from '../utils/paymentVerification';

const router = Router();

// POST /api/payments/create
router.post('/create', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { packageId, playerId, playerZoneId, paymentMethod, email, gameSlug, productSlug, packageName, price, amount } = req.body;

    if ((!packageId && !packageName) || !playerId || !paymentMethod) {
      return res.status(400).json({ error: 'Required fields missing' });
    }

    let normalizedMethod = (paymentMethod || '').toUpperCase().trim();
    if (normalizedMethod === 'KHQR' || normalizedMethod === 'BAKONG_KHQR') normalizedMethod = 'BAKONG';
    if (normalizedMethod === 'ABA_PAYWAY') normalizedMethod = 'ABA';

    if (!['ABA', 'BAKONG', 'CANADIA', 'CUTLUY', 'WALLET'].includes(normalizedMethod)) {
      normalizedMethod = 'BAKONG'; // Default to Bakong KHQR
    }
    const resolvedMethod = normalizedMethod;

    // Resilient Package Resolution
    let pkg: any = null;
    if (packageId) {
      pkg = await prisma.package.findUnique({
        where: { id: packageId },
        include: { product: true },
      }).catch(() => null);
    }

    if (!pkg && packageId) {
      pkg = await prisma.package.findFirst({
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
      const prod = await prisma.product.findFirst({
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
          pkg = prod.packages.find((p: any) => p.name.toLowerCase() === packageName.toLowerCase()) || null;
        }
        if (!pkg && price) {
          pkg = prod.packages.find((p: any) => Math.abs(p.price - parseFloat(price)) < 0.05) || null;
        }
        if (!pkg && prod.packages.length > 0) {
          pkg = prod.packages[0];
        }
        if (pkg) {
          pkg = await prisma.package.findUnique({
            where: { id: pkg.id },
            include: { product: true },
          }).catch(() => null);
        } else {
          // If no package exists yet, create on the fly
          const newPkg = await prisma.package.create({
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
      const lookup = await lookupPlayerNickname(pkg.product.slug, playerId, playerZoneId);
      if (lookup && lookup.nickname) {
        nickname = lookup.nickname;
      }
    } catch {
      nickname = 'Player';
    }

    // Generate unique payment transaction ID
    const timeCode = Date.now().toString().slice(-6);
    const randCode = Math.floor(1000 + Math.random() * 9000);
    let paymentTxnId = `TOPUP-${timeCode}-${randCode}`;

    // Map order to logged-in user if available
    let userId: string | null = null;
    let contactEmail = email || 'guest@topup.com';
    
    // Check if auth token header exists
    if (req.headers.authorization) {
      const authHeader = req.headers.authorization;
      const token = authHeader.split(' ')[1];
      const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-change-in-production-12345';
      try {
        const decoded = require('jsonwebtoken').verify(token, JWT_SECRET) as { id: string; email: string };
        userId = decoded.id;
        contactEmail = decoded.email || contactEmail;
      } catch (err) {
        // Fallback: Check if token is a Supabase Auth or Google JWT token
        try {
          const parts = token.split('.');
          if (parts.length === 3) {
            const decoded: any = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
            if (decoded) {
              userId = decoded.sub || decoded.id || null;
              contactEmail = decoded.email || contactEmail;
            }
          }
        } catch {
          // Ignore invalid token and create as guest
        }
      }
    }

    // Safely verify if userId exists in PostgreSQL DB to avoid foreign key violations
    if (userId) {
      try {
        const userExists = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
        if (!userExists) {
          if (contactEmail && contactEmail !== 'guest@topup.com') {
            const userByEmail = await prisma.user.findUnique({ where: { email: contactEmail }, select: { id: true } });
            userId = userByEmail ? userByEmail.id : null;
          } else {
            userId = null;
          }
        }
      } catch {
        userId = null;
      }
    }

    // Generate payment details depending on gateway choice
    let paymentDetails: any = {};
    let paymentQrCode: string | null = null;
    let paymentMd5: string | null = null;
    const baseUrl = `${req.protocol}://${req.get('host')}`;

    if (resolvedMethod === 'ABA') {
      const abaMerchantId = process.env.ABA_PAYWAY_MERCHANT_ID || 'MOCK_MERCHANT';
      const abaApiKey = process.env.ABA_PAYWAY_API_KEY || 'MOCK_KEY';
      paymentDetails = generateABAMockPayment(
        paymentTxnId,
        pkg.price,
        `${pkg.product.name} - ${pkg.name}`,
        abaMerchantId,
        abaApiKey,
        baseUrl
      );
    } else if (resolvedMethod === 'CANADIA') {
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
    } else {
      const bakongQr = await generateBakongKHQR(
        paymentTxnId,
        pkg.price,
        `${pkg.product.name} - ${pkg.name}`
      );
      paymentQrCode = bakongQr.qrCode;
      paymentMd5 = bakongQr.md5;
      if (bakongQr.txnId && bakongQr.txnId !== paymentTxnId) {
        paymentTxnId = bakongQr.txnId;
      }
      paymentDetails = bakongQr;
    }

    // Create Order in Database
    const order = await prisma.order.create({
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
        gatewayRef: (paymentDetails as any)?.gatewayRef || null,
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
    } else if (isFreeFire) {
      credentialsLabel = `<b>Free Fire ID:</b> <code>${playerId}</code>`;
    } else if (isValorant) {
      credentialsLabel = `<b>Valorant ID:</b> <code>${playerId}</code>`;
    } else if (isBloodStrike) {
      credentialsLabel = `<b>Blood Strike ID:</b> <code>${playerId}</code>`;
    } else if (isHoK) {
      credentialsLabel = `<b>Honor of Kings ID:</b> <code>${playerId}</code>`;
    } else if (isFarlight) {
      credentialsLabel = `<b>Farlight 84 ID:</b> <code>${playerId}</code>`;
    } else if (isDeltaForce) {
      credentialsLabel = `<b>Delta Force ID:</b> <code>${playerId}</code>`;
    } else if (playerZoneId) {
      credentialsLabel = `<b>Player ID:</b> <code>${playerId}</code>\n<b>Server/Zone ID:</b> <code>${playerZoneId}</code>`;
    }

    const playerIdFull = playerZoneId ? `${playerId} (${playerZoneId})` : playerId;
    const telegramMessage = `${playerIdFull} ${pkg.name}`.trim();
    await sendTelegramNotification(telegramMessage);

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
  } catch (error) {
    console.error('Order creation error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/payments/status/:transactionId
router.get('/status/:transactionId', async (req, res) => {
  try {
    const { transactionId } = req.params;
    let order = await prisma.order.findUnique({
      where: { paymentTxnId: transactionId },
      include: { package: { include: { product: true } } },
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Auto payment checking for pending orders
    if (order.paymentStatus === 'PENDING' && (order.paymentMethod === 'BAKONG' || order.paymentMethod === 'ABA')) {
      const isPaid = await verifyAbaKhqrPayment(order);
      if (isPaid) {
        console.log(`[Status Polling] Order ${transactionId} payment confirmed. Processing delivery...`);
        const result = await processVerifiedPayment(order, `POLL-AUTO-${order.paymentMd5 || transactionId}`);
        const updatedOrder = await prisma.order.findUnique({
          where: { paymentTxnId: transactionId },
          include: { package: { include: { product: true } } },
        });
        if (updatedOrder) order = updatedOrder;
      }
    }

    const deepLink = order.paymentQrCode ? `abamobilebank://ababank.com?type=payway&qrcode=${encodeURIComponent(order.paymentQrCode)}` : null;
    const payUrl = order.gatewayRef && order.gatewayRef.startsWith('TXN-') ? `https://www.vngzz2game.site/pay/${order.gatewayRef}` : null;
    const qrImageUrl = order.paymentQrCode ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=4&data=${encodeURIComponent(order.paymentQrCode)}` : null;

    return res.status(200).json({
      id: order.id,
      transactionId: order.paymentTxnId,
      gameName: order.package.product.name,
      gameSlug: order.package.product.slug,
      packageName: order.package.name,
      playerId: order.playerId,
      playerNickname: order.playerNickname,
      amount: order.price,
      status: order.status,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      stockDeliveredCode: order.stockDeliveredCode,
      paymentQrCode: order.paymentQrCode,
      deepLink,
      payUrl,
      qrImageUrl,
      createdAt: order.createdAt,
    });
  } catch (error) {
    console.error('Fetch order status error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/payments/verify
// SECURE PAYMENT VERIFICATION ENDPOINT
// 1. Validates txnId & paymentMd5 are present
// 2. Fetches order from OUR database (amount is always from DB, never trust client)
// 3. Checks idempotency (already paid)
// 4. Calls NBC Bakong API directly (server-to-server) using the stored MD5
// 5. Logs fraud attempts if MD5 doesn't match what's stored
// 6. Processes delivery atomically and idempotently
// ─────────────────────────────────────────────────────────────────────────────
router.post('/verify', async (req, res) => {
  try {
    const transactionId = req.body.transactionId || req.body.txnId || req.body.paymentTxnId;
    const clientMd5     = req.body.paymentMd5 || req.body.md5 || null;

    if (!transactionId) {
      return res.status(400).json({ verified: false, error: 'transactionId or txnId is required in request body' });
    }

    // ── RULE 1: Fetch order from OUR database (single source of truth) ────────
    const order = await prisma.order.findUnique({
      where: { paymentTxnId: transactionId },
      include: { package: { include: { product: true } } },
    });

    if (!order) {
      return res.status(404).json({ verified: false, error: 'Transaction ID not found in system.' });
    }

    // ── RULE 2: Idempotency guard — prevent double processing ─────────────────
    if (order.paymentStatus === 'PAID' || order.paymentStatus === 'SUCCESS' || order.status === 'PAID' || order.status === 'SUCCESS') {
      console.log(`[Verify] Order ${transactionId} already processed. Returning cached success.`);
      return res.status(200).json({
        verified: true,
        status: order.status,
        paymentStatus: order.paymentStatus,
        message: 'Payment already verified and processed.',
      });
    }

    if (order.paymentStatus === 'EXPIRED' || order.status === 'CANCELLED') {
      return res.status(410).json({ verified: false, error: 'Order has expired. Please create a new order.' });
    }

    // ── RULE 3: Expire orders older than 15 minutes ───────────────────────────
    const orderAgeMs = Date.now() - new Date(order.createdAt).getTime();
    if (orderAgeMs > 15 * 60 * 1000) {
      await prisma.order.update({
        where: { id: order.id },
        data: { paymentStatus: 'EXPIRED', status: 'CANCELLED', deliveryStatus: 'FAILED' },
      });
      return res.status(410).json({ verified: false, error: 'Order has expired. Please create a new order.' });
    }

    // ── RULE 4: MD5 fraud check (if client sends a paymentMd5, verify it matches DB) ─
    if (clientMd5 && order.paymentMd5) {
      const storedMd5 = order.paymentMd5.toLowerCase().trim();
      const incomingMd5 = clientMd5.toLowerCase().trim();
      if (storedMd5 !== incomingMd5) {
        console.error(`[SECURITY ALERT] MD5 mismatch on verify! TxnId=${transactionId} stored=${storedMd5} received=${incomingMd5}. Possible fraud.`);
        await sendTelegramNotification(
          `🚨 <b>SECURITY ALERT: MD5 Mismatch!</b>\n` +
          `<b>TxnId:</b> <code>${transactionId}</code>\n` +
          `<b>Stored MD5:</b> <code>${storedMd5}</code>\n` +
          `<b>Received MD5:</b> <code>${incomingMd5}</code>\n` +
          `Possible fraud attempt detected.`
        );
        return res.status(403).json({ verified: false, error: 'Security signature mismatch. Verification failed.' });
      }
    }

    // ── RULE 5: Multi-Gateway Server-to-Server Verification (CutLuy, Meatika, Bakong Relay, NBC) ─
    const isPaid = await verifyAbaKhqrPayment(order);

    // ── RULE 6: Race condition check — re-read DB in case concurrent poll got it first ─
    if (!isPaid) {
      const freshCheck = await prisma.order.findUnique({ where: { id: order.id } });
      if (freshCheck && (freshCheck.paymentStatus === 'SUCCESS' || freshCheck.paymentStatus === 'PAID' || freshCheck.status === 'PAID')) {
        console.log(`[Verify] Race: already processed by concurrent sweep for ${transactionId}`);
        return res.status(200).json({
          verified: true,
          status: freshCheck.status,
          paymentStatus: freshCheck.paymentStatus,
          message: 'Payment verified and product delivered!',
        });
      }
      return res.status(200).json({
        verified: false,
        status: order.status,
        paymentStatus: order.paymentStatus,
        message: 'Payment not yet confirmed by gateway. Please wait and try again.',
      });
    }

    // ── RULE 7: Process delivery atomically ───────────────────────────────────
    console.log(`[Verify] Payment confirmed for ${transactionId}. Processing delivery...`);
    const result = await processVerifiedPayment(order, `VERIFY-${order.paymentMd5 || transactionId}`);

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

  } catch (error) {
    console.error('[Verify] Error:', error);
    return res.status(500).json({ verified: false, error: 'Internal server error' });
  }
});



export default router;
