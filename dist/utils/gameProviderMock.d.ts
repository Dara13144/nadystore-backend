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
export declare function deliverTopup(gameSlug: string, playerId: string, playerZoneId: string | null, packageName: string, amount: number, orderTxnId?: string, productCode?: string): Promise<DeliveryResult>;
