import mongoose, { Schema, Document } from "mongoose";

export interface IMonitoredChannel extends Document {
  guildId: string;
  channelId: string;
  channelName?: string;
  addedBy: string; // User ID who added the channel
  addedAt: Date;
  isActive: boolean;
}

const MonitoredChannelSchema: Schema = new Schema(
  {
    guildId: {
      type: String,
      required: true,
      index: true,
    },
    channelId: {
      type: String,
      required: true,
      index: true,
    },
    channelName: {
      type: String,
      required: false,
    },
    addedBy: {
      type: String,
      required: true,
    },
    addedAt: {
      type: Date,
      default: Date.now,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    collection: "monitored_channels",
  }
);

// Compound index to ensure one channel per guild
MonitoredChannelSchema.index({ guildId: 1, channelId: 1 }, { unique: true });
MonitoredChannelSchema.index({ guildId: 1, isActive: 1 });

export const MonitoredChannel = mongoose.model<IMonitoredChannel>(
  "MonitoredChannel",
  MonitoredChannelSchema
);
