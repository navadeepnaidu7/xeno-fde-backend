"use strict";
/**
 * Scheduled Jobs
 * Runs periodic tasks using node-cron
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startScheduler = startScheduler;
exports.stopScheduler = stopScheduler;
exports.runSyncNow = runSyncNow;
const node_cron_1 = __importDefault(require("node-cron"));
const sync_1 = require("../services/sync");
const abandonment_1 = require("../services/abandonment");
// Store scheduled tasks for potential cleanup
const scheduledTasks = [];
/**
 * Start the scheduler
 * Runs sync every 6 hours (at 00:00, 06:00, 12:00, 18:00)
 * Runs abandonment detection every 15 minutes
 */
function startScheduler() {
    console.log('Starting job scheduler...');
    // Sync all tenants every 6 hours
    // Runs at: 00:00, 06:00, 12:00, 18:00
    const syncTask = node_cron_1.default.schedule('0 */6 * * *', async () => {
        console.log(`[${new Date().toISOString()}] Running scheduled sync...`);
        try {
            await (0, sync_1.syncAllTenants)();
        }
        catch (error) {
            console.error('Scheduled sync failed:', error);
        }
    });
    scheduledTasks.push(syncTask);
    console.log('Scheduler started: Sync runs every 6 hours');
    // Detect abandoned checkouts every 15 minutes
    const abandonmentTask = node_cron_1.default.schedule('*/15 * * * *', async () => {
        console.log(`[${new Date().toISOString()}] Running abandonment detection...`);
        try {
            const result = await (0, abandonment_1.detectAllAbandonedCheckouts)();
            if (result.totalAbandoned > 0) {
                console.log(`Marked ${result.totalAbandoned} checkouts as abandoned:`, result.tenantStats);
            }
        }
        catch (error) {
            console.error('Abandonment detection failed:', error);
        }
    });
    scheduledTasks.push(abandonmentTask);
    console.log('Scheduler started: Abandonment detection runs every 15 minutes');
}
/**
 * Stop all scheduled tasks
 */
function stopScheduler() {
    console.log('Stopping scheduler...');
    for (const task of scheduledTasks) {
        task.stop();
    }
    scheduledTasks.length = 0;
    console.log('Scheduler stopped');
}
/**
 * Run sync immediately (for testing or manual trigger)
 */
async function runSyncNow() {
    console.log('Running immediate sync...');
    await (0, sync_1.syncAllTenants)();
}
//# sourceMappingURL=scheduler.js.map