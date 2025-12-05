/**
 * Scheduled Jobs
 * Runs periodic tasks using node-cron
 */
/**
 * Start the scheduler
 * Runs sync every 6 hours (at 00:00, 06:00, 12:00, 18:00)
 * Runs abandonment detection every 15 minutes
 */
export declare function startScheduler(): void;
/**
 * Stop all scheduled tasks
 */
export declare function stopScheduler(): void;
/**
 * Run sync immediately (for testing or manual trigger)
 */
export declare function runSyncNow(): Promise<void>;
//# sourceMappingURL=scheduler.d.ts.map