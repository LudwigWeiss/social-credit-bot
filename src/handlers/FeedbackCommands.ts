import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
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
          content: `⏰ Подождите ещё ${minutesLeft} минут перед следующей похвалой бота!`,
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
      "Похвала работе системы социального рейтинга",
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
      .setTitle("🙏 СПАСИБО ЗА ПОХВАЛУ!")
      .setDescription(
        `**Гражданин ${interaction.user.username}!**\n\n` +
          `Партия ценит вашу поддержку системы социального рейтинга!`
      )
      .addFields(
        {
          name: "💰 Бонус",
          value: `+${CONFIG.SCORE_CHANGES.PRAISE_BOT_BONUS}`,
          inline: true,
        },
        { name: "💯 Новый Рейтинг", value: `${newScore}`, inline: true }
      )
      .setFooter({ text: "Партия всегда стремится к совершенству! 👁️" })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
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
          content: `⏰ Подождите ещё ${minutesLeft} минут перед следующим отчётом об ошибке!`,
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
      "Отчёт об ошибке в анализе системы социального рейтинга",
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
      .setTitle("📝 ОТЧЁТ ОБ ОШИБКЕ ЗАРЕГИСТРИРОВАН")
      .setDescription(
        `**Гражданин ${interaction.user.username}!**\n\n` +
          `Ваш отчёт об ошибке в работе системы социального рейтинга принят к рассмотрению. ` +
          `Партия благодарит за бдительность, но напоминает о необходимости осторожности в обвинениях.`
      )
      .addFields(
        {
          name: "⚠️ Штраф",
          value: `${CONFIG.SCORE_CHANGES.REPORT_MISTAKE_PENALTY}`,
          inline: true,
        },
        { name: "💯 Новый Рейтинг", value: `${newScore}`, inline: true }
      )
      .setFooter({ text: "Партия рассмотрит ваш отчёт! 📋" })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });

    // Log the report for manual review
    Logger.info(`Mistake reported by user ${userId} in guild ${guildId}`);
  }
}
