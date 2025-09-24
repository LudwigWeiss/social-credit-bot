import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  ActionRowBuilder,
  ComponentType,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  StringSelectMenuInteraction,
} from "discord.js";
import { BaseCommandHandler } from "./BaseCommandHandler.js";
import { CONFIG } from "../config.js";
import { Logger } from "../utils/Logger.js";

interface PartyFavorOption {
  id: string;
  name: string;
  description: string;
  duration: number; // in milliseconds
  effect: string;
}

export class PrivilegeCommands extends BaseCommandHandler {
  private readonly partyFavorOptions: PartyFavorOption[] = [
    {
      id: "GLORIOUS_PRODUCTION",
      name: "🏭 Славное Производство",
      description: "Все положительные изменения рейтинга увеличены на 10%",
      duration: 15 * 60 * 1000, // 15 minutes
      effect: "positive_boost",
    },
    {
      id: "HARMONY_FESTIVAL",
      name: "🕊️ Фестиваль Гармонии",
      description: "Никто не может потерять социальный рейтинг",
      duration: 15 * 60 * 1000, // 15 minutes
      effect: "no_negative",
    },
    {
      id: "LOYALTY_TEST",
      name: "📊 Проверка Лояльности",
      description: "Все изменения социального рейтинга удваиваются",
      duration: 15 * 60 * 1000, // 15 minutes
      effect: "double_changes",
    },
  ];

