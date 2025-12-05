/**
 * Shopify Admin API Client
 * Handles REST API calls to Shopify with pagination and rate limiting
 */
interface ShopifyProduct {
    id: number;
    title: string;
    vendor: string | null;
    product_type: string | null;
    variants: Array<{
        price: string;
    }>;
    created_at: string;
    updated_at: string;
}
interface ShopifyCustomer {
    id: number;
    email: string;
    first_name: string | null;
    last_name: string | null;
    orders_count: number;
    total_spent: string;
    created_at: string;
    updated_at: string;
}
interface ShopifyOrder {
    id: number;
    order_number: number;
    total_price: string;
    currency: string;
    customer: ShopifyCustomer | null;
    line_items: Array<{
        product_id: number;
        title: string;
        price: string;
        vendor: string | null;
    }>;
    created_at: string;
    updated_at: string;
}
export declare class ShopifyClient {
    private shopDomain;
    private accessToken;
    private baseUrl;
    constructor(shopDomain: string, accessToken: string);
    /**
     * Make a request to Shopify Admin API
     */
    private request;
    /**
     * Simple delay helper for rate limiting
     */
    private delay;
    /**
     * Parse Link header for pagination
     */
    private parseNextPageInfo;
    /**
     * Fetch all products with pagination
     */
    getAllProducts(limit?: number): Promise<ShopifyProduct[]>;
    /**
     * Fetch all customers with pagination
     */
    getAllCustomers(limit?: number): Promise<ShopifyCustomer[]>;
    /**
     * Fetch all orders with pagination (last 90 days by default)
     */
    getAllOrders(limit?: number, createdAtMin?: string): Promise<ShopifyOrder[]>;
    /**
     * Test the connection by fetching shop info
     */
    testConnection(): Promise<boolean>;
}
export type { ShopifyProduct, ShopifyCustomer, ShopifyOrder };
//# sourceMappingURL=shopify.d.ts.map