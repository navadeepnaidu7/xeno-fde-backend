import { Router, Request, Response } from 'express';
import { syncTenantData } from '../services/sync';
import prisma from '../lib/prisma';

const router = Router();

// POST /sync - Trigger manual sync for a tenant
router.post('/', async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.body;

    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId is required' });
    }

    // Verify tenant exists
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, accessToken: true },
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    if (!tenant.accessToken) {
      return res.status(400).json({
        error: 'No access token configured. Please update tenant with Shopify Admin API access token.',
      });
    }

    // Start sync (this may take a while)
    console.log(`Manual sync triggered for tenant: ${tenant.name}`);
    const result = await syncTenantData(tenantId);

    if (result.success) {
      res.json({
        message: 'Sync completed successfully',
        ...result,
      });
    } else {
      res.status(500).json({
        message: 'Sync failed',
        ...result,
      });
    }
  } catch (error) {
    console.error('Sync error:', error);
    res.status(500).json({ error: 'Failed to sync data' });
  }
});

// GET /sync/status/:tenantId - Get sync status for a tenant
router.get('/status/:tenantId', async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.params;

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        shopDomain: true,
        accessToken: true,
        _count: {
          select: {
            products: true,
            customers: true,
            orders: true,
          },
        },
      },
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    res.json({
      tenantId: tenant.id,
      name: tenant.name,
      shopDomain: tenant.shopDomain,
      hasAccessToken: !!tenant.accessToken,
      counts: {
        products: tenant._count.products,
        customers: tenant._count.customers,
        orders: tenant._count.orders,
      },
    });
  } catch (error) {
    console.error('Error fetching sync status:', error);
    res.status(500).json({ error: 'Failed to fetch sync status' });
  }
});

export default router;
