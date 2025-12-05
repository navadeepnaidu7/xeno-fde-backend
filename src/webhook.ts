import crypto from 'crypto';
import prisma from './lib/prisma';
import { deleteCache, CACHE_KEYS, getRedis } from './lib/redis';

// Shopify webhook payload types
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
}

interface ShopifyOrder {
  id: number;
  order_number?: number;
  total_price: string;
  currency: string;
  customer?: ShopifyCustomer;
  line_items?: ShopifyLineItem[];
  created_at?: string;
}

interface ShopifyProduct {
  id: number;
  title: string;
  vendor?: string;
  product_type?: string;
  variants?: Array<{ price: string }>;
}

// HMAC verification - pure function for testability
export function verifyHmac(
  rawBody: string,
  hmacHeader: string,
  secret: string
): boolean {
  const digest = crypto
    .createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('base64');
  return crypto.timingSafeEqual(
    Buffer.from(digest),
    Buffer.from(hmacHeader)
  );
}

// Find tenant by shop domain
export async function findTenantByDomain(shopDomain: string) {
  return prisma.tenant.findUnique({
    where: { shopDomain },
  });
}

// Process orders/create webhook
export async function processOrderCreated(
  tenantId: string,
  payload: ShopifyOrder
): Promise<void> {
  const orderId = String(payload.id);
  const total = parseFloat(payload.total_price) || 0;

  // Upsert order
  await prisma.order.upsert({
    where: { id: orderId },
    create: {
      id: orderId,
      tenantId,
      total,
      currency: payload.currency || 'USD',
      orderNumber: payload.order_number,
      customerId: payload.customer ? String(payload.customer.id) : null,
      rawJson: payload as object,
    },
    update: {
      total,
      currency: payload.currency || 'USD',
      rawJson: payload as object,
    },
  });

  // Upsert customer if present
  if (payload.customer) {
    const customerId = String(payload.customer.id);
    await processCustomer(tenantId, payload.customer);
    
    // Update customer metrics based on all their orders
    const [orderStats] = await prisma.$queryRaw<
      Array<{ totalSpent: number; ordersCount: number }>
    >`
      SELECT 
        COALESCE(SUM(total), 0)::float as "totalSpent",
        COUNT(*)::int as "ordersCount"
      FROM "Order"
      WHERE "customerId" = ${customerId} AND "tenantId" = ${tenantId}
    `;

    if (orderStats) {
      await prisma.customer.update({
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
        await prisma.product.upsert({
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
export async function processCustomer(
  tenantId: string,
  payload: ShopifyCustomer
): Promise<void> {
  const customerId = String(payload.id);

  await prisma.customer.upsert({
    where: { id: customerId },
    create: {
      id: customerId,
      tenantId,
      email: payload.email || '',
      firstName: payload.first_name || null,
      lastName: payload.last_name || null,
      totalSpent: parseFloat(payload.total_spent || '0'),
      ordersCount: payload.orders_count || 0,
      rawJson: payload as object,
    },
    update: {
      email: payload.email || '',
      firstName: payload.first_name || null,
      lastName: payload.last_name || null,
      totalSpent: parseFloat(payload.total_spent || '0'),
      ordersCount: payload.orders_count || 0,
      rawJson: payload as object,
    },
  });
}

// Process products/create or products/update webhook
export async function processProduct(
  tenantId: string,
  payload: ShopifyProduct
): Promise<void> {
  const productId = String(payload.id);
  const price = payload.variants?.[0]?.price
    ? parseFloat(payload.variants[0].price)
    : 0;

  await prisma.product.upsert({
    where: { id: productId },
    create: {
      id: productId,
      tenantId,
      title: payload.title,
      vendor: payload.vendor || null,
      productType: payload.product_type || null,
      price,
      rawJson: payload as object,
    },
    update: {
      title: payload.title,
      vendor: payload.vendor || null,
      productType: payload.product_type || null,
      price,
      rawJson: payload as object,
    },
  });
}

// Route webhook to appropriate handler based on topic
export async function routeWebhook(
  tenantId: string,
  topic: string,
  payload: unknown
): Promise<void> {
  switch (topic) {
    case 'orders/create':
    case 'orders/updated':
      await processOrderCreated(tenantId, payload as ShopifyOrder);
      break;
    case 'customers/create':
    case 'customers/update':
      await processCustomer(tenantId, payload as ShopifyCustomer);
      break;
    case 'products/create':
    case 'products/update':
      await processProduct(tenantId, payload as ShopifyProduct);
      break;
    default:
      console.log(`Unhandled webhook topic: ${topic}`);
  }

  // Invalidate metrics cache for this tenant after any data change
  await invalidateMetricsCache(tenantId);
}

// Invalidate all metrics cache entries for a tenant
async function invalidateMetricsCache(tenantId: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    // Delete the base metrics cache key
    await deleteCache(CACHE_KEYS.metrics(tenantId));

    // Also delete any date-filtered cache entries
    const pattern = `${CACHE_KEYS.metrics(tenantId)}:*`;
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }

    console.log(`Invalidated metrics cache for tenant ${tenantId}`);
  } catch (err) {
    console.error('Error invalidating cache:', err);
  }
}
