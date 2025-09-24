import {
  Interaction,
  MessageFlags,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import OpenAI from "openai";
import { SocialCreditManager } from "../managers/SocialCreditManager.js";
import { DatabaseManager } from "../managers/DatabaseManager.js";
import { EffectManager } from "../managers/EffectManager.js";
import { RateLimitManager } from "../managers/RateLimitManager.js";
import { MessageContextManager } from "../managers/MessageContextManager.js";
import { SocialCreditCommands } from "./SocialCreditCommands.js";
import { AdminCommands } from "./AdminCommands.js";
import { SanctionCommands } from "./SanctionCommands.js";
import { PrivilegeCommands } from "./PrivilegeCommands.js";
import { FeedbackCommands } from "./FeedbackCommands.js";
import { UtilityCommands } from "./UtilityCommands.js";

export class CommandHandler {
  private socialCreditCommands: SocialCreditCommands;
  private adminCommands: AdminCommands;
  private sanctionCommands: SanctionCommands;
  private privilegeCommands: PrivilegeCommands;
  private feedbackCommands: FeedbackCommands;
  private utilityCommands: UtilityCommands;

  constructor(
    socialCreditManager: SocialCreditManager,
    databaseManager: DatabaseManager,
    effectManager: EffectManager,
    openai: OpenAI,
    rateLimitManager?: RateLimitManager,
    messageContextManager?: MessageContextManager
  ) {
    // Initialize all command handlers
    this.socialCreditCommands = new SocialCreditCommands(
      socialCreditManager,
      databaseManager,
      effectManager,
      openai,
      rateLimitManager,
      messageContextManager
    );

    this.adminCommands = new AdminCommands(
      socialCreditManager,
      databaseManager,
      effectManager,
      openai,
      rateLimitManager,
      messageContextManager
    );

    this.sanctionCommands = new SanctionCommands(
      socialCreditManager,
      databaseManager,
      effectManager,
      openai,
      rateLimitManager,
      messageContextManager
    );

    this.privilegeCommands = new PrivilegeCommands(
      socialCreditManager,
      databaseManager,
      effectManager,
      openai,
      rateLimitManager,
      messageContextManager
    );

    this.feedbackCommands = new FeedbackCommands(
      socialCreditManager,
      databaseManager,
      effectManager,
      openai,
      rateLimitManager,
      messageContextManager
    );

    this.utilityCommands = new UtilityCommands(
      socialCreditManager,
      databaseManager,
      effectManager,
      openai,
      rateLimitManager,
      messageContextManager
    );
  }

  async handleInteraction(interaction: Interaction): Promise<void> {
    if (!interaction.isChatInputCommand()) return;

    try {
      const commandName = interaction.commandName;

      // Route commands to appropriate handlers
      if (
        [
          "social-credit",
          "leaderboard",
          "social-credit-history",
          "social-credit-stats",
        ].includes(commandName)
      ) {
        await this.socialCreditCommands.handleInteraction(interaction);
      } else if (
        [
          "set-monitor-channel",
          "remove-monitor-channel",
          "list-monitored-channels",
        ].includes(commandName)
      ) {
        await this.adminCommands.handleInteraction(interaction);
      } else if (
        [
          "redeem-myself",
          "work-for-the-party",
          "public-confession",
          "community-service",
          "loyalty-quiz",
        ].includes(commandName)
      ) {
        await this.sanctionCommands.handleInteraction(interaction);
      } else if (
        [
          "enforce-harmony",
          "claim-daily",
          "spread-propaganda",
          "propaganda-broadcast",
          "party-favor",
          "investigate",
        ].includes(commandName)
      ) {
        await this.privilegeCommands.handleInteraction(interaction);
      } else if (["praise-bot", "report-mistake"].includes(commandName)) {
        await this.feedbackCommands.handleInteraction(interaction);
      } else if (["rate-limit-status"].includes(commandName)) {
        await this.utilityCommands.handleInteraction(interaction);
      } else if (commandName === "directive") {
        await this.handleDirectiveCommand(interaction);
      } else {
        await interaction.reply({
          content:
            "🤔 Неизвестная команда, гражданин. Компьютеры Партии в замешательстве.",
          flags: MessageFlags.Ephemeral,
        });
      }
    } catch (error) {
      console.error("Error handling command:", error);
      await interaction.reply({
        content:
          "🚨 ОШИБКА: Система социального рейтинга вышла из строя! Пожалуйста, обратитесь к местному представителю Партии.",
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  // Delegate methods for backward compatibility
  public isChannelMonitored(guildId: string, channelId: string): boolean {
    return this.adminCommands.isChannelMonitored(guildId, channelId);
  }

  public addMonitoredChannel(guildId: string, channelId: string): void {
    this.adminCommands.addMonitoredChannel(guildId, channelId);
  }

  public removeMonitoredChannel(guildId: string, channelId: string): void {
    this.adminCommands.removeMonitoredChannel(guildId, channelId);
  }

  private async handleDirectiveCommand(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    // This is a placeholder - we need DirectiveManager access
    // For now, just show that the system exists
    const embed = new EmbedBuilder()
      .setColor(0x0099ff)
      .setTitle("📋 ВАШИ ТЕКУЩИЕ ЗАДАНИЯ")
      .setDescription(
        `**Гражданин ${interaction.user.username}!**\n\n` +
          `Система директив временно недоступна. Эта функция будет активирована в следующем обновлении.\n\n` +
          `**Скоро доступно:**\n` +
          `📅 Ежедневные задания\n` +
          `📊 Недельные цели\n` +
          `🎯 Персональные задачи`
      )
      .setFooter({ text: "Партия готовит для вас новые задания! 🎯" })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }
}
