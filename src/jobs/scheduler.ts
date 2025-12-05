/**
 * Scheduled Jobs
 * Runs periodic tasks using node-cron
 */

import cron, { ScheduledTask } from 'node-cron';
import { syncAllTenants } from '../services/sync';

// Store scheduled tasks for potential cleanup
const scheduledTasks: ScheduledTask[] = [];

/**
 * Start the scheduler
 * Runs sync every 6 hours (at 00:00, 06:00, 12:00, 18:00)
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
