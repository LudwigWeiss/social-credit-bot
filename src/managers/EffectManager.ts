import { DatabaseManager } from "./DatabaseManager.js";
import { Logger } from "../utils/Logger.js";

export interface ActiveEffect {
  id: string;
  userId: string;
  guildId: string;
  effectType: EffectType;
  appliedAt: Date;
  expiresAt: Date;
  originalValue?: string; // For nickname changes, etc.
  metadata?: Record<string, any>;
}

export type EffectType =
  | "NICKNAME_CHANGE"
  | "TIMEOUT"
  | "ROLE_GRANT"
  | "DAILY_CLAIM_RESET"
  | "EVENT_MULTIPLIER";

export class EffectManager {
  private activeEffects: Map<string, ActiveEffect[]> = new Map(); // userId -> effects
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(private db: DatabaseManager) {
    this.startCleanupInterval();
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
    metadata?: Record<string, any>
  ): Promise<string> {
    const effectId = `${userId}-${guildId}-${effectType}-${Date.now()}`;
    const appliedAt = new Date();
    const expiresAt = new Date(appliedAt.getTime() + durationMs);

    const effect: ActiveEffect = {
      id: effectId,
      userId,
      guildId,
      effectType,
      appliedAt,
      expiresAt,
      originalValue,
      metadata,
    };

    // Store in memory
    if (!this.activeEffects.has(userId)) {
      this.activeEffects.set(userId, []);
    }
    this.activeEffects.get(userId)!.push(effect);

    // TODO: Persist to database if needed for bot restarts
    // For now, effects are memory-only and will reset on restart

    Logger.info(
      `Applied effect ${effectType} to user ${userId} in guild ${guildId}, expires at ${expiresAt.toISOString()}`
    );

    return effectId;
  }

  /**
   * Remove an effect by ID
   */
  async removeEffect(userId: string, effectId: string): Promise<boolean> {
    const userEffects = this.activeEffects.get(userId);
    if (!userEffects) return false;

    const effectIndex = userEffects.findIndex((e) => e.id === effectId);
    if (effectIndex === -1) return false;

    const effect = userEffects[effectIndex];
    userEffects.splice(effectIndex, 1);

    Logger.info(`Removed effect ${effect.effectType} from user ${userId}`);
    return true;
  }

  /**
   * Remove all effects of a specific type for a user
   */
  async removeEffectsByType(
    userId: string,
    effectType: EffectType
  ): Promise<number> {
    const userEffects = this.activeEffects.get(userId);
    if (!userEffects) return 0;

    const initialLength = userEffects.length;
    const filteredEffects = userEffects.filter((e) => e.effectType !== effectType);
    const removedCount = initialLength - filteredEffects.length;

    if (removedCount > 0) {
      this.activeEffects.set(userId, filteredEffects);
      Logger.info(`Removed ${removedCount} ${effectType} effects from user ${userId}`);
    }

    return removedCount;
  }

  /**
   * Get all active effects for a user
   */
  getActiveEffects(userId: string): ActiveEffect[] {
    return this.activeEffects.get(userId) || [];
  }

  /**
   * Get effects of a specific type for a user
   */
  getEffectsByType(userId: string, effectType: EffectType): ActiveEffect[] {
    return this.getActiveEffects(userId).filter((e) => e.effectType === effectType);
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
    return effects.length > 0 ? effects[effects.length - 1].originalValue : undefined;
  }

  /**
   * Clean up expired effects
   */
  private cleanupExpiredEffects(): void {
    const now = new Date();
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

    if (totalCleaned > 0) {
      Logger.info(`Cleaned up ${totalCleaned} expired effects`);
    }
  }

  /**
   * Start the cleanup interval
   */
  private startCleanupInterval(): void {
    // Clean up every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredEffects();
    }, 5 * 60 * 1000);
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
    };

    for (const effects of this.activeEffects.values()) {
      totalActiveEffects += effects.length;
      for (const effect of effects) {
        effectsByType[effect.effectType]++;
      }
    }

    return {
      totalActiveEffects,
      effectsByType,
      usersWithEffects: this.activeEffects.size,
    };
  }
}