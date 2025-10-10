import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
} from "discord.js";
import { BaseCommandHandler } from "./BaseCommandHandler.js";
import { MemeResponses } from "../utils/MemeResponses.js";

export class SocialCreditCommands extends BaseCommandHandler {
  async handleInteraction(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    switch (interaction.commandName) {
      case "social-credit":
        await this.handleSocialCreditCommand(interaction);
        break;
      case "leaderboard":
        await this.handleLeaderboardCommand(interaction);
        break;
      case "social-credit-history":
        await this.handleHistoryCommand(interaction);
        break;
      case "social-credit-stats":
        await this.handleStatsCommand(interaction);
        break;
      default:
        throw new Error(
          `Unknown social credit command: ${interaction.commandName}`
        );
    }
  }

  private async handleSocialCreditCommand(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const targetUser = interaction.options.getUser("user") || interaction.user;
    const guildId = interaction.guildId || "dm";

    const score = await this.socialCreditManager.getUserScore(
      targetUser.id,
      guildId
    );
    const rankInfo = this.socialCreditManager.getScoreRank(score);

    const embed = new EmbedBuilder()
      .setColor(rankInfo.color)
      .setAuthor({
        name: `Social Credit Report for ${targetUser.username}`,
        iconURL: targetUser.displayAvatarURL(),
      })
      .addFields(
        {
          name: "💯 Current Score",
          value: `**${score}**`,
          inline: true,
        },
        {
          name: "🏅 Rank",
          value: `${rankInfo.emoji} ${rankInfo.rank}`,
          inline: true,
        },
        {
          name: "📝 Assessment",
          value: `*${rankInfo.description}*`,
          inline: false,
        }
      )
      .setFooter({
        text: MemeResponses.getRandomMemePhrase(),
        iconURL:
          "https://upload.wikimedia.org/wikipedia/commons/f/fa/Flag_of_the_People%27s_Republic_of_China.svg",
      })
      .setTimestamp();

    // Add active effects info
    const activeEffects = this.effectManager.getActiveEffects(targetUser.id);
    if (activeEffects.length > 0) {
      const effectsText = activeEffects
        .map((effect) => {
          const timeLeft = Math.ceil(
            (effect.expiresAt.getTime() - Date.now()) / (60 * 1000)
          );
          const effectName = this.getEffectDisplayName(effect.effectType);
          return `• ${effectName} (${timeLeft} min)`;
        })
        .join("\n");
      embed.addFields({
        name: "🔄 Active Effects",
        value: effectsText,
        inline: false,
      });
    }

    // Add daily claim status
    const lastClaim = activeEffects.find(
      (e) =>
        e.effectType === "DAILY_CLAIM_RESET" &&
        e.metadata?.type === "daily_claim"
    );
    if (lastClaim) {
      const timeLeft = Math.ceil(
        (lastClaim.expiresAt.getTime() - Date.now()) / (60 * 60 * 1000)
      );
      embed.addFields({
        name: "⏰ Daily Bonus",
        value: `Available in ${timeLeft} hours`,
        inline: true,
      });
    } else {
      embed.addFields({
        name: "⏰ Daily Bonus",
        value: "Available now!",
        inline: true,
      });
    }

    await interaction.reply({ embeds: [embed] });
  }

  private async handleLeaderboardCommand(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const scope = interaction.options.getString("scope") || "server";
    const guildId = interaction.guildId || "dm";

    let leaderboard;
    let title;
    const embedColor = 0xffd700;
    const embedTitle = "🏆 SOCIAL CREDIT LEADERBOARD 🏆";

    // Check for active events that affect appearance
    // TODO: Implement event tracking for visual flair
    // For now, keep default appearance

    if (scope === "global") {
      leaderboard = await this.socialCreditManager.getGlobalLeaderboard(10);
      title = MemeResponses.getLeaderboardTitle(true);
    } else {
      leaderboard = await this.socialCreditManager.getServerLeaderboard(
        guildId,
        10
      );
      title = MemeResponses.getLeaderboardTitle(false);
    }

    if (leaderboard.length === 0) {
      await interaction.reply({
        content:
          "📊 No social credit data found! Start monitoring a channel to track citizen behavior!",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(embedColor)
      .setTitle(embedTitle)
      .setDescription(title)
      .setTimestamp();

    const leaderboardEntries = await Promise.all(
      leaderboard.map(async (entry, i) => {
        const rank = i + 1;
        const medal =
          rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `**${rank}.**`;
        try {
          const user = await interaction.client.users.fetch(entry.userId);
          return `${medal} ${user.username} - \`${entry.score}\``;
        } catch {
          return `${medal} Unknown User - \`${entry.score}\``;
        }
      })
    );

    embed.addFields({
      name: "Top Citizens",
      value: leaderboardEntries.join("\n"),
      inline: false,
    });

    embed.setFooter({
      text: `${MemeResponses.getRandomMemePhrase()}`,
    });

    await interaction.reply({ embeds: [embed] });
  }

  private async handleHistoryCommand(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const targetUser = interaction.options.getUser("user") || interaction.user;
    const guildId = interaction.guildId || "dm";

    const history = await this.socialCreditManager.getUserHistory(
      targetUser.id,
      guildId,
      10
    );

    if (history.length === 0) {
      await interaction.reply({
        content: `📜 Social credit history for ${targetUser.username} not found. A clean slate, citizen!`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0x4169e1)
      .setAuthor({
        name: `Social Credit History for ${targetUser.username}`,
        iconURL: targetUser.displayAvatarURL(),
      })
      .setTimestamp();

    const historyEntries = history.map((entry) => {
      const changeEmoji = entry.scoreChange > 0 ? "📈" : "📉";
      const changeText =
        entry.scoreChange > 0
          ? `+${entry.scoreChange}`
          : `${entry.scoreChange}`;
      const time = `<t:${Math.floor(entry.timestamp.getTime() / 1000)}:R>`;
      return `${changeEmoji} **${changeText}** for *${entry.reason}* (${time})`;
    });

    embed.setDescription(historyEntries.join("\n"));

    embed.setFooter({
      text: `${MemeResponses.getRandomMemePhrase()}`,
    });

    await interaction.reply({ embeds: [embed] });
  }

  private async handleStatsCommand(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const guildId = interaction.guildId || "dm";

    const stats = await this.socialCreditManager.getServerStats(guildId);

    const embed = new EmbedBuilder()
      .setColor(0x9932cc)
      .setTitle("📊 Server Social Credit Statistics")
      .setDescription(`An overview of social harmony in this server.`)
      .addFields(
        {
          name: "👥 Citizens Under Watch",
          value: `${stats.totalUsers}`,
          inline: true,
        },
        {
          name: "⚖️ Average Score",
          value: `${stats.averageScore}`,
          inline: true,
        },
        {
          name: "🌟 Highest Score",
          value: `${stats.highestScore}`,
          inline: true,
        },
        {
          name: "📉 Lowest Score",
          value: `${stats.lowestScore}`,
          inline: true,
        },
        {
          name: "📈 Total Score Changes",
          value: `${stats.totalScoreChanges}`,
          inline: true,
        },
        {
          name: "🌍 Social Harmony",
          value: this.calculateHarmonyLevel(stats.averageScore),
          inline: true,
        }
      )
      .setFooter({
        text: `${MemeResponses.getRandomMemePhrase()}`,
      })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
}
