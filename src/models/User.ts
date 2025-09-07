import mongoose, { Schema, Document } from "mongoose";

export interface IUser extends Document {
  userId: string;
  guildId: string;
  score: number;
  lastUpdated: Date;
  totalChanges: number;
  username?: string;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema: Schema = new Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    guildId: {
      type: String,
      required: true,
      index: true,
    },
    score: {
      type: Number,
      default: 0,
      min: -10000,
      max: 10000,
    },
    lastUpdated: {
      type: Date,
      default: Date.now,
    },
    totalChanges: {
      type: Number,
      default: 0,
      min: 0,
    },
    username: {
      type: String,
      required: false,
    },
  },
  {
    timestamps: true,
    collection: "users",
  }
);

// Compound index for efficient queries
UserSchema.index({ userId: 1, guildId: 1 }, { unique: true });
UserSchema.index({ guildId: 1, score: -1 }); // For leaderboards
UserSchema.index({ score: -1 }); // For global leaderboards

export const User = mongoose.model<IUser>("User", UserSchema);
