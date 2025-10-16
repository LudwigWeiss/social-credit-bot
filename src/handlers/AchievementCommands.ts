import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
} from "discord.js";
import { BaseCommandHandler } from "./BaseCommandHandler.js";
import { AchievementManager } from "../managers/AchievementManager.js";

export class AchievementCommands extends BaseCommandHandler {
  private achievementManager: AchievementManager;

  constructor(
    achievementManager: AchievementManager,
    ...args: ConstructorParameters<typeof BaseCommandHandler>
  ) {
    super(...args);
    this.achievementManager = achievementManager;
  }

  async handleInteraction(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    switch (interaction.commandName) {
      case "achievements":
        await this.handleAchievementsCommand(interaction);
        break;
      case "achievements-list":
        await this.handleAchievementsListCommand(interaction);
        break;
      default:
        throw new Error(
          `Unknown achievement command: ${interaction.commandName}`
        );
    }
  }

  private async handleAchievementsCommand(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const targetUser = interaction.options.getUser("user") || interaction.user;
    const guildId = interaction.guildId || "dm";

    const achievements = await this.achievementManager.getUserAchievements(
      targetUser.id,
      guildId
    );

    if (achievements.length === 0) {
      await interaction.reply({
        content: `📜 ${targetUser.username} has not unlocked any achievements yet.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setAuthor({
        name: `Achievements for ${targetUser.username}`,
        iconURL: targetUser.displayAvatarURL(),
      })
      .setTimestamp();

    for (const achievement of achievements) {
      embed.addFields({
        name: `${achievement.name} (${achievement.tier})`,
        value: achievement.description,
        inline: false,
      });
    }

    await interaction.reply({ embeds: [embed] });
  }

  private async handleAchievementsListCommand(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const allAchievements = await this.achievementManager.loadAchievements();

    const embed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle("🏆 All Achievements")
      .setTimestamp();

    const achievementsByTier: Record<string, any[]> = {
      Gold: [],
      Silver: [],
      Bronze: [],
    };

    for (const achievement of allAchievements) {
      achievementsByTier[achievement.tier].push(achievement);
    }

    for (const tier in achievementsByTier) {
      const achievements = achievementsByTier[tier];
      if (achievements.length > 0) {
        embed.addFields({
          name: `**${tier}**`,
          value: achievements
            .map((ach) => `**${ach.name}**: ${ach.description}`)
            .join("\n"),
          inline: false,
        });
      }
    }

    await interaction.reply({ embeds: [embed] });
  }
}