  async handleInteraction(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    try {
      switch (interaction.commandName) {
        // Basic privilege commands
        case "enforce-harmony":
          await this.handleEnforceHarmonyCommand(interaction);
          break;
        case "claim-daily":
          await this.handleClaimDailyCommand(interaction);
          break;
        case "spread-propaganda":
          await this.handleSpreadPropagandaCommand(interaction);
          break;
        // Enhanced privilege commands
        case "propaganda-broadcast":
          await this.handlePropagandaBroadcastCommand(interaction);
          break;
        case "party-favor":
          await this.handlePartyFavorCommand(interaction);
          break;
        case "investigate":
          await this.handleInvestigateCommand(interaction);
          break;
        default:
          throw new Error(
            `Unknown privilege command: ${interaction.commandName}`
          );
      }
    } catch (error) {
      Logger.error(
        `Error in privilege command ${interaction.commandName}:`,
        error
      );

      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content:
            "🚨 Произошла ошибка при выполнении команды. Пожалуйста, попробуйте позже.",
          flags: MessageFlags.Ephemeral,
        });
      }
    }
  }

  // Basic Privilege Commands

  private async handleEnforceHarmonyCommand(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const enforcerId = interaction.user.id;
    const guildId = interaction.guildId || "dm";
    const targetUser = interaction.options.getUser("target", true);
    const reason = interaction.options.getString("reason", true);

    // Check if enforcer has high enough score
    const enforcerScore = await this.socialCreditManager.getUserScore(
      enforcerId,
      guildId
    );
    if (enforcerScore < CONFIG.SCORE_THRESHOLDS.PRIVILEGES.SUPREME_CITIZEN) {
      await interaction.reply({
        content: `❌ Недостаточный социальный рейтинг! Требуется ${CONFIG.SCORE_THRESHOLDS.PRIVILEGES.SUPREME_CITIZEN}+ для исполнения Мандата Гражданина.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Can't enforce on yourself
    if (targetUser.id === enforcerId) {
      await interaction.reply({
        content: "🤔 Вы не можете навязывать гармонию самому себе, гражданин!",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Can't enforce on bots
    if (targetUser.bot) {
      await interaction.reply({
        content: "🤖 Боты уже идеально гармоничны!",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Check cooldown
    const cooldownCheck = this.effectManager.isOnCooldown(
      enforcerId,
      "DAILY_CLAIM_RESET"
    );
    if (cooldownCheck.onCooldown && cooldownCheck.timeLeft) {
      const hoursLeft = Math.ceil(cooldownCheck.timeLeft / (60 * 60 * 1000));
      await interaction.reply({
        content: `⏰ Подождите ещё ${hoursLeft} часов перед следующим исполнением Мандата Гражданина!`,
        flags: MessageFlags.Ephemeral,
      });
      return;
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
      CONFIG.COOLDOWNS.ENFORCE_HARMONY
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

    // Check cooldown
    const cooldownCheck = this.effectManager.isOnCooldown(
      userId,
      "DAILY_CLAIM_RESET"
    );
    if (cooldownCheck.onCooldown && cooldownCheck.timeLeft) {
      const hoursLeft = Math.ceil(cooldownCheck.timeLeft / (60 * 60 * 1000));
      await interaction.reply({
        content: `⏰ Вы уже получили ежедневный бонус сегодня! Следующий бонус через ${hoursLeft} часов.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Get user's rank to determine bonus amount
    const userScore = await this.socialCreditManager.getUserScore(
      userId,
      guildId
    );
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
        content:
          "❌ Недостаточный социальный рейтинг для получения ежедневного бонуса! Повысьте свой рейтинг.",
        flags: MessageFlags.Ephemeral,
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
      CONFIG.EFFECT_DURATIONS.DAILY_CLAIM_RESET
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
    const userScore = await this.socialCreditManager.getUserScore(
      userId,
      guildId
    );
    if (userScore < CONFIG.SCORE_THRESHOLDS.PRIVILEGES.MODEL_CITIZEN) {
      await interaction.reply({
        content: `❌ Недостаточный социальный рейтинг! Требуется ${CONFIG.SCORE_THRESHOLDS.PRIVILEGES.MODEL_CITIZEN}+ для распространения пропаганды.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Check cooldown
    const cooldownCheck = this.effectManager.isOnCooldown(
      userId,
      "DAILY_CLAIM_RESET"
    );
    if (cooldownCheck.onCooldown && cooldownCheck.timeLeft) {
      const hoursLeft = Math.ceil(cooldownCheck.timeLeft / (60 * 60 * 1000));
      await interaction.reply({
        content: `⏰ Подождите ещё ${hoursLeft} часов перед следующим распространением пропаганды!`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Select random propaganda image
    const imageUrl =
      CONFIG.PROPAGANDA_IMAGES[
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
      CONFIG.COOLDOWNS.SPREAD_PROPAGANDA
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
        {
          name: "💰 Бонус",
          value: `+${CONFIG.SCORE_CHANGES.SPREAD_PROPAGANDA_BONUS}`,
          inline: true,
        },
        { name: "💯 Новый Рейтинг", value: `${newScore}`, inline: true }
      )
      .setFooter({ text: "Продолжайте служить Партии! 👁️" })
      .setTimestamp();

    await interaction.followUp({
      embeds: [confirmEmbed],
      flags: MessageFlags.Ephemeral,
    });
  }

  // Enhanced Privilege Commands

  private async handlePropagandaBroadcastCommand(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const userId = interaction.user.id;
    const guildId = interaction.guildId || "dm";
    const message = interaction.options.getString("message", true);

    // Check if user qualifies (score > 1000)
    const score = await this.socialCreditManager.getUserScore(userId, guildId);
    if (score <= CONFIG.SCORE_THRESHOLDS.PRIVILEGES.MODEL_CITIZEN) {
      await interaction.reply({
        content:
          "❌ Недостаточно высокий социальный рейтинг для трансляции пропаганды! Требуется статус Образцового Гражданина (1000+ рейтинга).",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Check cooldown
    const cooldownCheck = this.effectManager.isOnCooldown(
      userId,
      "PROPAGANDA_BROADCAST_COOLDOWN"
    );
    if (cooldownCheck.onCooldown && cooldownCheck.timeLeft) {
      const hoursLeft = Math.ceil(cooldownCheck.timeLeft / (60 * 60 * 1000));
      await interaction.reply({
        content: `⏰ Подождите ещё ${hoursLeft} часов перед следующей трансляцией пропаганды!`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Defer reply since moderation might take time
    await interaction.deferReply();

    try {
      // Moderate and enhance the message
      const enhancedMessage = await this.moderateAndEnhancePropaganda(message);

      // Create broadcast embed
      const embed = new EmbedBuilder()
        .setColor(0xdc143c)
        .setTitle("📢 ОФИЦИАЛЬНАЯ ТРАНСЛЯЦИЯ ПАРТИИ 📢")
        .setDescription(
          `**Внимание всем гражданам!**\n\n` +
            `Гражданин **${interaction.user.username}** передает важное сообщение от имени Партии:\n\n` +
            `*${enhancedMessage}*`
        )
        .setFooter({
          text: `Трансляция одобрена Министерством Пропаганды | ${new Date().toLocaleDateString("ru-RU")}`,
        })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

      // Apply score bonus
      const newScore = await this.socialCreditManager.updateScore(
        userId,
        guildId,
        CONFIG.SCORE_CHANGES.PROPAGANDA_BROADCAST_BONUS || 50,
        "Успешная трансляция пропаганды Партии",
        interaction.user.username
      );

      // Set cooldown
      await this.effectManager.applyEffect(
        userId,
        guildId,
        "PROPAGANDA_BROADCAST_COOLDOWN",
        CONFIG.COOLDOWNS.PROPAGANDA_BROADCAST
      );

      // Send confirmation to user
      const confirmEmbed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle("✅ ТРАНСЛЯЦИЯ УСПЕШНА!")
        .setDescription(
          `Ваше сообщение было одобрено и транслировано всем гражданам.\n\n` +
            `**Награда:** +${CONFIG.SCORE_CHANGES.PROPAGANDA_BROADCAST_BONUS || 50}\n` +
            `**Новый рейтинг:** ${newScore}`
        )
        .setFooter({ text: "Партия гордится вашей преданностью! 🇨🇳" });

      await interaction.followUp({
        embeds: [confirmEmbed],
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      Logger.error(`Error in propaganda broadcast: ${error}`);
      await interaction.editReply({
        content:
          "❌ Произошла ошибка при обработке вашего сообщения. Возможно, оно содержит неподходящий контент.",
      });
    }
  }

  private async handlePartyFavorCommand(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const userId = interaction.user.id;
    const guildId = interaction.guildId || "dm";

    // Check if user qualifies (Supreme Citizen)
    const score = await this.socialCreditManager.getUserScore(userId, guildId);
    if (score < CONFIG.SCORE_THRESHOLDS.PRIVILEGES.SUPREME_CITIZEN) {
      await interaction.reply({
        content: `❌ Недостаточно высокий социальный рейтинг! Требуется статус Высшего Гражданина (${CONFIG.SCORE_THRESHOLDS.PRIVILEGES.SUPREME_CITIZEN}+ рейтинга) для активации Партийных Привилегий.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Check cooldown
    const cooldownCheck = this.effectManager.isOnCooldown(
      userId,
      "PARTY_FAVOR_COOLDOWN"
    );
    if (cooldownCheck.onCooldown && cooldownCheck.timeLeft) {
      const hoursLeft = Math.ceil(cooldownCheck.timeLeft / (60 * 60 * 1000));
      await interaction.reply({
        content: `⏰ Подождите ещё ${hoursLeft} часов перед следующим использованием Партийных Привилегий!`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Create selection menu
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId("party_favor_select")
      .setPlaceholder("Выберите Партийную Привилегию...")
      .addOptions(
        this.partyFavorOptions.map((option) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(option.name)
            .setDescription(option.description)
            .setValue(option.id)
        )
      );

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      selectMenu
    );

    const embed = new EmbedBuilder()
      .setColor(0xffd700)
      .setTitle("🏛️ ПАРТИЙНЫЕ ПРИВИЛЕГИИ")
      .setDescription(
        `**Высший Гражданин ${interaction.user.username}!**\n\n` +
          `Партия предоставляет вам возможность активировать одну из следующих привилегий для всего сервера:\n\n` +
          `⏱️ **Длительность:** 15 минут\n` +
          `🌐 **Эффект:** Распространяется на всех граждан сервера`
      )
      .setFooter({ text: "Выберите привилегию из меню ниже 👇" })
      .setTimestamp();

    const response = await interaction.reply({
      embeds: [embed],
      components: [row],
      flags: MessageFlags.Ephemeral,
    });

    try {
      const confirmation = await response.awaitMessageComponent({
        componentType: ComponentType.StringSelect,
        time: 60000,
        filter: (i) => i.user.id === userId,
      });

      const selectedOption = this.partyFavorOptions.find(
        (option) => option.id === confirmation.values[0]
      );

      if (!selectedOption) {
        await confirmation.update({
          content: "❌ Неверный выбор привилегии.",
          components: [],
          embeds: [],
        });
        return;
      }

      await this.applyPartyFavor(confirmation, selectedOption, guildId);
    } catch (error) {
      Logger.error(`Error in party favor selection: ${error}`);
      await interaction.editReply({
        content: "⏰ Время выбора истекло. Попробуйте команду снова.",
        components: [],
        embeds: [],
      });
    }
  }

  private async handleInvestigateCommand(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const investigatorId = interaction.user.id;
    const guildId = interaction.guildId || "dm";
    const targetUser = interaction.options.getUser("target", true);

    // Check if investigator qualifies (Model Citizen)
    const investigatorScore = await this.socialCreditManager.getUserScore(
      investigatorId,
      guildId
    );
    if (investigatorScore < CONFIG.SCORE_THRESHOLDS.PRIVILEGES.MODEL_CITIZEN) {
      await interaction.reply({
        content: `❌ Недостаточно высокий социальный рейтинг для проведения расследований! Требуется статус Образцового Гражданина (${CONFIG.SCORE_THRESHOLDS.PRIVILEGES.MODEL_CITIZEN}+ рейтинга).`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Can't investigate yourself
    if (targetUser.id === investigatorId) {
      await interaction.reply({
        content: "🤔 Вы не можете расследовать самого себя, гражданин!",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Can't investigate bots
    if (targetUser.bot) {
      await interaction.reply({
        content:
          "🤖 Боты не нуждаются в расследовании - они всегда лояльны Партии!",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Check cooldown
    const cooldownCheck = this.effectManager.isOnCooldown(
      investigatorId,
      "INVESTIGATION_COOLDOWN"
    );
    if (cooldownCheck.onCooldown && cooldownCheck.timeLeft) {
      const hoursLeft = Math.ceil(cooldownCheck.timeLeft / (60 * 60 * 1000));
      await interaction.reply({
        content: `⏰ Подождите ещё ${hoursLeft} часов перед следующим расследованием!`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      // Get target's info
      const targetScore = await this.socialCreditManager.getUserScore(
        targetUser.id,
        guildId
      );
      const targetRank = this.socialCreditManager.getScoreRank(targetScore);
      const targetStatus = this.getUserStatusByScore(targetScore);

      // Get recent history (fallback implementation)
      const recentHistory: Array<{ reason: string; change: number }> = [];

      // Get active effects
      const activeEffects = this.effectManager.getActiveEffects(targetUser.id);

      // Create investigation report
      const embed = new EmbedBuilder()
        .setColor(targetScore >= 0 ? 0x00ff00 : 0xff0000)
        .setTitle("🔍 ДОСЬЕ ГРАЖДАНИНА")
        .setDescription(
          `**Объект:** ${targetUser.username}\n` +
            `**Следователь:** ${interaction.user.username}\n` +
            `**Статус расследования:** ЗАВЕРШЕНО`
        )
        .addFields(
          {
            name: "📊 Социальный Рейтинг",
            value: `**${targetScore}** (${targetRank.rank})`,
            inline: true,
          },
          {
            name: "🏷️ Статус Гражданина",
            value: targetStatus,
            inline: true,
          },
          {
            name: "⚡ Активные Эффекты",
            value:
              activeEffects.length > 0
                ? activeEffects.map((e) => `• ${e.effectType}`).join("\n")
                : "Нет активных эффектов",
            inline: false,
          }
        )
        .setFooter({
          text: `Досье подготовлено Министерством Государственной Безопасности`,
        })
        .setTimestamp();

      if (recentHistory && recentHistory.length > 0) {
        const historyText = recentHistory
          .map(
            (h: { reason: string; change: number }) =>
              `• ${h.reason} (${h.change > 0 ? "+" : ""}${h.change})`
          )
          .join("\n");

        embed.addFields({
          name: "📝 Недавняя Активность",
          value: historyText || "Нет недавней активности",
          inline: false,
        });
      }

      await interaction.editReply({ embeds: [embed] });

      // Apply investigation cost
      await this.socialCreditManager.updateScore(
        investigatorId,
        guildId,
        CONFIG.SCORE_CHANGES.INVESTIGATION_COST,
        `Расследование гражданина ${targetUser.username}`,
        interaction.user.username
      );

      // Set cooldown
      await this.effectManager.applyEffect(
        investigatorId,
        guildId,
        "INVESTIGATION_COOLDOWN",
        CONFIG.COOLDOWNS.INVESTIGATION
      );
    } catch (error) {
      Logger.error(`Error in investigation: ${error}`);
      await interaction.editReply({
        content:
          "❌ Произошла ошибка при проведении расследования. Попробуйте позже.",
      });
    }
  }

  // Helper methods

  private async moderateAndEnhancePropaganda(message: string): Promise<string> {
    try {
      const prompt = `
        Ты - редактор пропагандистского отдела Коммунистической партии Китая.
        Твоя задача - улучшить и модерировать сообщение для официальной трансляции.

        Правила:
        1. Убрать любую неподходящую лексику или оскорбления
        2. Добавить подходящие коммунистические и партийные фразы
        3. Сделать сообщение более торжественным и официальным
        4. Максимум 200 слов
        5. Ответить ТОЛЬКО итоговым текстом, без пояснений

        Исходное сообщение: "${message}"
      `;

      const completion = await this.openai.chat.completions.create({
        model: CONFIG.LLM.STANDARD_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 300,
      });

      const enhancedMessage = completion.choices?.[0]?.message?.content;
      return enhancedMessage || message;
    } catch (error) {
      Logger.error(`Error enhancing propaganda: ${error}`);
      return message; // Fallback to original message
    }
  }

  private async applyPartyFavor(
    interaction: ChatInputCommandInteraction | StringSelectMenuInteraction,
    option: PartyFavorOption,
    guildId: string
  ): Promise<void> {
    try {
      // Apply the server-wide effect
      await this.effectManager.applyEffect(
        "SERVER",
        guildId,
        "EVENT_MULTIPLIER",
        option.duration,
        undefined,
        {
          type: "party_favor",
          activatedBy: interaction.user.id,
          activatedByName: interaction.user.username,
          favorType: option.effect,
        }
      );

      // Deduct score cost
      const cost = CONFIG.SCORE_CHANGES.PARTY_FAVOR_COST;
      const newScore = await this.socialCreditManager.updateScore(
        interaction.user.id,
        guildId,
        -cost,
        `Активация Партийной Привилегии: ${option.name}`,
        interaction.user.username
      );

      // Set cooldown
      await this.effectManager.applyEffect(
        interaction.user.id,
        guildId,
        "PARTY_FAVOR_COOLDOWN",
        CONFIG.COOLDOWNS.PARTY_FAVOR
      );

      // Update the interaction with success message
      const successEmbed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle("✅ ПАРТИЙНАЯ ПРИВИЛЕГИЯ АКТИВИРОВАНА!")
        .setDescription(
          `**${option.name}** активирована!\n\n` +
            `**Эффект:** ${option.description}\n` +
            `**Длительность:** 15 минут\n` +
            `**Стоимость:** ${cost} рейтинга\n` +
            `**Новый рейтинг:** ${newScore}`
        )
        .setFooter({ text: "Партия благодарит за ваше служение! 🏛️" })
        .setTimestamp();

      if ("update" in interaction) {
        await interaction.update({
          embeds: [successEmbed],
          components: [],
        });
      } else {
        await interaction.editReply({
          embeds: [successEmbed],
          components: [],
        });
      }

      // Announce to the server (if in a guild)
      if (interaction.guild && interaction.channel) {
        const announceEmbed = new EmbedBuilder()
          .setColor(0xffd700)
          .setTitle("🏛️ ПАРТИЙНАЯ ПРИВИЛЕГИЯ АКТИВИРОВАНА!")
          .setDescription(
            `**Высший Гражданин ${interaction.user.username}** активировал привилегию для всего сервера:\n\n` +
              `**${option.name}**\n` +
              `*${option.description}*\n\n` +
              `⏱️ **Длительность:** 15 минут`
          )
          .setFooter({ text: "Все граждане получают преимущества! 🇨🇳" })
          .setTimestamp();

        if (
          interaction.guild &&
          interaction.channel &&
          !interaction.ephemeral
        ) {
          await interaction.followUp({ embeds: [announceEmbed] });
        }
      }
    } catch (error) {
      Logger.error(`Error applying party favor: ${error}`);
      if ("update" in interaction) {
        await interaction.update({
          content: "❌ Произошла ошибка при активации привилегии.",
          components: [],
          embeds: [],
        });
      } else {
        await interaction.editReply({
          content: "❌ Произошла ошибка при активации привилегии.",
          components: [],
          embeds: [],
        });
      }
    }
  }

  private getUserStatusByScore(score: number): string {
    if (score >= CONFIG.SCORE_THRESHOLDS.PRIVILEGES.SUPREME_CITIZEN) {
      return "🏛️ Высший Гражданин";
    } else if (score >= CONFIG.SCORE_THRESHOLDS.PRIVILEGES.MODEL_CITIZEN) {
      return "🏅 Образцовый Гражданин";
    } else if (score >= CONFIG.SCORE_THRESHOLDS.PRIVILEGES.GOOD_CITIZEN) {
      return "✅ Добропорядочный Гражданин";
    } else if (score >= CONFIG.SCORE_THRESHOLDS.PENALTIES.MILD) {
      return "⚠️ Обычный Гражданин";
    } else if (score >= CONFIG.SCORE_THRESHOLDS.PENALTIES.MODERATE) {
      return "❌ Сомнительный Элемент";
    } else if (score >= CONFIG.SCORE_THRESHOLDS.PENALTIES.SEVERE) {
      return "🚫 Враг Народа";
    } else {
      return "💀 Предатель Родины";
    }
  }
}
