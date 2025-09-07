import mongoose, { Schema, Document } from "mongoose";

export interface IScoreHistory extends Document {
  userId: string;
  guildId: string;
  scoreChange: number;
  previousScore: number;
  newScore: number;
  reason: string;
  messageContent?: string;
  timestamp: Date;
  createdAt: Date;
}

const ScoreHistorySchema: Schema = new Schema(
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
    scoreChange: {
      type: Number,
      required: true,
      min: -100,
      max: 100,
    },
    previousScore: {
      type: Number,
      required: true,
    },
    newScore: {
      type: Number,
      required: true,
    },
    reason: {
      type: String,
      required: true,
      maxlength: 500,
    },
    messageContent: {
      type: String,
      required: false,
      maxlength: 1000,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
    collection: "score_history",
  }
);

// Compound indexes for efficient queries
ScoreHistorySchema.index({ userId: 1, guildId: 1, timestamp: -1 });
ScoreHistorySchema.index({ guildId: 1, timestamp: -1 });
ScoreHistorySchema.index({ timestamp: -1 }); // For cleanup operations

export const ScoreHistory = mongoose.model<IScoreHistory>(
  "ScoreHistory",
  ScoreHistorySchema
);
