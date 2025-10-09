import { DatabaseManager } from "./DatabaseManager.js";
import { ActiveEffect, EffectType } from "../models/ActiveEffect.js";
import { Logger } from "../utils/Logger.js";

export interface ActiveEffectData {
  id: string;
  userId: string;
  guildId: string;
  effectType: EffectType;
  appliedAt: Date;
  expiresAt: Date;
  originalValue?: string;
  metadata?: Record<string, unknown>;
}

export class EffectManager {
  private activeEffects: Map<string, ActiveEffectData[]> = new Map(); // userId -> effects
  private cleanupInterval: NodeJS.Timeout | null = null;
  private dbInitialized: boolean = false;

  constructor(private db: DatabaseManager) {
    this.startCleanupInterval();
  }

  /**
   * Initialize the EffectManager by loading active effects from database
   */
  async initialize(): Promise<void> {
    if (this.dbInitialized) return;

    try {
      await this.loadActiveEffects();
      this.dbInitialized = true;
      Logger.info("EffectManager initialized with database persistence");
    } catch (error) {
      Logger.error("Failed to initialize EffectManager:", error);
    }
  }

  /**
   * Load all active effects from database on startup
   */
  async loadActiveEffects(): Promise<void> {
    try {
      const now = new Date();

      // Load all non-expired effects from database
      const dbEffects = await ActiveEffect.find({
        expiresAt: { $gt: now },
      }).sort({ appliedAt: 1 });

      Logger.info(`Loading ${dbEffects.length} active effects from database`);

      // Populate in-memory cache
      this.activeEffects.clear();

      for (const dbEffect of dbEffects) {
        const effect: ActiveEffectData = {
          id: dbEffect.effectId,
          userId: dbEffect.userId,
          guildId: dbEffect.guildId,
          effectType: dbEffect.effectType,
          appliedAt: dbEffect.appliedAt,
          expiresAt: dbEffect.expiresAt,
          originalValue: dbEffect.originalValue,
          metadata: dbEffect.metadata,
        };

        if (!this.activeEffects.has(dbEffect.userId)) {
          this.activeEffects.set(dbEffect.userId, []);
        }
        this.activeEffects.get(dbEffect.userId)!.push(effect);
      }

      Logger.info(`Loaded ${dbEffects.length} active effects into memory`);
    } catch (error) {
      Logger.error("Error loading active effects from database:", error);
    }
  }

