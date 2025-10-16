import { DatabaseManager } from "./DatabaseManager.js";
import { EffectManager } from "./EffectManager.js";
import { AchievementManager } from "./AchievementManager.js";
import { GuildMember } from "discord.js";

export interface SocialCreditEntry {
  userId: string;
  guildId: string;
  score: number;
  lastUpdated: Date;
  totalChanges: number;
}

export interface ScoreHistory {
  id: string;
  userId: string;
  guildId: string;
  scoreChange: number;
  reason: string;
  timestamp: Date;
  messageContent?: string;
}

export class SocialCreditManager {
  private effectManager!: EffectManager;
  private achievementManager!: AchievementManager;

  constructor(private db: DatabaseManager) {}

  setEffectManager(manager: EffectManager): void {
    this.effectManager = manager;
  }

  setAchievementManager(manager: AchievementManager): void {
    this.achievementManager = manager;
  }

  async updateScore(
    userId: string,
    guildId: string,
    change: number,
    reason:string,
    member: GuildMember | null,
    username?: string,
    messageContent?: string
  ): Promise<number> {
    // Get current score
    const currentEntry = await this.db.getUserScore(userId, guildId);
    const previousScore = currentEntry?.score || 0; // Start with 0 points (neutral)
    const newScore = previousScore + change;

    // Update or create user entry
    await this.db.updateUserScore(userId, guildId, newScore, username);

    // Add to history
    await this.db.addScoreHistory(
      userId,
      guildId,
      change,
      previousScore,
      newScore,
      reason,
      messageContent
    );

    // Update effects
    await this.effectManager.updateEffectsForScore(member, newScore);

    // Check for achievements
    if (member) {
      await this.achievementManager.checkAndAwardAchievements(member, newScore);
    }

    return newScore;
  }

  async getUserScore(userId: string, guildId: string): Promise<number> {
    const entry = await this.db.getUserScore(userId, guildId);
    return entry?.score || 0; // Default starting score (neutral)
  }

  async getServerLeaderboard(
    guildId: string,
    limit: number = 10
  ): Promise<SocialCreditEntry[]> {
    return await this.db.getServerLeaderboard(guildId, limit);
  }

  async getGlobalLeaderboard(limit: number = 10): Promise<SocialCreditEntry[]> {
    return await this.db.getGlobalLeaderboard(limit);
  }

  async getUserHistory(
    userId: string,
    guildId: string,
    limit: number = 10
  ): Promise<ScoreHistory[]> {
    return await this.db.getUserHistory(userId, guildId, limit);
  }

  async getServerStats(guildId: string): Promise<{
    totalUsers: number;
    averageScore: number;
    highestScore: number;
    lowestScore: number;
    totalScoreChanges: number;
  }> {
    return await this.db.getServerStats(guildId);
  }

  getScoreRank(score: number): {
    rank: string;
    emoji: string;
    description: string;
    color: number;
  } {
    if (score >= 2000) {
      return {
        rank: "Supreme Citizen 🇨🇳",
        emoji: "👑",
        description: "A glorious leader of the people! Xi Jinping would be proud!",
        color: 0xffd700,
      };
    } else if (score >= 1000) {
      return {
        rank: "Model Citizen",
        emoji: "⭐",
        description:
          "An exemplary member of society! Your social credit score brings honor!",
        color: 0x00ff00,
      };
    } else if (score >= 500) {
      return {
        rank: "Good Citizen",
        emoji: "✅",
        description:
          "A worthy member of society. Keep up the good work, comrade!",
        color: 0x90ee90,
      };
    } else if (score > 0) {
      return {
        rank: "Average Citizen",
        emoji: "😐",
        description:
          "A positive but modest score. There is room to grow, citizen.",
        color: 0xffff00,
      };
    } else if (score === 0) {
      return {
        rank: "Neutral Citizen",
        emoji: "⚪",
        description:
          "A neutral social credit score. Start proving yourself, comrade!",
        color: 0x808080,
      };
    } else if (score >= -200) {
      return {
        rank: "Problematic Citizen",
        emoji: "⚠️",
        description:
          "Your behavior is concerning. Re-education may be required.",
        color: 0xffa500,
      };
    } else if (score >= -500) {
      return {
        rank: "Bad Citizen",
        emoji: "❌",
        description:
          "Unacceptable behavior! Report to the nearest re-education camp!",
        color: 0xff4500,
      };
    } else {
      return {
        rank: "Enemy of the State",
        emoji: "💀",
        description:
          "ATTENTION: This individual poses a threat to social harmony!",
        color: 0xff0000,
      };
    }
  }

  getPenaltyLevel(score: number): string | null {
    if (score <= -500) return "SEVERE";
    if (score <= -200) return "MODERATE";
    if (score <= -50) return "MILD";
    return null;
  }

  getPrivilegeLevel(score: number): string | null {
    if (score >= 1000) return "SUPREME_CITIZEN";
    if (score >= 500) return "MODEL_CITIZEN";
    if (score >= 200) return "GOOD_CITIZEN";
    return null;
  }
}
