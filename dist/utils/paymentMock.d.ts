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
    qrCode: string;
    md5: string;
    txnId: string;
    merchantName?: string;
    gatewayRef?: string;
}
/**
 * Computes the ABA HMAC-SHA256 signature based on documentation
 */
export declare function generateABASignature(reqTime: string, merchantId: string, tranId: string, amount: string, items: string, shipping: string, type: string, paymentOption: string, apiKey: string): string;
/**
 * Generates mock ABA checkout payload and link
 */
export declare function generateABAMockPayment(tranId: string, amount: number, itemName: string, merchantId: string, apiKey: string, baseUrl: string): {
    checkoutUrl: string;
    payload: ABAPaymentRequest;
};
/**
 * Calculates the EMVCo standard CRC-16 CCITT-FALSE checksum of a string
 */
export declare function calculateCRC16(data: string): string;
export declare function generateBakongKHQR(tranId: string, amount: number, itemName: string): Promise<BakongQRResponse>;
export interface PaymentVerificationContext {
    expectedAmount?: number;
    expectedCurrency?: string;
    expectedMerchantId?: string;
}
/**
 * Checks Bakong payment status using multiple methods/gateways sequentially for maximum reliability.
 */
export declare function checkBakongPaymentStatus(md5: string, khpayTxnId?: string, ctx?: PaymentVerificationContext): Promise<boolean>;
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
export declare function verifyBakongWebhook(md5Hash: string, transactionId: string, signature: string, apiKey: string): boolean;
