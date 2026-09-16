import crypto from 'crypto';
import prisma from '../prisma';

export interface ABAPaymentRequest {
  req_time: string;
  merchant_id: string;
  tran_id: string;
  amount: string;
  items: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  type: string;
  payment_option?: string;
  shipping?: string;
  hash: string;
  callback_url: string;
  return_url: string;
}

export interface BakongQRResponse {
  qrCode: string; // The raw KHQR string
  md5: string;    // MD5 of the QR code
  txnId: string;
  merchantName?: string;
  gatewayRef?: string;
}

/**
 * Computes the ABA HMAC-SHA256 signature based on documentation
 */
export function generateABASignature(
  reqTime: string,
  merchantId: string,
  tranId: string,
  amount: string,
  items: string,
  shipping: string,
  type: string,
  paymentOption: string,
  apiKey: string
): string {
  // Concat fields as specified by ABA documentation:
  // req_time + merchant_id + tran_id + amount + items + shipping + type + payment_option (if present)
  const data = reqTime + merchantId + tranId + amount + items + shipping + type + paymentOption;
  return crypto.createHmac('sha256', apiKey).update(data).digest('base64');
}

/**
 * Generates mock ABA checkout payload and link
 */
export function generateABAMockPayment(
  tranId: string,
  amount: number,
  itemName: string,
  merchantId: string,
  apiKey: string,
  baseUrl: string
): { checkoutUrl: string; payload: ABAPaymentRequest } {
  const reqTime = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14); // YYYYMMDDHHMMSS
  const amountStr = amount.toFixed(2);
  const items = Buffer.from(JSON.stringify([{ name: itemName, quantity: 1, price: amountStr }])).toString('base64');
  
  const hash = generateABASignature(
    reqTime,
    merchantId,
    tranId,
    amountStr,
    items,
    '0', // shipping
    'purchase', // type
    'cards', // payment_option
    apiKey
  );

  const payload: ABAPaymentRequest = {
    req_time: reqTime,
    merchant_id: merchantId,
    tran_id: tranId,
    amount: amountStr,
    items,
    firstName: 'John',
    lastName: 'Doe',
    email: 'customer@topup.com',
    phone: '012345678',
    type: 'purchase',
    payment_option: 'cards',
    shipping: '0',
    hash,
    callback_url: `${baseUrl}/api/callback/aba`,
    return_url: `${baseUrl}/orders/success?txnId=${tranId}`,
  };

  // The checkout URL redirects to our own simulated ABA page hosted on the frontend
  const checkoutUrl = `/payments/aba-checkout?txnId=${tranId}&amount=${amountStr}&desc=${encodeURIComponent(itemName)}`;

  return { checkoutUrl, payload };
}

/**
 * Calculates the EMVCo standard CRC-16 CCITT-FALSE checksum of a string
 */
