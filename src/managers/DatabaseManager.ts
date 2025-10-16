import mongoose from "mongoose";
import { User } from "../models/User.js";
import { ScoreHistory, IScoreHistory } from "../models/ScoreHistory.js";
import { MonitoredChannel } from "../models/MonitoredChannel.js";
import { Achievement, UserAchievement } from "../models/Achievement.js";
import {
  SocialCreditEntry,
  ScoreHistory as ScoreHistoryType,
} from "./SocialCreditManager.js";
import { Logger } from "../utils/Logger.js";

export class DatabaseManager {
  private connectionString: string;

  constructor() {
    this.connectionString =
      process.env.MONGODB_URI || "mongodb://localhost:27017/social-credit-bot";
  }

  async initialize(): Promise<void> {
    try {
      await mongoose.connect(this.connectionString, {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      });

      Logger.info("📊 MongoDB connected successfully!");

      // Create indexes if they don't exist
      await this.createIndexes();
      await this.seedAchievements();

      Logger.info("📊 Database initialized successfully!");
    } catch (error) {
      Logger.error("Failed to connect to MongoDB:", error);
      throw error;
    }
  }

  private async createIndexes(): Promise<void> {
    try {
      await User.createIndexes();
      await ScoreHistory.createIndexes();
      await MonitoredChannel.createIndexes();
      await Achievement.createIndexes();
      await UserAchievement.createIndexes();
      Logger.info("📊 Database indexes created successfully!");
    } catch (error) {
      Logger.error("Failed to create database indexes:", error);
    }
  }

  async disconnect(): Promise<void> {
    try {
      await mongoose.disconnect();
      Logger.info("📊 MongoDB disconnected successfully!");
    } catch (error) {
      Logger.error("Failed to disconnect from MongoDB:", error);
    }
  }

  async getUserScore(
    userId: string,
    guildId: string
  ): Promise<SocialCreditEntry | null> {
    try {
      const user = await User.findOne({ userId, guildId }).lean();
      if (!user) return null;

      return {
        userId: user.userId,
        guildId: user.guildId,
        score: user.score,
        lastUpdated: user.lastUpdated,
        totalChanges: user.totalChanges,
      };
    } catch (error) {
      Logger.error("Error getting user score:", error);
      return null;
    }
  }

  async updateUserScore(
    userId: string,
    guildId: string,
    newScore: number,
    username?: string
  ): Promise<void> {
    try {
      await User.findOneAndUpdate(
        { userId, guildId },
        {
          $set: {
            score: newScore,
            lastUpdated: new Date(),
            ...(username && { username }),
          },
          $inc: { totalChanges: 1 },
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
        }
      );
    } catch (error) {
      Logger.error("Error updating user score:", error);
      throw error;
    }
  }

  async addScoreHistory(
    userId: string,
    guildId: string,
    scoreChange: number,
    previousScore: number,
    newScore: number,
    reason: string,
    messageContent?: string
  ): Promise<void> {
    try {
      const historyEntry = new ScoreHistory({
        userId,
        guildId,
        scoreChange,
        previousScore,
        newScore,
        reason,
        messageContent,
        timestamp: new Date(),
      });

      await historyEntry.save();
    } catch (error) {
      Logger.error("Error adding score history:", error);
      throw error;
    }
  }

  async getServerLeaderboard(
    guildId: string,
    limit: number = 10
  ): Promise<SocialCreditEntry[]> {
    try {
      const users = await User.find({ guildId })
        .sort({ score: -1 })
        .limit(limit)
        .lean();

      return users.map((user) => ({
        userId: user.userId,
        guildId: user.guildId,
        score: user.score,
        lastUpdated: user.lastUpdated,
        totalChanges: user.totalChanges,
      }));
    } catch (error) {
      Logger.error("Error getting server leaderboard:", error);
      return [];
    }
  }

  async getGlobalLeaderboard(limit: number = 10): Promise<SocialCreditEntry[]> {
    try {
      const pipeline = [
        {
          $group: {
            _id: "$userId",
            totalScore: { $sum: "$score" },
            lastUpdated: { $max: "$lastUpdated" },
            totalChanges: { $sum: "$totalChanges" },
          },
        },
        {
          $sort: { totalScore: -1 as const },
        },
        {
          $limit: limit,
        },
      ];

      const results = await User.aggregate(pipeline);

      return results.map((result) => ({
        userId: result._id,
        guildId: "global",
        score: result.totalScore,
        lastUpdated: result.lastUpdated,
        totalChanges: result.totalChanges,
      }));
    } catch (error) {
      Logger.error("Error getting global leaderboard:", error);
      return [];
    }
  }

