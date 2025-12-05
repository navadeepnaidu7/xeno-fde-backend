"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyHmac = verifyHmac;
exports.findTenantByDomain = findTenantByDomain;
exports.processOrderCreated = processOrderCreated;
exports.processCustomer = processCustomer;
exports.processProduct = processProduct;
exports.processCheckout = processCheckout;
exports.processCart = processCart;
exports.processRefund = processRefund;
exports.routeWebhook = routeWebhook;
const crypto_1 = __importDefault(require("crypto"));
const prisma_1 = __importDefault(require("./lib/prisma"));
const redis_1 = require("./lib/redis");
// HMAC verification - pure function for testability
function verifyHmac(rawBody, hmacHeader, secret) {
    const digest = crypto_1.default
        .createHmac('sha256', secret)
        .update(rawBody, 'utf8')
        .digest('base64');
    return crypto_1.default.timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader));
}
// Find tenant by shop domain
async function findTenantByDomain(shopDomain) {
    return prisma_1.default.tenant.findUnique({
        where: { shopDomain },
    });
}
// Process orders/create webhook
async function processOrderCreated(tenantId, payload) {
    const orderId = String(payload.id);
    const total = parseFloat(payload.total_price) || 0;
    // Upsert order
    await prisma_1.default.order.upsert({
        where: { id: orderId },
        create: {
            id: orderId,
            tenantId,
            total,
            currency: payload.currency || 'USD',
            orderNumber: payload.order_number,
            customerId: payload.customer ? String(payload.customer.id) : null,
            rawJson: payload,
        },
        update: {
            total,
            currency: payload.currency || 'USD',
            rawJson: payload,
        },
    });
    // Upsert customer if present
    if (payload.customer) {
        const customerId = String(payload.customer.id);
        await processCustomer(tenantId, payload.customer);
        // Update customer metrics based on all their orders
        const [orderStats] = await prisma_1.default.$queryRaw `
      SELECT 
        COALESCE(SUM(total), 0)::float as "totalSpent",
        COUNT(*)::int as "ordersCount"
      FROM "Order"
      WHERE "customerId" = ${customerId} AND "tenantId" = ${tenantId}
    `;
        if (orderStats) {
            await prisma_1.default.customer.update({
                where: { id: customerId },
                data: {
                    totalSpent: orderStats.totalSpent,
                    ordersCount: orderStats.ordersCount,
                },
            });
        }
    }
    // Extract and upsert products from line items
    if (payload.line_items && payload.line_items.length > 0) {
        for (const item of payload.line_items) {
            if (item.product_id) {
                await prisma_1.default.product.upsert({
                    where: { id: String(item.product_id) },
                    create: {
                        id: String(item.product_id),
                        tenantId,
                        title: item.title,
                        vendor: item.vendor || null,
                        price: parseFloat(item.price) || 0,
                    },
                    update: {
                        title: item.title,
                        vendor: item.vendor || null,
                        price: parseFloat(item.price) || 0,
                    },
                });
            }
        }
    }
}
// Process customers/create or customers/update webhook
async function processCustomer(tenantId, payload) {
    const customerId = String(payload.id);
    await prisma_1.default.customer.upsert({
        where: { id: customerId },
        create: {
            id: customerId,
            tenantId,
            email: payload.email || '',
            firstName: payload.first_name || null,
            lastName: payload.last_name || null,
            totalSpent: parseFloat(payload.total_spent || '0'),
            ordersCount: payload.orders_count || 0,
            rawJson: payload,
        },
        update: {
            email: payload.email || '',
            firstName: payload.first_name || null,
            lastName: payload.last_name || null,
            totalSpent: parseFloat(payload.total_spent || '0'),
            ordersCount: payload.orders_count || 0,
            rawJson: payload,
        },
    });
}
// Process products/create or products/update webhook
async function processProduct(tenantId, payload) {
    const productId = String(payload.id);
    const price = payload.variants?.[0]?.price
        ? parseFloat(payload.variants[0].price)
        : 0;
    await prisma_1.default.product.upsert({
        where: { id: productId },
        create: {
            id: productId,
            tenantId,
            title: payload.title,
            vendor: payload.vendor || null,
            productType: payload.product_type || null,
            price,
            rawJson: payload,
        },
        update: {
            title: payload.title,
            vendor: payload.vendor || null,
            productType: payload.product_type || null,
            price,
            rawJson: payload,
        },
    });
}
// Process checkouts/create or checkouts/update webhook
async function processCheckout(tenantId, payload) {
    const shopifyCheckoutId = String(payload.id);
    const totalPrice = parseFloat(payload.total_price) || 0;
    const lineItemsCount = payload.line_items?.reduce((sum, item) => sum + (item.quantity || 1), 0) || 0;
    // Determine status
    const isCompleted = payload.completed_at !== null && payload.completed_at !== undefined;
    await prisma_1.default.checkout.upsert({
        where: {
            tenantId_shopifyCheckoutId: {
                tenantId,
                shopifyCheckoutId,
            },
        },
        create: {
            tenantId,
            shopifyCheckoutId,
            shopifyCartToken: payload.cart_token || null,
            email: payload.email || null,
            totalPrice,
            currency: payload.currency || 'USD',
            status: isCompleted ? 'COMPLETED' : 'PENDING',
            lineItemsCount,
            completedAt: isCompleted ? new Date(payload.completed_at) : null,
            rawJson: payload,
        },
        update: {
            email: payload.email || null,
            totalPrice,
            currency: payload.currency || 'USD',
            status: isCompleted ? 'COMPLETED' : 'PENDING',
            lineItemsCount,
            completedAt: isCompleted ? new Date(payload.completed_at) : null,
            rawJson: payload,
        },
    });
    console.log(`Checkout ${shopifyCheckoutId} processed - status: ${isCompleted ? 'COMPLETED' : 'PENDING'}, total: ${totalPrice}`);
}
// Process carts/create or carts/update webhook
// Note: Shopify cart webhooks have limited data, we track cart tokens for checkout correlation
async function processCart(tenantId, payload) {
    // Cart webhooks don't have full pricing info like checkouts
    // We primarily use this to correlate carts with checkouts
    const cartToken = payload.token;
    console.log(`Cart ${cartToken} event received for tenant ${tenantId}`);
    // Check if there's an existing checkout with this cart token
    const existingCheckout = await prisma_1.default.checkout.findFirst({
        where: {
            tenantId,
            shopifyCartToken: cartToken,
        },
    });
    if (existingCheckout) {
        // Update the checkout's updatedAt to track activity
        await prisma_1.default.checkout.update({
            where: { id: existingCheckout.id },
            data: { updatedAt: new Date() },
        });
    }
}
// Process refunds/create webhook
async function processRefund(tenantId, payload) {
    const shopifyRefundId = String(payload.id);
    const shopifyOrderId = String(payload.order_id);
    // Calculate total refund amount
    const amount = payload.transactions?.reduce((sum, tx) => sum + (parseFloat(tx.amount) || 0), 0) || payload.refund_line_items?.reduce((sum, item) => sum + (item.subtotal || 0), 0) || 0;
    const currency = payload.transactions?.[0]?.currency || 'USD';
    await prisma_1.default.refund.upsert({
        where: {
            tenantId_shopifyRefundId: {
                tenantId,
                shopifyRefundId,
            },
        },
        create: {
            tenantId,
            shopifyRefundId,
            shopifyOrderId,
            amount,
            currency,
            reason: payload.note || null,
            rawJson: payload,
        },
        update: {
            amount,
            reason: payload.note || null,
            rawJson: payload,
        },
    });
    console.log(`Refund ${shopifyRefundId} processed for order ${shopifyOrderId} - amount: ${amount}`);
}
// Mark checkout as completed when order is created
async function markCheckoutCompleted(tenantId, checkoutToken) {
    // Find checkout by token (Shopify sends checkout_token in order payload)
    const checkout = await prisma_1.default.checkout.findFirst({
        where: {
            tenantId,
            shopifyCheckoutId: checkoutToken,
        },
    });
    if (checkout && checkout.status !== 'COMPLETED') {
        await prisma_1.default.checkout.update({
            where: { id: checkout.id },
            data: {
                status: 'COMPLETED',
                completedAt: new Date(),
            },
        });
        console.log(`Checkout ${checkoutToken} marked as COMPLETED via order`);
    }
}
// Route webhook to appropriate handler based on topic
async function routeWebhook(tenantId, topic, payload) {
    switch (topic) {
        case 'orders/create':
        case 'orders/updated':
            await processOrderCreated(tenantId, payload);
            // Also mark associated checkout as completed
            const order = payload;
            if (order.checkout_token) {
                await markCheckoutCompleted(tenantId, order.checkout_token);
            }
            break;
        case 'customers/create':
        case 'customers/update':
            await processCustomer(tenantId, payload);
            break;
        case 'products/create':
        case 'products/update':
            await processProduct(tenantId, payload);
            break;
        case 'checkouts/create':
        case 'checkouts/update':
            await processCheckout(tenantId, payload);
            break;
        case 'carts/create':
        case 'carts/update':
            await processCart(tenantId, payload);
            break;
        case 'refunds/create':
            await processRefund(tenantId, payload);
            break;
        default:
            console.log(`Unhandled webhook topic: ${topic}`);
    }
    // Invalidate metrics cache for this tenant after any data change
    await invalidateMetricsCache(tenantId);
}
// Invalidate all metrics cache entries for a tenant
async function invalidateMetricsCache(tenantId) {
    const redis = (0, redis_1.getRedis)();
    if (!redis)
        return;
    try {
        // Delete the base metrics cache key
        await (0, redis_1.deleteCache)(redis_1.CACHE_KEYS.metrics(tenantId));
        // Also delete any date-filtered cache entries
        const pattern = `${redis_1.CACHE_KEYS.metrics(tenantId)}:*`;
        const keys = await redis.keys(pattern);
        if (keys.length > 0) {
            await redis.del(...keys);
        }
        console.log(`Invalidated metrics cache for tenant ${tenantId}`);
    }
    catch (err) {
        console.error('Error invalidating cache:', err);
    }
}
//# sourceMappingURL=webhook.js.map