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
          "🚫 Access denied! Only officials can set monitoring channels!",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const channel = interaction.options.getChannel("channel");
    const guildId = interaction.guildId!;

    if (!channel || channel.type !== ChannelType.GuildText) {
      await interaction.reply({
        content:
          "❌ Invalid channel! Please select a text channel for monitoring.",
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
      .setTitle("Monitoring Activated")
      .setDescription(
        `The channel ${channel} is now under surveillance by the social credit system.`
      )
      .setFooter({ text: "Imagination sees all! 👁️" })
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
          "🚫 Access denied! Only officials can manage monitoring!",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const channel = interaction.options.getChannel("channel");
    const guildId = interaction.guildId!;

    if (!channel || channel.type !== ChannelType.GuildText) {
      await interaction.reply({
        content: "❌ Invalid channel! Please select a text channel.",
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
          .setTitle("Monitoring Deactivated")
          .setDescription(
            `The channel ${channel} is no longer being monitored.`
          )
          .setFooter({ text: "Imagination has stopped watching this channel." })
          .setTimestamp();

        await interaction.reply({ embeds: [embed] });
      } else {
        await interaction.reply({
          content: `❌ Channel ${channel} was not in the monitored list.`,
          flags: MessageFlags.Ephemeral,
        });
      }
    } catch {
      await interaction.reply({
        content: "❌ Error while removing channel from monitoring.",
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
          "🚫 Access denied! Only officials can view monitoring!",
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
            "📊 There are no monitored channels on this server. Use `/set-monitor-channel` to add one.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(0x4169e1)
        .setTitle("Monitored Channels")
        .setDescription(
          `A list of all channels currently under surveillance in this server.`
        )
        .setTimestamp();

      const channelList = channelInfo
        .map((info) => {
          const channel = `<#${info.channelId}>`;
          const time = `<t:${Math.floor(info.addedAt.getTime() / 1000)}:R>`;
          return `• ${channel} (added by <@${info.addedBy}> ${time})`;
        })
        .join("\n");

      embed.addFields({
        name: `Active Channels (${channelInfo.length})`,
        value: channelList || "None",
        inline: false,
      });

      embed.setFooter({ text: "Imagination is watching everyone! 👁️" });

      await interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral,
      });
    } catch {
      await interaction.reply({
        content: "❌ Error fetching channel list.",
        flags: MessageFlags.Ephemeral,
      });
    }
  }
}
