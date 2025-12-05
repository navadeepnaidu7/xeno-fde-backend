/**
 * Abandonment Detection Service
 * Marks checkouts as abandoned if no order is received within a time threshold
 */

import prisma from '../lib/prisma';

// Abandonment threshold in minutes (default: 60 minutes = 1 hour)
const ABANDONMENT_THRESHOLD_MINUTES = 60;

/**
 * Detect and mark abandoned checkouts for a specific tenant
 */
export async function detectAbandonedCheckouts(
  tenantId: string
): Promise<number> {
  const thresholdDate = new Date(
    Date.now() - ABANDONMENT_THRESHOLD_MINUTES * 60 * 1000
  );

  // Find PENDING checkouts older than threshold
  const result = await prisma.checkout.updateMany({
    where: {
      tenantId,
      status: 'PENDING',
      createdAt: { lt: thresholdDate },
    },
    data: {
      status: 'ABANDONED',
      abandonedAt: new Date(),
    },
  });

  return result.count;
}

/**
 * Detect abandoned checkouts for all tenants
 */
export async function detectAllAbandonedCheckouts(): Promise<{
  totalAbandoned: number;
  tenantStats: Record<string, number>;
}> {
  const tenants = await prisma.tenant.findMany({
    select: { id: true, name: true },
  });

  const tenantStats: Record<string, number> = {};
  let totalAbandoned = 0;

  for (const tenant of tenants) {
    const abandoned = await detectAbandonedCheckouts(tenant.id);
    if (abandoned > 0) {
      tenantStats[tenant.name] = abandoned;
      totalAbandoned += abandoned;
    }
  }

  return { totalAbandoned, tenantStats };
}

/**
 * Get abandonment analytics for a tenant
 */
export async function getAbandonmentAnalytics(
  tenantId: string,
  startDate?: Date,
  endDate?: Date
): Promise<{
  totalCheckouts: number;
  completedCheckouts: number;
  abandonedCheckouts: number;
  pendingCheckouts: number;
  conversionRate: number;
  abandonmentRate: number;
  abandonedValue: number;
  completedValue: number;
}> {
  const dateFilter: { createdAt?: { gte?: Date; lte?: Date } } = {};
  if (startDate || endDate) {
    dateFilter.createdAt = {};
    if (startDate) dateFilter.createdAt.gte = startDate;
    if (endDate) dateFilter.createdAt.lte = endDate;
  }

  const [completed, abandoned, pending] = await Promise.all([
    prisma.checkout.aggregate({
      where: { tenantId, status: 'COMPLETED', ...dateFilter },
      _count: true,
      _sum: { totalPrice: true },
    }),
    prisma.checkout.aggregate({
      where: { tenantId, status: 'ABANDONED', ...dateFilter },
      _count: true,
      _sum: { totalPrice: true },
    }),
    prisma.checkout.aggregate({
      where: { tenantId, status: 'PENDING', ...dateFilter },
      _count: true,
    }),
  ]);

  const completedCount = completed._count;
  const abandonedCount = abandoned._count;
  const pendingCount = pending._count;
  const totalCheckouts = completedCount + abandonedCount + pendingCount;

  const completedValue = completed._sum.totalPrice || 0;
  const abandonedValue = abandoned._sum.totalPrice || 0;

  const conversionRate =
    totalCheckouts > 0 ? (completedCount / totalCheckouts) * 100 : 0;
  const abandonmentRate =
    totalCheckouts > 0 ? (abandonedCount / totalCheckouts) * 100 : 0;

  return {
    totalCheckouts,
    completedCheckouts: completedCount,
    abandonedCheckouts: abandonedCount,
    pendingCheckouts: pendingCount,
    conversionRate: Math.round(conversionRate * 100) / 100,
    abandonmentRate: Math.round(abandonmentRate * 100) / 100,
    abandonedValue: Math.round(abandonedValue * 100) / 100,
    completedValue: Math.round(completedValue * 100) / 100,
  };
}

/**
 * Get refund analytics for a tenant
 */
export async function getRefundAnalytics(
  tenantId: string,
  startDate?: Date,
  endDate?: Date
): Promise<{
  totalRefunds: number;
  totalRefundAmount: number;
  averageRefundAmount: number;
}> {
  const dateFilter: { createdAt?: { gte?: Date; lte?: Date } } = {};
  if (startDate || endDate) {
    dateFilter.createdAt = {};
    if (startDate) dateFilter.createdAt.gte = startDate;
    if (endDate) dateFilter.createdAt.lte = endDate;
  }

  const refunds = await prisma.refund.aggregate({
    where: { tenantId, ...dateFilter },
    _count: true,
    _sum: { amount: true },
    _avg: { amount: true },
  });

  return {
    totalRefunds: refunds._count,
    totalRefundAmount: Math.round((refunds._sum.amount || 0) * 100) / 100,
    averageRefundAmount: Math.round((refunds._avg.amount || 0) * 100) / 100,
  };
}
