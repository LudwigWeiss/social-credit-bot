import {
  Client,
  TextChannel,
  EmbedBuilder,
  Message,
  GuildMember,
  MessageCollector,
} from "discord.js";
import { OpenAI } from "openai";
import { DatabaseManager } from "./DatabaseManager.js";
import { SocialCreditManager } from "./SocialCreditManager.js";
import { CONFIG } from "../config.js";
import { Logger } from "../utils/Logger.js";

export interface ActiveEvent {
  type: string;
  endTime: Date;
  data: unknown;
  activeChannels: Set<string>;
  title: string;
  description: string;
  effect: EventEffect;
}

export interface EventEffect {
  type: "SCORE_MODIFIER" | "SPECIAL_TASK" | "BEHAVIOR_RULE";
  score_multiplier?: number;
  task_description?: string;
  task_reward?: number;
}

export interface DynamicEventData {
  eventType: string;
  title: string;
  description: string;
  duration_minutes: number;
  effect: EventEffect;
}

export class EventManager {
  private activeEvents: Map<string, ActiveEvent> = new Map(); // guildId -> event
  private eventTimeouts: Map<string, NodeJS.Timeout> = new Map();

  constructor(
    private client: Client,
    private openai: OpenAI,
    private databaseManager: DatabaseManager,
    private socialCreditManager: SocialCreditManager
  ) {}

  /**
   * Start a random event for a guild
   */
  async startRandomEvent(guildId: string): Promise<void> {
    // Don't start a new event if one is already active
    if (this.activeEvents.has(guildId)) {
      Logger.debug(
        `Event already active in guild ${guildId}, skipping random event`
      );
      return;
    }

    const eventTypes = [
      "PARTY_INSPECTOR_VISIT",
      "SOCIAL_HARMONY_HOUR",
      "WESTERN_SPY_INFILTRATION",
      "PRODUCTION_QUOTA",
      "DYNAMIC_EVENT",
    ];

    const selectedType =
      eventTypes[Math.floor(Math.random() * eventTypes.length)];

    if (selectedType === "DYNAMIC_EVENT") {
      await this.startDynamicEvent(guildId);
    } else {
      await this.startPredefinedEvent(guildId, selectedType);
    }
  }

  /**
   * Generate and start a dynamic event using LLM
   */
  async generateDynamicEvent(
    guildId: string
  ): Promise<DynamicEventData | null> {
    const prompt = `You are a creative event designer for a meme-themed Discord bot based on the Chinese Social Credit System. Generate a new, random event for a server. The event should last between 15 minutes and 1 hour.

Your response MUST be in this exact JSON format:
{
  "eventType": "UNIQUE_EVENT_NAME_IN_UPPER_SNAKE_CASE",
  "title": "Thematic and funny event title (e.g., 'SURPRISE IDEOLOGY INSPECTION!')",
  "description": "A description of the event for the players, explaining the rules and duration. Be creative and humorous.",
  "duration_minutes": a number between 15 and 60,
  "effect": {
    "type": "SCORE_MODIFIER" | "SPECIAL_TASK" | "BEHAVIOR_RULE",
    "score_multiplier": a number (e.g., 2 for double points, 0 for no negative points),
    "task_description": "A specific task for users if type is SPECIAL_TASK (e.g., 'The first person to say a glorious poem about rice wins')",
    "task_reward": a number
  }
}`;

    try {
      const completion = await this.openai.chat.completions.create({
        model: CONFIG.LLM.STANDARD_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.8,
        max_tokens: 800,
      });

      const response = completion.choices?.[0]?.message?.content;
      if (!response) {
        Logger.error("No response from OpenAI for dynamic event generation");
        return null;
      }

      // Clean up the response
      let jsonString = response.replace(/```json\s*|\s*```/g, "").trim();

      const jsonStartIndex = jsonString.indexOf("{");
      const jsonEndIndex = jsonString.lastIndexOf("}");

      if (
        jsonStartIndex !== -1 &&
        jsonEndIndex !== -1 &&
        jsonEndIndex > jsonStartIndex
      ) {
        jsonString = jsonString.substring(jsonStartIndex, jsonEndIndex + 1);
      }

      const eventData: DynamicEventData = JSON.parse(jsonString);

      // Validate the event data
      if (
        !eventData.eventType ||
        !eventData.title ||
        !eventData.description ||
        !eventData.duration_minutes ||
        !eventData.effect
      ) {
        throw new Error("Invalid event data structure");
      }

      if (eventData.duration_minutes < 15 || eventData.duration_minutes > 60) {
        eventData.duration_minutes = Math.max(
          15,
          Math.min(60, eventData.duration_minutes)
        );
      }

      Logger.info(
        `Generated dynamic event: ${eventData.eventType} for guild ${guildId}`
      );
      return eventData;
    } catch (error) {
      Logger.error(
        `Error generating dynamic event for guild ${guildId}:`,
        error
      );
      return null;
    }
  }

