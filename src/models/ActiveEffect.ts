import mongoose, { Schema, Document } from "mongoose";

export type EffectType =
  | "NICKNAME_CHANGE"
  | "TIMEOUT"
  | "ROLE_GRANT"
  | "DAILY_CLAIM_RESET"
  | "EVENT_MULTIPLIER"
  | "CONFESSION_COOLDOWN"
  | "COMMUNITY_SERVICE_COOLDOWN"
  | "LOYALTY_QUIZ_COOLDOWN"
  | "PROPAGANDA_BROADCAST_COOLDOWN"
  | "IMAGINATION_FAVOR_COOLDOWN"
  | "INVESTIGATION_COOLDOWN";

export interface IActiveEffect extends Document {
  effectId: string;
  userId: string;
  guildId: string;
  effectType: EffectType;
  appliedAt: Date;
  expiresAt: Date;
  originalValue?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const ActiveEffectSchema: Schema = new Schema(
  {
    effectId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
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
    effectType: {
      type: String,
      required: true,
      enum: [
        "NICKNAME_CHANGE",
        "TIMEOUT",
        "ROLE_GRANT",
        "DAILY_CLAIM_RESET",
        "EVENT_MULTIPLIER",
        "CONFESSION_COOLDOWN",
        "COMMUNITY_SERVICE_COOLDOWN",
        "LOYALTY_QUIZ_COOLDOWN",
        "PROPAGANDA_BROADCAST_COOLDOWN",
        "IMAGINATION_FAVOR_COOLDOWN",
        "INVESTIGATION_COOLDOWN",
      ],
    },
    appliedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    originalValue: {
      type: String,
      required: false,
    },
    metadata: {
      type: Schema.Types.Mixed,
      required: false,
      default: {},
    },
  },
  {
    timestamps: true,
    collection: "activeeffects",
  }
);

// Compound indexes for efficient queries
ActiveEffectSchema.index({ userId: 1, guildId: 1 });
ActiveEffectSchema.index({ userId: 1, effectType: 1 });
ActiveEffectSchema.index({ guildId: 1, effectType: 1 });

// TTL index to automatically remove expired effects
ActiveEffectSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const ActiveEffect = mongoose.model<IActiveEffect>(
  "ActiveEffect",
  ActiveEffectSchema
);
