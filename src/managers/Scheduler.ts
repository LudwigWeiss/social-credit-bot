import * as cron from "node-cron";
import { EffectManager } from "./EffectManager.js";
import { DatabaseManager } from "./DatabaseManager.js";
import { Logger } from "../utils/Logger.js";
import { CONFIG } from "../config.js";

export class Scheduler {
  private jobs: cron.ScheduledTask[] = [];
  private eventCallback?: (eventType: string, data: any) => Promise<void>;

  constructor(
    private effectManager: EffectManager,
    private databaseManager: DatabaseManager
  ) {}

  setEventCallback(callback: (eventType: string, data: any) => Promise<void>): void {
    this.eventCallback = callback;
  }

  /**
   * Start all scheduled tasks
   */
  start(): void {
    this.scheduleDailyReset();
    this.scheduleCleanup();
    this.scheduleRandomEvents();
    Logger.info("📅 Scheduler started successfully");
  }

  /**
   * Stop all scheduled tasks
   */
  stop(): void {
    this.jobs.forEach(job => job.stop());
    this.jobs = [];
    Logger.info("📅 Scheduler stopped");
  }

  /**
   * Schedule daily reset of daily claims at midnight UTC
   */
  private scheduleDailyReset(): void {
    const job = cron.schedule("0 0 * * *", async () => {
      try {
        Logger.info("🌅 Running daily reset...");

        // Reset daily claims by clearing DAILY_CLAIM_RESET effects
        // This is handled automatically by EffectManager cleanup, but we can log it
        Logger.info("✅ Daily claims reset completed");

        // Could add more daily reset logic here
      } catch (error) {
        Logger.error("Error during daily reset:", error);
      }
    }, {
      timezone: "UTC"
    });

    this.jobs.push(job);
    Logger.info("📅 Daily reset scheduled for midnight UTC");
  }

  /**
   * Schedule periodic cleanup of old data
   */
  private scheduleCleanup(): void {
    const job = cron.schedule("0 2 * * *", async () => { // 2 AM UTC
      try {
        Logger.info("🧹 Running scheduled cleanup...");

        // Cleanup old history entries
        await this.databaseManager.cleanupOldHistory();

        // EffectManager cleanup is automatic
        Logger.info("✅ Scheduled cleanup completed");
      } catch (error) {
        Logger.error("Error during scheduled cleanup:", error);
      }
    }, {
      timezone: "UTC"
    });

    this.jobs.push(job);
    Logger.info("📅 Cleanup scheduled for 2 AM UTC daily");
  }

  /**
   * Schedule random server-wide events
   */
  private scheduleRandomEvents(): void {
    // Trigger random events every 2-4 hours
    const interval = Math.random() * (CONFIG.EVENTS.INTERVAL_MAX - CONFIG.EVENTS.INTERVAL_MIN) + CONFIG.EVENTS.INTERVAL_MIN;

    const job = cron.schedule(`*/${Math.floor(interval / (60 * 1000))} * * * *`, async () => {
      try {
        if (this.eventCallback) {
          const eventType = this.getRandomEventType();
          await this.eventCallback(eventType, {});
          Logger.info(`🎲 Random event triggered: ${eventType}`);
        }
      } catch (error) {
        Logger.error("Error triggering random event:", error);
      }
    }, {
      timezone: "UTC"
    });

    this.jobs.push(job);
    Logger.info("📅 Random events scheduled");
  }

  private getRandomEventType(): string {
    const events = [
      "PARTY_INSPECTOR_VISIT",
      "SOCIAL_HARMONY_HOUR",
      "WESTERN_SPY_INFILTRATION",
      "PRODUCTION_QUOTA"
    ];
    return events[Math.floor(Math.random() * events.length)];
  }

  /**
   * Get scheduler statistics
   */
  getStats(): {
    activeJobs: number;
    nextDailyReset: Date | null;
    nextCleanup: Date | null;
  } {
    const dailyResetJob = this.jobs.find(job => job.name === 'dailyReset');
    const cleanupJob = this.jobs.find(job => job.name === 'cleanup');

    return {
      activeJobs: this.jobs.length,
      nextDailyReset: dailyResetJob ? this.getNextRun(dailyResetJob) : null,
      nextCleanup: cleanupJob ? this.getNextRun(cleanupJob) : null,
    };
  }

  /**
   * Get next run time for a cron job (approximate)
   */
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