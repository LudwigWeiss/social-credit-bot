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
import { DirectiveManager } from "../managers/DirectiveManager.js";
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
  private directiveManager: DirectiveManager;

  constructor(
    socialCreditManager: SocialCreditManager,
    databaseManager: DatabaseManager,
    effectManager: EffectManager,
    openai: OpenAI,
    directiveManager: DirectiveManager,
    rateLimitManager?: RateLimitManager,
    messageContextManager?: MessageContextManager
  ) {
    this.directiveManager = directiveManager;
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
            "🤔 Unknown command, citizen. The Party's computers are confused.",
          flags: MessageFlags.Ephemeral,
        });
      }
    } catch (error) {
      console.error("Error handling command:", error);
      await interaction.reply({
        content:
          "🚨 ERROR: The social credit system has malfunctioned! Please contact your local Party representative.",
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
    const userId = interaction.user.id;
    const guildId = interaction.guildId || "dm";

    const dailyDirectives = this.directiveManager.getDailyDirectives(
      userId,
      guildId
    );
    const weeklyGoals = this.directiveManager.getWeeklyGoals(userId, guildId);

    const embed = new EmbedBuilder()
      .setColor(0x0099ff)
      .setTitle(`📋 Directives for Citizen ${interaction.user.username}`)
      .setTimestamp();

    if (dailyDirectives.length === 0 && weeklyGoals.length === 0) {
      embed.setDescription(
        "You have no active directives. The Party will provide you with new goals soon. Be active!"
      );
    }

    if (dailyDirectives.length > 0) {
      const directive = dailyDirectives[0]; // Assuming one active daily directive
      const timeLeft = Math.ceil(
        (directive.expiresAt.getTime() - Date.now()) / (60 * 60 * 1000)
      );
      embed.addFields({
        name: `📅 Daily Directive (Time left: ${timeLeft}h)`,
        value: `**${directive.task}**\n*${directive.description}*\n${this.formatProgressBar(directive.currentProgress, directive.targetValue)}\n**Progress:** ${directive.currentProgress} / ${directive.targetValue}\n**Reward:** +${directive.reward} credits`,
        inline: false,
      });
    }

    if (weeklyGoals.length > 0) {
      const goal = weeklyGoals[0]; // Assuming one active weekly goal
      const timeLeft = Math.ceil(
        (goal.expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)
      );
      embed.addFields({
        name: `🗓️ Weekly Goal (Time left: ${timeLeft}d)`,
        value: `**${goal.goal}**\n*${goal.description}*\n${this.formatProgressBar(goal.currentProgress, goal.targetValue)}\n**Progress:** ${goal.currentProgress} / ${goal.targetValue}\n**Reward:** +${goal.reward} credits`,
        inline: false,
      });
    }

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  private formatProgressBar(
    current: number,
    total: number,
    length: number = 10
  ): string {
    if (total === 0) return "`[░░░░░░░░░░]` 0%";
    const progress = Math.min(Math.max(current / total, 0), 1);
    const filledBlocks = Math.round(progress * length);
    const emptyBlocks = length - filledBlocks;
    const bar = "█".repeat(filledBlocks) + "░".repeat(emptyBlocks);
    return `\`[${bar}]\` ${Math.round(progress * 100)}%`;
  }
}