  /**
   * Apply a temporary effect to a user
   */
  async applyEffect(
    userId: string,
    guildId: string,
    effectType: EffectType,
    durationMs: number,
    originalValue?: string,
    metadata?: Record<string, unknown>
  ): Promise<string> {
    const effectId = `${userId}-${guildId}-${effectType}-${Date.now()}`;
    const appliedAt = new Date();
    const expiresAt = new Date(appliedAt.getTime() + durationMs);

    const effectData: ActiveEffectData = {
      id: effectId,
      userId,
      guildId,
      effectType,
      appliedAt,
      expiresAt,
      originalValue,
      metadata: metadata || {},
    };

    try {
      // Save to database first
      const dbEffect = new ActiveEffect({
        effectId: effectId,
        userId,
        guildId,
        effectType,
        appliedAt,
        expiresAt,
        originalValue,
        metadata: metadata || {},
      });

      await dbEffect.save();

      // Then store in memory
      if (!this.activeEffects.has(userId)) {
        this.activeEffects.set(userId, []);
      }
      this.activeEffects.get(userId)!.push(effectData);

      Logger.info(
        `Applied effect ${effectType} to user ${userId} in guild ${guildId}, expires at ${expiresAt.toISOString()}`
      );

      return effectId;
    } catch (error) {
      Logger.error(
        `Error applying effect ${effectType} to user ${userId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Remove an effect by ID
   */
  async removeEffect(userId: string, effectId: string): Promise<boolean> {
    try {
      // Remove from database first
      const dbResult = await ActiveEffect.deleteOne({ effectId: effectId });

      // Remove from memory
      const userEffects = this.activeEffects.get(userId);
      if (!userEffects) return dbResult.deletedCount > 0;

      const effectIndex = userEffects.findIndex((e) => e.id === effectId);
      if (effectIndex === -1) return dbResult.deletedCount > 0;

      const effect = userEffects[effectIndex];
      userEffects.splice(effectIndex, 1);

      if (userEffects.length === 0) {
        this.activeEffects.delete(userId);
      }

      Logger.info(`Removed effect ${effect.effectType} from user ${userId}`);
      return true;
    } catch (error) {
      Logger.error(
        `Error removing effect ${effectId} from user ${userId}:`,
        error
      );
      return false;
    }
  }

  /**
   * Remove all effects of a specific type for a user
   */
  async removeEffectsByType(
    userId: string,
    effectType: EffectType
  ): Promise<number> {
    try {
      // Remove from database first
      const dbResult = await ActiveEffect.deleteMany({
        userId: userId,
        effectType: effectType,
      });

      // Remove from memory
      const userEffects = this.activeEffects.get(userId);
      if (!userEffects) return dbResult.deletedCount || 0;

      const initialLength = userEffects.length;
      const filteredEffects = userEffects.filter(
        (e) => e.effectType !== effectType
      );
      const removedCount = initialLength - filteredEffects.length;

      if (removedCount > 0) {
        if (filteredEffects.length === 0) {
          this.activeEffects.delete(userId);
        } else {
          this.activeEffects.set(userId, filteredEffects);
        }
        Logger.info(
          `Removed ${removedCount} ${effectType} effects from user ${userId}`
        );
      }

      return Math.max(removedCount, dbResult.deletedCount || 0);
    } catch (error) {
      Logger.error(
        `Error removing effects of type ${effectType} from user ${userId}:`,
        error
      );
      return 0;
    }
  }

  /**
   * Get all active effects for a user
   */
  getActiveEffects(userId: string): ActiveEffectData[] {
    const effects = this.activeEffects.get(userId) || [];
    const now = new Date();

    // Filter out expired effects
    return effects.filter((effect) => effect.expiresAt > now);
  }

  /**
   * Get effects of a specific type for a user
   */
  getEffectsByType(userId: string, effectType: EffectType): ActiveEffectData[] {
    return this.getActiveEffects(userId).filter(
      (e) => e.effectType === effectType
    );
  }

  /**
   * Check if user has a specific effect type active
   */
  hasEffectType(userId: string, effectType: EffectType): boolean {
    return this.getEffectsByType(userId, effectType).length > 0;
  }

  /**
   * Get the original value for a specific effect type (useful for restoration)
   */
  getOriginalValue(userId: string, effectType: EffectType): string | undefined {
    const effects = this.getEffectsByType(userId, effectType);
    // Return the most recent effect's original value
    return effects.length > 0
      ? effects[effects.length - 1].originalValue
      : undefined;
  }

  /**
   * Get effect metadata for a specific effect type
   */
  getEffectMetadata(
    userId: string,
    effectType: EffectType
  ): Record<string, unknown> | undefined {
    const effects = this.getEffectsByType(userId, effectType);
    return effects.length > 0
      ? effects[effects.length - 1].metadata
      : undefined;
  }

  /**
   * Check if user is on cooldown for a specific effect type
   */
  isOnCooldown(
    userId: string,
    effectType: EffectType
  ): { onCooldown: boolean; timeLeft?: number } {
    const effects = this.getEffectsByType(userId, effectType);
    if (effects.length === 0) {
      return { onCooldown: false };
    }

    const now = new Date();
    const latestEffect = effects[effects.length - 1];

    if (latestEffect.expiresAt > now) {
      const timeLeft = latestEffect.expiresAt.getTime() - now.getTime();
      return { onCooldown: true, timeLeft };
    }

    return { onCooldown: false };
  }

  /**
   * Clean up expired effects
   */
  private async cleanupExpiredEffects(): Promise<void> {
    try {
      const now = new Date();

      // Remove expired effects from database
      const dbResult = await ActiveEffect.deleteMany({
        expiresAt: { $lte: now },
      });

      // Clean up memory
      let totalCleaned = 0;
      for (const [userId, effects] of this.activeEffects.entries()) {
        const activeEffects = effects.filter((effect) => {
          if (effect.expiresAt <= now) {
            Logger.debug(`Effect ${effect.id} expired for user ${userId}`);
            totalCleaned++;
            return false;
          }
          return true;
        });

        if (activeEffects.length === 0) {
          this.activeEffects.delete(userId);
        } else {
          this.activeEffects.set(userId, activeEffects);
        }
      }

      if (
        totalCleaned > 0 ||
        (dbResult.deletedCount && dbResult.deletedCount > 0)
      ) {
        Logger.info(
          `Cleaned up ${totalCleaned} expired effects from memory, ${dbResult.deletedCount || 0} from database`
        );
      }
    } catch (error) {
      Logger.error("Error cleaning up expired effects:", error);
    }
  }

  /**
   * Start the cleanup interval
   */
  private startCleanupInterval(): void {
    // Clean up every 5 minutes
    this.cleanupInterval = setInterval(
      () => {
        this.cleanupExpiredEffects();
      },
      5 * 60 * 1000
    );
  }

  /**
   * Stop the cleanup interval (for graceful shutdown)
   */
  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Get effect statistics
   */
  getStats(): {
    totalActiveEffects: number;
    effectsByType: Record<EffectType, number>;
    usersWithEffects: number;
  } {
    let totalActiveEffects = 0;
    const effectsByType: Record<EffectType, number> = {
      NICKNAME_CHANGE: 0,
      TIMEOUT: 0,
      ROLE_GRANT: 0,
      DAILY_CLAIM_RESET: 0,
      EVENT_MULTIPLIER: 0,
      CONFESSION_COOLDOWN: 0,
      COMMUNITY_SERVICE_COOLDOWN: 0,
      LOYALTY_QUIZ_COOLDOWN: 0,
      PROPAGANDA_BROADCAST_COOLDOWN: 0,
      IMAGINATION_FAVOR_COOLDOWN: 0,
      INVESTIGATION_COOLDOWN: 0,
    };

    for (const effects of this.activeEffects.values()) {
      const activeEffects = effects.filter((e) => e.expiresAt > new Date());
      totalActiveEffects += activeEffects.length;

      for (const effect of activeEffects) {
        effectsByType[effect.effectType]++;
      }
    }

    return {
      totalActiveEffects,
      effectsByType,
      usersWithEffects: this.activeEffects.size,
    };
  }

  /**
   * Force sync memory with database (useful for debugging)
   */
  async syncWithDatabase(): Promise<void> {
    Logger.info("Force syncing EffectManager with database...");
    await this.loadActiveEffects();
    Logger.info("EffectManager sync completed");
  }

  /**
   * Get all effects for a guild (admin utility)
   */
  async getGuildEffects(guildId: string): Promise<ActiveEffectData[]> {
    const guildEffects: ActiveEffectData[] = [];

    for (const effects of this.activeEffects.values()) {
      const activeEffects = effects.filter(
        (e) => e.guildId === guildId && e.expiresAt > new Date()
      );
      guildEffects.push(...activeEffects);
    }

    return guildEffects;
  }

  /**
   * Manual cleanup for specific user (admin utility)
   */
  async cleanupUserEffects(userId: string): Promise<number> {
    try {
      const dbResult = await ActiveEffect.deleteMany({ userId: userId });
      this.activeEffects.delete(userId);

      Logger.info(`Manually cleaned up all effects for user ${userId}`);
      return dbResult.deletedCount || 0;
    } catch (error) {
      Logger.error(`Error cleaning up effects for user ${userId}:`, error);
      return 0;
    }
  }
}
