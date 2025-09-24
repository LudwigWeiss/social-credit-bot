import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
} from "discord.js";
import { BaseCommandHandler } from "./BaseCommandHandler.js";
import { MemeResponses } from "../utils/MemeResponses.js";

export class SocialCreditCommands extends BaseCommandHandler {
  async handleInteraction(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    switch (interaction.commandName) {
      case "social-credit":
        await this.handleSocialCreditCommand(interaction);
        break;
      case "leaderboard":
        await this.handleLeaderboardCommand(interaction);
        break;
      case "social-credit-history":
        await this.handleHistoryCommand(interaction);
        break;
      case "social-credit-stats":
        await this.handleStatsCommand(interaction);
        break;
      default:
        throw new Error(
          `Unknown social credit command: ${interaction.commandName}`
        );
    }
  }

  private async handleSocialCreditCommand(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const targetUser = interaction.options.getUser("user") || interaction.user;
    const guildId = interaction.guildId || "dm";

    const score = await this.socialCreditManager.getUserScore(
      targetUser.id,
      guildId
    );
    const rankInfo = this.socialCreditManager.getScoreRank(score);

    const embed = new EmbedBuilder()
      .setColor(rankInfo.color)
      .setTitle(
        `${rankInfo.emoji} ОТЧЁТ О СОЦИАЛЬНОМ РЕЙТИНГЕ ${rankInfo.emoji}`
      )
      .setDescription(
        `**Гражданин:** ${targetUser.username}\n**Статус:** ${rankInfo.rank}`
      )
      .addFields(
        { name: "💯 Текущий Рейтинг", value: `${score}`, inline: true },
        { name: "🏅 Звание", value: rankInfo.rank, inline: true },
        { name: "📝 Оценка", value: rankInfo.description, inline: false }
      )
      .setThumbnail(targetUser.displayAvatarURL())
      .setFooter({
        text: `${MemeResponses.getRandomMemePhrase()}`,
        iconURL:
          "https://upload.wikimedia.org/wikipedia/commons/f/fa/Flag_of_the_People%27s_Republic_of_China.svg",
      })
      .setTimestamp();

    // Add active effects info
    const activeEffects = this.effectManager.getActiveEffects(targetUser.id);
    const penaltyLevel = this.socialCreditManager.getPenaltyLevel(score);
    const privilegeLevel = this.socialCreditManager.getPrivilegeLevel(score);

    if (penaltyLevel) {
      const penalty = MemeResponses.getPenalties(penaltyLevel);
      embed.addFields({
        name: "⚠️ Активные Наказания",
        value: penalty.memeText,
        inline: false,
      });
    }

    if (privilegeLevel) {
      const privilege = MemeResponses.getPrivileges(privilegeLevel);
      embed.addFields({
        name: "🎁 Активные Привилегии",
        value: privilege.memeText,
        inline: false,
      });
    }

    // Add active effects
    if (activeEffects.length > 0) {
      let effectsText = "";
      for (const effect of activeEffects) {
        const timeLeft = Math.ceil(
          (effect.expiresAt.getTime() - Date.now()) / (60 * 1000)
        );
        const effectName = this.getEffectDisplayName(effect.effectType);
        effectsText += `• ${effectName} (${timeLeft} мин)\n`;
      }
      embed.addFields({
        name: "🔄 Активные Эффекты",
        value: effectsText || "Нет активных эффектов",
        inline: false,
      });
    }

    // Add daily claim status
    const lastClaim = activeEffects.find(
      (e) =>
        e.effectType === "DAILY_CLAIM_RESET" &&
        e.metadata?.type === "daily_claim"
    );
    if (lastClaim) {
      const timeLeft = Math.ceil(
        (lastClaim.expiresAt.getTime() - Date.now()) / (60 * 60 * 1000)
      );
      embed.addFields({
        name: "⏰ Ежедневный Бонус",
        value: `Доступен через ${timeLeft} часов`,
        inline: true,
      });
    } else {
      embed.addFields({
        name: "⏰ Ежедневный Бонус",
        value: "Доступен сейчас!",
        inline: true,
      });
    }

    await interaction.reply({ embeds: [embed] });
  }

