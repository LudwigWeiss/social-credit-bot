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
      .setTitle("🎯 MONITORING ACTIVATED")
      .setDescription(
        `Channel ${channel} is now being monitored for social credit assessment!`
      )
      .addFields(
        { name: "📺 Monitored Channel", value: `${channel}`, inline: true },
        { name: "👁️ Status", value: "ACTIVE", inline: true }
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
          .setTitle("🚫 MONITORING DEACTIVATED")
          .setDescription(
            `Channel ${channel} is no longer tracked by the social credit system.`
          )
          .addFields(
            { name: "📺 Channel", value: `${channel}`, inline: true },
            { name: "👁️ Status", value: "DEACTIVATED", inline: true }
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
        .setTitle("📺 MONITORED CHANNELS")
        .setDescription("*Channels under surveillance by the social credit system*")
        .setTimestamp();

      let description = "";
      for (const info of channelInfo) {
        const channel = `<#${info.channelId}>`;
        const addedDate = info.addedAt.toLocaleDateString();
        description += `${channel}\n`;
        description += `└ Added: ${addedDate} | <@${info.addedBy}>\n\n`;
      }

      embed.addFields({
        name: `👁️ Active Channels: ${channelInfo.length}`,
        value: description,
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