  async getUserHistory(
    userId: string,
    guildId: string,
    limit: number = 10
  ): Promise<IScoreHistory[]> {
    try {
      const history = await ScoreHistory.find({ userId, guildId })
        .sort({ timestamp: -1 })
        .limit(limit)
        .lean();

      return history;
    } catch (error) {
      Logger.error("Error getting user history:", error);
      return [];
    }
  }

  async getServerStats(guildId: string): Promise<{
    totalUsers: number;
    averageScore: number;
    highestScore: number;
    lowestScore: number;
    totalScoreChanges: number;
  }> {
    try {
      const pipeline = [
        { $match: { guildId } },
        {
          $group: {
            _id: null,
            totalUsers: { $sum: 1 },
            averageScore: { $avg: "$score" },
            highestScore: { $max: "$score" },
            lowestScore: { $min: "$score" },
            totalScoreChanges: { $sum: "$totalChanges" },
          },
        },
      ];

      const results = await User.aggregate(pipeline);

      if (results.length === 0) {
        return {
          totalUsers: 0,
          averageScore: 0,
          highestScore: 0,
          lowestScore: 0,
          totalScoreChanges: 0,
        };
      }

      const stats = results[0];
      return {
        totalUsers: stats.totalUsers,
        averageScore: Math.round(stats.averageScore),
        highestScore: stats.highestScore,
        lowestScore: stats.lowestScore,
        totalScoreChanges: stats.totalScoreChanges,
      };
    } catch (error) {
      Logger.error("Error getting server stats:", error);
      return {
        totalUsers: 0,
        averageScore: 1000,
        highestScore: 1000,
        lowestScore: 1000,
        totalScoreChanges: 0,
      };
    }
  }

  async cleanupOldHistory(daysToKeep: number = 90): Promise<void> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      const result = await ScoreHistory.deleteMany({
        timestamp: { $lt: cutoffDate },
      });

