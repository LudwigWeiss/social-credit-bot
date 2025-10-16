import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  GuildMember,
} from "discord.js";
import { BaseCommandHandler } from "./BaseCommandHandler.js";
import { CONFIG } from "../config.js";
import { Logger } from "../utils/Logger.js";

export class FeedbackCommands extends BaseCommandHandler {
  async handleInteraction(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    switch (interaction.commandName) {
      case "praise-bot":
        await this.handlePraiseBotCommand(interaction);
        break;
      case "report-mistake":
        await this.handleReportMistakeCommand(interaction);
        break;
      default:
        throw new Error(`Unknown feedback command: ${interaction.commandName}`);
    }
  }

  private async handlePraiseBotCommand(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const userId = interaction.user.id;
    const guildId = interaction.guildId || "dm";

    // Check cooldown
    const lastPraise = this.effectManager
      .getEffectsByType(userId, "DAILY_CLAIM_RESET")
      .find((e) => e.metadata?.type === "praise_cooldown");
    if (lastPraise) {
      const timeLeft = lastPraise.expiresAt.getTime() - Date.now();
      if (timeLeft > 0) {
        const minutesLeft = Math.ceil(timeLeft / (60 * 1000));
        await interaction.reply({
          content: `⏰ Please wait another ${minutesLeft} minutes before praising the bot again!`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
    }

    // Apply small bonus
    const newScore = await this.socialCreditManager.updateScore(
      userId,
      guildId,
      CONFIG.SCORE_CHANGES.PRAISE_BOT_BONUS,
      "Praising the work of the social credit system",
      null,
      interaction.user.username
    );

    // Set cooldown
    await this.effectManager.applyEffect(
      userId,
      guildId,
      "DAILY_CLAIM_RESET",
      CONFIG.COOLDOWNS.PRAISE_BOT,
      undefined,
      { type: "praise_cooldown" }
    );

    const embed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle("Praise Acknowledged")
      .setDescription(
        `Citizen ${interaction.user.username}, your support for the State has been noted and rewarded.`
      )
      .addFields(
        {
          name: "Bonus",
          value: `+${CONFIG.SCORE_CHANGES.PRAISE_BOT_BONUS}`,
          inline: true,
        },
        { name: "New Score", value: `\`${newScore}\``, inline: true }
      )
      .setFooter({ text: "The Party always strives for perfection! 👁️" })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });

    await this.checkAchievements(
      interaction.member as GuildMember,
      "praise-bot"
    );
  }

  private async handleReportMistakeCommand(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const userId = interaction.user.id;
    const guildId = interaction.guildId || "dm";

    // Check cooldown
    const lastReport = this.effectManager
      .getEffectsByType(userId, "DAILY_CLAIM_RESET")
      .find((e) => e.metadata?.type === "report_cooldown");
    if (lastReport) {
      const timeLeft = lastReport.expiresAt.getTime() - Date.now();
      if (timeLeft > 0) {
        const minutesLeft = Math.ceil(timeLeft / (60 * 1000));
        await interaction.reply({
          content: `⏰ Please wait another ${minutesLeft} minutes before reporting another mistake!`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
    }

    // For now, just acknowledge the report and apply minor penalty
    // In a real implementation, this could log to a database for review
    const newScore = await this.socialCreditManager.updateScore(
      userId,
      guildId,
      CONFIG.SCORE_CHANGES.REPORT_MISTAKE_PENALTY,
      "Reporting a mistake in the social credit system's analysis",
      null,
      interaction.user.username
    );

    // Set cooldown
    await this.effectManager.applyEffect(
      userId,
      guildId,
      "DAILY_CLAIM_RESET",
      CONFIG.COOLDOWNS.REPORT_MISTAKE,
      undefined,
      { type: "report_cooldown" }
    );

    const embed = new EmbedBuilder()
      .setColor(0xffa500)
      .setTitle("Mistake Report Filed")
      .setDescription(
        `Citizen ${interaction.user.username}, your report has been filed for review. Frivolous reports may result in a penalty.`
      )
      .addFields(
        {
          name: "Penalty",
          value: `${CONFIG.SCORE_CHANGES.REPORT_MISTAKE_PENALTY}`,
          inline: true,
        },
        { name: "New Score", value: `\`${newScore}\``, inline: true }
      )
      .setFooter({ text: "The Party will review your report! 📋" })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });

    // Log the report for manual review
    Logger.info(`Mistake reported by user ${userId} in guild ${guildId}`);
  }
}
