import {
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { BaseCommandHandler } from "./BaseCommandHandler.js";
import { CONFIG } from "../config.js";
import { MemeResponses } from "../utils/MemeResponses.js";

export class PrivilegeCommands extends BaseCommandHandler {
  async handleInteraction(interaction: ChatInputCommandInteraction): Promise<void> {
    switch (interaction.commandName) {
      case "enforce-harmony":
        await this.handleEnforceHarmonyCommand(interaction);
        break;
      case "claim-daily":
        await this.handleClaimDailyCommand(interaction);
        break;
      case "spread-propaganda":
        await this.handleSpreadPropagandaCommand(interaction);
        break;
      default:
        throw new Error(`Unknown privilege command: ${interaction.commandName}`);
    }
  }

  private async handleEnforceHarmonyCommand(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const enforcerId = interaction.user.id;
    const guildId = interaction.guildId || "dm";
    const targetUser = interaction.options.getUser("target", true);
    const reason = interaction.options.getString("reason", true);

    // Check if enforcer has high enough score
    const enforcerScore = await this.socialCreditManager.getUserScore(enforcerId, guildId);
    if (enforcerScore < CONFIG.SCORE_THRESHOLDS.PRIVILEGES.SUPREME_CITIZEN) {
      await interaction.reply({
        content: `❌ Недостаточный социальный рейтинг! Требуется ${CONFIG.SCORE_THRESHOLDS.PRIVILEGES.SUPREME_CITIZEN}+ для исполнения Мандата Гражданина.`,
        ephemeral: true,
      });
      return;
    }

    // Can't enforce on yourself
    if (targetUser.id === enforcerId) {
      await interaction.reply({
        content: "🤔 Вы не можете навязывать гармонию самому себе, гражданин!",
        ephemeral: true,
      });
      return;
    }

    // Can't enforce on bots
    if (targetUser.bot) {
      await interaction.reply({
        content: "🤖 Боты уже идеально гармоничны!",
        ephemeral: true,
      });
      return;
    }

    // Check cooldown
    const lastEnforce = this.effectManager.getEffectsByType(enforcerId, "DAILY_CLAIM_RESET").find(
      e => e.metadata?.type === "enforce_cooldown"
    );
    if (lastEnforce) {
      const timeLeft = lastEnforce.expiresAt.getTime() - Date.now();
      if (timeLeft > 0) {
        const minutesLeft = Math.ceil(timeLeft / (60 * 1000));
        await interaction.reply({
          content: `⏰ Подождите ещё ${minutesLeft} минут перед следующим исполнением Мандата Гражданина!`,
          ephemeral: true,
        });
        return;
      }
    }

    // Apply enforcement
    const targetNewScore = await this.socialCreditManager.updateScore(
      targetUser.id,
      guildId,
      CONFIG.SCORE_CHANGES.ENFORCE_HARMONY_TARGET,
      `Мандат Гражданина: ${reason} (от ${interaction.user.username})`,
      targetUser.username
    );

    const enforcerNewScore = await this.socialCreditManager.updateScore(
      enforcerId,
      guildId,
      CONFIG.SCORE_CHANGES.ENFORCE_HARMONY_ENFORCER,
      `Исполнение Мандата Гражданина на ${targetUser.username}`,
      interaction.user.username
    );

    // Set cooldown
    await this.effectManager.applyEffect(
      enforcerId,
      guildId,
      "DAILY_CLAIM_RESET",
      CONFIG.COOLDOWNS.ENFORCE_HARMONY,
      undefined,
      { type: "enforce_cooldown" }
    );

    const embed = new EmbedBuilder()
      .setColor(0xffd700)
      .setTitle("⚖️ МАНДАТ ГРАЖДАНИНА ИСПОЛНЕН")
      .setDescription(
        `**Исполнитель:** ${interaction.user.username}\n` +
        `**Нарушитель:** ${targetUser.username}\n` +
        `**Причина:** ${reason}`
      )
      .addFields(
        {
          name: "👤 Нарушитель",
          value: `📉 ${CONFIG.SCORE_CHANGES.ENFORCE_HARMONY_TARGET} → \`${targetNewScore}\``,
          inline: true,
        },
        {
          name: "👑 Исполнитель",
          value: `📈 ${CONFIG.SCORE_CHANGES.ENFORCE_HARMONY_ENFORCER} → \`${enforcerNewScore}\``,
          inline: true,
        }
      )
      .setFooter({ text: "Партия ценит вашу бдительность! 👁️" })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }

  private async handleClaimDailyCommand(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const userId = interaction.user.id;
    const guildId = interaction.guildId || "dm";

    // Check if already claimed today
    const lastClaim = this.effectManager.getEffectsByType(userId, "DAILY_CLAIM_RESET").find(
      e => e.metadata?.type === "daily_claim"
    );
    if (lastClaim) {
      const timeLeft = lastClaim.expiresAt.getTime() - Date.now();
      if (timeLeft > 0) {
        const hoursLeft = Math.ceil(timeLeft / (60 * 60 * 1000));
        await interaction.reply({
          content: `⏰ Вы уже получили ежедневный бонус сегодня! Следующий бонус через ${hoursLeft} часов.`,
          ephemeral: true,
        });
        return;
      }
    }

    // Get user's rank to determine bonus amount
    const userScore = await this.socialCreditManager.getUserScore(userId, guildId);
    const rankInfo = this.socialCreditManager.getScoreRank(userScore);

    let bonusAmount = 0;
    if (userScore >= CONFIG.SCORE_THRESHOLDS.PRIVILEGES.SUPREME_CITIZEN) {
      bonusAmount = CONFIG.DAILY_CLAIMS.SUPREME_CITIZEN;
    } else if (userScore >= CONFIG.SCORE_THRESHOLDS.PRIVILEGES.MODEL_CITIZEN) {
      bonusAmount = CONFIG.DAILY_CLAIMS.MODEL_CITIZEN;
    } else if (userScore >= CONFIG.SCORE_THRESHOLDS.PRIVILEGES.GOOD_CITIZEN) {
      bonusAmount = CONFIG.DAILY_CLAIMS.GOOD_CITIZEN;
    } else {
      await interaction.reply({
        content: "❌ Недостаточный социальный рейтинг для получения ежедневного бонуса! Повысьте свой рейтинг.",
        ephemeral: true,
      });
      return;
    }

    // Apply the bonus
    const newScore = await this.socialCreditManager.updateScore(
      userId,
      guildId,
      bonusAmount,
      `Ежедневный бонус Партии (${rankInfo.rank})`,
      interaction.user.username
    );

    // Set claim cooldown
    await this.effectManager.applyEffect(
      userId,
      guildId,
      "DAILY_CLAIM_RESET",
      CONFIG.EFFECT_DURATIONS.DAILY_CLAIM_RESET,
      undefined,
      { type: "daily_claim" }
    );

    const embed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle("🎁 ЕЖЕДНЕВНЫЙ БОНУС ПАРТИИ")
      .setDescription(
        `**Гражданин ${interaction.user.username}!**\n\n` +
        `Партия благосклонна к вам сегодня! Вы получили бонус за вашу лояльность.`
      )
      .addFields(
        { name: "🏅 Звание", value: rankInfo.rank, inline: true },
        { name: "💰 Бонус", value: `+${bonusAmount}`, inline: true },
        { name: "💯 Новый Рейтинг", value: `${newScore}`, inline: true }
      )
      .setFooter({ text: "Партия заботится о своих лучших гражданах! 🇨🇳" })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }

  private async handleSpreadPropagandaCommand(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const userId = interaction.user.id;
    const guildId = interaction.guildId || "dm";

    // Check if user has high enough score
    const userScore = await this.socialCreditManager.getUserScore(userId, guildId);
    if (userScore < CONFIG.SCORE_THRESHOLDS.PRIVILEGES.MODEL_CITIZEN) {
      await interaction.reply({
        content: `❌ Недостаточный социальный рейтинг! Требуется ${CONFIG.SCORE_THRESHOLDS.PRIVILEGES.MODEL_CITIZEN}+ для распространения пропаганды.`,
        ephemeral: true,
      });
      return;
    }

    // Check cooldown
    const lastPropaganda = this.effectManager.getEffectsByType(userId, "DAILY_CLAIM_RESET").find(
      e => e.metadata?.type === "propaganda_cooldown"
    );
    if (lastPropaganda) {
      const timeLeft = lastPropaganda.expiresAt.getTime() - Date.now();
      if (timeLeft > 0) {
        const hoursLeft = Math.ceil(timeLeft / (60 * 60 * 1000));
        await interaction.reply({
          content: `⏰ Подождите ещё ${hoursLeft} часов перед следующим распространением пропаганды!`,
          ephemeral: true,
        });
        return;
      }
    }

    // Select random propaganda image
    const imageUrl = CONFIG.PROPAGANDA_IMAGES[
      Math.floor(Math.random() * CONFIG.PROPAGANDA_IMAGES.length)
    ];

    // Create embed with propaganda
    const embed = new EmbedBuilder()
      .setColor(0xffd700)
      .setTitle("🇨🇳 СЛАВА ПАРТИИ! 🇨🇳")
      .setDescription(
        `**${interaction.user.username}** напоминает вам о величии Партии!\n\n` +
        `*"Социальная гармония достигается через единство под руководством Партии!"*`
      )
      .setImage(imageUrl)
      .setFooter({ text: "Партия всегда права! 中华人民共和国万岁!" })
      .setTimestamp();

    // Send to current channel
    await interaction.reply({ embeds: [embed] });

    // Apply bonus
    const newScore = await this.socialCreditManager.updateScore(
      userId,
      guildId,
      CONFIG.SCORE_CHANGES.SPREAD_PROPAGANDA_BONUS,
      "Распространение славной пропаганды Партии",
      interaction.user.username
    );

    // Set cooldown
    await this.effectManager.applyEffect(
      userId,
      guildId,
      "DAILY_CLAIM_RESET",
      CONFIG.COOLDOWNS.SPREAD_PROPAGANDA,
      undefined,
      { type: "propaganda_cooldown" }
    );

    // Send confirmation
    const confirmEmbed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle("📢 ПРОПАГАНДА РАСПРОСТРАНЕНА!")
      .setDescription(
        `**Спасибо за вашу преданность, гражданин ${interaction.user.username}!**\n\n` +
        `Партия ценит вашу помощь в распространении истины.`
      )
      .addFields(
        { name: "💰 Бонус", value: `+${CONFIG.SCORE_CHANGES.SPREAD_PROPAGANDA_BONUS}`, inline: true },
        { name: "💯 Новый Рейтинг", value: `${newScore}`, inline: true }
      )
      .setFooter({ text: "Продолжайте служить Партии! 👁️" })
      .setTimestamp();

    await interaction.followUp({ embeds: [confirmEmbed], ephemeral: true });
  }
}