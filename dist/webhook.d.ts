interface ShopifyCustomer {
    id: number;
    email: string;
    first_name?: string;
    last_name?: string;
    total_spent?: string;
    orders_count?: number;
}
interface ShopifyLineItem {
    product_id: number;
    title: string;
    price: string;
    vendor?: string;
    quantity?: number;
}
interface ShopifyOrder {
    id: number;
    order_number?: number;
    total_price: string;
    currency: string;
    customer?: ShopifyCustomer;
    line_items?: ShopifyLineItem[];
    created_at?: string;
    checkout_token?: string;
}
interface ShopifyProduct {
    id: number;
    title: string;
    vendor?: string;
    product_type?: string;
    variants?: Array<{
        price: string;
    }>;
}
interface ShopifyCheckout {
    id: number;
    token: string;
    cart_token?: string;
    email?: string;
    total_price: string;
    currency: string;
    line_items?: ShopifyLineItem[];
    completed_at?: string | null;
    created_at?: string;
    updated_at?: string;
}
interface ShopifyCart {
    id: string;
    token: string;
    line_items?: ShopifyLineItem[];
    created_at?: string;
    updated_at?: string;
}
interface ShopifyRefund {
    id: number;
    order_id: number;
    note?: string;
    created_at?: string;
    transactions?: Array<{
        amount: string;
        currency: string;
    }>;
    refund_line_items?: Array<{
        quantity: number;
        subtotal: number;
    }>;
}
export declare function verifyHmac(rawBody: string, hmacHeader: string, secret: string): boolean;
export declare function findTenantByDomain(shopDomain: string): Promise<{
    id: string;
    name: string;
    shopDomain: string;
    webhookSecret: string;
    accessToken: string | null;
    createdAt: Date;
    updatedAt: Date;
} | null>;
export declare function processOrderCreated(tenantId: string, payload: ShopifyOrder): Promise<void>;
export declare function processCustomer(tenantId: string, payload: ShopifyCustomer): Promise<void>;
export declare function processProduct(tenantId: string, payload: ShopifyProduct): Promise<void>;
export declare function processCheckout(tenantId: string, payload: ShopifyCheckout): Promise<void>;
export declare function processCart(tenantId: string, payload: ShopifyCart): Promise<void>;
export declare function processRefund(tenantId: string, payload: ShopifyRefund): Promise<void>;
export declare function routeWebhook(tenantId: string, topic: string, payload: unknown): Promise<void>;
export {};
//# sourceMappingURL=webhook.d.ts.map