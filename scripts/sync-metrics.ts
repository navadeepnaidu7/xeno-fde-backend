import prisma from '../src/lib/prisma';

async function syncCustomerMetrics(tenantId: string) {
  try {
    console.log(`Syncing customer metrics for tenant: ${tenantId}`);

    // Get all customers and their aggregated order data
    const customerMetrics = await prisma.$queryRaw<
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

    // Update each customer with their actual metrics
    for (const metric of customerMetrics) {
      await prisma.customer.update({
        where: { id: metric.customerId },
        data: {
          totalSpent: metric.totalSpent,
          ordersCount: metric.ordersCount,
        },
      });
    }

    console.log(`Synced metrics for ${customerMetrics.length} customers`);
  } catch (error) {
    console.error('Error syncing customer metrics:', error);
  }
}

// Run the sync
const tenantId = process.argv[2];
if (!tenantId) {
  console.error('Usage: npx ts-node scripts/sync-metrics.ts <tenantId>');
  process.exit(1);
}

syncCustomerMetrics(tenantId).then(() => process.exit(0));
