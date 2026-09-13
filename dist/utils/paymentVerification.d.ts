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
export declare function processVerifiedPayment(order: any, gatewayRef: string): Promise<{
    deliverySuccess: boolean;
    deliveredCode: string | null;
    currentOrder: {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        playerId: string;
        playerZoneId: string | null;
        price: number;
        packageId: string;
        userId: string | null;
        playerNickname: string | null;
        status: string;
        paymentMethod: string;
        paymentStatus: string;
        paymentTxnId: string;
        gatewayRef: string | null;
        paymentQrCode: string | null;
        paymentMd5: string | null;
        paidAt: Date | null;
        deliveryStatus: string;
        stockDeliveredCode: string | null;
    };
}>;
/**
 * expireOldOrders
 *
 * Scans the database for orders still pending after 30 minutes, marking them
 * as EXPIRED / FAILED to prevent delayed auto-fulfillment issues.
 */
export declare function expireOldOrders(): Promise<void>;
