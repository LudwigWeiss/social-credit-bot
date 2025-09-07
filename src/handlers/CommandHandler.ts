import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType,
  Interaction,
} from "discord.js";
import { SocialCreditManager } from "../managers/SocialCreditManager.js";
import { DatabaseManager } from "../managers/DatabaseManager.js";
import { MemeResponses } from "../utils/MemeResponses.js";
import { RateLimitManager } from "../managers/RateLimitManager.js";
import { MessageContextManager } from "../managers/MessageContextManager.js";
import { Logger } from "../utils/Logger.js";

export class CommandHandler {
  private monitoredChannels: Map<string, Set<string>> = new Map(); // guildId -> Set of channelIds

  constructor(
    private socialCreditManager: SocialCreditManager,
    private databaseManager: DatabaseManager,
    private rateLimitManager?: RateLimitManager,
    private messageContextManager?: MessageContextManager
  ) {
    this.loadMonitoredChannels();
  }

  private async loadMonitoredChannels(): Promise<void> {
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

  async handleInteraction(interaction: Interaction): Promise<void> {
    if (!interaction.isChatInputCommand()) return;

    try {
      switch (interaction.commandName) {
        case "social-credit":
          await this.handleSocialCreditCommand(interaction);
          break;
        case "leaderboard":
          await this.handleLeaderboardCommand(interaction);
          break;
        case "set-monitor-channel":
          await this.handleSetMonitorChannelCommand(interaction);
          break;
        case "social-credit-history":
          await this.handleHistoryCommand(interaction);
          break;
        case "social-credit-stats":
          await this.handleStatsCommand(interaction);
          break;
        case "rate-limit-status":
          await this.handleRateLimitStatusCommand(interaction);
          break;
        case "list-monitored-channels":
          await this.handleListMonitoredChannelsCommand(interaction);
          break;
        case "remove-monitor-channel":
          await this.handleRemoveMonitorChannelCommand(interaction);
          break;
        default:
          await interaction.reply({
            content:
              "🤔 Unknown command, citizen. The Party computers are confused.",
            ephemeral: true,
          });
      }
    } catch (error) {
      console.error("Error handling command:", error);
      await interaction.reply({
        content:
          "🚨 ERROR: The social credit system has malfunctioned! Please contact your local Party representative.",
        ephemeral: true,
      });
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

    // Add penalty/privilege info if applicable
    const penaltyLevel = this.socialCreditManager.getPenaltyLevel(score);
    const privilegeLevel = this.socialCreditManager.getPrivilegeLevel(score);

    if (penaltyLevel) {
      const penalty = MemeResponses.getPenalties(penaltyLevel);
      embed.addFields({
        name: "⚠️ Active Penalties",
        value: penalty.memeText,
        inline: false,
      });
    }

    if (privilegeLevel) {
      const privilege = MemeResponses.getPrivileges(privilegeLevel);
      embed.addFields({
        name: "🎁 Active Privileges",
        value: privilege.memeText,
        inline: false,
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
        ephemeral: true,
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0xffd700)
      .setTitle("🏆 ТАБЛИЦА СОЦИАЛЬНОГО РЕЙТИНГА 🏆")
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

  private async handleSetMonitorChannelCommand(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    // Check if user has admin permissions
    if (
      !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)
    ) {
      await interaction.reply({
        content:
          "🚫 Доступ запрещён! Только партийные чиновники (администраторы) могут устанавливать каналы мониторинга!",
        ephemeral: true,
      });
      return;
    }

    const channel = interaction.options.getChannel("channel");
    const guildId = interaction.guildId!;

    if (!channel || channel.type !== ChannelType.GuildText) {
      await interaction.reply({
        content:
          "❌ Неверный канал! Пожалуйста, выберите текстовый канал для мониторинга.",
        ephemeral: true,
      });
      return;
    }

    // Add channel to monitored channels (both memory and database)
    await this.addMonitoredChannelPersistent(
      guildId,
      channel.id,
      channel.name || "Unknown Channel",
      interaction.user.id
    );

    const embed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle("🎯 МОНИТОРИНГ АКТИВИРОВАН")
      .setDescription(
        `Канал ${channel} теперь отслеживается для оценки социального рейтинга!`
      )
      .addFields(
        { name: "📺 Отслеживаемый Канал", value: `${channel}`, inline: true },
        { name: "👁️ Статус", value: "АКТИВЕН", inline: true }
      )
      .setFooter({ text: "Партия видит всё! 👁️" })
      .setTimestamp();

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
        ephemeral: true,
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

  private calculateHarmonyLevel(averageScore: number): string {
    if (averageScore >= 800) return "🌟 ВЫСШАЯ ГАРМОНИЯ";
    if (averageScore >= 400) return "✅ ВЫСОКАЯ ГАРМОНИЯ";
    if (averageScore >= 100) return "😐 УМЕРЕННАЯ ГАРМОНИЯ";
    if (averageScore >= -100) return "⚪ НЕЙТРАЛЬНАЯ ГАРМОНИЯ";
    if (averageScore >= -300) return "⚠️ НИЗКАЯ ГАРМОНИЯ";
    return "🚨 СОЦИАЛЬНЫЕ БЕСПОРЯДКИ";
  }

  private async handleRateLimitStatusCommand(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    if (!this.rateLimitManager) {
      await interaction.reply({
        content: "❌ Rate limit manager not available.",
        ephemeral: true,
      });
      return;
    }

    const userId = interaction.user.id;
    const guildId = interaction.guildId || "dm";

    const status = this.rateLimitManager.getUserStatus(userId, guildId);
    const contextStats = this.messageContextManager?.getChannelStats() || {
      totalChannels: 0,
      totalMessages: 0,
    };

    const embed = new EmbedBuilder()
      .setColor(0x4169e1)
      .setTitle("⏱️ СТАТУС ОГРАНИЧЕНИЙ РЕЙТИНГА")
      .setDescription(
        `**Гражданин:** ${interaction.user.username}\n*Текущее состояние системы контроля*`
      )
      .addFields(
        {
          name: "🎯 Положительный Рейтинг",
          value: status.canReceivePositive
            ? "✅ Доступен"
            : `❌ Кулдаун: ${Math.ceil(status.timeUntilPositive / 60000)} мин`,
          inline: true,
        },
        {
          name: "📊 Сообщений в Окне",
          value: `${status.messagesInWindow}/10`,
          inline: true,
        },
        {
          name: "📝 Буферизованных",
          value: `${status.bufferedMessages}`,
          inline: true,
        },
        {
          name: "⏰ Окно Сбросится",
          value: `${Math.ceil(status.windowTimeLeft / 1000)} сек`,
          inline: true,
        },
        {
          name: "🌐 Контекст Каналов",
          value: `${contextStats.totalChannels}`,
          inline: true,
        },
        {
          name: "💬 Всего Сообщений",
          value: `${contextStats.totalMessages}`,
          inline: true,
        }
      )
      .setFooter({
        text: "Партия контролирует темп! 👁️",
      })
      .setTimestamp();

    // Add warning if user is being rate limited
    if (!status.canReceivePositive || status.messagesInWindow >= 8) {
      embed.addFields({
        name: "⚠️ Предупреждение",
        value:
          status.messagesInWindow >= 8
            ? "🚨 Близко к лимиту сообщений! Следующие сообщения будут буферизованы."
            : "⏰ Кулдаун на положительный рейтинг активен.",
        inline: false,
      });
    }

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  private async handleListMonitoredChannelsCommand(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    // Check if user has admin permissions
    if (
      !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)
    ) {
      await interaction.reply({
        content:
          "🚫 Доступ запрещён! Только партийные чиновники (администраторы) могут просматривать мониторинг!",
        ephemeral: true,
      });
      return;
    }

    const guildId = interaction.guildId!;

    try {
      const channelInfo =
        await this.databaseManager.getMonitoredChannelInfo(guildId);

      if (channelInfo.length === 0) {
        await interaction.reply({
          content:
            "📊 В этом сервере нет отслеживаемых каналов. Используйте `/set-monitor-channel` для добавления.",
          ephemeral: true,
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(0x4169e1)
        .setTitle("📺 ОТСЛЕЖИВАЕМЫЕ КАНАЛЫ")
        .setDescription("*Каналы под наблюдением системы социального рейтинга*")
        .setTimestamp();

      let description = "";
      for (const info of channelInfo) {
        const channel = `<#${info.channelId}>`;
        const addedDate = info.addedAt.toLocaleDateString();
        description += `${channel}\n`;
        description += `└ Добавлен: ${addedDate} | <@${info.addedBy}>\n\n`;
      }

      embed.addFields({
        name: `👁️ Активных каналов: ${channelInfo.length}`,
        value: description,
        inline: false,
      });

      embed.setFooter({ text: "Партия наблюдает за всеми! 👁️" });

      await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error) {
      Logger.error("Error listing monitored channels:", error);
      await interaction.reply({
        content: "❌ Ошибка при получении списка каналов.",
        ephemeral: true,
      });
    }
  }

  private async handleRemoveMonitorChannelCommand(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    // Check if user has admin permissions
    if (
      !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)
    ) {
      await interaction.reply({
        content:
          "🚫 Доступ запрещён! Только партийные чиновники (администраторы) могут управлять мониторингом!",
        ephemeral: true,
      });
      return;
    }

    const channel = interaction.options.getChannel("channel");
    const guildId = interaction.guildId!;

    if (!channel || channel.type !== ChannelType.GuildText) {
      await interaction.reply({
        content: "❌ Неверный канал! Пожалуйста, выберите текстовый канал.",
        ephemeral: true,
      });
      return;
    }

    try {
      const removed = await this.removeMonitoredChannelPersistent(
        guildId,
        channel.id
      );

      if (removed) {
        const embed = new EmbedBuilder()
          .setColor(0xff4500)
          .setTitle("🚫 МОНИТОРИНГ ОТКЛЮЧЁН")
          .setDescription(
            `Канал ${channel} больше не отслеживается системой социального рейтинга.`
          )
          .addFields(
            { name: "📺 Канал", value: `${channel}`, inline: true },
            { name: "👁️ Статус", value: "ОТКЛЮЧЁН", inline: true }
          )
          .setFooter({ text: "Партия перестала наблюдать за этим каналом." })
          .setTimestamp();

        await interaction.reply({ embeds: [embed] });
      } else {
        await interaction.reply({
          content: `❌ Канал ${channel} не был в списке отслеживаемых.`,
          ephemeral: true,
        });
      }
    } catch (error) {
      Logger.error("Error removing monitored channel:", error);
      await interaction.reply({
        content: "❌ Ошибка при удалении канала из мониторинга.",
        ephemeral: true,
      });
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

  private async addMonitoredChannelPersistent(
    guildId: string,
    channelId: string,
    channelName: string,
    addedBy: string
  ): Promise<void> {
    try {
      // Add to database
      await this.databaseManager.addMonitoredChannel(
        guildId,
        channelId,
        channelName,
        addedBy
      );

      // Add to memory
      this.addMonitoredChannel(guildId, channelId);

      Logger.info(
        `Added monitored channel ${channelId} (${channelName}) for guild ${guildId}`
      );
    } catch (error) {
      Logger.error("Failed to add monitored channel:", error);
      throw error;
    }
  }

  private async removeMonitoredChannelPersistent(
    guildId: string,
    channelId: string
  ): Promise<boolean> {
    try {
      // Remove from database
      const removed = await this.databaseManager.removeMonitoredChannel(
        guildId,
        channelId
      );

      if (removed) {
        // Remove from memory
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
}
