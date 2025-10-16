import { DatabaseManager } from "./DatabaseManager.js";
import { SocialCreditManager } from "./SocialCreditManager.js";
import { EffectManager } from "./EffectManager.js";
import {
  Achievement,
  IAchievement,
  UserAchievement,
} from "../models/Achievement.js";
import { Logger } from "../utils/Logger.js";
import { GuildMember } from "discord.js";

export class AchievementManager {
  private achievements: IAchievement[] = [];

  constructor(
    private db: DatabaseManager,
    private socialCreditManager: SocialCreditManager,
    private effectManager: EffectManager
  ) {}

  async initialize(): Promise<void> {
    await this.loadAchievements();
    Logger.info(`Loaded ${this.achievements.length} achievements`);
  }

  async loadAchievements(): Promise<IAchievement[]> {
    this.achievements = await Achievement.find();
    return this.achievements;
  }

  async checkAndAwardAchievements(
    member: GuildMember,
    score: number
  ): Promise<void> {
    const userId = member.id;
    const guildId = member.guild.id;

    const userAchievements = await this.getUserAchievements(userId, guildId);
    const unlockedAchievementIds = new Set(
      userAchievements.map((ua) => ua.achievementId)
    );

    for (const achievement of this.achievements) {
      if (unlockedAchievementIds.has(achievement.achievementId)) {
        continue;
      }

      let unlocked = false;
      if (achievement.type === "Score") {
        unlocked = this.checkScoreAchievement(achievement, score);
      }

      if (unlocked) {
        await this.unlockAchievement(member, achievement);
      }
    }
  }

  private checkScoreAchievement(
    achievement: IAchievement,
    score: number
  ): boolean {
    switch (achievement.achievementId) {
      case "GOOD_CITIZEN":
        return score >= 500;
      case "PROBLEMATIC_CITIZEN":
        return score <= -200;
      case "MODEL_CITIZEN":
        return score >= 1000;
      case "ENEMY_OF_THE_STATE":
        return score <= -500;
      case "SUPREME_CITIZEN":
        return score >= 2000;
      default:
        return false;
    }
  }

  async unlockAchievement(
    member: GuildMember,
    achievement: IAchievement
  ): Promise<void> {
    const userId = member.id;
    const guildId = member.guild.id;

    const userAchievement = new UserAchievement({
      userId,
      guildId,
      achievementId: achievement.achievementId,
    });

    await userAchievement.save();

    Logger.info(
      `User ${member.user.username} unlocked achievement: ${achievement.name}`
    );

    // TODO: Grant rewards
  }

  async getUserAchievements(
    userId: string,
    guildId: string
  ): Promise<IAchievement[]> {
    const userAchievements = await UserAchievement.find({ userId, guildId });
    const achievementIds = userAchievements.map((ua) => ua.achievementId);

    return this.achievements.filter((ach) =>
      achievementIds.includes(ach.achievementId)
    );
  }
}