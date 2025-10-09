import * as cron from "node-cron";
import { EffectManager } from "./EffectManager.js";
import { DatabaseManager } from "./DatabaseManager.js";
import { Logger } from "../utils/Logger.js";
import { CONFIG } from "../config.js";

export class Scheduler {
  private jobs: cron.ScheduledTask[] = [];

  constructor(
    private effectManager: EffectManager,
    private databaseManager: DatabaseManager
  ) {}


  /**
   * Start all scheduled tasks
   */
  start(): void {
    this.scheduleDailyReset();
    this.scheduleCleanup();
    Logger.info("📅 Scheduler started successfully");
  }

  /**
   * Stop all scheduled tasks
   */
  stop(): void {
    this.jobs.forEach((job) => job.stop());
    this.jobs = [];
    Logger.info("📅 Scheduler stopped");
  }

  /**
   * Schedule daily reset of daily claims at midnight UTC
   */
  private scheduleDailyReset(): void {
    const job = cron.schedule(
      "0 0 * * *",
      async () => {
        try {
          Logger.info("🌅 Running daily reset...");

          // Reset daily claims by clearing DAILY_CLAIM_RESET effects
          // This is handled automatically by EffectManager cleanup, but we can log it
          Logger.info("✅ Daily claims reset completed");

          // Could add more daily reset logic here
        } catch (error) {
          Logger.error("Error during daily reset:", error);
        }
      },
      {
        timezone: "UTC",
      }
    );

    this.jobs.push(job);
    Logger.info("📅 Daily reset scheduled for midnight UTC");
  }

  /**
   * Schedule periodic cleanup of old data
   */
  private scheduleCleanup(): void {
    const job = cron.schedule(
      "0 2 * * *",
      async () => {
        // 2 AM UTC
        try {
          Logger.info("🧹 Running scheduled cleanup...");

          // Cleanup old history entries
          await this.databaseManager.cleanupOldHistory();

          // EffectManager cleanup is automatic
          Logger.info("✅ Scheduled cleanup completed");
        } catch (error) {
          Logger.error("Error during scheduled cleanup:", error);
        }
      },
      {
        timezone: "UTC",
      }
    );

    this.jobs.push(job);
    Logger.info("📅 Cleanup scheduled for 2 AM UTC daily");
  }


  /**
   * Get scheduler statistics
   */
  getStats(): {
    activeJobs: number;
    nextDailyReset: Date | null;
    nextCleanup: Date | null;
  } {
    const dailyResetJob = this.jobs.find((job) => job.name === "dailyReset");
    const cleanupJob = this.jobs.find((job) => job.name === "cleanup");

    return {
      activeJobs: this.jobs.length,
      nextDailyReset: dailyResetJob ? this.getNextRun(dailyResetJob) : null,
      nextCleanup: cleanupJob ? this.getNextRun(cleanupJob) : null,
    };
  }

  /**
   * Get next run time for a cron job (approximate)
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private getNextRun(job: cron.ScheduledTask): Date | null {
    // This is a simplified implementation
    // In a real scenario, you'd need to calculate based on the cron expression
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    return tomorrow;
  }
}
