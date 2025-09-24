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

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }
}
