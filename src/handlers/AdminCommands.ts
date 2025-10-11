import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
  Webhook,
  TextChannel,
  User,
} from "discord.js";
import { BaseCommandHandler } from "./BaseCommandHandler.js";
import { CONFIG } from "../config.js";
import { Logger } from "../utils/Logger.js";

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
      case "reeducate":
        await this.handleReeducateCommand(interaction);
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
        `The channel <#${channel.id}> is now under surveillance by the social credit system.`
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
            `The channel <#${channel.id}> is no longer being monitored.`
          )
          .setFooter({ text: "Imagination has stopped watching this channel." })
          .setTimestamp();

        await interaction.reply({ embeds: [embed] });
      } else {
        await interaction.reply({
          content: `❌ Channel <#${channel.id}> was not in the monitored list.`,
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
  private async handleReeducateCommand(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    if (
      !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)
    ) {
      await interaction.reply({
        content:
          "🚫 Access denied! Only officials can use this command!",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const targetUser = interaction.options.getUser("target", true);
    const messageId = interaction.options.getString("message_id", true);

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      if(interaction.channel === null) {
        throw new Error("Channel is not a text channel")
      }
      const message = await interaction.channel.messages.fetch(messageId);
      if(!message) {
        await interaction.editReply({ content: "Message not found."});
        return;
      }

      await this.applySpeechReeducation(interaction, targetUser, message.content, interaction.channel as TextChannel);
      await message.delete();

      await interaction.editReply({ content: "Speech re-education applied successfully."});
    } catch (error) {
      Logger.error(`Failed to apply manual speech re-education: ${error}`);
      await interaction.editReply({ content: "Failed to apply speech re-education."});
    }
  }

  public async applySpeechReeducation(
    interaction: ChatInputCommandInteraction,
    targetUser: User,
    sanitizedContent: string,
    channel: TextChannel,
  ): Promise<void> {
    // Get corrected message from LLM
    const correctedContent = await this.getCorrectedMessage(sanitizedContent);

    // Create webhook to post as the user
    if (!channel || !channel.isTextBased()) return;

    const webhooks = await (channel as TextChannel).fetchWebhooks();
    let webhook = webhooks.find(
      (wh: Webhook) => wh.name === "Social Credit Re-education"
    );

    if (!webhook) {
      webhook = await (channel as TextChannel).createWebhook({
        name: "Social Credit Re-education",
        avatar: interaction.client.user?.displayAvatarURL(),
      });
    }

    // Post the corrected message
    await webhook.send({
      content: correctedContent,
      username: targetUser.username,
      avatarURL: targetUser.displayAvatarURL(),
    });

    // Apply additional penalty for requiring re-education
    await this.socialCreditManager.updateScore(
      targetUser.id,
      interaction.guild?.id || "dm",
      -10, // Additional penalty
      "Speech re-education correction applied",
      null,
      targetUser.username,
      sanitizedContent
    );

    Logger.info(`Applied manual speech re-education to user ${targetUser.id} by ${interaction.user.id}`);
  }

  public async getCorrectedMessage(originalMessage: string): Promise<string> {
    const prompt = `Rewrite the following message to be positive, patriotic, and supportive of 'Imagination' and 'The Supreme Leader, Eva'. Preserve the original theme if possible. Respond ONLY with the rewritten message text, without any additional explanations, options, or formatting.\n\nOriginal message: "${originalMessage}"`;

    const completion = await this.openai.chat.completions.create({
      model: CONFIG.LLM.STANDARD_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: CONFIG.LLM.TEMPERATURE,
      max_tokens: CONFIG.LLM.MAX_TOKENS,
    });

    const response = completion.choices?.[0]?.message?.content;
    if (!response)
      throw new Error("No response from OpenAI API for speech correction");

    // Handle different response types from Mistral
    const responseText =
      typeof response === "string" ? response : JSON.stringify(response);

    return responseText.trim();
  }
}
