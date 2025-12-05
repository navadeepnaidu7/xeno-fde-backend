import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { getCache, setCache, CACHE_KEYS, CACHE_TTL } from '../lib/redis';

const router = Router();

interface CreateTenantBody {
  name: string;
  shopDomain: string;
  webhookSecret: string;
  accessToken?: string;
}

interface MetricsQuery {
  startDate?: string;
  endDate?: string;
}

// POST /tenants - Register a new tenant
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, shopDomain, webhookSecret, accessToken } = req.body as CreateTenantBody;

    if (!name || !shopDomain || !webhookSecret) {
      return res.status(400).json({
        error: 'Missing required fields: name, shopDomain, webhookSecret',
      });
    }

    // Check if tenant already exists
    const existing = await prisma.tenant.findUnique({
      where: { shopDomain },
    });

    if (existing) {
      return res.status(409).json({ error: 'Tenant with this shop domain already exists' });
    }

    const tenant = await prisma.tenant.create({
      data: {
        name,
        shopDomain,
        webhookSecret,
        accessToken: accessToken || null,
      },
    });

    res.status(201).json({
      id: tenant.id,
      name: tenant.name,
      shopDomain: tenant.shopDomain,
      createdAt: tenant.createdAt,
    });
  } catch (error) {
    console.error('Error creating tenant:', error);
    res.status(500).json({ error: 'Failed to create tenant' });
  }
});

// GET /tenants - List all tenants
router.get('/', async (req: Request, res: Response) => {
  try {
    const tenants = await prisma.tenant.findMany({
      select: {
        id: true,
        name: true,
        shopDomain: true,
        createdAt: true,
      },
    });
    res.json(tenants);
  } catch (error) {
    console.error('Error listing tenants:', error);
    res.status(500).json({ error: 'Failed to list tenants' });
  }
});

// GET /tenants/:id - Get tenant by ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const tenant = await prisma.tenant.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        shopDomain: true,
        createdAt: true,
      },
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    res.json(tenant);
  } catch (error) {
    console.error('Error fetching tenant:', error);
    res.status(500).json({ error: 'Failed to fetch tenant' });
  }
});

// GET /tenants/:id/metrics - Get analytics metrics for a tenant
router.get('/:id/metrics', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { startDate, endDate } = req.query as MetricsQuery;

    // Verify tenant exists
    const tenant = await prisma.tenant.findUnique({ where: { id } });
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Build cache key (include date filters if present)
    const cacheKey = startDate || endDate
      ? `${CACHE_KEYS.metrics(id)}:${startDate || ''}:${endDate || ''}`
      : CACHE_KEYS.metrics(id);

    // Try to get cached metrics
    const cached = await getCache<object>(cacheKey);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      return res.json(cached);
    }

    res.setHeader('X-Cache', 'MISS');

    // Build date filter
    const dateFilter: { createdAt?: { gte?: Date; lte?: Date } } = {};
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) dateFilter.createdAt.gte = new Date(startDate);
      if (endDate) dateFilter.createdAt.lte = new Date(endDate);
    }

    // Get counts and aggregations
    const [customersCount, ordersCount, revenueResult, topCustomers, ordersByDate] =
      await Promise.all([
        // Total customers
        prisma.customer.count({
          where: { tenantId: id },
        }),

        // Total orders
        prisma.order.count({
          where: { tenantId: id, ...dateFilter },
        }),

        // Total revenue
        prisma.order.aggregate({
          where: { tenantId: id, ...dateFilter },
          _sum: { total: true },
        }),

        // Top 5 customers by spend (calculated from actual orders)
        prisma.$queryRaw<Array<{ id: string; email: string; firstName: string | null; lastName: string | null; totalSpent: number; ordersCount: number }>>`
          SELECT 
            c.id,
            c.email,
            c."firstName",
            c."lastName",
            COALESCE(SUM(o.total), 0)::float as "totalSpent",
            COUNT(o.id)::int as "ordersCount"
          FROM "Customer" c
          LEFT JOIN "Order" o ON c.id = o."customerId" AND o."tenantId" = ${id}
          WHERE c."tenantId" = ${id}
          GROUP BY c.id, c.email, c."firstName", c."lastName"
          ORDER BY "totalSpent" DESC
          LIMIT 5
        `,

        // Orders grouped by date (last 30 days by default)
        prisma.$queryRaw<Array<{ date: string; orders: bigint; revenue: number }>>`
          SELECT 
            DATE("createdAt")::text as date,
            COUNT(*)::bigint as orders,
            COALESCE(SUM(total), 0) as revenue
          FROM "Order"
          WHERE "tenantId" = ${id}
          GROUP BY DATE("createdAt")
          ORDER BY date DESC
          LIMIT 30
        `,
      ]);

    const metricsResponse = {
      customersCount,
      ordersCount,
      totalRevenue: revenueResult._sum.total || 0,
      topCustomers: topCustomers.map((c) => ({
        customerId: c.id,
        email: c.email,
        name: [c.firstName, c.lastName].filter(Boolean).join(' ') || null,
        totalSpent: c.totalSpent,
        ordersCount: c.ordersCount,
      })),
      ordersByDate: ordersByDate.map((row) => ({
        date: row.date,
        orders: Number(row.orders),
        revenue: row.revenue,
      })),
    };

    // Cache the response
    await setCache(cacheKey, metricsResponse, CACHE_TTL.metrics);

    res.json(metricsResponse);
  } catch (error) {
    console.error('Error fetching metrics:', error);
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

// GET /tenants/:id/orders - Paginated orders list
router.get('/:id/orders', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    // Verify tenant exists
    const tenant = await prisma.tenant.findUnique({ where: { id } });
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const [orders, totalCount] = await Promise.all([
      prisma.order.findMany({
        where: { tenantId: id },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          orderNumber: true,
          total: true,
          currency: true,
          customerId: true,
          createdAt: true,
        },
      }),
      prisma.order.count({ where: { tenantId: id } }),
    ]);

    res.json({
      orders,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// GET /tenants/:id/customers - Paginated customers list
router.get('/:id/customers', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    // Verify tenant exists
    const tenant = await prisma.tenant.findUnique({ where: { id } });
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const [customers, totalCount] = await Promise.all([
      prisma.customer.findMany({
        where: { tenantId: id },
        orderBy: { totalSpent: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          totalSpent: true,
          ordersCount: true,
          createdAt: true,
        },
      }),
      prisma.customer.count({ where: { tenantId: id } }),
    ]);

    res.json({
      customers,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

// GET /tenants/:id/products - Paginated products list
router.get('/:id/products', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    // Verify tenant exists
    const tenant = await prisma.tenant.findUnique({ where: { id } });
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const [products, totalCount] = await Promise.all([
      prisma.product.findMany({
        where: { tenantId: id },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          title: true,
          vendor: true,
          productType: true,
          price: true,
          createdAt: true,
        },
      }),
      prisma.product.count({ where: { tenantId: id } }),
    ]);

    res.json({
      products,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

export default router;
