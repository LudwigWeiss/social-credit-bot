import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  Message,
  TextChannel,
  ReadonlyCollection,
  MessageFlags,
} from "discord.js";
import { BaseCommandHandler } from "./BaseCommandHandler.js";
import { CONFIG } from "../config.js";
import { Logger } from "../utils/Logger.js";

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
    switch (interaction.commandName) {
      case "redeem-myself":
        await this.handleRedeemMyselfCommand(interaction);
        break;
      case "work-for-the-party":
        await this.handleWorkForThePartyCommand(interaction);
        break;
      default:
        throw new Error(`Unknown sanction command: ${interaction.commandName}`);
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
        content:
          "❌ Вы не нуждаетесь в искуплении, гражданин! Ваш социальный рейтинг в порядке.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Check cooldown
    const lastRedeem = this.effectManager
      .getEffectsByType(userId, "DAILY_CLAIM_RESET")
      .find((e) => e.metadata?.type === "redeem_cooldown");
    if (lastRedeem) {
      const timeLeft = lastRedeem.expiresAt.getTime() - Date.now();
      if (timeLeft > 0) {
        const minutesLeft = Math.ceil(timeLeft / (60 * 1000));
        await interaction.reply({
          content: `⏰ Подождите ещё ${minutesLeft} минут перед следующим искуплением, гражданин!`,
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

    // Check cooldown
    const lastWork = this.effectManager
      .getEffectsByType(userId, "DAILY_CLAIM_RESET")
      .find((e) => e.metadata?.type === "work_cooldown");
    if (lastWork) {
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

        // Handle different response types from Mistral
        const responseText =
          typeof response === "string" ? response : JSON.stringify(response);

        // Clean up the response text
        let jsonString = responseText.trim();

        // Remove markdown code blocks if present
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

          // Try parsing the extracted JSON
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

        // Ensure answer is a string and trim it
        const answer =
          typeof parsed.answer === "string"
            ? parsed.answer.trim()
            : String(parsed.answer).trim();

        return {
          question: String(parsed.question),
          answer: answer,
        };
      } catch (error: unknown) {
        // Check if this is a rate limit error (429)
        const isRateLimit = this.isRateLimitError(error);

        if (isRateLimit && attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt); // Exponential backoff
          Logger.warn(
            `Rate limit hit, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries + 1})`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        // If not a rate limit error or max retries reached, log and fallback
        Logger.error(
          `Error generating work task (attempt ${attempt + 1}/${maxRetries + 1}): ${error}`
        );
        if (attempt < maxRetries) {
          Logger.info(`Retrying work task generation...`);
          continue;
        }

        // Fallback to a simple static task
        return {
          question: "Сколько будет 2 + 2?",
          answer: "4",
        };
      }
    }

    // This should never be reached, but just in case
    return {
      question: "Сколько будет 2 + 2?",
      answer: "4",
    };
  }
}
