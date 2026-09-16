export interface LookupResult {
    success: boolean;
    nickname?: string;
    error?: string;
    avatarUrl?: string;
    region?: string;
    level?: string | number;
    playerId?: string;
    playerZoneId?: string;
}
export interface DeliveryResult {
    success: boolean;
    referenceId: string;
    error?: string;
}
export declare function lookupPlayerNickname(gameSlug: string, playerId: string, playerZoneId?: string): Promise<LookupResult>;
export declare function resolveLiveProductCode(gameSlug: string, packageName: string, amount?: number): string | null;
export declare function deliverTopup(gameSlug: string, playerId: string, playerZoneId: string | null, packageName: string, price: number, orderTxnId?: string, productCode?: string, packageAmount?: number): Promise<DeliveryResult>;
export declare function checkTopupOrderStatus(reference: string): Promise<any>;
export declare function fetchProviderProfile(): Promise<any>;
export declare function fetchProviderCategories(): Promise<any>;
export declare function fetchProviderProducts(gameCode: string): Promise<any>;
export declare function depositProviderBalance(amount: number, currency?: string): Promise<any>;
