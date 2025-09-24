import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
} from "discord.js";
import { BaseCommandHandler } from "./BaseCommandHandler.js";

export class AdminCommands extends BaseCommandHandler {
  async handleInteraction(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    switch (interaction.commandName) {
      case "set-monitor-channel":
        await this.handleSetMonitorChannelCommand(interaction);
        break;
      case "remove-monitor-channel":
        await this.handleRemoveMonitorChannelCommand(interaction);
        break;
      case "list-monitored-channels":
        await this.handleListMonitoredChannelsCommand(interaction);
        break;
      default:
        throw new Error(`Unknown admin command: ${interaction.commandName}`);
    }
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
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const channel = interaction.options.getChannel("channel");
    const guildId = interaction.guildId!;

    if (!channel || channel.type !== ChannelType.GuildText) {
      await interaction.reply({
        content:
          "❌ Неверный канал! Пожалуйста, выберите текстовый канал для мониторинга.",
        flags: MessageFlags.Ephemeral,
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
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const channel = interaction.options.getChannel("channel");
    const guildId = interaction.guildId!;

    if (!channel || channel.type !== ChannelType.GuildText) {
      await interaction.reply({
        content: "❌ Неверный канал! Пожалуйста, выберите текстовый канал.",
        flags: MessageFlags.Ephemeral,
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
          flags: MessageFlags.Ephemeral,
        });
      }
    } catch {
      await interaction.reply({
        content: "❌ Ошибка при удалении канала из мониторинга.",
        flags: MessageFlags.Ephemeral,
      });
    }
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
        flags: MessageFlags.Ephemeral,
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
          flags: MessageFlags.Ephemeral,
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

      await interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral,
      });
    } catch {
      await interaction.reply({
        content: "❌ Ошибка при получении списка каналов.",
        flags: MessageFlags.Ephemeral,
      });
    }
  }
}
