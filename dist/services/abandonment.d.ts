/**
 * Abandonment Detection Service
 * Marks checkouts as abandoned if no order is received within a time threshold
 */
/**
 * Detect and mark abandoned checkouts for a specific tenant
 */
export declare function detectAbandonedCheckouts(tenantId: string): Promise<number>;
/**
 * Detect abandoned checkouts for all tenants
 */
export declare function detectAllAbandonedCheckouts(): Promise<{
    totalAbandoned: number;
    tenantStats: Record<string, number>;
}>;
/**
 * Get abandonment analytics for a tenant
 */
export declare function getAbandonmentAnalytics(tenantId: string, startDate?: Date, endDate?: Date): Promise<{
    totalCheckouts: number;
    completedCheckouts: number;
    abandonedCheckouts: number;
    pendingCheckouts: number;
    conversionRate: number;
    abandonmentRate: number;
    abandonedValue: number;
    completedValue: number;
}>;
/**
 * Get refund analytics for a tenant
 */
export declare function getRefundAnalytics(tenantId: string, startDate?: Date, endDate?: Date): Promise<{
    totalRefunds: number;
    totalRefundAmount: number;
    averageRefundAmount: number;
}>;
//# sourceMappingURL=abandonment.d.ts.map