export function calculateCRC16(data: string): string {
  let crc = 0xFFFF;
  for (let i = 0; i < data.length; i++) {
    crc ^= (data.charCodeAt(i) << 8);
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
      } else {
        crc = (crc << 1) & 0xFFFF;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export async function generateBakongKHQR(
  tranId: string,
  amount: number,
  itemName: string
): Promise<BakongQRResponse> {
  const amountStr = amount.toFixed(2);
  console.log(`[Bakong KHQR Generator] Starting generation for Txn ID: "${tranId}", Amount: $${amountStr}, Item Name: "${itemName}"`);

  // ── 000. VNGZZ2GAME Live ABA KHQR Generator (https://www.vngzz2game.site) ─
  const vngzzKey = process.env.VNGZZ2GAME_API_KEY || process.env.AUTO_TOPUP_API_KEY || 'pwArFcCneE0vcBDIGu6ZeIKHUZ3HxeQZ';
  if (vngzzKey) {
    try {
      console.log(`[Bakong KHQR Generator] [VNGZZ2GAME] Requesting live ABA KHQR: $${amountStr}, Ref: ${tranId}`);
      const res = await fetch('https://www.vngzz2game.site/api/v1/generate_qr', {
        method: 'POST',
        headers: {
          'X-API-Key': vngzzKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: amountStr,
          currency: 'USD',
          idempotency_key: tranId,
          metadata: { order_id: tranId, item: itemName }
        }),
        signal: AbortSignal.timeout(6000),
      });

      if (res.ok) {
        const data = await res.json() as any;
        console.log('[Bakong KHQR Generator] [VNGZZ2GAME] Response:', JSON.stringify(data));
        const qrString = data.data?.qr_string || data.qr_string;
        if (qrString) {
          const md5 = crypto.createHash('md5').update(qrString).digest('hex').toLowerCase();
          const txn = data.data?.transaction_id || tranId;
          return {
            qrCode: qrString,
            md5,
            txnId: tranId,
            gatewayRef: txn,
            payUrl: data.data?.pay_url,
            deepLink: data.data?.deep_link,
            qrImageUrl: data.data?.qr_image_url,
          } as any;
        }
      } else {
        const errText = await res.text();
        console.warn(`[Bakong KHQR Generator] [VNGZZ2GAME] Error ${res.status}:`, errText);
      }
    } catch (vngzzErr: any) {
      console.error('[Bakong KHQR Generator] [VNGZZ2GAME] Failed:', vngzzErr.message || vngzzErr);
    }
  }

  // ── 00. CutLuy Live Auto Payment Gateway (https://cutluy.com/) ───────────
  const cutluyApiKey = process.env.CUTLUY_API_KEY || 'ck_live_7TNbEHrfs2CDCc5ze1atGCIM6ISYZQwD';
  const cutluyApiUrl = process.env.CUTLUY_API_URL || 'https://cutluy.com/v1/payments';

  if (cutluyApiKey) {
    try {
      console.log(`[Bakong KHQR Generator] [CutLuy] Requesting payment: Amount $${amountStr}, Ref: ${tranId}`);
      const res = await fetch(cutluyApiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${cutluyApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: parseFloat(amountStr),
          reference_id: tranId,
        }),
        signal: AbortSignal.timeout(6000),
      });

      if (res.ok) {
        const paymentData = await res.json() as any;
        console.log('[Bakong KHQR Generator] [CutLuy] Response:', JSON.stringify(paymentData));
        const qrString = paymentData.qr_string || paymentData.data?.qr_string || (paymentData.payment && paymentData.payment.qr_string);
        if (qrString) {
          const md5 = crypto.createHash('md5').update(qrString).digest('hex').toLowerCase();
          const cutluyRef = paymentData.id || paymentData.data?.id || (paymentData.payment && paymentData.payment.id) || tranId;
          return {
            qrCode: qrString,
            md5,
            txnId: tranId,
            gatewayRef: cutluyRef,
          } as any;
        }
      } else {
        const errText = await res.text();
        console.warn(`[Bakong KHQR Generator] [CutLuy] Error ${res.status}:`, errText);
      }
    } catch (cutluyErr: any) {
      console.error('[Bakong KHQR Generator] [CutLuy] Failed:', cutluyErr.message || cutluyErr);
    }
  }

  // ── 0. MEATIKA KHQR API (khqr-api.meatika.dev) ──────────────────────────
  const meatikaApiKey = process.env.MEATIKA_API_KEY || 
                        (process.env.BAKONG_TOKEN?.startsWith('sk_') ? process.env.BAKONG_TOKEN : '') || 
                        '';
  const rawMeatikaUrl = process.env.MEATIKA_API_URL || 
                        (process.env.BAKONG_API?.includes('meatika') ? process.env.BAKONG_API : '') || 
                        'https://khqr-api.meatika.dev';
  const meatikaApiUrl = rawMeatikaUrl.replace(/\/$/, '').replace(/\/api$/, '') + '/api';

  if (meatikaApiKey) {
    try {
      const generateUrl = `${meatikaApiUrl}/generate-khqr?amount=${parseFloat(amountStr)}&api_key=${meatikaApiKey}`;
      console.log(`[Bakong KHQR Generator] Trying Meatika: ${generateUrl}`);

      const apiRes = await fetch(generateUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });

      console.log(`[Bakong KHQR Generator] Meatika response status: ${apiRes.status}`);
      if (apiRes.ok) {
        const resData = await apiRes.json() as any;
        console.log('[Bakong KHQR Generator] Meatika Response JSON:', JSON.stringify(resData));
        if (resData.qr_string && resData.md5) {
          console.log('[Bakong KHQR Generator] ✅ KHQR generated successfully via Meatika.');
          return {
            qrCode: resData.qr_string,
            md5:    resData.md5.toLowerCase().trim(),
            txnId:  tranId,
          };
        }
      }
    } catch (apiErr: any) {
      console.error('[Bakong KHQR Generator] Meatika generation failed:', apiErr.message || apiErr);
    }
  }

  // ── 1. KHPAY API (khpay.site) ────────────────────────────────────────────
  const khpayUrl = process.env.KHPAY_API_URL;
  const khpayToken = process.env.KHPAY_API_KEY;

  if (khpayToken) {
    try {
      const generateUrl = `${khpayUrl}/bakong/generate`;
      console.log(`[Bakong KHQR Generator] Trying KHPAY API: ${generateUrl}`);
      
      const apiRes = await fetch(generateUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${khpayToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: amountStr,
          currency: 'USD',
          note: itemName,
        }),
        signal: AbortSignal.timeout(5000), // 5 seconds timeout
      });

      console.log(`[Bakong KHQR Generator] KHPAY response status: ${apiRes.status}`);
      if (apiRes.ok) {
        const resData = await apiRes.json() as any;
        console.log('[Bakong KHQR Generator] KHPAY Response JSON:', JSON.stringify(resData));
        if (resData.success && resData.data?.qr && resData.data?.md5) {
          console.log('[Bakong KHQR Generator] ✅ KHQR generated successfully via KHPAY.');
          return {
            qrCode: resData.data.qr,
            md5:    resData.data.md5.toLowerCase().trim(),
            txnId:  resData.data.transaction_id || tranId,
          };
        }
        console.warn('[Bakong KHQR Generator] KHPAY returned success=false or missing data:', resData);
      } else {
        const errText = await apiRes.text();
        console.warn(`[Bakong KHQR Generator] KHPAY HTTP Error response: ${errText}`);
      }
    } catch (apiErr: any) {
      console.error('[Bakong KHQR Generator] KHPAY generation failed/timed out:', apiErr.message || apiErr);
    }
  }

  // ── 2. BAKONG RELAY API (api.bakongrelay.com) ───────────────────────────
  const relayUrl   = process.env.BAKONG_RELAY_URL   || 'https://api.bakongrelay.com/v1';
  const token = process.env.BAKONG_RELAY_TOKEN || process.env.BAKONG_TOKEN || '';
  const isRelay = token.startsWith('rbkn') || !!process.env.BAKONG_RELAY_TOKEN;
  const relayToken = isRelay ? token : '';
  const accountId  = (process.env.BAKONG_ACCOUNT_ID  || 'dara_mao1@bkrt').trim().replace(/['"]/g, '');
  const merchantName = (process.env.BAKONG_MERCHANT_NAME || 'NA-DY TOPUP ll').trim().replace(/['"]/g, '');
  const merchantCity = (process.env.BAKONG_MERCHANT_CITY || 'Phnom Penh').trim().replace(/['"]/g, '');

  if (relayToken) {
    try {
      // 1. Try Bakong Relay Web Checkout Session
      try {
        const checkoutUrl = `${relayUrl}/web_checkouts/create`;
        console.log(`[Bakong KHQR Generator] Trying Web Checkout Create: ${checkoutUrl}`);
        const isKhrAccount = accountId.toLowerCase().endsWith('@bkrt');
        const currency = isKhrAccount ? 'KHR' : 'USD';
        const finalAmount = isKhrAccount ? Math.round(amount * 4100) : parseFloat(amountStr);

        const frontendUrl = (process.env.FRONTEND_URL || 'https://robbytopupv2-frontend.onrender.com').trim().replace(/\/$/, '');
        const backendUrl = (process.env.BACKEND_URL || 'https://robbytopupv2-backend.onrender.com').trim().replace(/\/$/, '');

        const payload = {
          trans_id: tranId,
          req_custom: { lang: "km", ttl: 5 },
          req_khqr: {
            account_id: accountId,
            merchant_name: merchantName.slice(0, 25),
            merchant_city: merchantCity.slice(0, 15),
            amount: finalAmount,
            currency: currency
          },
          req_url: {
            return_url: `${frontendUrl}/orders/${tranId}`,
            webhook_url: `${backendUrl}/api/webhook`
          }
        };

        const apiRes = await fetch(checkoutUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${relayToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(6000),
        });

        if (apiRes.ok) {
          const resData = await apiRes.json() as any;
          if (resData.responseCode === 0 && resData.data?.session_id) {
            const sessionId = resData.data.session_id;
            console.log(`[Bakong KHQR Generator] Web checkout session created: ${sessionId}. Querying details...`);

            const detailsUrl = `${relayUrl}/web_checkouts/details`;
            const detailsRes = await fetch(detailsUrl, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${relayToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ session_id: sessionId }),
              signal: AbortSignal.timeout(6000),
            });

            if (detailsRes.ok) {
              const detailsData = await detailsRes.json() as any;
              if (detailsData.responseCode === 0 && detailsData.data?.req_khqr?.qr_string) {
                console.log('[Bakong KHQR Generator] ✅ KHQR generated successfully via Web Checkout.');
                return {
                  qrCode: detailsData.data.req_khqr.qr_string,
                  md5:    (detailsData.data.req_khqr.md5 || '').toLowerCase().trim(),
                  txnId:  tranId,
                  gatewayRef: sessionId,
                  merchantName,
                } as any;
              }
            }
          }
        }
      } catch (checkoutErr: any) {
        console.warn(`[Bakong KHQR Generator] Web Checkout method failed, falling back to generate_qr:`, checkoutErr.message || checkoutErr);
      }

      // 2. Fallback to traditional generate_qr
      const generateUrl = `${relayUrl}/generate_qr`;
      const billNumber = tranId.slice(-25);
      console.log(`[Bakong KHQR Generator] Trying Bakong Relay generate_qr: ${generateUrl} with account: ${accountId}`);

      const apiRes = await fetch(generateUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${relayToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          account_id:    accountId,
          merchant_name: merchantName.slice(0, 25),
          merchant_city: merchantCity.slice(0, 15),
          amount:        parseFloat(amountStr),
          currency:      'USD',
          bill_number:   billNumber,
          static:        false,
        }),
        signal: AbortSignal.timeout(5000),
      });

      if (apiRes.ok) {
        const resData = await apiRes.json() as any;
        console.log('[Bakong KHQR Generator] Bakong Relay Response JSON:', JSON.stringify(resData));
        if (resData.responseCode === 0 && resData.data?.qr && resData.data?.md5) {
          console.log('[Bakong KHQR Generator] ✅ KHQR generated successfully via Bakong Relay generate_qr.');
          return {
            qrCode: resData.data.qr,
            md5:    resData.data.md5.toLowerCase().trim(),
            txnId:  tranId,
            merchantName,
          };
        }
        console.warn('[Bakong KHQR Generator] Bakong Relay returned non-zero responseCode:', resData);
      } else {
        const errText = await apiRes.text();
        console.warn(`[Bakong KHQR Generator] Bakong Relay HTTP Error response: ${errText}`);
      }
    } catch (apiErr: any) {
      console.error('[Bakong KHQR Generator] Bakong Relay generation failed/timed out:', apiErr.message || apiErr);
    }
  }

  // ── 3. FALLBACK: Local EMVCo compliance Tag 29 Generator ─────────────────
  const fbAccountId = (process.env.BAKONG_ACCOUNT_ID || 'dara_mao1@bkrt').trim().replace(/['"]/g, '');
  console.log(`[Bakong KHQR Generator] ⚠️ Falling back to Local EMVCo Tag 29 Generator using ID: "${fbAccountId}"`);
  
  const guid = 'kh.gov.nbc';
  const subtag29_00 = `00${guid.length.toString().padStart(2, '0')}${guid}`;
  const subtag29_01 = `01${fbAccountId.length.toString().padStart(2, '0')}${fbAccountId}`;
  const tag29Content = `${subtag29_00}${subtag29_01}`;
  const tag29 = `29${tag29Content.length.toString().padStart(2, '0')}${tag29Content}`;

  const tag54 = `54${amountStr.length.toString().padStart(2, '0')}${amountStr}`;

  const fbMerchantName = 'TOPUP SITE CO LTD';
  const tag59 = `59${fbMerchantName.length.toString().padStart(2, '0')}${fbMerchantName}`;

  const fbMerchantCity = 'Phnom Penh';
  const tag60 = `60${fbMerchantCity.length.toString().padStart(2, '0')}${fbMerchantCity}`;

  const subtag62_07 = `07${tranId.length.toString().padStart(2, '0')}${tranId}`;
  const tag62 = `62${subtag62_07.length.toString().padStart(2, '0')}${subtag62_07}`;

  const precursor = `000201010212${tag29}520459995303840${tag54}5802KH${tag59}${tag60}${tag62}6304`;
  const crc = calculateCRC16(precursor);
  const rawKHQR = `${precursor}${crc}`;
  
  const md5 = crypto.createHash('md5').update(rawKHQR).digest('hex').toLowerCase().trim();
  console.log(`[Bakong KHQR Generator] ✅ Local EMVCo QR generated successfully. MD5: ${md5}`);

  return {
    qrCode: rawKHQR,
    md5,
    txnId: tranId,
    merchantName,
  };
}

export interface PaymentVerificationContext {
  expectedAmount?: number;
  expectedCurrency?: string;
  expectedMerchantId?: string;
}

/**
 * Checks Bakong payment status using multiple methods/gateways sequentially for maximum reliability.
 */
export async function checkBakongPaymentStatus(
  md5: string,
  khpayTxnId?: string,
  ctx?: PaymentVerificationContext
): Promise<boolean> {
  const sanitizedMd5 = md5 ? md5.toLowerCase().trim() : '';
  console.log(`[Payment Verification] Verifying payment for MD5: "${sanitizedMd5}", KHPAY ID: "${khpayTxnId || 'N/A'}"`);

  if (!sanitizedMd5) {
    console.warn('[Payment Verification] ❌ Verification aborted: MD5 is empty.');
    return false;
  }

  // ── 0000. VNGZZ2GAME Live Payment Status Check (https://www.vngzz2game.site) ──
  const vngzzKey = process.env.VNGZZ2GAME_API_KEY || process.env.AUTO_TOPUP_API_KEY || 'pwArFcCneE0vcBDIGu6ZeIKHUZ3HxeQZ';
  if (vngzzKey) {
    try {
      const order = await prisma.order.findFirst({
        where: {
          OR: [
            { paymentMd5: sanitizedMd5 },
            { paymentMd5: sanitizedMd5.toUpperCase() },
            { paymentTxnId: khpayTxnId }
          ]
        }
      });

      const targetTxn = order?.gatewayRef || order?.paymentTxnId || khpayTxnId;
      if (targetTxn && (targetTxn.startsWith('TXN-') || targetTxn.startsWith('TOPUP-'))) {
        const checkUrl = 'https://www.vngzz2game.site/api/v1/check_transaction';
        const res = await fetch(checkUrl, {
          method: 'POST',
          headers: {
            'X-API-Key': vngzzKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ transaction_id: targetTxn }),
          signal: AbortSignal.timeout(5000),
        });

        if (res.ok) {
          const data = await res.json() as any;
          console.log('[Payment Verification] [VNGZZ2GAME] check_transaction response:', JSON.stringify(data));
          if (data.data?.is_paid === true || data.data?.state === 'PAID' || data.data?.state === 'APPROVED' || data.data?.state === 'SUCCESS') {
            console.log(`[Payment Verification] ✅ Confirmed PAID via VNGZZ2GAME for ${targetTxn}`);
            return true;
          }
        }
      }
    } catch (vngzzErr: any) {
      console.error('[Payment Verification] [VNGZZ2GAME] Check error:', vngzzErr.message || vngzzErr);
    }
  }

  // ── 000. CutLuy Live Payment Status Check ─────────────────────────────────
  const cutluyApiKey = process.env.CUTLUY_API_KEY || 'ck_live_7TNbEHrfs2CDCc5ze1atGCIM6ISYZQwD';
  if (cutluyApiKey) {
    try {
      const order = await prisma.order.findFirst({
        where: {
          OR: [
            { paymentMd5: sanitizedMd5 },
            { paymentMd5: sanitizedMd5.toUpperCase() },
            { paymentTxnId: khpayTxnId }
          ]
        }
      });

      const cutluyId = order?.gatewayRef;
      if (cutluyId && !cutluyId.startsWith('MOCK') && !cutluyId.startsWith('rbkn')) {
        const checkUrl = `https://cutluy.com/v1/payments/${cutluyId}`;
        const res = await fetch(checkUrl, {
          headers: { Authorization: `Bearer ${cutluyApiKey}` },
          signal: AbortSignal.timeout(5000)
        });
        if (res.ok) {
          const data = await res.json() as any;
          if (data.status === 'paid' || data.status === 'approved' || data.status === 'completed' || data.status === 'success') {
            console.log(`[Payment Verification] ✅ Confirmed PAID via CutLuy status for ${cutluyId}`);
            return true;
          }
        }
      }
    } catch (e: any) {
      console.error('[Payment Verification] [CutLuy] Check error:', e.message || e);
    }
  }

  // ── 00. Meatika Payment Status Check ───────────────────────────────────────
  const meatikaApiKey = process.env.MEATIKA_API_KEY || 
                        (process.env.BAKONG_TOKEN?.startsWith('sk_') ? process.env.BAKONG_TOKEN : '') || 
                        '';
  const rawMeatikaCheckUrl = process.env.MEATIKA_API_URL || 
                             (process.env.BAKONG_API?.includes('meatika') ? process.env.BAKONG_API : '') || 
                             'https://khqr-api.meatika.dev';
  const meatikaApiUrl = rawMeatikaCheckUrl.replace(/\/$/, '').replace(/\/api$/, '') + '/api';

  if (meatikaApiKey) {
    try {
      const checkUrl = `${meatikaApiUrl}/check-payment-status?md5=${sanitizedMd5}&api_key=${meatikaApiKey}`;
      console.log(`[Payment Verification] [Meatika] Checking: ${checkUrl}`);
      const res = await fetch(checkUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const result = await res.json() as any;
        console.log(`[Payment Verification] [Meatika] Response:`, JSON.stringify(result));
        const statusUpper = typeof result.status === 'string' ? result.status.toUpperCase().trim() : '';
        if (
          statusUpper === 'PAID' || 
          statusUpper === 'SUCCESS' || 
          statusUpper === 'COMPLETED' || 
          statusUpper === 'COMPLETED_PAYMENT' || 
          result.paid === true || 
          result.success === true ||
          result.is_paid === true
        ) {
          console.log(`[Payment Verification] ✅ Confirmed PAID via Meatika check-payment-status`);
          return true;
        }
      }
    } catch (err: any) {
      console.error('[Payment Verification] [Meatika] Check error/timeout:', err.message || err);
    }
  }

  // ── 0. Web Checkout Session check (Bakong Relay) ──────────────────────────
  const relayUrl   = process.env.BAKONG_RELAY_URL   || 'https://api.bakongrelay.com/v1';
  const token = process.env.BAKONG_RELAY_TOKEN || process.env.BAKONG_TOKEN || '';
  const isRelay = token.startsWith('rbkn') || !!process.env.BAKONG_RELAY_TOKEN;
  const relayToken = isRelay ? token : '';

  if (relayToken) {
    try {
      const order = await prisma.order.findFirst({
        where: {
          OR: [
            { paymentMd5: sanitizedMd5 },
            { paymentMd5: sanitizedMd5.toUpperCase() },
            { paymentTxnId: khpayTxnId }
          ]
        }
      });
      
      const sessionId = order?.gatewayRef;

      if (sessionId) {
        const checkUrl = `${relayUrl}/web_checkouts/details`;
        console.log(`[Payment Verification] [Bakong Relay Web Checkout] Checking session: ${checkUrl} session_id=${sessionId}`);
        const res = await fetch(checkUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${relayToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ session_id: sessionId }),
          signal: AbortSignal.timeout(5000),
        });

        if (res.ok) {
          const result = await res.json() as any;
          console.log(`[Payment Verification] [Bakong Relay Web Checkout] Response:`, JSON.stringify(result));
          if (result.responseCode === 0 && result.data) {
            const statusUpper = typeof result.data.status === 'string' ? result.data.status.toUpperCase() : '';
            if (statusUpper === 'PAID') {
              console.log(`[Payment Verification] ✅ Confirmed PAID via Bakong Relay web_checkouts/details`);
              return true;
            } else if (statusUpper === 'EXPIRED') {
              console.log(`[Payment Verification] ❌ Session EXPIRED via Bakong Relay web_checkouts/details`);
              return false;
            }
          }
        }
      }
    } catch (err: any) {
      console.error('[Payment Verification] [Bakong Relay Web Checkout] Check error:', err.message || err);
    }
  }

  // ── Sandbox Auto-Approve simulation bypass ──────────────────────────────────
  if (process.env.SANDBOX_MODE === 'true') {
    try {
      const order = await prisma.order.findFirst({
        where: {
          OR: [
            { paymentMd5: sanitizedMd5 },
            { paymentMd5: sanitizedMd5.toUpperCase() },
            { paymentTxnId: khpayTxnId }
          ]
        }
      });
      if (order) {
        const elapsedMs = Date.now() - new Date(order.createdAt).getTime();
        if (elapsedMs >= 15000) {
          console.log(`[Payment Verification] [Sandbox Auto-Approve] Order ${order.paymentTxnId} elapsed ${elapsedMs / 1000}s. Auto-confirming payment.`);
          return true;
        }
      }
    } catch (e: any) {
      console.error('[Payment Verification] Sandbox auto-approve check error:', e.message);
    }
  }

  // ── 1. KHPAY API status check ─────────────────────────────────────────────
  const khpayUrl = process.env.KHPAY_API_URL;
  const khpayToken = process.env.KHPAY_API_KEY;

  if (khpayToken) {
    try {
      if (khpayTxnId) {
        const checkUrl = `${khpayUrl}/qr/check/${khpayTxnId}`;
        console.log(`[Payment Verification] [KHPAY] Checking via txnId: ${checkUrl}`);
        const res = await fetch(checkUrl, {
          headers: { 'Authorization': `Bearer ${khpayToken}` },
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) {
          const data = await res.json() as any;
          console.log(`[Payment Verification] [KHPAY] check/id Response:`, JSON.stringify(data));
          if (data.success && data.data) {
            if (data.data.paid === true || data.data.status === 'paid') {
              console.log(`[Payment Verification] ✅ Confirmed PAID via KHPAY GET /qr/check/${khpayTxnId}`);
              return true;
            }
          }
        } else {
          console.warn(`[Payment Verification] [KHPAY] GET /qr/check HTTP Error: ${res.status}`);
        }
      }

      const checkUrl = `${khpayUrl}/bakong/check`;
      console.log(`[Payment Verification] [KHPAY] Checking via MD5: ${checkUrl} for md5=${sanitizedMd5}`);
      const res = await fetch(checkUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${khpayToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ md5: sanitizedMd5, transaction_id: khpayTxnId }),
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const data = await res.json() as any;
        console.log(`[Payment Verification] [KHPAY] check/md5 Response:`, JSON.stringify(data));
        if (data.success && data.data) {
          // Verify amount
          if (ctx?.expectedAmount !== undefined && data.data.amount !== undefined) {
            const gatewayAmt = parseFloat(data.data.amount);
            if (Math.abs(gatewayAmt - ctx.expectedAmount) > 0.001) {
              console.error(`[Payment Verification] ❌ AMOUNT MISMATCH (KHPAY)! Expected: ${ctx.expectedAmount}, Gateway: ${gatewayAmt}. Rejecting.`);
              return false;
            }
          }
          // Verify currency
          if (ctx?.expectedCurrency !== undefined && data.data.currency !== undefined) {
            if (data.data.currency.toUpperCase() !== ctx.expectedCurrency.toUpperCase()) {
              console.error(`[Payment Verification] ❌ CURRENCY MISMATCH (KHPAY)! Expected: ${ctx.expectedCurrency}, Gateway: ${data.data.currency}. Rejecting.`);
              return false;
            }
          }
          const statusUpper = typeof data.data.status === 'string' ? data.data.status.toUpperCase() : '';
          if (statusUpper === 'PAID' || statusUpper === 'SUCCESS' || data.data.paid === true) {
            console.log(`[Payment Verification] ✅ Confirmed PAID via KHPAY POST /bakong/check`);
            return true;
          }
        }
      } else {
        console.warn(`[Payment Verification] [KHPAY] POST /bakong/check HTTP Error: ${res.status}`);
      }
    } catch (err: any) {
      console.error('[Payment Verification] [KHPAY] Check error/timeout:', err.message || err);
    }
  }

  // ── 2. BAKONG RELAY API status check ──────────────────────────────────────
  if (relayToken) {
    try {
      const checkUrl = `${relayUrl}/check_transaction_by_md5`;
      console.log(`[Payment Verification] [Bakong Relay] Checking: ${checkUrl} md5=${sanitizedMd5}`);
      const res = await fetch(checkUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${relayToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ md5: sanitizedMd5 }),
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const result = await res.json() as any;
        console.log(`[Payment Verification] [Bakong Relay] Response:`, JSON.stringify(result));
        if (result.responseCode === 0 && result.data) {
          // Verify amount
          if (ctx?.expectedAmount !== undefined && result.data.amount !== undefined) {
            const gatewayAmt = parseFloat(result.data.amount);
            if (Math.abs(gatewayAmt - ctx.expectedAmount) > 0.001) {
              console.error(`[Payment Verification] ❌ AMOUNT MISMATCH (Relay)! Expected: ${ctx.expectedAmount}, Gateway: ${gatewayAmt}. Rejecting.`);
              return false;
            }
          }
          // Verify currency
          if (ctx?.expectedCurrency !== undefined && result.data.currency !== undefined) {
            if (result.data.currency.toUpperCase() !== ctx.expectedCurrency.toUpperCase()) {
              console.error(`[Payment Verification] ❌ CURRENCY MISMATCH (Relay)! Expected: ${ctx.expectedCurrency}, Gateway: ${result.data.currency}. Rejecting.`);
              return false;
            }
          }
          // Verify merchant ID
          const expectedMerchant = (ctx?.expectedMerchantId || process.env.BAKONG_ACCOUNT_ID || '').replace(/['"]/g, '').trim();
          const gatewayMerchantRaw = result.data.toAccountId || result.data.receiving_account_id || result.data.receivingAccountId;
          if (expectedMerchant && gatewayMerchantRaw) {
            const gatewayMerchant = gatewayMerchantRaw.trim().toLowerCase();
            if (gatewayMerchant !== expectedMerchant.trim().toLowerCase()) {
              console.error(`[Payment Verification] ❌ MERCHANT MISMATCH (Relay)! Expected: ${expectedMerchant}, Gateway: ${gatewayMerchant}. Rejecting.`);
              return false;
            }
          }
          console.log(`[Payment Verification] ✅ Confirmed PAID via Bakong Relay check_transaction_by_md5`);
          return true;
        }
      } else {
        console.warn(`[Payment Verification] [Bakong Relay] HTTP Error: ${res.status}`);
      }
    } catch (err: any) {
      console.error('[Payment Verification] [Bakong Relay] Check error/timeout:', err.message || err);
    }
  }

  // ── 3. NBC OpenAPI fallback check ──────────────────────────────────────────
  const bakongApiUrl = process.env.BAKONG_API || 'https://api-bakong.nbc.gov.kh';
  const tokenForNbc = process.env.BAKONG_RELAY_TOKEN || process.env.BAKONG_TOKEN || '';
  const isRelayForNbc = tokenForNbc.startsWith('rbkn') || !!process.env.BAKONG_RELAY_TOKEN;
  const bakongToken  = !isRelayForNbc ? (process.env.BAKONG_TOKEN || '') : '';

  if (bakongToken) {
    try {
      let baseUrl = bakongApiUrl.replace(/\/+$/, '');
      if (!baseUrl.endsWith('/v1')) {
        baseUrl += '/v1';
      }
      const url = `${baseUrl}/check_transaction_by_md5`;
      console.log(`[Payment Verification] [NBC API] Checking: ${url} md5=${sanitizedMd5}`);
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${bakongToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ md5: sanitizedMd5 }),
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const result = await res.json() as any;
        console.log(`[Payment Verification] [NBC API] Response:`, JSON.stringify(result));
        if (result && (result.responseCode === 0 || result.responseCode === '0' || result.responseCode === 200) && result.data) {
          // Verify amount
          if (ctx?.expectedAmount !== undefined && result.data.amount !== undefined) {
            const gatewayAmt = parseFloat(result.data.amount);
            if (Math.abs(gatewayAmt - ctx.expectedAmount) > 0.001) {
              console.error(`[Payment Verification] ❌ AMOUNT MISMATCH (NBC)! Expected: ${ctx.expectedAmount}, Gateway: ${gatewayAmt}. Rejecting.`);
              return false;
            }
          }
          // Verify currency
          if (ctx?.expectedCurrency !== undefined && result.data.currency !== undefined) {
            if (result.data.currency.toUpperCase() !== ctx.expectedCurrency.toUpperCase()) {
              console.error(`[Payment Verification] ❌ CURRENCY MISMATCH (NBC)! Expected: ${ctx.expectedCurrency}, Gateway: ${result.data.currency}. Rejecting.`);
              return false;
            }
          }
          // Verify merchant ID
          const expectedMerchant = (ctx?.expectedMerchantId || process.env.BAKONG_ACCOUNT_ID || '').replace(/['"]/g, '').trim();
          const gatewayMerchantRaw = result.data.toAccountId || result.data.receiving_account_id || result.data.receivingAccountId;
          if (expectedMerchant && gatewayMerchantRaw) {
            const gatewayMerchant = gatewayMerchantRaw.trim().toLowerCase();
            if (gatewayMerchant !== expectedMerchant.trim().toLowerCase()) {
              console.error(`[Payment Verification] ❌ MERCHANT MISMATCH (NBC)! Expected: ${expectedMerchant}, Gateway: ${gatewayMerchant}. Rejecting.`);
              return false;
            }
          }
          console.log(`[Payment Verification] ✅ Confirmed PAID via NBC OpenAPI check_transaction_by_md5`);
          return true;
        }
      } else {
        console.warn(`[Payment Verification] [NBC API] HTTP Error: ${res.status}`);
      }
    } catch (err: any) {
      console.error('[Payment Verification] [NBC API] Check error/timeout:', err.message || err);
    }
  }

  console.log(`[Payment Verification] ❌ Payment not detected across all gateways for MD5: "${sanitizedMd5}"`);
  return false;
}

/**
 * Verifies a real Bakong KHQR payment callback webhook signature.
 * Bakong signs webhooks using HMAC-SHA512 with your merchant API key.
 * 
 * HOW IT WORKS:
 *  - Bakong sends: { md5Hash, transactionId, paymentStatus, amount, ... }
 *  - We verify the signature using: HMAC-SHA512(md5Hash + transactionId, apiKey)
 *  - If signature matches → the payment is authentic
 *
 * @param md5Hash        - The md5 field from Bakong callback payload
 * @param transactionId  - The transaction ID (our paymentTxnId)
 * @param signature      - The X-Bakong-Signature header value from Bakong
 * @param apiKey         - Your Bakong Merchant API Secret Key (from .env)
 * @returns boolean — true if the callback is authentic
 */
export function verifyBakongWebhook(
  md5Hash: string,
  transactionId: string,
  signature: string,
  apiKey: string
): boolean {
  const dataToSign = `${md5Hash}${transactionId}`;
  const expectedSig = crypto.createHmac('sha512', apiKey).update(dataToSign).digest('hex');
  if (!signature || expectedSig.length !== signature.length) {
    return false;
  }
  return crypto.timingSafeEqual(
    Buffer.from(expectedSig, 'hex'),
    Buffer.from(signature, 'hex')
  );
}
