import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
} from "discord.js";
import { BaseCommandHandler } from "./BaseCommandHandler.js";
import { AchievementManager } from "../managers/AchievementManager.js";

export class AchievementCommands extends BaseCommandHandler {
  constructor(
    protected achievementManager: AchievementManager,
    ...args: ConstructorParameters<typeof BaseCommandHandler>
  ) {
    super(...args);
  }

  async handleInteraction(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    switch (interaction.commandName) {
      case "achievements":
        await this.handleAchievementsViewCommand(interaction);
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

  private async handleAchievementsViewCommand(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const user = interaction.options.getUser("user") || interaction.user;
    const guildId = interaction.guildId || "dm";

    const userAchievements = await this.achievementManager.getUserAchievements(
      user.id,
      guildId
    );

    const embed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle(`${user.username}'s Achievements`)
      .setDescription(
        `Here are the achievements that ${user.username} has unlocked:`
      );

    if (userAchievements.length === 0) {
      embed.setDescription(`${user.username} has not unlocked any achievements yet.`);
    } else {
      for (const achievement of userAchievements) {
        embed.addFields({
          name: `${achievement.tier} - ${achievement.name}`,
          value: achievement.description,
        });
      }
    }

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  private async handleAchievementsListCommand(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const allAchievements = this.achievementManager.getAchievements();

    const embed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle("All Achievements")
      .setDescription("Here is a list of all available achievements:");

    for (const achievement of allAchievements) {
      embed.addFields({
        name: `${achievement.tier} - ${achievement.name}`,
        value: achievement.description,
      });
    }

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }
}