  /**
   * Start a dynamic event
   */
  async startDynamicEvent(guildId: string): Promise<void> {
    const eventData = await this.generateDynamicEvent(guildId);
    if (!eventData) {
      // Fallback to a predefined event
      await this.startPredefinedEvent(guildId, "PARTY_INSPECTOR_VISIT");
      return;
    }

    const durationMs = eventData.duration_minutes * 60 * 1000;
    const endTime = new Date(Date.now() + durationMs);

    const activeEvent: ActiveEvent = {
      type: eventData.eventType,
      endTime,
      data: eventData,
      activeChannels: new Set(),
      title: eventData.title,
      description: eventData.description,
      effect: eventData.effect,
    };

    this.activeEvents.set(guildId, activeEvent);

    // Announce the event in a random monitored channel
    await this.announceEventInGuild(guildId, activeEvent);

    // Set timeout to end the event
    const timeout = setTimeout(() => {
      this.endEvent(guildId);
    }, durationMs);

    this.eventTimeouts.set(guildId, timeout);
    Logger.info(
      `Started dynamic event ${eventData.eventType} in guild ${guildId} for ${eventData.duration_minutes} minutes`
    );
  }

  /**
   * Start a predefined event
   */
  async startPredefinedEvent(
    guildId: string,
    eventType: string
  ): Promise<void> {
    let duration: number;
    let title: string;
    let description: string;
    let effect: EventEffect;

    switch (eventType) {
      case "PARTY_INSPECTOR_VISIT":
        duration = CONFIG.EVENTS.PARTY_INSPECTOR_DURATION;
        title = "🚨 VISIT FROM THE PARTY INSPECTOR!";
        description =
          "**ATTENTION, CITIZENS!**\n\n" +
          "A Party Inspector has arrived for an audit! For the next 15 minutes, all social credit changes are **doubled**!\n\n" +
          "Prove your loyalty to the Party! 🇨🇳";
        effect = {
          type: "SCORE_MODIFIER",
          score_multiplier: CONFIG.EVENTS.PARTY_INSPECTOR_MULTIPLIER,
        };
        break;

      case "SOCIAL_HARMONY_HOUR":
        duration = CONFIG.EVENTS.SOCIAL_HARMONY_DURATION;
        title = "🕊️ HOUR OF SOCIAL HARMONY";
        description =
          "**THE BLESSED HOUR HAS BEGUN!**\n\n" +
          "For the next hour, only **positive** social credit changes are possible!\n\n" +
          "Share kindness and loyalty! 💝";
        effect = { type: "BEHAVIOR_RULE", score_multiplier: 0 };
        break;

      case "WESTERN_SPY_INFILTRATION":
        duration = CONFIG.EVENTS.SPY_INFILTRATION_DURATION;
        title = "🕵️ INFILTRATION BY A WESTERN SPY!";
        description =
          "**ALERT!**\n\n" +
          "A Western spy has infiltrated our ranks! The first to say the correct patriotic phrase will receive **+50** social credit!\n\n" +
          'Phrase: **"The Party is always right!"**\n\n' +
          "⏱️ You have 5 minutes!";
        effect = {
          type: "SPECIAL_TASK",
          task_description: "The Party is always right!",
          task_reward: CONFIG.EVENTS.SPY_INFILTRATION_BONUS,
        };
        break;

      case "PRODUCTION_QUOTA":
        duration = CONFIG.EVENTS.PRODUCTION_QUOTA_DURATION;
        title = "🏭 PRODUCTION QUOTA!";
        description =
          "**THE PARTY DEMANDS PRODUCTION!**\n\n" +
          "Send **50 messages** in monitored channels in the next 10 minutes!\n\n" +
          "Upon success, all online users will receive **+10** social credit!\n\n" +
          "To work, comrades! ⚒️";
        effect = {
          type: "SPECIAL_TASK",
          task_description: "Send 50 messages collectively",
          task_reward: CONFIG.EVENTS.PRODUCTION_QUOTA_BONUS,
        };
        break;

      default:
        Logger.error(`Unknown event type: ${eventType}`);
        return;
    }

    const endTime = new Date(Date.now() + duration);
    const activeEvent: ActiveEvent = {
      type: eventType,
      endTime,
      data: { eventType, duration_minutes: duration / (60 * 1000) },
      activeChannels: new Set(),
      title,
      description,
      effect,
    };

    this.activeEvents.set(guildId, activeEvent);

    // Handle special event logic
    switch (eventType) {
      case "WESTERN_SPY_INFILTRATION":
        await this.handleWesternSpyInfiltration(guildId);
        break;
      case "PRODUCTION_QUOTA":
        await this.handleProductionQuota(guildId);
        break;
      default:
        await this.announceEventInGuild(guildId, activeEvent);
        break;
    }

    // Set timeout to end the event
    const timeout = setTimeout(() => {
      this.endEvent(guildId);
    }, duration);

    this.eventTimeouts.set(guildId, timeout);
    Logger.info(`Started predefined event ${eventType} in guild ${guildId}`);
  }

