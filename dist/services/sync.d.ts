/**
 * Sync Service
 * Handles syncing data from Shopify Admin API to database
 */
interface SyncResult {
    success: boolean;
    products: {
        synced: number;
        errors: number;
    };
    customers: {
        synced: number;
        errors: number;
    };
    orders: {
        synced: number;
        errors: number;
    };
    duration: number;
    error?: string;
}
/**
 * Sync all data for a tenant from Shopify
 */
export declare function syncTenantData(tenantId: string): Promise<SyncResult>;
/**
 * Sync all tenants that have access tokens
 */
export declare function syncAllTenants(): Promise<void>;
export {};
//# sourceMappingURL=sync.d.ts.map