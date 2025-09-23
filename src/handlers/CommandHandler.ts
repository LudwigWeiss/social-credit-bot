import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType,
  Interaction,
} from "discord.js";
import { SocialCreditManager } from "../managers/SocialCreditManager.js";
import { DatabaseManager } from "../managers/DatabaseManager.js";
import { EffectManager } from "../managers/EffectManager.js";
import { MemeResponses } from "../utils/MemeResponses.js";
import { RateLimitManager } from "../managers/RateLimitManager.js";
import { MessageContextManager } from "../managers/MessageContextManager.js";
import { Logger } from "../utils/Logger.js";
import { CONFIG } from "../config.js";

export class CommandHandler {
  private monitoredChannels: Map<string, Set<string>> = new Map(); // guildId -> Set of channelIds

  constructor(
    private socialCreditManager: SocialCreditManager,
    private databaseManager: DatabaseManager,
    private effectManager: EffectManager,
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
        case "redeem-myself":
          await this.handleRedeemMyselfCommand(interaction);
          break;
        case "enforce-harmony":
          await this.handleEnforceHarmonyCommand(interaction);
          break;
        case "claim-daily":
          await this.handleClaimDailyCommand(interaction);
          break;
        case "spread-propaganda":
          await this.handleSpreadPropagandaCommand(interaction);
          break;
        case "praise-bot":
          await this.handlePraiseBotCommand(interaction);
          break;
        case "report-mistake":
          await this.handleReportMistakeCommand(interaction);
          break;
        case "work-for-the-party":
          await this.handleWorkForThePartyCommand(interaction);
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
        const timeLeft = Math.ceil((effect.expiresAt.getTime() - Date.now()) / (60 * 1000));
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
    const lastClaim = activeEffects.find(e => e.effectType === "DAILY_CLAIM_RESET" && e.metadata?.type === "daily_claim");
    if (lastClaim) {
      const timeLeft = Math.ceil((lastClaim.expiresAt.getTime() - Date.now()) / (60 * 60 * 1000));
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
    let embedColor = 0xffd700;
    let embedTitle = "🏆 ТАБЛИЦА СОЦИАЛЬНОГО РЕЙТИНГА 🏆";

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
        ephemeral: true,
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

  private async handlePraiseBotCommand(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const userId = interaction.user.id;
    const guildId = interaction.guildId || "dm";

    // Check cooldown
    const lastPraise = this.effectManager.getEffectsByType(userId, "DAILY_CLAIM_RESET").find(
      e => e.metadata?.type === "praise_cooldown"
    );
    if (lastPraise) {
      const timeLeft = lastPraise.expiresAt.getTime() - Date.now();
      if (timeLeft > 0) {
        const minutesLeft = Math.ceil(timeLeft / (60 * 1000));
        await interaction.reply({
          content: `⏰ Подождите ещё ${minutesLeft} минут перед следующей похвалой бота!`,
          ephemeral: true,
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
        { name: "💰 Бонус", value: `+${CONFIG.SCORE_CHANGES.PRAISE_BOT_BONUS}`, inline: true },
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
    const lastReport = this.effectManager.getEffectsByType(userId, "DAILY_CLAIM_RESET").find(
      e => e.metadata?.type === "report_cooldown"
    );
    if (lastReport) {
      const timeLeft = lastReport.expiresAt.getTime() - Date.now();
      if (timeLeft > 0) {
        const minutesLeft = Math.ceil(timeLeft / (60 * 1000));
        await interaction.reply({
          content: `⏰ Подождите ещё ${minutesLeft} минут перед следующим отчётом об ошибке!`,
          ephemeral: true,
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
        { name: "⚠️ Штраф", value: `${CONFIG.SCORE_CHANGES.REPORT_MISTAKE_PENALTY}`, inline: true },
        { name: "💯 Новый Рейтинг", value: `${newScore}`, inline: true }
      )
      .setFooter({ text: "Партия рассмотрит ваш отчёт! 📋" })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });

    // Log the report for manual review
    Logger.info(`Mistake reported by user ${userId} in guild ${guildId}`);
  }

  private async handleWorkForThePartyCommand(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const userId = interaction.user.id;
    const guildId = interaction.guildId || "dm";

    // Check cooldown
    const lastWork = this.effectManager.getEffectsByType(userId, "DAILY_CLAIM_RESET").find(
      e => e.metadata?.type === "work_cooldown"
    );
    if (lastWork) {
      const timeLeft = lastWork.expiresAt.getTime() - Date.now();
      if (timeLeft > 0) {
        const minutesLeft = Math.ceil(timeLeft / (60 * 1000));
        await interaction.reply({
          content: `⏰ Подождите ещё ${minutesLeft} минут перед следующей работой для Партии!`,
          ephemeral: true,
        });
        return;
      }
    }

    // Select random task
    const task = CONFIG.WORK_TASKS[Math.floor(Math.random() * CONFIG.WORK_TASKS.length)];

    const embed = new EmbedBuilder()
      .setColor(0xffa500)
      .setTitle("⚒️ РАБОТА ДЛЯ ПАРТИИ")
      .setDescription(
        `**Гражданин ${interaction.user.username}!**\n\n` +
        `Партия нуждается в вашей помощи! Выполните задание:\n\n` +
        `**${task.question}**\n\n` +
        `⏱️ У вас есть 60 секунд!`
      )
      .setFooter({ text: "Партия ценит вашу преданность! 👁️" })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });

    // Set cooldown
    await this.effectManager.applyEffect(
      userId,
      guildId,
      "DAILY_CLAIM_RESET",
      CONFIG.COOLDOWNS.WORK_FOR_PARTY,
      undefined,
      { type: "work_cooldown" }
    );

    // Wait for response
    const filter = (m: any) => m.author.id === userId && m.content.trim() === task.answer;

    try {
      const channel = interaction.channel;
      if (!channel || !channel.isTextBased()) {
        throw new Error("Invalid channel");
      }

      const collector = (channel as any).createMessageCollector({
        filter,
        max: 1,
        time: 60000
      });

      const collected: any[] = await new Promise((resolve) => {
        collector.on('collect', (message: any) => {
          resolve([message]);
        });
        collector.on('end', (collected: any, reason: string) => {
          if (reason === 'time') {
            resolve([]);
          }
        });
      });

      if (collected && collected.length > 0) {
        // Success
        const newScore = await this.socialCreditManager.updateScore(
          userId,
          guildId,
          CONFIG.SCORE_CHANGES.WORK_FOR_PARTY_SUCCESS,
          "Успешное выполнение работы для Партии",
          interaction.user.username
        );

        const successEmbed = new EmbedBuilder()
          .setColor(0x00ff00)
          .setTitle("✅ РАБОТА ВЫПОЛНЕНА!")
          .setDescription(
            `**Отличная работа, гражданин ${interaction.user.username}!**\n\n` +
            `Партия благодарна за вашу преданность.`
          )
          .addFields(
            { name: "💰 Награда", value: `+${CONFIG.SCORE_CHANGES.WORK_FOR_PARTY_SUCCESS}`, inline: true },
            { name: "💯 Новый Рейтинг", value: `${newScore}`, inline: true }
          )
          .setFooter({ text: "Продолжайте служить Партии! 🇨🇳" })
          .setTimestamp();

        await interaction.followUp({ embeds: [successEmbed] });
      } else {
        // No reward for failure, just inform
        const failureEmbed = new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle("❌ ЗАДАНИЕ НЕ ВЫПОЛНЕНО")
          .setDescription(
            `**Гражданин ${interaction.user.username}!**\n\n` +
            `Вы не смогли выполнить задание Партии в срок. Попробуйте ещё раз позже.`
          )
          .setFooter({ text: "Партия ждёт лучших результатов! ⚠️" })
          .setTimestamp();

        await interaction.followUp({ embeds: [failureEmbed] });
      }
    } catch (error) {
      Logger.error(`Error in work-for-the-party: ${error}`);
    }
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

  private async handleRedeemMyselfCommand(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const userId = interaction.user.id;
    const guildId = interaction.guildId || "dm";

    // Check if user qualifies for redemption (score <= -200)
    const score = await this.socialCreditManager.getUserScore(userId, guildId);
    if (score > CONFIG.SCORE_THRESHOLDS.PENALTIES.MODERATE) {
      await interaction.reply({
        content: "❌ Вы не нуждаетесь в искуплении, гражданин! Ваш социальный рейтинг в порядке.",
        ephemeral: true,
      });
      return;
    }

    // Check cooldown
    const lastRedeem = this.effectManager.getEffectsByType(userId, "DAILY_CLAIM_RESET").find(
      e => e.metadata?.type === "redeem_cooldown"
    );
    if (lastRedeem) {
      const timeLeft = lastRedeem.expiresAt.getTime() - Date.now();
      if (timeLeft > 0) {
        const minutesLeft = Math.ceil(timeLeft / (60 * 1000));
        await interaction.reply({
          content: `⏰ Подождите ещё ${minutesLeft} минут перед следующим искуплением, гражданин!`,
          ephemeral: true,
        });
        return;
      }
    }

    // Select random phrase
    const phrase = CONFIG.ANALYSIS.REDEEM_PHRASES[
      Math.floor(Math.random() * CONFIG.ANALYSIS.REDEEM_PHRASES.length)
    ];

    // Send the challenge
    const embed = new EmbedBuilder()
      .setColor(0xffa500)
      .setTitle("🙏 ЭДИКТ ПРОЩЕНИЯ")
      .setDescription(
        `**Гражданин ${interaction.user.username}!**\n\n` +
        `Партия даёт вам шанс на искупление! Повторите эту фразу в чате в течение 60 секунд:\n\n` +
        `**"${phrase}"**\n\n` +
        `⏱️ У вас есть 60 секунд!`
      )
      .setFooter({ text: "Партия милосердна, но справедлива! 👁️" })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });

    // Set up cooldown
    await this.effectManager.applyEffect(
      userId,
      guildId,
      "DAILY_CLAIM_RESET",
      CONFIG.COOLDOWNS.REDEEM_MYSELF,
      undefined,
      { type: "redeem_cooldown" }
    );

    // Wait for response
    const filter = (m: any) => m.author.id === userId && m.content.trim() === phrase;

    try {
      const channel = interaction.channel;
      if (!channel || !channel.isTextBased()) {
        throw new Error("Invalid channel");
      }

      const collector = (channel as any).createMessageCollector({
        filter,
        max: 1,
        time: 60000
      });

      const collected: any[] = await new Promise((resolve) => {
        collector.on('collect', (message: any) => {
          resolve([message]);
        });
        collector.on('end', (collected: any, reason: string) => {
          if (reason === 'time') {
            resolve([]);
          }
        });
      });

      if (collected && collected.length > 0) {
        // Success - grant forgiveness
        const newScore = await this.socialCreditManager.updateScore(
          userId,
          guildId,
          CONFIG.SCORE_CHANGES.REDEEM_SUCCESS,
          "Искупление через Эдикт Прощения",
          interaction.user.username
        );

        const successEmbed = new EmbedBuilder()
          .setColor(0x00ff00)
          .setTitle("🎉 ПРОЩЕНИЕ ПОЛУЧЕНО!")
          .setDescription(
            `**Поздравляем, гражданин ${interaction.user.username}!**\n\n` +
            `Партия принимает ваше искупление! Ваш социальный рейтинг повышен.`
          )
          .addFields(
            { name: "📈 Изменение Рейтинга", value: `+${CONFIG.SCORE_CHANGES.REDEEM_SUCCESS}`, inline: true },
            { name: "💯 Новый Рейтинг", value: `${newScore}`, inline: true }
          )
          .setFooter({ text: "Партия всегда даёт второй шанс! 🇨🇳" })
          .setTimestamp();

        await interaction.followUp({ embeds: [successEmbed] });
      }
    } catch {
      // Failure - penalize
      const newScore = await this.socialCreditManager.updateScore(
        userId,
        guildId,
        CONFIG.SCORE_CHANGES.REDEEM_FAILURE,
        "Провал Эдикта Прощения - недостаточное рвение",
        interaction.user.username
      );

      const failureEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle("❌ ПРОЩЕНИЕ ОТКАЗАНО")
        .setDescription(
          `**Гражданин ${interaction.user.username}!**\n\n` +
          `Вы не смогли должным образом выразить преданность Партии. Ваш социальный рейтинг понижен.`
        )
        .addFields(
          { name: "📉 Изменение Рейтинга", value: `${CONFIG.SCORE_CHANGES.REDEEM_FAILURE}`, inline: true },
          { name: "💯 Новый Рейтинг", value: `${newScore}`, inline: true }
        )
        .setFooter({ text: "Партия разочарована вашим поведением! ⚠️" })
        .setTimestamp();

      await interaction.followUp({ embeds: [failureEmbed] });
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

  private getEffectDisplayName(effectType: string): string {
    const effectNames: Record<string, string> = {
      NICKNAME_CHANGE: "Изменение Никнейма",
      TIMEOUT: "Тайм-аут",
      ROLE_GRANT: "Предоставление Роли",
      DAILY_CLAIM_RESET: "Кулдаун Ежедневного Бонуса",
      EVENT_MULTIPLIER: "Множитель События",
    };
    return effectNames[effectType] || effectType;
  }
}
