import { Message } from "discord.js";
import { Logger } from "../utils/Logger.js";

interface MessageContext {
  content: string;
  timestamp: number;
  userId: string;
  username: string;
}

export class MessageContextManager {
  private channelHistory: Map<string, MessageContext[]> = new Map();
  private readonly MAX_HISTORY_PER_CHANNEL = 50;
  private readonly CONTEXT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

  constructor() {
    // Clean up old messages every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  addMessage(message: Message): void {
    if (!message.guild) return;

    const channelKey = `${message.guild.id}-${message.channel.id}`;

    if (!this.channelHistory.has(channelKey)) {
      this.channelHistory.set(channelKey, []);
    }

    const history = this.channelHistory.get(channelKey)!;

    const messageContext: MessageContext = {
      content: message.content,
      timestamp: message.createdTimestamp,
      userId: message.author.id,
      username: message.author.username,
    };

    history.push(messageContext);

    // Keep only recent messages
    if (history.length > this.MAX_HISTORY_PER_CHANNEL) {
      history.shift();
    }
  }

  getRecentContext(
    guildId: string,
    channelId: string,
    excludeUserId: string,
    count: number = 3
  ): MessageContext[] {
    const channelKey = `${guildId}-${channelId}`;
    const history = this.channelHistory.get(channelKey) || [];
    const now = Date.now();

    // Get recent messages from other users (not the current user)
    return history
      .filter(
        (msg) =>
          msg.userId !== excludeUserId &&
          now - msg.timestamp < this.CONTEXT_WINDOW_MS
      )
      .slice(-count); // Get last N messages
  }

  getUserRecentMessages(
    guildId: string,
    channelId: string,
    userId: string,
    count: number = 5
  ): MessageContext[] {
    const channelKey = `${guildId}-${channelId}`;
    const history = this.channelHistory.get(channelKey) || [];
    const now = Date.now();

    // Get recent messages from specific user
    return history
      .filter(
        (msg) =>
          msg.userId === userId && now - msg.timestamp < this.CONTEXT_WINDOW_MS
      )
      .slice(-count); // Get last N messages
  }

  getInterleavedRecentContext(
    guildId: string,
    channelId: string,
    count: number = 5
  ): MessageContext[] {
    const channelKey = `${guildId}-${channelId}`;
    const history = this.channelHistory.get(channelKey) || [];
    const now = Date.now();

    return history
      .filter((msg) => now - msg.timestamp < this.CONTEXT_WINDOW_MS)
      .slice(-count);
  }

  buildContextString(
    userMessages: string[],
    recentContext: MessageContext[],
    currentMessage: string,
    authorUsername: string
  ): string {
    let contextString = "";

    // Add recent channel context
    if (recentContext.length > 0) {
      contextString += "Недавний контекст канала:\n";
      recentContext.forEach((msg) => {
        contextString += `${msg.username}: "${msg.content}"\n`;
      });
      contextString += "\n";
    }

    // Add user's recent messages if multiple
    if (userMessages.length > 1) {
      contextString += "Недавние сообщения пользователя:\n";
      userMessages.slice(0, -1).forEach((msg) => {
        contextString += `${authorUsername}: "${msg}"\n`;
      });
      contextString += "\n";
    }

    contextString += `Текущее сообщение для анализа от ${authorUsername}: "${currentMessage}"`;

    return contextString;
  }

  private cleanup(): void {
    const now = Date.now();
    let totalCleaned = 0;

    for (const [channelKey, history] of this.channelHistory.entries()) {
      const originalLength = history.length;

      // Remove messages older than context window
      const filtered = history.filter(
        (msg) => now - msg.timestamp < this.CONTEXT_WINDOW_MS
      );

      if (filtered.length === 0) {
        this.channelHistory.delete(channelKey);
      } else {
        this.channelHistory.set(channelKey, filtered);
      }

      totalCleaned += originalLength - filtered.length;
    }

    if (totalCleaned > 0) {
      Logger.debug(
        `Message context cleanup: removed ${totalCleaned} old messages from ${this.channelHistory.size} channels`
      );
    }
  }

  getChannelStats(): { totalChannels: number; totalMessages: number } {
    let totalMessages = 0;
    for (const history of this.channelHistory.values()) {
      totalMessages += history.length;
    }

    return {
      totalChannels: this.channelHistory.size,
      totalMessages,
    };
  }
}
