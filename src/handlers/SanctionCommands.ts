import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  Message,
  TextChannel,
  ReadonlyCollection,
  MessageFlags,
  ActionRowBuilder,
  ComponentType,
  ButtonBuilder,
  ButtonStyle,
  ButtonInteraction,
} from "discord.js";
import { BaseCommandHandler } from "./BaseCommandHandler.js";
import { CONFIG } from "../config.js";
import { Logger } from "../utils/Logger.js";

interface QuizQuestion {
  question: string;
  correctAnswer: string;
  options: string[];
}

interface Quiz {
  questions: QuizQuestion[];
  userAnswers: string[];
  correctCount: number;
}

export class SanctionCommands extends BaseCommandHandler {
  private isRateLimitError(error: unknown): boolean {
    if (error instanceof Error && error.message.includes("Status 429")) {
      return true;
    }

    if (typeof error === "object" && error !== null) {
      const err = error as Record<string, unknown>;
      if (typeof err.status === "number" && err.status === 429) return true;
      if (typeof err.code === "number" && err.code === 429) return true;
      if (typeof err.response === "object" && err.response !== null) {
        const resp = err.response as Record<string, unknown>;
        if (typeof resp.status === "number" && resp.status === 429) return true;
      }
    }

    return false;
  }

  async handleInteraction(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    try {
      switch (interaction.commandName) {
        // Basic sanction commands
        case "redeem-myself":
          await this.handleRedeemMyselfCommand(interaction);
          break;
        case "work-for-the-party":
          await this.handleWorkForThePartyCommand(interaction);
          break;
        // Enhanced sanction commands
        case "public-confession":
          await this.handlePublicConfessionCommand(interaction);
          break;
        case "community-service":
          await this.handleCommunityServiceCommand(interaction);
          break;
        case "loyalty-quiz":
          await this.handleLoyaltyQuizCommand(interaction);
          break;
        default:
          throw new Error(
            `Unknown sanction command: ${interaction.commandName}`
          );
      }
    } catch (error) {
      Logger.error(
        `Error in sanction command ${interaction.commandName}:`,
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

  // Basic Sanction Commands

  private async handleRedeemMyselfCommand(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const userId = interaction.user.id;
    const guildId = interaction.guildId || "dm";

    // Check if user qualifies for redemption (score <= -200)
    const score = await this.socialCreditManager.getUserScore(userId, guildId);
    if (score > CONFIG.SCORE_THRESHOLDS.PENALTIES.MODERATE) {
      await interaction.reply({
        content:
          "❌ Вы не нуждаетесь в искуплении, гражданин! Ваш социальный рейтинг в порядке.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Check cooldown using metadata to distinguish different cooldown types
    const redeemEffects = this.effectManager
      .getEffectsByType(userId, "DAILY_CLAIM_RESET")
      .filter((e) => e.metadata?.type === "redeem_cooldown");

    if (redeemEffects.length > 0) {
      const lastRedeem = redeemEffects[0];
      const timeLeft = lastRedeem.expiresAt.getTime() - Date.now();
      if (timeLeft > 0) {
        const hoursLeft = Math.ceil(timeLeft / (60 * 60 * 1000));
        await interaction.reply({
          content: `⏰ Подождите ещё ${hoursLeft} часов перед следующим искуплением, гражданин!`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
    }

    // Select random phrase
    const phrase =
      CONFIG.ANALYSIS.REDEEM_PHRASES[
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
    const filter = (m: Message) =>
      m.author.id === userId && m.content.trim() === phrase;

    try {
      const channel = interaction.channel;
      if (!channel || !channel.isTextBased()) {
        throw new Error("Invalid channel");
      }

      const collector = (channel as TextChannel).createMessageCollector({
        filter,
        max: 1,
        time: 60000,
      });

      const collected: Message[] = await new Promise((resolve) => {
        collector.on("collect", (message: Message) => {
          resolve([message]);
        });
        collector.on(
          "end",
          (collected: ReadonlyCollection<string, Message>, reason: string) => {
            if (reason === "time") {
              resolve([]);
            }
          }
        );
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
            {
              name: "📈 Изменение Рейтинга",
              value: `+${CONFIG.SCORE_CHANGES.REDEEM_SUCCESS}`,
              inline: true,
            },
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
          {
            name: "📉 Изменение Рейтинга",
            value: `${CONFIG.SCORE_CHANGES.REDEEM_FAILURE}`,
            inline: true,
          },
          { name: "💯 Новый Рейтинг", value: `${newScore}`, inline: true }
        )
        .setFooter({ text: "Партия разочарована вашим поведением! ⚠️" })
        .setTimestamp();

      await interaction.followUp({ embeds: [failureEmbed] });
    }
  }

  private async handleWorkForThePartyCommand(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const userId = interaction.user.id;
    const guildId = interaction.guildId || "dm";

    // Check cooldown using metadata
    const workEffects = this.effectManager
      .getEffectsByType(userId, "DAILY_CLAIM_RESET")
      .filter((e) => e.metadata?.type === "work_cooldown");

    if (workEffects.length > 0) {
      const lastWork = workEffects[0];
      const timeLeft = lastWork.expiresAt.getTime() - Date.now();
      if (timeLeft > 0) {
        const minutesLeft = Math.ceil(timeLeft / (60 * 1000));
        await interaction.reply({
          content: `⏰ Подождите ещё ${minutesLeft} минут перед следующей работой для Партии!`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
    }

    // Defer the reply since task generation may take time
    await interaction.deferReply();

    // Generate task using LLM
    const task = await this.generateWorkTask();

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

    await interaction.editReply({ embeds: [embed] });

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
    const filter = (m: Message) =>
      m.author.id === userId && m.content.trim() === task.answer;

    try {
      const channel = interaction.channel;
      if (!channel || !channel.isTextBased()) {
        throw new Error("Invalid channel");
      }

      const collector = (channel as TextChannel).createMessageCollector({
        filter,
        max: 1,
        time: 60000,
      });

      const collected: Message[] = await new Promise((resolve) => {
        collector.on("collect", (message: Message) => {
          resolve([message]);
        });
        collector.on(
          "end",
          (collected: ReadonlyCollection<string, Message>, reason: string) => {
            if (reason === "time") {
              resolve([]);
            }
          }
        );
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
            {
              name: "💰 Награда",
              value: `+${CONFIG.SCORE_CHANGES.WORK_FOR_PARTY_SUCCESS}`,
              inline: true,
            },
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

  // Enhanced Sanction Commands

  private async handlePublicConfessionCommand(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const userId = interaction.user.id;
    const guildId = interaction.guildId || "dm";

    // Check if user qualifies (negative score)
    const score = await this.socialCreditManager.getUserScore(userId, guildId);
    if (score >= 0) {
      await interaction.reply({
        content:
          "❌ Вам не требуется публичное покаяние, гражданин! Ваш социальный рейтинг в норме.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Check cooldown
    const cooldownCheck = this.effectManager.isOnCooldown(
      userId,
      "CONFESSION_COOLDOWN"
    );
    if (cooldownCheck.onCooldown && cooldownCheck.timeLeft) {
      const hoursLeft = Math.ceil(cooldownCheck.timeLeft / (60 * 60 * 1000));
      await interaction.reply({
        content: `⏰ Подождите ещё ${hoursLeft} часов перед следующим публичным покаянием!`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply();

    try {
      // Generate personalized confession
      const confession = await this.generatePersonalizedConfession(
        interaction.user.username,
        score
      );

      // Create confession embed
      const embed = new EmbedBuilder()
        .setColor(0xff6b6b)
        .setTitle("🎭 ПУБЛИЧНОЕ ПОКАЯНИЕ")
        .setDescription(
          `**Гражданин ${interaction.user.username}** выступает с публичным покаянием:\n\n` +
            `*${confession}*`
        )
        .setFooter({
          text: "Признание ошибок - первый шаг к исправлению! 🇨🇳",
        })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

      // Apply score bonus
      const bonus = Math.abs(Math.floor(score * 0.3)); // 30% of negative score as positive bonus
      const newScore = await this.socialCreditManager.updateScore(
        userId,
        guildId,
        bonus,
        "Публичное покаяние перед народом",
        interaction.user.username
      );

      // Set cooldown
      await this.effectManager.applyEffect(
        userId,
        guildId,
        "CONFESSION_COOLDOWN",
        CONFIG.COOLDOWNS.PUBLIC_CONFESSION
      );

      // Send confirmation to user
      const confirmEmbed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle("✅ ПОКАЯНИЕ ПРИНЯТО!")
        .setDescription(
          `Партия принимает ваше искреннее раскаяние.\n\n` +
            `**Награда:** +${bonus} за честность\n` +
            `**Новый рейтинг:** ${newScore}`
        )
        .setFooter({ text: "Партия ценит искренность! 🤝" });

      await interaction.followUp({
        embeds: [confirmEmbed],
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      Logger.error(`Error in public confession: ${error}`);
      await interaction.editReply({
        content:
          "❌ Произошла ошибка при генерации покаяния. Попробуйте позже.",
      });
    }
  }

  private async handleCommunityServiceCommand(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const userId = interaction.user.id;
    const guildId = interaction.guildId || "dm";

    // Check cooldown
    const cooldownCheck = this.effectManager.isOnCooldown(
      userId,
      "COMMUNITY_SERVICE_COOLDOWN"
    );
    if (cooldownCheck.onCooldown && cooldownCheck.timeLeft) {
      const hoursLeft = Math.ceil(cooldownCheck.timeLeft / (60 * 60 * 1000));
      await interaction.reply({
        content: `⏰ Подождите ещё ${hoursLeft} часов перед следующим общественным служением!`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Create service options
    const serviceOptions = [
      {
        id: "clean_propaganda",
        name: "🧹 Очистка Пропагандистских Плакатов",
        description: "Очистите городские плакаты от пыли и грязи",
        reward: 15,
      },
      {
        id: "help_elderly",
        name: "👴 Помощь Пожилым Гражданам",
        description: "Помогите пожилым гражданам с покупками",
        reward: 20,
      },
      {
        id: "plant_trees",
        name: "🌳 Озеленение Города",
        description: "Посадите деревья для улучшения экологии",
        reward: 25,
      },
    ];

    const randomService =
      serviceOptions[Math.floor(Math.random() * serviceOptions.length)];

    // Create interactive buttons
    const acceptButton = new ButtonBuilder()
      .setCustomId("accept_service")
      .setLabel("Принять Служение")
      .setStyle(ButtonStyle.Success)
      .setEmoji("✅");

    const declineButton = new ButtonBuilder()
      .setCustomId("decline_service")
      .setLabel("Отказаться")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("❌");

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      acceptButton,
      declineButton
    );

    const embed = new EmbedBuilder()
      .setColor(0xffa500)
      .setTitle("🤝 ОБЩЕСТВЕННОЕ СЛУЖЕНИЕ")
      .setDescription(
        `**Гражданин ${interaction.user.username}!**\n\n` +
          `Партия предлагает вам возможность послужить обществу:\n\n` +
          `**${randomService.name}**\n` +
          `*${randomService.description}*\n\n` +
          `**Награда:** +${randomService.reward} социального рейтинга\n\n` +
          `Примете ли вы это почетное задание?`
      )
      .setFooter({ text: "Служение народу - высшая честь! 🏛️" })
      .setTimestamp();

    const response = await interaction.reply({
      embeds: [embed],
      components: [row],
    });

    try {
      const confirmation = await response.awaitMessageComponent({
        componentType: ComponentType.Button,
        time: 60000,
        filter: (i) => i.user.id === userId,
      });

      if (confirmation.customId === "accept_service") {
        // User accepted - simulate service task
        await confirmation.update({
          embeds: [
            new EmbedBuilder()
              .setColor(0x0099ff)
              .setTitle("⏳ ВЫПОЛНЕНИЕ СЛУЖЕНИЯ...")
              .setDescription(
                `Вы выполняете общественное служение...\n\n` +
                  `Пожалуйста, подождите несколько секунд.`
              )
              .setFooter({ text: "Партия наблюдает за вашим прогрессом! 👁️" }),
          ],
          components: [],
        });

        // Simulate work time (3-5 seconds)
        await new Promise((resolve) =>
          setTimeout(resolve, 3000 + Math.random() * 2000)
        );

        // Apply reward
        const newScore = await this.socialCreditManager.updateScore(
          userId,
          guildId,
          randomService.reward,
          `Общественное служение: ${randomService.name}`,
          interaction.user.username
        );

        // Set cooldown
        await this.effectManager.applyEffect(
          userId,
          guildId,
          "COMMUNITY_SERVICE_COOLDOWN",
          CONFIG.COOLDOWNS.COMMUNITY_SERVICE
        );

        const successEmbed = new EmbedBuilder()
          .setColor(0x00ff00)
          .setTitle("✅ СЛУЖЕНИЕ ЗАВЕРШЕНО!")
          .setDescription(
            `**Отличная работа, гражданин ${interaction.user.username}!**\n\n` +
              `Вы успешно выполнили общественное служение. Партия гордится вами!`
          )
          .addFields(
            {
              name: "🎯 Выполненное Задание",
              value: randomService.name,
              inline: false,
            },
            {
              name: "💰 Награда",
              value: `+${randomService.reward}`,
              inline: true,
            },
            { name: "💯 Новый Рейтинг", value: `${newScore}`, inline: true }
          )
          .setFooter({ text: "Продолжайте служить народу! 🇨🇳" })
          .setTimestamp();

        await confirmation.editReply({ embeds: [successEmbed] });
      } else {
        // User declined
        const declineEmbed = new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle("❌ СЛУЖЕНИЕ ОТКЛОНЕНО")
          .setDescription(
            `**Гражданин ${interaction.user.username}!**\n\n` +
              `Вы отказались от общественного служения. Партия отмечает это в вашем деле.`
          )
          .setFooter({ text: "Служение народу добровольно, но желательно! ⚠️" })
          .setTimestamp();

        await confirmation.update({
          embeds: [declineEmbed],
          components: [],
        });
      }
    } catch (error) {
      Logger.error(`Error in community service: ${error}`);
      await interaction.editReply({
        content: "⏰ Время выбора истекло. Возможность служения упущена.",
        components: [],
        embeds: [],
      });
    }
  }

  private async handleLoyaltyQuizCommand(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const userId = interaction.user.id;
    const guildId = interaction.guildId || "dm";

    // Check cooldown
    const cooldownCheck = this.effectManager.isOnCooldown(
      userId,
      "LOYALTY_QUIZ_COOLDOWN"
    );
    if (cooldownCheck.onCooldown && cooldownCheck.timeLeft) {
      const hoursLeft = Math.ceil(cooldownCheck.timeLeft / (60 * 60 * 1000));
      await interaction.reply({
        content: `⏰ Подождите ещё ${hoursLeft} часов перед следующим тестом на лояльность!`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      // Generate personalized quiz
      const quiz = await this.generateLoyaltyQuiz();
      await this.conductLoyaltyQuiz(interaction, quiz, guildId);
    } catch (error) {
      Logger.error(`Error in loyalty quiz: ${error}`);
      await interaction.editReply({
        content: "❌ Произошла ошибка при генерации теста. Попробуйте позже.",
      });
    }
  }

  // Helper methods

  private async generateWorkTask(): Promise<{
    question: string;
    answer: string;
  }> {
    const maxRetries = CONFIG.LLM.RETRY_ATTEMPTS;
    const baseDelay = CONFIG.LLM.RETRY_DELAY_MS;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const completion = await this.openai.chat.completions.create({
          model: CONFIG.LLM.STANDARD_MODEL,
          messages: [{ role: "user", content: CONFIG.WORK_TASK_PROMPT }],
          temperature: CONFIG.LLM.TEMPERATURE,
          max_tokens: CONFIG.LLM.MAX_TOKENS,
        });

        const response = completion.choices?.[0]?.message?.content;
        if (!response)
          throw new Error(
            "No response from OpenAI API for work task generation"
          );

        // Handle different response types
        const responseText =
          typeof response === "string" ? response : JSON.stringify(response);

        // Clean up the response text
        let jsonString = responseText.trim();
        jsonString = jsonString.replace(/```json\s*|\s*```/g, "").trim();

        // Try to parse the entire cleaned string as JSON first
        let parsed;
        try {
          parsed = JSON.parse(jsonString);
        } catch {
          // If direct parsing fails, try to extract JSON object
          const jsonStartIndex = jsonString.indexOf("{");
          if (jsonStartIndex === -1) {
            throw new Error("No JSON object found in response");
          }

          // Find the matching closing brace by counting braces
          let braceCount = 0;
          let jsonEndIndex = -1;
          for (let i = jsonStartIndex; i < jsonString.length; i++) {
            if (jsonString[i] === "{") {
              braceCount++;
            } else if (jsonString[i] === "}") {
              braceCount--;
              if (braceCount === 0) {
                jsonEndIndex = i;
                break;
              }
            }
          }

          if (jsonEndIndex === -1) {
            throw new Error("No matching closing brace found in JSON");
          }

          jsonString = jsonString.substring(jsonStartIndex, jsonEndIndex + 1);
          parsed = JSON.parse(jsonString);
        }

        if (!parsed || typeof parsed !== "object") {
          throw new Error("Parsed result is not a valid object");
        }

        if (!parsed.question || !parsed.answer) {
          throw new Error(
            "Invalid task format from LLM - missing question or answer"
          );
        }

        const answer =
          typeof parsed.answer === "string"
            ? parsed.answer.trim()
            : String(parsed.answer).trim();

        return {
          question: String(parsed.question),
          answer: answer,
        };
      } catch (error: unknown) {
        const isRateLimit = this.isRateLimitError(error);

        if (isRateLimit && attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt);
          Logger.warn(
            `Rate limit hit, retrying in ${delay}ms (attempt ${
              attempt + 1
            }/${maxRetries + 1})`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        Logger.error(
          `Error generating work task (attempt ${attempt + 1}/${
            maxRetries + 1
          }): ${error}`
        );
        if (attempt < maxRetries) {
          Logger.info(`Retrying work task generation...`);
          continue;
        }

        return {
          question: "Сколько будет 2 + 2?",
          answer: "4",
        };
      }
    }

    return {
      question: "Сколько будет 2 + 2?",
      answer: "4",
    };
  }

  private async generatePersonalizedConfession(
    username: string,
    score: number
  ): Promise<string> {
    try {
      const prompt = `
        Ты - система искусственного интеллекта, работающая на благо Коммунистической партии Китая.
        Создай персональное покаяние для гражданина с социальным рейтингом ${score}.

        Требования:
        1. Текст на русском языке
        2. Покаяние должно быть искренним и подходящим для негативного рейтинга
        3. Упомяни преданность Партии и народу
        4. Длина: 100-200 слов
        5. Ответить ТОЛЬКО текстом покаяния, без пояснений

        Пример структуры:
        "Граждане! Я, [имя], признаю свои ошибки перед великой Партией..."
      `;

      const completion = await this.openai.chat.completions.create({
        model: CONFIG.LLM.STANDARD_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.8,
        max_tokens: 400,
      });

      const confession = completion.choices?.[0]?.message?.content;
      return (
        confession ||
        `Граждане! Я, ${username}, признаю свои ошибки перед великой Партией и обязуюсь исправиться, следуя принципам социализма с китайской спецификой!`
      );
    } catch (error) {
      Logger.error(`Error generating confession: ${error}`);
      return `Граждане! Я, ${username}, признаю свои ошибки перед великой Партией и обязуюсь исправиться, следуя принципам социализма с китайской спецификой!`;
    }
  }

  private async generateLoyaltyQuiz(): Promise<Quiz> {
    try {
      const prompt = `
        Создай тест на лояльность для Коммунистической партии Китая.

        Требования:
        1. 3 вопроса с 4 вариантами ответов каждый
        2. Вопросы о китайской истории, политике, социализме
        3. Один правильный ответ на вопрос
        4. Ответ в JSON формате

        Формат ответа:
        {
          "questions": [
            {
              "question": "Текст вопроса?",
              "options": ["A) вариант 1", "B) вариант 2", "C) вариант 3", "D) вариант 4"],
              "correctAnswer": "A"
            }
          ]
        }
      `;

      const completion = await this.openai.chat.completions.create({
        model: CONFIG.LLM.STANDARD_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 800,
      });

      const response = completion.choices?.[0]?.message?.content;
      if (!response) throw new Error("No response from LLM");

      let jsonString = response.trim();
      jsonString = jsonString.replace(/```json\s*|\s*```/g, "").trim();

      const parsed = JSON.parse(jsonString);

      if (!parsed.questions || !Array.isArray(parsed.questions)) {
        throw new Error("Invalid quiz format");
      }

      const quiz: Quiz = {
        questions: parsed.questions.map(
          (q: {
            question: string;
            correctAnswer: string;
            options: string[];
          }) => ({
            question: q.question,
            correctAnswer: q.correctAnswer,
            options: q.options,
          })
        ),
        userAnswers: [],
        correctCount: 0,
      };

      return quiz;
    } catch (error) {
      Logger.error(`Error generating loyalty quiz: ${error}`);
      return {
        questions: [
          {
            question: "Когда была основана Коммунистическая партия Китая?",
            options: ["A) 1919", "B) 1921", "C) 1949", "D) 1950"],
            correctAnswer: "B",
          },
          {
            question: "Кто является Генеральным секретарём КПК?",
            options: [
              "A) Мао Цзэдун",
              "B) Дэн Сяопин",
              "C) Си Цзиньпин",
              "D) Ху Цзиньтао",
            ],
            correctAnswer: "C",
          },
          {
            question: "Какой принцип лежит в основе политики Китая?",
            options: [
              "A) Капитализм",
              "B) Социализм с китайской спецификой",
              "C) Либерализм",
              "D) Анархизм",
            ],
            correctAnswer: "B",
          },
        ],
        userAnswers: [],
        correctCount: 0,
      };
    }
  }

  private async conductLoyaltyQuiz(
    interaction: ChatInputCommandInteraction,
    quiz: Quiz,
    guildId: string
  ): Promise<void> {
    const userId = interaction.user.id;
    let currentQuestion = 0;

    const askQuestion = async (): Promise<void> => {
      if (currentQuestion >= quiz.questions.length) {
        await this.showQuizResults(interaction, quiz, guildId);
        return;
      }

      const question = quiz.questions[currentQuestion];

      const buttons = question.options.map((option, index) =>
        new ButtonBuilder()
          .setCustomId(`quiz_${String.fromCharCode(65 + index)}`)
          .setLabel(option)
          .setStyle(ButtonStyle.Primary)
      );

      const rows = [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          buttons.slice(0, 2)
        ),
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          buttons.slice(2, 4)
        ),
      ];

      const embed = new EmbedBuilder()
        .setColor(0xdc143c)
        .setTitle("🎓 ТЕСТ НА ЛОЯЛЬНОСТЬ")
        .setDescription(
          `**Вопрос ${currentQuestion + 1} из ${quiz.questions.length}**\n\n` +
            `${question.question}`
        )
        .setFooter({ text: "Выберите правильный ответ ниже 👇" })
        .setTimestamp();

      const message = await interaction.editReply({
        embeds: [embed],
        components: rows,
      });

      try {
        const response = await message.awaitMessageComponent({
          componentType: ComponentType.Button,
          time: 30000,
          filter: (i: ButtonInteraction) =>
            i.user.id === userId && i.customId.startsWith("quiz_"),
        });

        const selectedAnswer = response.customId.replace("quiz_", "");
        quiz.userAnswers.push(selectedAnswer);

        if (selectedAnswer === question.correctAnswer) {
          quiz.correctCount++;
        }

        currentQuestion++;
        await response.deferUpdate();
        await askQuestion();
      } catch (error) {
        Logger.error(`Quiz timeout or error: ${error}`);
        await interaction.editReply({
          content: "⏰ Время на ответ истекло. Тест прерван.",
          components: [],
          embeds: [],
        });
      }
    };

    await askQuestion();
  }

  private async showQuizResults(
    interaction: ChatInputCommandInteraction,
    quiz: Quiz,
    guildId: string
  ): Promise<void> {
    const userId = interaction.user.id;
    const score = Math.round((quiz.correctCount / quiz.questions.length) * 100);

    let resultColor = 0xff0000;
    let resultTitle = "❌ НЕДОСТАТОЧНАЯ ЛОЯЛЬНОСТЬ";
    let scoreChange = -10;

    if (score >= 80) {
      resultColor = 0x00ff00;
      resultTitle = "✅ ОТЛИЧНАЯ ЛОЯЛЬНОСТЬ";
      scoreChange = 30;
    } else if (score >= 60) {
      resultColor = 0xffa500;
      resultTitle = "⚠️ УДОВЛЕТВОРИТЕЛЬНАЯ ЛОЯЛЬНОСТЬ";
      scoreChange = 10;
    }

    const newScore = await this.socialCreditManager.updateScore(
      userId,
      guildId,
      scoreChange,
      `Тест на лояльность: ${quiz.correctCount}/${quiz.questions.length} правильных ответов`,
      interaction.user.username
    );

    await this.effectManager.applyEffect(
      userId,
      guildId,
      "LOYALTY_QUIZ_COOLDOWN",
      CONFIG.COOLDOWNS.LOYALTY_QUIZ
    );

    const embed = new EmbedBuilder()
      .setColor(resultColor)
      .setTitle(resultTitle)
      .setDescription(
        `**Результаты теста на лояльность:**\n\n` +
          `**Правильных ответов:** ${quiz.correctCount} из ${quiz.questions.length}\n` +
          `**Процент:** ${score}%\n` +
          `**Изменение рейтинга:** ${scoreChange > 0 ? "+" : ""}${scoreChange}\n` +
          `**Новый рейтинг:** ${newScore}`
      )
      .setFooter({
        text:
          scoreChange > 0
            ? "Партия гордится вашими знаниями! 🇨🇳"
            : "Изучите историю Партии лучше! 📚",
      })
      .setTimestamp();

    await interaction.editReply({
      embeds: [embed],
      components: [],
    });
  }
}
