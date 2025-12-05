/**
 * Scheduled Jobs
 * Runs periodic tasks using node-cron
 */

import cron, { ScheduledTask } from 'node-cron';
import { syncAllTenants } from '../services/sync';
import { detectAllAbandonedCheckouts } from '../services/abandonment';

// Store scheduled tasks for potential cleanup
const scheduledTasks: ScheduledTask[] = [];

/**
 * Start the scheduler
 * Runs sync every 6 hours (at 00:00, 06:00, 12:00, 18:00)
 * Runs abandonment detection every 15 minutes
 */
export function startScheduler(): void {
  console.log('Starting job scheduler...');

  // Sync all tenants every 6 hours
  // Runs at: 00:00, 06:00, 12:00, 18:00
  const syncTask = cron.schedule('0 */6 * * *', async () => {
    console.log(`[${new Date().toISOString()}] Running scheduled sync...`);
    try {
      await syncAllTenants();
    } catch (error) {
      console.error('Scheduled sync failed:', error);
    }
  });

  scheduledTasks.push(syncTask);
  console.log('Scheduler started: Sync runs every 6 hours');

  // Detect abandoned checkouts every 15 minutes
  const abandonmentTask = cron.schedule('*/15 * * * *', async () => {
    console.log(`[${new Date().toISOString()}] Running abandonment detection...`);
    try {
      const result = await detectAllAbandonedCheckouts();
      if (result.totalAbandoned > 0) {
        console.log(
          `Marked ${result.totalAbandoned} checkouts as abandoned:`,
          result.tenantStats
        );
      }
    } catch (error) {
      console.error('Abandonment detection failed:', error);
    }
  });

  scheduledTasks.push(abandonmentTask);
  console.log('Scheduler started: Abandonment detection runs every 15 minutes');
}

/**
 * Stop all scheduled tasks
 */
export function stopScheduler(): void {
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
export async function runSyncNow(): Promise<void> {
  console.log('Running immediate sync...');
  await syncAllTenants();
}
