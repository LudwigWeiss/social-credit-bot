import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
} from "discord.js";
import { BaseCommandHandler } from "./BaseCommandHandler.js";

export class UtilityCommands extends BaseCommandHandler {
  async handleInteraction(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    switch (interaction.commandName) {
      case "rate-limit-status":
        await this.handleRateLimitStatusCommand(interaction);
        break;
      default:
        throw new Error(`Unknown utility command: ${interaction.commandName}`);
    }
  }

  private async handleRateLimitStatusCommand(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    if (!this.rateLimitManager) {
      await interaction.reply({
        content: "❌ Rate limit manager not available.",
        flags: MessageFlags.Ephemeral,
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
      .setTitle("⏱️ RATE LIMIT STATUS")
      .setDescription(
        `**Citizen:** ${interaction.user.username}\n*Current status of the control system*`
      )
      .addFields(
        {
          name: "🎯 Positive Score",
          value: status.canReceivePositive
            ? "✅ Available"
            : `❌ Cooldown: ${Math.ceil(status.timeUntilPositive / 60000)} min`,
          inline: true,
        },
        {
          name: "📊 Messages in Window",
          value: `${status.messagesInWindow}/10`,
          inline: true,
        },
        {
          name: "📝 Buffered",
          value: `${status.bufferedMessages}`,
          inline: true,
        },
        {
          name: "⏰ Window Resets In",
          value: `${Math.ceil(status.windowTimeLeft / 1000)} sec`,
          inline: true,
        },
        {
          name: "🌐 Channel Context",
          value: `${contextStats.totalChannels}`,
          inline: true,
        },
        {
          name: "💬 Total Messages",
          value: `${contextStats.totalMessages}`,
          inline: true,
        }
      )
      .setFooter({
        text: "The Party controls the pace! 👁️",
      })
      .setTimestamp();

    // Add warning if user is being rate limited
    if (!status.canReceivePositive || status.messagesInWindow >= 8) {
      embed.addFields({
        name: "⚠️ Warning",
        value:
          status.messagesInWindow >= 8
            ? "🚨 Nearing message limit! Subsequent messages will be buffered."
            : "⏰ Cooldown for positive score is active.",
        inline: false,
      });
    }

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }
}
