/**
 * Sync Service
 * Handles syncing data from Shopify Admin API to database
 */

import prisma from '../lib/prisma';
import { ShopifyClient, ShopifyProduct, ShopifyCustomer, ShopifyOrder } from '../lib/shopify';
import { deleteCache, CACHE_KEYS, getRedis } from '../lib/redis';

interface SyncResult {
  success: boolean;
  products: { synced: number; errors: number };
  customers: { synced: number; errors: number };
  orders: { synced: number; errors: number };
  duration: number;
  error?: string;
}

/**
 * Sync all data for a tenant from Shopify
 */
export async function syncTenantData(tenantId: string): Promise<SyncResult> {
  const startTime = Date.now();
  const result: SyncResult = {
    success: false,
    products: { synced: 0, errors: 0 },
    customers: { synced: 0, errors: 0 },
    orders: { synced: 0, errors: 0 },
    duration: 0,
  };

  try {
    // Get tenant with access token
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      result.error = 'Tenant not found';
      return result;
    }

    if (!tenant.accessToken) {
      result.error = 'No access token configured for this tenant';
      return result;
    }

    console.log(`Starting sync for tenant: ${tenant.name} (${tenant.shopDomain})`);

    // Create Shopify client
    const shopify = new ShopifyClient(tenant.shopDomain, tenant.accessToken);

    // Test connection first
    const connected = await shopify.testConnection();
    if (!connected) {
      result.error = 'Failed to connect to Shopify API';
      return result;
    }

    // Sync products
    console.log('Syncing products...');
    const products = await shopify.getAllProducts();
    for (const product of products) {
      try {
        await syncProduct(tenantId, product);
        result.products.synced++;
      } catch (err) {
        console.error(`Error syncing product ${product.id}:`, err);
        result.products.errors++;
      }
    }

    // Sync customers
    console.log('Syncing customers...');
    const customers = await shopify.getAllCustomers();
    for (const customer of customers) {
      try {
        await syncCustomer(tenantId, customer);
        result.customers.synced++;
      } catch (err) {
        console.error(`Error syncing customer ${customer.id}:`, err);
        result.customers.errors++;
      }
    }

    // Sync orders (last 90 days)
    console.log('Syncing orders...');
    const orders = await shopify.getAllOrders();
    for (const order of orders) {
      try {
        await syncOrder(tenantId, order);
        result.orders.synced++;
      } catch (err) {
        console.error(`Error syncing order ${order.id}:`, err);
        result.orders.errors++;
      }
    }

    // Recalculate customer metrics from synced orders
    console.log('Recalculating customer metrics...');
    await recalculateCustomerMetrics(tenantId);

    // Invalidate metrics cache
    await invalidateAllMetricsCache(tenantId);

    result.success = true;
    result.duration = Date.now() - startTime;

    console.log(`Sync completed for ${tenant.name}:`, {
      products: result.products,
      customers: result.customers,
      orders: result.orders,
      duration: `${result.duration}ms`,
    });

    return result;
  } catch (error) {
    result.error = error instanceof Error ? error.message : 'Unknown error';
    result.duration = Date.now() - startTime;
    console.error('Sync failed:', result.error);
    return result;
  }
}

/**
 * Sync a single product to database
 */
async function syncProduct(tenantId: string, product: ShopifyProduct): Promise<void> {
  const productId = String(product.id);
  const price = product.variants?.[0]?.price ? parseFloat(product.variants[0].price) : 0;

  await prisma.product.upsert({
    where: { id: productId },
    create: {
      id: productId,
      tenantId,
      title: product.title,
      vendor: product.vendor || null,
      productType: product.product_type || null,
      price,
      rawJson: product as object,
    },
    update: {
      title: product.title,
      vendor: product.vendor || null,
      productType: product.product_type || null,
      price,
      rawJson: product as object,
    },
  });
}

/**
 * Sync a single customer to database
 */
async function syncCustomer(tenantId: string, customer: ShopifyCustomer): Promise<void> {
  const customerId = String(customer.id);

  await prisma.customer.upsert({
    where: { id: customerId },
    create: {
      id: customerId,
      tenantId,
      email: customer.email || '',
      firstName: customer.first_name || null,
      lastName: customer.last_name || null,
      totalSpent: parseFloat(customer.total_spent || '0'),
      ordersCount: customer.orders_count || 0,
      rawJson: customer as object,
    },
    update: {
      email: customer.email || '',
      firstName: customer.first_name || null,
      lastName: customer.last_name || null,
      // Don't update metrics here - will recalculate from orders
      rawJson: customer as object,
    },
  });
}

/**
 * Sync a single order to database
 */
async function syncOrder(tenantId: string, order: ShopifyOrder): Promise<void> {
  const orderId = String(order.id);
  const total = parseFloat(order.total_price) || 0;

  await prisma.order.upsert({
    where: { id: orderId },
    create: {
      id: orderId,
      tenantId,
      total,
      currency: order.currency || 'USD',
      orderNumber: order.order_number,
      customerId: order.customer ? String(order.customer.id) : null,
      rawJson: order as object,
      createdAt: new Date(order.created_at),
    },
    update: {
      total,
      currency: order.currency || 'USD',
      customerId: order.customer ? String(order.customer.id) : null,
      rawJson: order as object,
    },
  });

  // Sync products from line items
  if (order.line_items) {
    for (const item of order.line_items) {
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

/**
 * Recalculate customer metrics from actual orders
 */
async function recalculateCustomerMetrics(tenantId: string): Promise<void> {
  // Get all customers with their order stats
  const customerStats = await prisma.$queryRaw<
    Array<{ customerId: string; totalSpent: number; ordersCount: number }>
  >`
    SELECT 
      c.id as "customerId",
      COALESCE(SUM(o.total), 0)::float as "totalSpent",
      COUNT(o.id)::int as "ordersCount"
    FROM "Customer" c
    LEFT JOIN "Order" o ON c.id = o."customerId" AND o."tenantId" = ${tenantId}
    WHERE c."tenantId" = ${tenantId}
    GROUP BY c.id
  `;

  // Update each customer
  for (const stats of customerStats) {
    await prisma.customer.update({
      where: { id: stats.customerId },
      data: {
        totalSpent: stats.totalSpent,
        ordersCount: stats.ordersCount,
      },
    });
  }
}

/**
 * Invalidate all metrics cache for a tenant
 */
async function invalidateAllMetricsCache(tenantId: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    await deleteCache(CACHE_KEYS.metrics(tenantId));
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

/**
 * Sync all tenants that have access tokens
 */
export async function syncAllTenants(): Promise<void> {
  console.log('Starting scheduled sync for all tenants...');

  const tenants = await prisma.tenant.findMany({
    where: {
      accessToken: { not: null },
    },
    select: {
      id: true,
      name: true,
    },
  });

  console.log(`Found ${tenants.length} tenants with access tokens`);

  for (const tenant of tenants) {
    try {
      await syncTenantData(tenant.id);
    } catch (error) {
      console.error(`Failed to sync tenant ${tenant.name}:`, error);
    }
  }

  console.log('Scheduled sync completed for all tenants');
}
