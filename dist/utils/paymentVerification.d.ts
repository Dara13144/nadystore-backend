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
export declare function verifyAbaKhqrPayment(order: any): Promise<boolean>;
/**
 * processVerifiedPayment
 *
 * Runs inside an atomic transaction block. Marks the payment as PAID and
 * allocates stock vouchers if the product is a code voucher category, else
 * auto-fulfills direct top-ups via VNGZZ2GAME API. Sends Telegram alert notifications.
 */
export declare function processVerifiedPayment(order: any, gatewayRef: string, options?: {
    forceFulfill?: boolean;
}): Promise<{
    deliverySuccess: boolean;
    deliveredCode: any;
    currentOrder: any;
}>;
/**
 * expireOldOrders
 *
 * Scans the database for orders still pending after 30 minutes, marking them
 * as EXPIRED / FAILED to prevent delayed auto-fulfillment issues.
 */
export declare function expireOldOrders(): Promise<void>;
