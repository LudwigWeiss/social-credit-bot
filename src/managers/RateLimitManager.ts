import { Logger } from "../utils/Logger.js";

interface UserCooldown {
  lastPositiveScore: number;
  lastAnalysis: number;
  messageBuffer: {
    content: string;
    timestamp: number;
    messageId: string;
  }[];
  totalMessagesInWindow: number;
  windowStart: number;
  bufferTimer?: NodeJS.Timeout;
}

export class RateLimitManager {
  private userCooldowns: Map<string, UserCooldown> = new Map();
  private analysisCallback?: (
    userId: string,
    guildId: string,
    messages: string[]
  ) => Promise<void>;

  // Configuration
  private readonly POSITIVE_SCORE_COOLDOWN = 5 * 60 * 1000; // 5 minutes for positive scores
  private readonly ANALYSIS_COOLDOWN = 30 * 1000; // 30 seconds between analyses
  private readonly MESSAGE_BUFFER_TIME = 30 * 1000; // 30 seconds buffer timeout
  private readonly MAX_MESSAGES_PER_MINUTE = 10; // Max messages per minute before rate limiting
  private readonly MESSAGE_BUFFER_SIZE = 5; // Max messages to buffer
  private readonly CONTEXT_HISTORY_SIZE = 3; // Previous messages to include for context

  constructor() {
    // Clean up old data every 10 minutes
    setInterval(() => this.cleanup(), 10 * 60 * 1000);
  }

  setAnalysisCallback(
    callback: (
      userId: string,
      guildId: string,
      messages: string[]
    ) => Promise<void>
  ): void {
    this.analysisCallback = callback;
  }

  private getUserKey(userId: string, guildId: string): string {
    return `${userId}-${guildId}`;
  }

  private getUserCooldown(userId: string, guildId: string): UserCooldown {
    const key = this.getUserKey(userId, guildId);
    if (!this.userCooldowns.has(key)) {
      this.userCooldowns.set(key, {
        lastPositiveScore: 0,
        lastAnalysis: 0,
        messageBuffer: [],
        totalMessagesInWindow: 0,
        windowStart: Date.now(),
      });
    }
    return this.userCooldowns.get(key)!;
  }

  canReceivePositiveScore(userId: string, guildId: string): boolean {
    const cooldown = this.getUserCooldown(userId, guildId);
    const now = Date.now();

    return now - cooldown.lastPositiveScore >= this.POSITIVE_SCORE_COOLDOWN;
  }

  // Bad behavior should NEVER be rate limited - always punish immediately
  shouldPunishBadBehavior(): boolean {
    return true; // Always punish bad behavior
  }

  markPositiveScore(userId: string, guildId: string): void {
    const cooldown = this.getUserCooldown(userId, guildId);
    cooldown.lastPositiveScore = Date.now();
  }

  shouldAnalyzeMessage(
    userId: string,
    guildId: string,
    messageContent: string,
    messageId: string
  ): {
    shouldAnalyze: boolean;
    reason: string;
    bufferedMessages?: string[];
    forceAnalysis?: boolean;
  } {
    const cooldown = this.getUserCooldown(userId, guildId);
    const now = Date.now();

    // Reset window if needed
    if (now - cooldown.windowStart > 60 * 1000) {
      cooldown.totalMessagesInWindow = 0;
      cooldown.windowStart = now;
      cooldown.messageBuffer = [];
    }

    cooldown.totalMessagesInWindow++;

    // Always analyze if enough time has passed since last analysis
    const timeSinceLastAnalysis = now - cooldown.lastAnalysis;
    const shouldAnalyzeNow = timeSinceLastAnalysis >= this.ANALYSIS_COOLDOWN;

    if (shouldAnalyzeNow) {
      // Time to analyze - include buffered messages
      const messagesToAnalyze = [
        ...cooldown.messageBuffer.map((m) => m.content),
        messageContent,
      ];

      // Clear buffer and timer after analysis
      this.clearBufferTimer(cooldown);
      cooldown.messageBuffer = [];
      cooldown.lastAnalysis = now;

      return {
        shouldAnalyze: true,
        reason: "ready_for_analysis",
        bufferedMessages: messagesToAnalyze,
      };
    }

    // If we can't analyze now, add to buffer
    cooldown.messageBuffer.push({
      content: messageContent,
      timestamp: now,
      messageId,
    });

    // Start buffer timer if this is the first message in buffer
    if (cooldown.messageBuffer.length === 1 && !cooldown.bufferTimer) {
      cooldown.bufferTimer = setTimeout(() => {
        this.flushBuffer(userId, guildId);
      }, this.MESSAGE_BUFFER_TIME);
    }

    // Keep buffer size manageable
    if (cooldown.messageBuffer.length > this.MESSAGE_BUFFER_SIZE) {
      cooldown.messageBuffer.shift();
    }

    // Check if buffer is getting full - force analysis if so
    if (cooldown.messageBuffer.length >= this.MESSAGE_BUFFER_SIZE) {
      this.clearBufferTimer(cooldown);
      const messagesToAnalyze = cooldown.messageBuffer.map((m) => m.content);
      cooldown.messageBuffer = [];
      cooldown.lastAnalysis = now;

      return {
        shouldAnalyze: true,
        reason: "buffer_full_force_analysis",
        bufferedMessages: messagesToAnalyze,
        forceAnalysis: true,
      };
    }

    return {
      shouldAnalyze: false,
      reason:
        cooldown.totalMessagesInWindow > this.MAX_MESSAGES_PER_MINUTE
          ? "rate_limited_buffering"
          : "analysis_cooldown",
    };
  }

