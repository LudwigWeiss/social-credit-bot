import mongoose, { Schema, Document } from "mongoose";

export type AchievementTier = "Bronze" | "Silver" | "Gold";
export type AchievementType = "Score" | "Activity" | "Event";

export interface IAchievement extends Document {
  achievementId: string;
  name: string;
  description: string;
  tier: AchievementTier;
  type: AchievementType;
  unlockCondition: Record<string, any>;
  reward: Record<string, any>;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const AchievementSchema: Schema = new Schema(
  {
    achievementId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    tier: {
      type: String,
      required: true,
      enum: ["Bronze", "Silver", "Gold"],
    },
    type: {
      type: String,
      required: true,
      enum: ["Score", "Activity", "Event"],
    },
    unlockCondition: {
      type: Schema.Types.Mixed,
      required: true,
    },
    reward: {
      type: Schema.Types.Mixed,
      required: true,
    },
    enabled: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    collection: "achievements",
  }
);

export const Achievement = mongoose.model<IAchievement>(
  "Achievement",
  AchievementSchema
);

export interface IUserAchievement extends Document {
  userId: string;
  achievementId: string;
  unlockedAt: Date;
  guildId: string;
}

const UserAchievementSchema: Schema = new Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    achievementId: {
      type: String,
      required: true,
      index: true,
    },
    unlockedAt: {
      type: Date,
      default: Date.now,
    },
    guildId: {
      type: String,
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
    collection: "user_achievements",
  }
);

UserAchievementSchema.index({ userId: 1, achievementId: 1 }, { unique: true });

export const UserAchievement = mongoose.model<IUserAchievement>(
  "UserAchievement",
  UserAchievementSchema
);