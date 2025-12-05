"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = __importDefault(require("../lib/prisma"));
const redis_1 = require("../lib/redis");
const router = (0, express_1.Router)();
// POST /tenants - Register a new tenant
router.post('/', async (req, res) => {
    try {
        const { name, shopDomain, webhookSecret, accessToken } = req.body;
        if (!name || !shopDomain || !webhookSecret) {
            return res.status(400).json({
                error: 'Missing required fields: name, shopDomain, webhookSecret',
            });
        }
        // Check if tenant already exists
        const existing = await prisma_1.default.tenant.findUnique({
            where: { shopDomain },
        });
        if (existing) {
            return res.status(409).json({ error: 'Tenant with this shop domain already exists' });
        }
        const tenant = await prisma_1.default.tenant.create({
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
    }
    catch (error) {
        console.error('Error creating tenant:', error);
        res.status(500).json({ error: 'Failed to create tenant' });
    }
});
// GET /tenants - List all tenants
router.get('/', async (req, res) => {
    try {
        const tenants = await prisma_1.default.tenant.findMany({
            select: {
                id: true,
                name: true,
                shopDomain: true,
                createdAt: true,
            },
        });
        res.json(tenants);
    }
    catch (error) {
        console.error('Error listing tenants:', error);
        res.status(500).json({ error: 'Failed to list tenants' });
    }
});
// GET /tenants/:id - Get tenant by ID
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const tenant = await prisma_1.default.tenant.findUnique({
            where: { id },
            select: {
                id: true,
                name: true,
                shopDomain: true,
                createdAt: true,
                accessToken: true,
            },
        });
        if (!tenant) {
            return res.status(404).json({ error: 'Tenant not found' });
        }
        res.json({
            ...tenant,
            hasAccessToken: !!tenant.accessToken,
            accessToken: undefined, // Don't expose the actual token
        });
    }
    catch (error) {
        console.error('Error fetching tenant:', error);
        res.status(500).json({ error: 'Failed to fetch tenant' });
    }
});
// PATCH /tenants/:id - Update tenant (e.g., add access token)
router.patch('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { accessToken, name } = req.body;
        const tenant = await prisma_1.default.tenant.findUnique({ where: { id } });
        if (!tenant) {
            return res.status(404).json({ error: 'Tenant not found' });
        }
        const updated = await prisma_1.default.tenant.update({
            where: { id },
            data: {
                ...(accessToken && { accessToken }),
                ...(name && { name }),
            },
            select: {
                id: true,
                name: true,
                shopDomain: true,
                createdAt: true,
            },
        });
        res.json({
            ...updated,
            hasAccessToken: !!accessToken || !!tenant.accessToken,
        });
    }
    catch (error) {
        console.error('Error updating tenant:', error);
        res.status(500).json({ error: 'Failed to update tenant' });
    }
});
// GET /tenants/:id/metrics - Get analytics metrics for a tenant
router.get('/:id/metrics', async (req, res) => {
    try {
        const { id } = req.params;
        const { startDate, endDate } = req.query;
        // Verify tenant exists
        const tenant = await prisma_1.default.tenant.findUnique({ where: { id } });
        if (!tenant) {
            return res.status(404).json({ error: 'Tenant not found' });
        }
        // Build cache key (include date filters if present)
        const cacheKey = startDate || endDate
            ? `${redis_1.CACHE_KEYS.metrics(id)}:${startDate || ''}:${endDate || ''}`
            : redis_1.CACHE_KEYS.metrics(id);
        // Try to get cached metrics
        const cached = await (0, redis_1.getCache)(cacheKey);
        if (cached) {
            res.setHeader('X-Cache', 'HIT');
            return res.json(cached);
        }
        res.setHeader('X-Cache', 'MISS');
        // Build date filter
        const dateFilter = {};
        if (startDate || endDate) {
            dateFilter.createdAt = {};
            if (startDate)
                dateFilter.createdAt.gte = new Date(startDate);
            if (endDate)
                dateFilter.createdAt.lte = new Date(endDate);
        }
        // Get counts and aggregations
        const [customersCount, ordersCount, revenueResult, topCustomers, ordersByDate] = await Promise.all([
            // Total customers
            prisma_1.default.customer.count({
                where: { tenantId: id },
            }),
            // Total orders
            prisma_1.default.order.count({
                where: { tenantId: id, ...dateFilter },
            }),
            // Total revenue
            prisma_1.default.order.aggregate({
                where: { tenantId: id, ...dateFilter },
                _sum: { total: true },
            }),
            // Top 5 customers by spend (calculated from actual orders)
            prisma_1.default.$queryRaw `
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
            prisma_1.default.$queryRaw `
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
        await (0, redis_1.setCache)(cacheKey, metricsResponse, redis_1.CACHE_TTL.metrics);
        res.json(metricsResponse);
    }
    catch (error) {
        console.error('Error fetching metrics:', error);
        res.status(500).json({ error: 'Failed to fetch metrics' });
    }
});
// GET /tenants/:id/orders - Paginated orders list
router.get('/:id/orders', async (req, res) => {
    try {
        const { id } = req.params;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;
        // Verify tenant exists
        const tenant = await prisma_1.default.tenant.findUnique({ where: { id } });
        if (!tenant) {
            return res.status(404).json({ error: 'Tenant not found' });
        }
        const [orders, totalCount] = await Promise.all([
            prisma_1.default.order.findMany({
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
            prisma_1.default.order.count({ where: { tenantId: id } }),
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
    }
    catch (error) {
        console.error('Error fetching orders:', error);
        res.status(500).json({ error: 'Failed to fetch orders' });
    }
});
// GET /tenants/:id/customers - Paginated customers list
router.get('/:id/customers', async (req, res) => {
    try {
        const { id } = req.params;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;
        // Verify tenant exists
        const tenant = await prisma_1.default.tenant.findUnique({ where: { id } });
        if (!tenant) {
            return res.status(404).json({ error: 'Tenant not found' });
        }
        const [customers, totalCount] = await Promise.all([
            prisma_1.default.customer.findMany({
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
            prisma_1.default.customer.count({ where: { tenantId: id } }),
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
    }
    catch (error) {
        console.error('Error fetching customers:', error);
        res.status(500).json({ error: 'Failed to fetch customers' });
    }
});
// GET /tenants/:id/products - Paginated products list
router.get('/:id/products', async (req, res) => {
    try {
        const { id } = req.params;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;
        // Verify tenant exists
        const tenant = await prisma_1.default.tenant.findUnique({ where: { id } });
        if (!tenant) {
            return res.status(404).json({ error: 'Tenant not found' });
        }
        const [products, totalCount] = await Promise.all([
            prisma_1.default.product.findMany({
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
            prisma_1.default.product.count({ where: { tenantId: id } }),
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
    }
    catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).json({ error: 'Failed to fetch products' });
    }
});
exports.default = router;
//# sourceMappingURL=tenants.js.map