  /**
   * Announce event in a random monitored channel for the guild
   */
  private async announceEventInGuild(
    guildId: string,
    event: ActiveEvent
  ): Promise<void> {
    try {
      const monitoredChannels =
        await this.databaseManager.getMonitoredChannels(guildId);
      if (monitoredChannels.length === 0) {
        Logger.warn(`No monitored channels found for guild ${guildId}`);
        return;
      }

      // Pick a random channel to announce in
      const randomChannelId =
        monitoredChannels[Math.floor(Math.random() * monitoredChannels.length)];
      const channel = this.client.channels.cache.get(randomChannelId);

      if (!channel || !channel.isTextBased()) {
        Logger.warn(`Channel ${randomChannelId} not found or not text-based`);
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(this.getEventColor(event.type))
        .setTitle(event.title)
        .setDescription(event.description)
        .setFooter({ text: "The Party is watching! 👁️" })
        .setTimestamp();

      await (channel as TextChannel).send({ embeds: [embed] });
      Logger.info(
        `Announced event ${event.type} in channel ${randomChannelId} for guild ${guildId}`
      );
    } catch (error) {
      Logger.error(`Error announcing event in guild ${guildId}:`, error);
    }
  }

  /**
   * Handle Western Spy Infiltration event
   */
  private async handleWesternSpyInfiltration(guildId: string): Promise<void> {
    const event = this.activeEvents.get(guildId);
    if (!event || event.type !== "WESTERN_SPY_INFILTRATION") return;

    const correctPhrase =
      event.effect.task_description || "The Party is always right!";
    let spyCaught = false;

    // Announce in a random monitored channel
    const monitoredChannels =
      await this.databaseManager.getMonitoredChannels(guildId);
    if (monitoredChannels.length === 0) return;

    const randomChannelId =
      monitoredChannels[Math.floor(Math.random() * monitoredChannels.length)];
    const channel = this.client.channels.cache.get(
      randomChannelId
    ) as TextChannel;
    if (!channel) return;

    await this.announceEventInGuild(guildId, event);

    // Set up message collector for the spy phrase
    const collector = channel.createMessageCollector({
      filter: (message: Message) =>
        !message.author.bot && message.content.trim() === correctPhrase,
      max: 1,
      time: CONFIG.EVENTS.SPY_INFILTRATION_DURATION,
    });

    collector.on("collect", async (message: Message) => {
      if (spyCaught) return;
      spyCaught = true;

      const reward =
        event.effect.task_reward || CONFIG.EVENTS.SPY_INFILTRATION_BONUS;
      const newScore = await this.socialCreditManager.updateScore(
        message.author.id,
        guildId,
        reward,
        "Caught a western spy - vigilance demonstrated!",
        message.author.username
      );

      const rewardEmbed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle("🎯 SPY CAUGHT!")
        .setDescription(
          `**${message.author.username}** showed vigilance and caught the western spy!\n\n` +
            `Reward: **+${reward}** social credit!`
        )
        .addFields({
          name: "💯 New Score",
          value: `${newScore}`,
          inline: true,
        })
        .setFooter({ text: "The Party thanks you for your vigilance! 👁️" })
        .setTimestamp();

      await channel.send({ embeds: [rewardEmbed] });
      Logger.info(
        `Spy caught by user ${message.author.id} in guild ${guildId}`
      );
    });

    collector.on("end", () => {
      if (!spyCaught) {
        const failEmbed = new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle("⚠️ SPY ESCAPED!")
          .setDescription(
            "The Western spy has successfully escaped! Be more vigilant next time."
          )
          .setFooter({ text: "The Party will continue the fight against espionage! 🕵️" })
          .setTimestamp();

        channel.send({ embeds: [failEmbed] }).catch(() => {});
      }
    });
  }

  /**
   * Handle Production Quota event
   */
  private async handleProductionQuota(guildId: string): Promise<void> {
    const event = this.activeEvents.get(guildId);
    if (!event || event.type !== "PRODUCTION_QUOTA") return;

    const guild = this.client.guilds.cache.get(guildId);
    if (!guild) return;

    const requiredMessages = 50;
    let messageCount = 0;
    const participants = new Set<string>();

    await this.announceEventInGuild(guildId, event);

    // Set up message collectors for all monitored channels in this guild
    const monitoredChannels =
      await this.databaseManager.getMonitoredChannels(guildId);
    const collectors: MessageCollector[] = [];

    for (const channelId of monitoredChannels) {
      const targetChannel = this.client.channels.cache.get(channelId);
      if (!targetChannel || !targetChannel.isTextBased()) continue;

      const collector = (targetChannel as TextChannel).createMessageCollector({
        filter: (message: Message) => !message.author.bot,
        time: CONFIG.EVENTS.PRODUCTION_QUOTA_DURATION,
      });

      collector.on("collect", (message: Message) => {
        messageCount++;
        participants.add(message.author.id);
      });

      collectors.push(collector);
    }

    // Wait for the event to end
    setTimeout(async () => {
      collectors.forEach((collector) => collector.stop());

      const reward =
        event.effect.task_reward || CONFIG.EVENTS.PRODUCTION_QUOTA_BONUS;
      const randomChannelId =
        monitoredChannels[Math.floor(Math.random() * monitoredChannels.length)];
      const channel = this.client.channels.cache.get(
        randomChannelId
      ) as TextChannel;

      if (!channel) return;

      if (messageCount >= requiredMessages) {
        // Success - reward all online participants
        const onlineMembers = guild.members.cache.filter(
          (member: GuildMember) =>
            !member.user.bot && member.presence?.status !== "offline"
        );

        let rewardedCount = 0;
        for (const member of onlineMembers.values()) {
          try {
            await this.socialCreditManager.updateScore(
              member.id,
              guildId,
              reward,
              "Fulfilling the Party's production quota",
              member.user.username
            );
            rewardedCount++;
          } catch (error) {
            Logger.error(`Failed to reward user ${member.id}: ${error}`);
          }
        }

        const successEmbed = new EmbedBuilder()
          .setColor(0x00ff00)
          .setTitle("🎉 QUOTA MET!")
          .setDescription(
            `**PLAN EXCEEDED!**\n\n` +
              `Sent **${messageCount}** messages (required: ${requiredMessages})\n` +
              `**${participants.size}** citizens participated\n` +
              `**${rewardedCount}** online users rewarded!\n\n` +
              `Everyone received **+${reward}** social credit!`
          )
          .setFooter({ text: "The Party is proud of your hard work! 🏭" })
          .setTimestamp();

        await channel.send({ embeds: [successEmbed] });
      } else {
        const failEmbed = new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle("❌ QUOTA FAILED!")
          .setDescription(
            `**PLAN FAILED!**\n\n` +
              `Only **${messageCount}** messages sent (required: ${requiredMessages})\n\n` +
              `The Party expects better results next time.`
          )
          .setFooter({ text: "Increase productivity! 📉" })
          .setTimestamp();

        await channel.send({ embeds: [failEmbed] });
      }

      Logger.info(
        `Production quota ended in guild ${guildId}: ${messageCount}/${requiredMessages} messages`
      );
    }, CONFIG.EVENTS.PRODUCTION_QUOTA_DURATION);
  }

  /**
   * End an active event
   */
  endEvent(guildId: string): void {
    const event = this.activeEvents.get(guildId);
    if (!event) return;

    this.activeEvents.delete(guildId);

    const timeout = this.eventTimeouts.get(guildId);
    if (timeout) {
      clearTimeout(timeout);
      this.eventTimeouts.delete(guildId);
    }

    Logger.info(`Ended event ${event.type} in guild ${guildId}`);
  }

  /**
   * Check if guild has active event and return its details
   */
  getActiveEvent(guildId: string): ActiveEvent | undefined {
    return this.activeEvents.get(guildId);
  }

  /**
   * Get all active events
   */
  getAllActiveEvents(): Map<string, ActiveEvent> {
    return new Map(this.activeEvents);
  }

  /**
   * Apply event effects to score changes
   */
  applyEventEffects(guildId: string, scoreChange: number): number {
    const event = this.activeEvents.get(guildId);
    if (!event || !event.effect) return scoreChange;

    switch (event.effect.type) {
      case "SCORE_MODIFIER":
        if (event.effect.score_multiplier !== undefined) {
          if (event.type === "SOCIAL_HARMONY_HOUR" && scoreChange < 0) {
            // Block negative changes during harmony hour
            return 0;
          }
          return Math.round(scoreChange * event.effect.score_multiplier);
        }
        break;
      case "BEHAVIOR_RULE":
        if (event.effect.score_multiplier === 0 && scoreChange < 0) {
          // Block negative changes
          return 0;
        }
        break;
    }

    return scoreChange;
  }

  /**
   * Get event color based on event type
   */
  private getEventColor(eventType: string): number {
    switch (eventType) {
      case "PARTY_INSPECTOR_VISIT":
        return 0xff0000; // Red
      case "SOCIAL_HARMONY_HOUR":
        return 0x00ff00; // Green
      case "WESTERN_SPY_INFILTRATION":
        return 0xff4500; // Orange Red
      case "PRODUCTION_QUOTA":
        return 0xffd700; // Gold
      default:
        return 0x0099ff; // Blue
    }
  }

  /**
   * Cleanup method for graceful shutdown
   */
  cleanup(): void {
    // Clear all timeouts
    for (const timeout of this.eventTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.eventTimeouts.clear();
    this.activeEvents.clear();
    Logger.info("EventManager cleanup completed");
  }
}
