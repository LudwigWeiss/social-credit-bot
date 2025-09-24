import { Interaction } from "discord.js";
import OpenAI from "openai";
import { SocialCreditManager } from "../managers/SocialCreditManager.js";
import { DatabaseManager } from "../managers/DatabaseManager.js";
import { EffectManager } from "../managers/EffectManager.js";
import { RateLimitManager } from "../managers/RateLimitManager.js";
import { MessageContextManager } from "../managers/MessageContextManager.js";
import { Logger } from "../utils/Logger.js";

export abstract class BaseCommandHandler {
  protected monitoredChannels: Map<string, Set<string>> = new Map();

  constructor(
    protected socialCreditManager: SocialCreditManager,
    protected databaseManager: DatabaseManager,
    protected effectManager: EffectManager,
    protected openai: OpenAI,
    protected rateLimitManager?: RateLimitManager,
    protected messageContextManager?: MessageContextManager
  ) {}

  abstract handleInteraction(interaction: Interaction): Promise<void>;

  protected async loadMonitoredChannels(): Promise<void> {
    try {
      this.monitoredChannels =
        await this.databaseManager.getAllMonitoredChannels();
      Logger.info(
        `Loaded monitored channels from database: ${this.monitoredChannels.size} guilds`
      );
    } catch (error) {
      Logger.error("Failed to load monitored channels from database:", error);
    }
  }

  public isChannelMonitored(guildId: string, channelId: string): boolean {
    return this.monitoredChannels.get(guildId)?.has(channelId) || false;
  }

  public addMonitoredChannel(guildId: string, channelId: string): void {
    if (!this.monitoredChannels.has(guildId)) {
      this.monitoredChannels.set(guildId, new Set());
    }
    this.monitoredChannels.get(guildId)!.add(channelId);
  }

  public removeMonitoredChannel(guildId: string, channelId: string): void {
    this.monitoredChannels.get(guildId)?.delete(channelId);
  }

  protected async addMonitoredChannelPersistent(
    guildId: string,
    channelId: string,
    channelName: string,
    addedBy: string
  ): Promise<void> {
    try {
      await this.databaseManager.addMonitoredChannel(
        guildId,
        channelId,
        channelName,
        addedBy
      );
      this.addMonitoredChannel(guildId, channelId);
      Logger.info(
        `Added monitored channel ${channelId} (${channelName}) for guild ${guildId}`
      );
    } catch (error) {
      Logger.error("Failed to add monitored channel:", error);
      throw error;
    }
  }

  protected async removeMonitoredChannelPersistent(
    guildId: string,
    channelId: string
  ): Promise<boolean> {
    try {
      const removed = await this.databaseManager.removeMonitoredChannel(
        guildId,
        channelId
      );

      if (removed) {
        this.removeMonitoredChannel(guildId, channelId);
        Logger.info(
          `Removed monitored channel ${channelId} for guild ${guildId}`
        );
      }

      return removed;
    } catch (error) {
      Logger.error("Failed to remove monitored channel:", error);
      throw error;
    }
  }

  protected getEffectDisplayName(effectType: string): string {
    const effectNames: Record<string, string> = {
      NICKNAME_CHANGE: "Изменение Никнейма",
      TIMEOUT: "Тайм-аут",
      ROLE_GRANT: "Предоставление Роли",
      DAILY_CLAIM_RESET: "Кулдаун Ежедневного Бонуса",
      EVENT_MULTIPLIER: "Множитель События",
    };
    return effectNames[effectType] || effectType;
  }

  protected calculateHarmonyLevel(averageScore: number): string {
    if (averageScore >= 800) return "🌟 ВЫСШАЯ ГАРМОНИЯ";
    if (averageScore >= 400) return "✅ ВЫСОКАЯ ГАРМОНИЯ";
    if (averageScore >= 100) return "😐 УМЕРЕННАЯ ГАРМОНИЯ";
    if (averageScore >= -100) return "⚪ НЕЙТРАЛЬНАЯ ГАРМОНИЯ";
    if (averageScore >= -300) return "⚠️ НИЗКАЯ ГАРМОНИЯ";
    return "🚨 СОЦИАЛЬНЫЕ БЕСПОРЯДКИ";
  }
}
