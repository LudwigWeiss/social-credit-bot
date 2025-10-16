import { DatabaseManager } from "./DatabaseManager.js";
import { SocialCreditManager } from "./SocialCreditManager.js";
import { EffectManager } from "./EffectManager.js";
import { RewardManager } from "./RewardManager.js";
import {
  Achievement,
  IAchievement,
  UserAchievement,
} from "../models/Achievement.js";
import { Logger } from "../utils/Logger.js";
import { GuildMember } from "discord.js";
import { ACHIEVEMENTS } from "../data/achievements.js";

export class AchievementManager {
  private achievements: IAchievement[] = [];

  constructor(
    private db: DatabaseManager,
    private socialCreditManager: SocialCreditManager,
    private effectManager: EffectManager,
    private rewardManager: RewardManager
  ) {}

  async initialize(): Promise<void> {
    await this.syncAchievementsWithDb();
    this.achievements = await Achievement.find(); // Load all achievements into memory
    Logger.info(`Loaded ${this.achievements.length} achievements`);
  }

  async syncAchievementsWithDb(): Promise<void> {
    Logger.info("Syncing achievements with the database...");
    for (const achievementData of ACHIEVEMENTS) {
      await Achievement.findOneAndUpdate(
        { achievementId: achievementData.achievementId },
        achievementData as any,
        { upsert: true, new: true }
      );
    }
    Logger.info("Achievement sync complete.");
  }

  async checkAndAwardAchievements(
    member: GuildMember,
    activityType: string,
    activityData: any
  ): Promise<void> {
    const userId = member.id;
    const guildId = member.guild.id;

    const userAchievements = await this.getUserAchievements(userId, guildId);
    const unlockedAchievementIds = new Set(
      userAchievements.map((ua) => ua.achievementId)
    );

    for (const achievement of this.achievements) {
      if (
        unlockedAchievementIds.has(achievement.achievementId) ||
        !achievement.enabled
      ) {
        continue;
      }

      const unlocked = await this.isAchievementUnlocked(
        achievement,
        member,
        activityType,
        activityData
      );

      if (unlocked) {
        await this.unlockAchievement(member, achievement);
      }
    }
  }

  private async isAchievementUnlocked(
    achievement: IAchievement,
    member: GuildMember,
    activityType: string,
    activityData: any
  ): Promise<boolean> {
    const condition = achievement.unlockCondition;

    switch (achievement.type) {
      case "Score":
        if (activityType !== "score_update") return false;
        const score = activityData.score;
        if (score === undefined) return false;
        if (condition.score.$gte !== undefined && score < condition.score.$gte)
          return false;
        if (condition.score.$lte !== undefined && score > condition.score.$lte)
          return false;
        return true;

      case "Activity":
        const userHistory = await this.db.getUserHistory(
          member.id,
          member.guild.id,
          1000
        );

        if (condition.command) {
          if (
            activityType !== "command_used" ||
            activityData.command !== condition.command
          ) {
            return false;
          }
          if (condition.count === 1) return true;

          if (condition.count > 1) {
            const commandUses = userHistory.filter((h) =>
              h.reason.includes(activityData.command)
            ).length;
            return commandUses >= condition.count;
          }

          if (condition.command === "enforce-harmony") {
            if (
              condition.scoreChange === "negative" &&
              activityData.scoreChange < 0
            )
              return true;
            if (condition.reciprocal) {
              const targetHistory = await this.db.getUserHistory(
                activityData.targetId,
                member.guild.id
              );
              return targetHistory.some(
                (h) =>
                  h.reason.includes("Enforce Harmony") &&
                  h.messageContent?.includes(member.id)
              );
            }
          }

          if (
            condition.command === "loyalty-quiz" &&
            condition.perfectScore &&
            activityData.perfectScore
          ) {
            return true;
          }

          if (
            condition.command === "propaganda-broadcast" &&
            condition.perfect &&
            activityData.perfect
          ) {
            return true;
          }

          if (
            condition.command === "decree-from-the-party" &&
            condition.success &&
            activityData.success
          ) {
            return true;
          }
        }

        if (condition.event) {
          if (activityType !== "event" || activityData.event !== condition.event) {
            return false;
          }
          return true;
        }

        if (condition.leaderboardRank === 1) {
          const leaderboard =
            await this.socialCreditManager.getServerLeaderboard(
              member.guild.id,
              1
            );
          return leaderboard.length > 0 && leaderboard[0].userId === member.id;
        }

        if (condition.score && condition.duration) {
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(
            sevenDaysAgo.getDate() - condition.duration
          );
          const recentHistory = userHistory.filter(
            (h) => new Date(h.timestamp) > sevenDaysAgo
          );
          if (recentHistory.length === 0) return false;
          return recentHistory.every((h) => h.newScore >= condition.score.$gte);
        }

        return false;

      case "Event":
        return false;

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

    await this.rewardManager.grantReward(member, achievement);
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

  public getAchievements(): IAchievement[] {
    return this.achievements;
  }
}