  getTimeUntilNextPositiveScore(userId: string, guildId: string): number {
    const cooldown = this.getUserCooldown(userId, guildId);
    const timeLeft =
      this.POSITIVE_SCORE_COOLDOWN - (Date.now() - cooldown.lastPositiveScore);
    return Math.max(0, timeLeft);
  }

  getBufferedMessageCount(userId: string, guildId: string): number {
    const cooldown = this.getUserCooldown(userId, guildId);
    return cooldown.messageBuffer.length;
  }

  private flushBuffer(userId: string, guildId: string): void {
    const cooldown = this.getUserCooldown(userId, guildId);

    if (cooldown.messageBuffer.length > 0) {
      const messagesToAnalyze = cooldown.messageBuffer.map((m) => m.content);

      // Clear buffer and timer
      this.clearBufferTimer(cooldown);
      cooldown.messageBuffer = [];
      cooldown.lastAnalysis = Date.now();

      // Trigger analysis callback if available
      if (this.analysisCallback) {
        this.analysisCallback(userId, guildId, messagesToAnalyze).catch(
          (error) => {
            Logger.error("Error in buffer flush analysis callback:", error);
          }
        );
      }

      Logger.debug(
        `Buffer flushed for user ${userId}: ${messagesToAnalyze.length} messages analyzed`
      );
    }
  }

  private clearBufferTimer(cooldown: UserCooldown): void {
    if (cooldown.bufferTimer) {
      clearTimeout(cooldown.bufferTimer);
      cooldown.bufferTimer = undefined;
    }
  }

  private cleanup(): void {
    const now = Date.now();
    const cutoff = 30 * 60 * 1000; // 30 minutes

    for (const [key, cooldown] of this.userCooldowns.entries()) {
      // Remove old message buffers
      cooldown.messageBuffer = cooldown.messageBuffer.filter(
        (msg) => now - msg.timestamp < this.MESSAGE_BUFFER_TIME
      );

      // Clear timer if buffer is empty
      if (cooldown.messageBuffer.length === 0) {
        this.clearBufferTimer(cooldown);
      }

      // Remove completely inactive users
      if (
        now - cooldown.lastAnalysis > cutoff &&
        now - cooldown.lastPositiveScore > cutoff &&
        cooldown.messageBuffer.length === 0
      ) {
        this.clearBufferTimer(cooldown);
        this.userCooldowns.delete(key);
      }
    }

    Logger.debug(
      `Rate limit cleanup completed. Active users: ${this.userCooldowns.size}`
    );
  }

  // Get user's current rate limit status for debugging
  getUserStatus(
    userId: string,
    guildId: string
  ): {
    canReceivePositive: boolean;
    timeUntilPositive: number;
    bufferedMessages: number;
    messagesInWindow: number;
    windowTimeLeft: number;
  } {
    const cooldown = this.getUserCooldown(userId, guildId);
    const now = Date.now();

    return {
      canReceivePositive: this.canReceivePositiveScore(userId, guildId),
      timeUntilPositive: this.getTimeUntilNextPositiveScore(userId, guildId),
      bufferedMessages: cooldown.messageBuffer.length,
      messagesInWindow: cooldown.totalMessagesInWindow,
      windowTimeLeft: Math.max(0, 60 * 1000 - (now - cooldown.windowStart)),
    };
  }
}