  private async handleLeaderboardCommand(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const scope = interaction.options.getString("scope") || "server";
    const guildId = interaction.guildId || "dm";

    let leaderboard;
    let title;
    const embedColor = 0xffd700;
    const embedTitle = "🏆 ТАБЛИЦА СОЦИАЛЬНОГО РЕЙТИНГА 🏆";

    // Check for active events that affect appearance
    // TODO: Implement event tracking for visual flair
    // For now, keep default appearance

    if (scope === "global") {
      leaderboard = await this.socialCreditManager.getGlobalLeaderboard(10);
      title = MemeResponses.getLeaderboardTitle(true);
    } else {
      leaderboard = await this.socialCreditManager.getServerLeaderboard(
        guildId,
        10
      );
      title = MemeResponses.getLeaderboardTitle(false);
    }

    if (leaderboard.length === 0) {
      await interaction.reply({
        content:
          "📊 Данные о социальном рейтинге не найдены! Начните мониторинг канала для отслеживания поведения граждан!",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(embedColor)
      .setTitle(embedTitle)
      .setDescription(title)
      .setTimestamp();

    let description = "";
    for (let i = 0; i < leaderboard.length; i++) {
      const entry = leaderboard[i];
      const rank = i + 1;
      const medal =
        rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `${rank}.`;
      const scoreEmoji = MemeResponses.getScoreEmoji(entry.score);

      try {
        const user = await interaction.client.users.fetch(entry.userId);
        description += `${medal} **${user.username}** ${scoreEmoji} \`${entry.score}\`\n`;
      } catch {
        description += `${medal} **Unknown User** ${scoreEmoji} \`${entry.score}\`\n`;
      }
    }

    embed.addFields({
      name: "👥 Лучшие Граждане",
      value: description || "Данные недоступны",
      inline: false,
    });

    embed.setFooter({
      text: `${MemeResponses.getRandomMemePhrase()}`,
    });

    await interaction.reply({ embeds: [embed] });
  }

  private async handleHistoryCommand(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const targetUser = interaction.options.getUser("user") || interaction.user;
    const guildId = interaction.guildId || "dm";

    const history = await this.socialCreditManager.getUserHistory(
      targetUser.id,
      guildId,
      10
    );

    if (history.length === 0) {
      await interaction.reply({
        content: `📜 История социального рейтинга для ${targetUser.username} не найдена. Чистый лист, гражданин!`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0x4169e1)
      .setTitle("📜 ИСТОРИЯ СОЦИАЛЬНОГО РЕЙТИНГА")
      .setDescription(
        `**Гражданин:** ${targetUser.username}\n*Недавние изменения социального рейтинга*`
      )
      .setThumbnail(targetUser.displayAvatarURL())
      .setTimestamp();

    let historyText = "";
    for (const entry of history) {
      const date = entry.timestamp.toLocaleDateString();
      const time = entry.timestamp.toLocaleTimeString();
      const changeEmoji = entry.scoreChange > 0 ? "📈" : "📉";
      const changeText =
        entry.scoreChange > 0
          ? `+${entry.scoreChange}`
          : `${entry.scoreChange}`;

      historyText += `${changeEmoji} **${changeText}** - ${entry.reason}\n`;
      historyText += `*${date} at ${time}*\n\n`;
    }

    embed.addFields({
      name: "📊 Недавняя Активность",
      value: historyText || "Нет недавней активности",
      inline: false,
    });

    embed.setFooter({
      text: `${MemeResponses.getRandomMemePhrase()}`,
    });

    await interaction.reply({ embeds: [embed] });
  }

  private async handleStatsCommand(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const guildId = interaction.guildId || "dm";

    const stats = await this.socialCreditManager.getServerStats(guildId);

    const embed = new EmbedBuilder()
      .setColor(0x9932cc)
      .setTitle("📊 СТАТИСТИКА СОЦИАЛЬНОГО РЕЙТИНГА СЕРВЕРА")
      .setDescription(MemeResponses.getStatsTitle())
      .addFields(
        {
          name: "👥 Всего Граждан",
          value: `${stats.totalUsers}`,
          inline: true,
        },
        {
          name: "📊 Средний Рейтинг",
          value: `${stats.averageScore}`,
          inline: true,
        },
        {
          name: "🏆 Высший Рейтинг",
          value: `${stats.highestScore}`,
          inline: true,
        },
        {
          name: "💀 Низший Рейтинг",
          value: `${stats.lowestScore}`,
          inline: true,
        },
        {
          name: "📈 Всего Изменений",
          value: `${stats.totalScoreChanges}`,
          inline: true,
        },
        {
          name: "🎯 Уровень Социальной Гармонии",
          value: this.calculateHarmonyLevel(stats.averageScore),
          inline: true,
        }
      )
      .setFooter({
        text: `${MemeResponses.getRandomMemePhrase()}`,
      })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
}
