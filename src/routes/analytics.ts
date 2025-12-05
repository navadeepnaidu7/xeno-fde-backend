/**
 * Analytics Routes
 * GET /api/v1/analytics/checkouts/:tenantId - Get checkout/abandonment analytics
 * GET /api/v1/analytics/refunds/:tenantId - Get refund analytics
 */

import { Router, Request, Response } from 'express';
import {
  getAbandonmentAnalytics,
  getRefundAnalytics,
  detectAbandonedCheckouts,
} from '../services/abandonment';
import prisma from '../lib/prisma';

const router = Router();

/**
 * GET /analytics/checkouts/:tenantId
 * Get checkout and abandonment analytics
 * Query params: startDate, endDate (ISO date strings)
 */
router.get('/checkouts/:tenantId', async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.params;
    const { startDate, endDate } = req.query;

    // Verify tenant exists
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      res.status(404).json({ error: 'Tenant not found' });
      return;
    }

    const analytics = await getAbandonmentAnalytics(
      tenantId,
      startDate ? new Date(startDate as string) : undefined,
      endDate ? new Date(endDate as string) : undefined
    );

    res.json({
      tenantId,
      tenantName: tenant.name,
      analytics,
    });
  } catch (error) {
    console.error('Error fetching checkout analytics:', error);
    res.status(500).json({ error: 'Failed to fetch checkout analytics' });
  }
});

/**
 * GET /analytics/refunds/:tenantId
 * Get refund analytics
 * Query params: startDate, endDate (ISO date strings)
 */
router.get('/refunds/:tenantId', async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.params;
    const { startDate, endDate } = req.query;

    // Verify tenant exists
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      res.status(404).json({ error: 'Tenant not found' });
      return;
    }

    const analytics = await getRefundAnalytics(
      tenantId,
      startDate ? new Date(startDate as string) : undefined,
      endDate ? new Date(endDate as string) : undefined
    );

    res.json({
      tenantId,
      tenantName: tenant.name,
      analytics,
    });
  } catch (error) {
    console.error('Error fetching refund analytics:', error);
    res.status(500).json({ error: 'Failed to fetch refund analytics' });
  }
});

/**
 * POST /analytics/detect-abandoned/:tenantId
 * Manually trigger abandonment detection for a tenant
 */
router.post('/detect-abandoned/:tenantId', async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.params;

    // Verify tenant exists
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      res.status(404).json({ error: 'Tenant not found' });
      return;
    }

    const abandonedCount = await detectAbandonedCheckouts(tenantId);

    res.json({
      success: true,
      message: `Marked ${abandonedCount} checkouts as abandoned`,
      abandonedCount,
    });
  } catch (error) {
    console.error('Error detecting abandoned checkouts:', error);
    res.status(500).json({ error: 'Failed to detect abandoned checkouts' });
  }
});

/**
 * GET /analytics/checkouts/:tenantId/list
 * Get list of checkouts with optional status filter
 * Query params: status (PENDING, COMPLETED, ABANDONED), limit, offset
 */
router.get('/checkouts/:tenantId/list', async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.params;
    const { status, limit = '50', offset = '0' } = req.query;

    // Verify tenant exists
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      res.status(404).json({ error: 'Tenant not found' });
      return;
    }

    const where: { tenantId: string; status?: 'PENDING' | 'COMPLETED' | 'ABANDONED' } = { tenantId };
    if (status && ['PENDING', 'COMPLETED', 'ABANDONED'].includes(status as string)) {
      where.status = status as 'PENDING' | 'COMPLETED' | 'ABANDONED';
    }

    const [checkouts, total] = await Promise.all([
      prisma.checkout.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit as string, 10),
        skip: parseInt(offset as string, 10),
        select: {
          id: true,
          shopifyCheckoutId: true,
          email: true,
          totalPrice: true,
          currency: true,
          status: true,
          lineItemsCount: true,
          createdAt: true,
          completedAt: true,
          abandonedAt: true,
        },
      }),
      prisma.checkout.count({ where }),
    ]);

    res.json({
      checkouts,
      total,
      limit: parseInt(limit as string, 10),
      offset: parseInt(offset as string, 10),
    });
  } catch (error) {
    console.error('Error fetching checkouts list:', error);
    res.status(500).json({ error: 'Failed to fetch checkouts list' });
  }
});

/**
 * GET /analytics/refunds/:tenantId/list
 * Get list of refunds
 * Query params: limit, offset
 */
router.get('/refunds/:tenantId/list', async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.params;
    const { limit = '50', offset = '0' } = req.query;

    // Verify tenant exists
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      res.status(404).json({ error: 'Tenant not found' });
      return;
    }

    const [refunds, total] = await Promise.all([
      prisma.refund.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit as string, 10),
        skip: parseInt(offset as string, 10),
        select: {
          id: true,
          shopifyRefundId: true,
          shopifyOrderId: true,
          amount: true,
          currency: true,
          reason: true,
          createdAt: true,
        },
      }),
      prisma.refund.count({ where: { tenantId } }),
    ]);

    res.json({
      refunds,
      total,
      limit: parseInt(limit as string, 10),
      offset: parseInt(offset as string, 10),
    });
  } catch (error) {
    console.error('Error fetching refunds list:', error);
    res.status(500).json({ error: 'Failed to fetch refunds list' });
  }
});

export default router;
