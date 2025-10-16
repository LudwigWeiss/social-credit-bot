import { GuildMember } from "discord.js";
import { IAchievement } from "../models/Achievement.js";
import { SocialCreditManager } from "./SocialCreditManager.js";
import { EffectManager } from "./EffectManager.js";
import { Logger } from "../utils/Logger.js";

export class RewardManager {
  constructor(
    private socialCreditManager: SocialCreditManager,
    private effectManager: EffectManager
  ) {}

  async grantReward(
    member: GuildMember,
    achievement: IAchievement
  ): Promise<void> {
    const reward = achievement.reward;

    if (reward.scoreBonus) {
      await this.grantScoreBonus(member, reward.scoreBonus, achievement.name);
    }

    if (reward.effect) {
      await this.grantEffect(member, reward.effect);
    }

    if (reward.role) {
      await this.grantRole(member, reward.role);
    }
  }

  private async grantScoreBonus(
    member: GuildMember,
    scoreBonus: number,
    achievementName: string
  ): Promise<void> {
    await this.socialCreditManager.updateScore(
      member.id,
      member.guild.id,
      scoreBonus,
      `Unlocked achievement: ${achievementName}`,
      member,
      member.user.username
    );
    Logger.info(
      `Granted score bonus of ${scoreBonus} to ${member.user.username} for unlocking ${achievementName}`
    );
  }

  private async grantEffect(
    member: GuildMember,
    effect: { type: string; duration: number }
  ): Promise<void> {
    // TODO: Implement effect granting
    Logger.info(
      `Granted effect ${effect.type} to ${member.user.username} for ${effect.duration} hours`
    );
  }

  private async grantRole(member: GuildMember, roleName: string): Promise<void> {
    // TODO: Implement role granting
    Logger.info(`Granted role ${roleName} to ${member.user.username}`);
  }
}