import {
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { BaseCommandHandler } from "./BaseCommandHandler.js";
import { CONFIG } from "../config.js";
import { Logger } from "../utils/Logger.js";

export class SanctionCommands extends BaseCommandHandler {
  async handleInteraction(interaction: ChatInputCommandInteraction): Promise<void> {
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
}