      Logger.info(`🧹 Cleaned up ${result.deletedCount} old history entries`);
    } catch (error) {
      Logger.error("Error cleaning up old history:", error);
    }
  }

  // Monitored Channels Management
  async addMonitoredChannel(
    guildId: string,
    channelId: string,
    channelName: string,
    addedBy: string
  ): Promise<void> {
    try {
      await MonitoredChannel.findOneAndUpdate(
        { guildId, channelId },
        {
          $set: {
            channelName,
            addedBy,
            isActive: true,
            addedAt: new Date(),
          },
        },
        {
          upsert: true,
          new: true,
        }
      );
      Logger.info(`Added monitored channel ${channelId} for guild ${guildId}`);
    } catch (error) {
      Logger.error("Error adding monitored channel:", error);
      throw error;
    }
  }

  async removeMonitoredChannel(
    guildId: string,
    channelId: string
  ): Promise<boolean> {
    try {
      const result = await MonitoredChannel.findOneAndUpdate(
        { guildId, channelId },
        { $set: { isActive: false } },
        { new: true }
      );

      if (result) {
        Logger.info(
          `Removed monitored channel ${channelId} for guild ${guildId}`
        );
        return true;
      }
      return false;
    } catch (error) {
      Logger.error("Error removing monitored channel:", error);
      throw error;
    }
  }

  async getMonitoredChannels(guildId: string): Promise<string[]> {
    try {
      const channels = await MonitoredChannel.find({
        guildId,
        isActive: true,
      }).lean();

      return channels.map((channel) => channel.channelId);
    } catch (error) {
      Logger.error("Error getting monitored channels:", error);
      return [];
    }
  }

  async getAllMonitoredChannels(): Promise<Map<string, Set<string>>> {
    try {
      const channels = await MonitoredChannel.find({ isActive: true }).lean();
      const channelMap = new Map<string, Set<string>>();

      for (const channel of channels) {
        if (!channelMap.has(channel.guildId)) {
          channelMap.set(channel.guildId, new Set());
        }
        channelMap.get(channel.guildId)!.add(channel.channelId);
      }

      Logger.info(
        `Loaded ${channels.length} monitored channels across ${channelMap.size} guilds`
      );
      return channelMap;
    } catch (error) {
      Logger.error("Error getting all monitored channels:", error);
      return new Map();
    }
  }

  async getMonitoredChannelInfo(guildId: string): Promise<
    {
      channelId: string;
      channelName?: string;
      addedBy: string;
      addedAt: Date;
    }[]
  > {
    try {
      const channels = await MonitoredChannel.find({
        guildId,
        isActive: true,
      }).lean();

      return channels.map((channel) => ({
        channelId: channel.channelId,
        channelName: channel.channelName,
        addedBy: channel.addedBy,
        addedAt: channel.addedAt,
      }));
    } catch (error) {
      Logger.error("Error getting monitored channel info:", error);
      return [];
    }
  }

  async seedAchievements(): Promise<void> {
    try {
      const achievements = [
        {
          achievementId: "GOOD_CITIZEN",
          name: "Good Citizen",
          description: "Reach a score of 500.",
          tier: "Bronze",
          type: "Score",
        },
        {
          achievementId: "PROBLEMATIC_CITIZEN",
          name: "Problematic Citizen",
          description: "Drop to a score of -200.",
          tier: "Bronze",
          type: "Score",
        },
        {
          achievementId: "MODEL_CITIZEN",
          name: "Model Citizen",
          description: "Reach a score of 1000.",
          tier: "Silver",
          type: "Score",
        },
        {
          achievementId: "ENEMY_OF_THE_STATE",
          name: "Enemy of the State",
          description: "Drop to a score of -500.",
          tier: "Silver",
          type: "Score",
        },
        {
          achievementId: "SUPREME_CITIZEN",
          name: "Supreme Citizen",
          description: "Reach a score of 2000.",
          tier: "Gold",
          type: "Score",
        },
        {
          achievementId: "CONFESSOR",
          name: "Confessor",
          description: "Use the /public-confession command for the first time.",
          tier: "Bronze",
          type: "Activity",
        },
        {
          achievementId: "LABORER",
          name: "Laborer",
          description: "Use the /labor-for-the-state command 5 times.",
          tier: "Bronze",
          type: "Activity",
        },
        {
          achievementId: "SNITCH",
          name: "Snitch",
          description: "Use the /enforce-harmony command to lower someone's score.",
          tier: "Bronze",
          type: "Activity",
        },
        {
          achievementId: "BOOTLICKER",
          name: "Bootlicker",
          description: "Use the /praise-bot command.",
          tier: "Bronze",
          type: "Activity",
        },
        {
          achievementId: "LOYALIST",
          name: "Loyalist",
          description: "Achieve a perfect score on the /loyalty-quiz.",
          tier: "Silver",
          type: "Activity",
        },
        {
          achievementId: "COMMUNITY_LEADER",
          name: "Community Leader",
          description: "Successfully complete 10 /community-service tasks.",
          tier: "Silver",
          type: "Activity",
        },
        {
          achievementId: "PROPAGANDIST",
          name: "Propagandist",
          description: "Use the /spread-propaganda command 5 times.",
          tier: "Silver",
          type: "Activity",
        },
        {
          achievementId: "THOUGHT_CRIMINAL",
          name: "Thought Criminal",
          description: "Have a message re-educated by an admin.",
          tier: "Silver",
          type: "Activity",
        },
        {
          achievementId: "DOUBLE_CROSSER",
          name: "Double-Crosser",
          description: "Use /enforce-harmony on someone who has enforced harmony on you.",
          tier: "Silver",
          type: "Activity",
        },
        {
          achievementId: "THE_PEOPLES_CHAMPION",
          name: "The People's Champion",
          description: "Reach the #1 spot on the server leaderboard.",
          tier: "Gold",
          type: "Activity",
        },
        {
          achievementId: "UNPERSON",
          name: "Unperson",
          description: "Be the target of a /decree-from-the-party command.",
          tier: "Gold",
          type: "Activity",
        },
        {
          achievementId: "REVOLUTIONARY_LEADER",
          name: "Revolutionary Leader",
          description: "Successfully use /decree-from-the-party.",
          tier: "Gold",
          type: "Activity",
        },
        {
          achievementId: "MASTER_OF_THE_ARTS",
          name: "Master of the Arts",
          description: "Generate a perfect piece of propaganda.",
          tier: "Gold",
          type: "Activity",
        },
        {
          achievementId: "THE_INCORRUPTIBLE",
          name: "The Incorruptible",
          description: "Maintain a score of 1000+ for 7 consecutive days.",
          tier: "Gold",
          type: "Activity",
        },
      ];

      for (const ach of achievements) {
        await Achievement.findOneAndUpdate({ achievementId: ach.achievementId }, ach, {
          upsert: true,
          new: true,
        });
      }

      Logger.info(`🌱 Seeded ${achievements.length} achievements`);
    } catch (error) {
      Logger.error("Error seeding achievements:", error);
    }
  }
}
