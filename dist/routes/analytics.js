"use strict";
/**
 * Analytics Routes
 * GET /api/v1/analytics/checkouts/:tenantId - Get checkout/abandonment analytics
 * GET /api/v1/analytics/refunds/:tenantId - Get refund analytics
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const abandonment_1 = require("../services/abandonment");
const prisma_1 = __importDefault(require("../lib/prisma"));
const router = (0, express_1.Router)();
/**
 * GET /analytics/checkouts/:tenantId
 * Get checkout and abandonment analytics
 * Query params: startDate, endDate (ISO date strings)
 */
router.get('/checkouts/:tenantId', async (req, res) => {
    try {
        const { tenantId } = req.params;
        const { startDate, endDate } = req.query;
        // Verify tenant exists
        const tenant = await prisma_1.default.tenant.findUnique({
            where: { id: tenantId },
        });
        if (!tenant) {
            res.status(404).json({ error: 'Tenant not found' });
            return;
        }
        const analytics = await (0, abandonment_1.getAbandonmentAnalytics)(tenantId, startDate ? new Date(startDate) : undefined, endDate ? new Date(endDate) : undefined);
        res.json({
            tenantId,
            tenantName: tenant.name,
            analytics,
        });
    }
    catch (error) {
        console.error('Error fetching checkout analytics:', error);
        res.status(500).json({ error: 'Failed to fetch checkout analytics' });
    }
});
/**
 * GET /analytics/refunds/:tenantId
 * Get refund analytics
 * Query params: startDate, endDate (ISO date strings)
 */
router.get('/refunds/:tenantId', async (req, res) => {
    try {
        const { tenantId } = req.params;
        const { startDate, endDate } = req.query;
        // Verify tenant exists
        const tenant = await prisma_1.default.tenant.findUnique({
            where: { id: tenantId },
        });
        if (!tenant) {
            res.status(404).json({ error: 'Tenant not found' });
            return;
        }
        const analytics = await (0, abandonment_1.getRefundAnalytics)(tenantId, startDate ? new Date(startDate) : undefined, endDate ? new Date(endDate) : undefined);
        res.json({
            tenantId,
            tenantName: tenant.name,
            analytics,
        });
    }
    catch (error) {
        console.error('Error fetching refund analytics:', error);
        res.status(500).json({ error: 'Failed to fetch refund analytics' });
    }
});
/**
 * POST /analytics/detect-abandoned/:tenantId
 * Manually trigger abandonment detection for a tenant
 */
router.post('/detect-abandoned/:tenantId', async (req, res) => {
    try {
        const { tenantId } = req.params;
        // Verify tenant exists
        const tenant = await prisma_1.default.tenant.findUnique({
            where: { id: tenantId },
        });
        if (!tenant) {
            res.status(404).json({ error: 'Tenant not found' });
            return;
        }
        const abandonedCount = await (0, abandonment_1.detectAbandonedCheckouts)(tenantId);
        res.json({
            success: true,
            message: `Marked ${abandonedCount} checkouts as abandoned`,
            abandonedCount,
        });
    }
    catch (error) {
        console.error('Error detecting abandoned checkouts:', error);
        res.status(500).json({ error: 'Failed to detect abandoned checkouts' });
    }
});
/**
 * GET /analytics/checkouts/:tenantId/list
 * Get list of checkouts with optional status filter
 * Query params: status (PENDING, COMPLETED, ABANDONED), limit, offset
 */
router.get('/checkouts/:tenantId/list', async (req, res) => {
    try {
        const { tenantId } = req.params;
        const { status, limit = '50', offset = '0' } = req.query;
        // Verify tenant exists
        const tenant = await prisma_1.default.tenant.findUnique({
            where: { id: tenantId },
        });
        if (!tenant) {
            res.status(404).json({ error: 'Tenant not found' });
            return;
        }
        const where = { tenantId };
        if (status && ['PENDING', 'COMPLETED', 'ABANDONED'].includes(status)) {
            where.status = status;
        }
        const [checkouts, total] = await Promise.all([
            prisma_1.default.checkout.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                take: parseInt(limit, 10),
                skip: parseInt(offset, 10),
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
            prisma_1.default.checkout.count({ where }),
        ]);
        res.json({
            checkouts,
            total,
            limit: parseInt(limit, 10),
            offset: parseInt(offset, 10),
        });
    }
    catch (error) {
        console.error('Error fetching checkouts list:', error);
        res.status(500).json({ error: 'Failed to fetch checkouts list' });
    }
});
/**
 * GET /analytics/refunds/:tenantId/list
 * Get list of refunds
 * Query params: limit, offset
 */
router.get('/refunds/:tenantId/list', async (req, res) => {
    try {
        const { tenantId } = req.params;
        const { limit = '50', offset = '0' } = req.query;
        // Verify tenant exists
        const tenant = await prisma_1.default.tenant.findUnique({
            where: { id: tenantId },
        });
        if (!tenant) {
            res.status(404).json({ error: 'Tenant not found' });
            return;
        }
        const [refunds, total] = await Promise.all([
            prisma_1.default.refund.findMany({
                where: { tenantId },
                orderBy: { createdAt: 'desc' },
                take: parseInt(limit, 10),
                skip: parseInt(offset, 10),
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
            prisma_1.default.refund.count({ where: { tenantId } }),
        ]);
        res.json({
            refunds,
            total,
            limit: parseInt(limit, 10),
            offset: parseInt(offset, 10),
        });
    }
    catch (error) {
        console.error('Error fetching refunds list:', error);
        res.status(500).json({ error: 'Failed to fetch refunds list' });
    }
});
exports.default = router;
//# sourceMappingURL=analytics.js.map