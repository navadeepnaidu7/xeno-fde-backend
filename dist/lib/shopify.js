"use strict";
/**
 * Shopify Admin API Client
 * Handles REST API calls to Shopify with pagination and rate limiting
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShopifyClient = void 0;
const SHOPIFY_API_VERSION = '2024-01';
class ShopifyClient {
    constructor(shopDomain, accessToken) {
        this.shopDomain = shopDomain;
        this.accessToken = accessToken;
        // Remove .myshopify.com if present to normalize
        const cleanDomain = shopDomain.replace('.myshopify.com', '');
        this.baseUrl = `https://${cleanDomain}.myshopify.com/admin/api/${SHOPIFY_API_VERSION}`;
    }
    /**
     * Make a request to Shopify Admin API
     */
    async request(endpoint, options = {}) {
        const { method = 'GET', body, params } = options;
        let url = `${this.baseUrl}${endpoint}`;
        if (params) {
            const searchParams = new URLSearchParams();
            for (const [key, value] of Object.entries(params)) {
                searchParams.append(key, String(value));
            }
            url += `?${searchParams.toString()}`;
        }
        const response = await fetch(url, {
            method,
            headers: {
                'X-Shopify-Access-Token': this.accessToken,
                'Content-Type': 'application/json',
            },
            body: body ? JSON.stringify(body) : undefined,
        });
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Shopify API error ${response.status}: ${error}`);
        }
        // Respect rate limits - Shopify allows 2 requests/second
        // Add small delay to be safe
        await this.delay(500);
        const data = await response.json();
        return { data, headers: response.headers };
    }
    /**
     * Simple delay helper for rate limiting
     */
    delay(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
    /**
     * Parse Link header for pagination
     */
    parseNextPageInfo(linkHeader) {
        if (!linkHeader)
            return null;
        const matches = linkHeader.match(/<[^>]+page_info=([^>&]+)[^>]*>;\s*rel="next"/);
        return matches ? matches[1] : null;
    }
    /**
     * Fetch all products with pagination
     */
    async getAllProducts(limit = 250) {
        const allProducts = [];
        let pageInfo = null;
        do {
            const params = { limit };
            if (pageInfo) {
                params.page_info = pageInfo;
            }
            const { data, headers } = await this.request('/products.json', { params: pageInfo ? { page_info: pageInfo, limit } : { limit } });
            allProducts.push(...data.products);
            pageInfo = this.parseNextPageInfo(headers.get('Link'));
            console.log(`Fetched ${allProducts.length} products...`);
        } while (pageInfo);
        return allProducts;
    }
    /**
     * Fetch all customers with pagination
     */
    async getAllCustomers(limit = 250) {
        const allCustomers = [];
        let pageInfo = null;
        do {
            const { data, headers } = await this.request('/customers.json', { params: pageInfo ? { page_info: pageInfo, limit } : { limit } });
            allCustomers.push(...data.customers);
            pageInfo = this.parseNextPageInfo(headers.get('Link'));
            console.log(`Fetched ${allCustomers.length} customers...`);
        } while (pageInfo);
        return allCustomers;
    }
    /**
     * Fetch all orders with pagination (last 90 days by default)
     */
    async getAllOrders(limit = 250, createdAtMin) {
        const allOrders = [];
        let pageInfo = null;
        // Default to last 90 days if not specified
        const minDate = createdAtMin || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
        do {
            const baseParams = {
                limit,
                status: 'any',
                created_at_min: minDate,
            };
            const { data, headers } = await this.request('/orders.json', { params: pageInfo ? { page_info: pageInfo, limit } : baseParams });
            allOrders.push(...data.orders);
            pageInfo = this.parseNextPageInfo(headers.get('Link'));
            console.log(`Fetched ${allOrders.length} orders...`);
        } while (pageInfo);
        return allOrders;
    }
    /**
     * Test the connection by fetching shop info
     */
    async testConnection() {
        try {
            await this.request('/shop.json');
            return true;
        }
        catch (error) {
            console.error('Shopify connection test failed:', error);
            return false;
        }
    }
}
exports.ShopifyClient = ShopifyClient;
//# sourceMappingURL=shopify.js.map