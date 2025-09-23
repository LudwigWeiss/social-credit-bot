import {
  Client,
  GatewayIntentBits,
  Events,
  Message,
  EmbedBuilder,
  SlashCommandBuilder,
  REST,
  Routes,
  ChannelType,
  TextChannel,
  GuildMember,
  MessageCollector,
  Webhook,
} from "discord.js";
import { Mistral } from "@mistralai/mistralai";
import * as dotenv from "dotenv";
import { SocialCreditManager } from "./managers/SocialCreditManager.js";
import { DatabaseManager } from "./managers/DatabaseManager.js";
import { EffectManager } from "./managers/EffectManager.js";
import { Scheduler } from "./managers/Scheduler.js";
import { HealthCheck } from "./HealthCheck.js";
import { MemeResponses } from "./utils/MemeResponses.js";
import { CommandHandler } from "./handlers/CommandHandler.js";
import { Logger } from "./utils/Logger.js";
import { Validators } from "./utils/Validators.js";
import { RateLimitManager } from "./managers/RateLimitManager.js";
import { MessageContextManager } from "./managers/MessageContextManager.js";
import { MessageAnalysisResult, MessageContextEntry } from "./types/index.js";
import { CONFIG } from "./config.js";

dotenv.config();

class SocialCreditBot {
  private client: Client;
  private mistral: Mistral;
  private socialCreditManager: SocialCreditManager;
  private databaseManager: DatabaseManager;
  private effectManager: EffectManager;
  private scheduler: Scheduler;
  private healthCheck: HealthCheck;
  private commandHandler: CommandHandler;
  private rateLimitManager: RateLimitManager;
  private messageContextManager: MessageContextManager;
  private activeEvents: Map<string, { type: string; endTime: Date }> =
    new Map();

  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
      ],
    });

    this.mistral = new Mistral({
      apiKey: process.env.MISTRAL_API_KEY || "",
    });

    this.databaseManager = new DatabaseManager();
    this.socialCreditManager = new SocialCreditManager(this.databaseManager);
    this.effectManager = new EffectManager(this.databaseManager);
    this.scheduler = new Scheduler(this.effectManager, this.databaseManager);
    this.healthCheck = new HealthCheck(this.client, this.databaseManager);
    this.rateLimitManager = new RateLimitManager();
    this.messageContextManager = new MessageContextManager();

    // Set up buffer analysis callback
    this.rateLimitManager.setAnalysisCallback(
      this.analyzeBufferedMessages.bind(this)
    );

    this.commandHandler = new CommandHandler(
      this.socialCreditManager,
      this.databaseManager,
      this.effectManager,
      this.mistral,
      this.rateLimitManager,
      this.messageContextManager
    );

    // Set up event callback
    this.scheduler.setEventCallback(this.handleRandomEvent.bind(this));

    this.setupEventListeners();

    // Clean up expired events every minute
    setInterval(() => {
      const now = new Date();
      for (const [guildId, event] of this.activeEvents.entries()) {
        if (event.endTime <= now) {
          this.activeEvents.delete(guildId);
          Logger.debug(
            `Cleaned up expired event ${event.type} in guild ${guildId}`
          );
        }
      }
    }, 60 * 1000);
  }

  private setupEventListeners(): void {
    this.client.once(Events.ClientReady, (readyClient) => {
      Logger.info(
        `🚀 ${readyClient.user.tag} is ready to monitor social credits!`
      );
      this.registerCommands();
    });

    this.client.on(Events.MessageCreate, this.handleMessage.bind(this));
    this.client.on(Events.InteractionCreate, (interaction) => {
      this.commandHandler.handleInteraction(interaction).catch((error) => {
        Logger.error("Error handling interaction:", error);
      });
    });
  }

  private async handleMessage(message: Message): Promise<void> {
    // Ignore bot messages and non-monitored channels
    if (message.author.bot) return;
    const guildId = message.guild?.id || "dm";
    if (!this.commandHandler.isChannelMonitored(guildId, message.channelId))
      return;

    // Add message to context history
    this.messageContextManager.addMessage(message);

    // Skip messages with attachments, links, or embeds
    if (
      message.attachments.size > 0 ||
      message.embeds.length > 0 ||
      Validators.containsLinks(message.content)
    ) {
      return;
    }

    // Skip empty messages
    if (!message.content.trim()) return;

    const userId = message.author.id;
    const sanitizedContent = Validators.sanitizeMessage(message.content);

    // Check for critically bad keywords (immediate penalty, no AI cost)
    if (this.hasCriticallyBadKeywords(sanitizedContent)) {
      await this.applyKeywordPenalty(message, sanitizedContent);
      return; // Don't process further
    }

    // Check for speech re-education (critically low scores)
    const userScore = await this.socialCreditManager.getUserScore(
      userId,
      guildId
    );
    if (userScore <= CONFIG.SCORE_THRESHOLDS.PENALTIES.SEVERE) {
      await this.applySpeechReeducation(message, sanitizedContent);
      return; // Don't process further
    }

    // Check rate limiting and buffering
    const rateLimitResult = this.rateLimitManager.shouldAnalyzeMessage(
      userId,
      guildId,
      sanitizedContent,
      message.id,
      message.channelId
    );

    if (!rateLimitResult.shouldAnalyze) {
      // Log rate limiting but don't return yet - we might need to check for immediate bad behavior
      if (rateLimitResult.reason === "rate_limited_buffering") {
        Logger.debug(`User ${userId} is being rate limited, buffering message`);
      } else if (rateLimitResult.reason === "analysis_cooldown") {
        Logger.debug(`User ${userId} analysis on cooldown, buffering message`);
      }
      return;
    }

    try {
      // Get context for analysis
      const recentContext =
        this.messageContextManager.getInterleavedRecentContext(
          guildId,
          message.channelId,
          5
        );

      const messagesToAnalyze = rateLimitResult.bufferedMessages || [
        sanitizedContent,
      ];
      const analysis = await this.analyzeMessageWithContext(
        messagesToAnalyze,
        recentContext,
        sanitizedContent,
        message.author.username,
        userId,
        guildId
      );

      await this.processAnalysis(message, analysis, sanitizedContent);
    } catch (error) {
      Logger.error("Error processing message:", error);
    }
  }

  private async analyzeMessageWithContext(
    userMessages: string[],
    recentContext: MessageContextEntry[],
    currentMessage: string,
    authorUsername: string,
    userId?: string,
    guildId?: string
  ): Promise<MessageAnalysisResult> {
    const contextString = this.messageContextManager.buildContextString(
      userMessages,
      recentContext,
      currentMessage,
      authorUsername
    );

    // Dynamic prompting based on user history
    let useCheapModel = false;
    let simplifiedPrompt = false;

    if (userId && guildId) {
      const userScore = await this.socialCreditManager.getUserScore(
        userId,
        guildId
      );
      const userHistory = await this.socialCreditManager.getUserHistory(
        userId,
        guildId,
        10
      );

      // Use cheap model for neutral users with consistent neutral history
      const recentVerdicts = userHistory.slice(0, 5).map((h) => {
        if (h.scoreChange > 0) return "good";
        if (h.scoreChange < 0) return "bad";
        return "neutral";
      });

      const neutralRatio =
        recentVerdicts.filter((v) => v === "neutral").length /
        recentVerdicts.length;
      if (Math.abs(userScore) < 50 && neutralRatio > 0.6) {
        useCheapModel = true;
        simplifiedPrompt = true;
      }
    }

    const prompt = simplifiedPrompt
      ? `Анализируй сообщение на предмет отношения к Китаю/Партии. Отвечай ТОЛЬКО JSON: {"verdict": "good/bad/neutral", "score_change": число, "reason": "кратко", "meme_response": "мемно"}`
      : `Ты - Верховный ИИ Китайской Системы Социального Рейтинга (мем версия). Проанализируй сообщения пользователя с учётом контекста и определи, хорошо ли это, плохо или нейтрально для социального рейтинга.

${contextString}

ВАЖНО: Отвечай ТОЛЬКО чистым JSON без markdown блоков, без дополнительного текста, без объяснений!

Формат ответа:
{
    "verdict": "good" | "bad" | "neutral",
    "score_change": число (от -100 до 100, 0 для нейтрального),
    "reason": "ОЧЕНЬ краткое мем объяснение (1-2 предложения) в стиле Китайской Системы Социального Рейтинга",
    "meme_response": "ОЧЕНЬ краткий и смешной ответ (1-2 предложения) как будто ты ИИ системы социального рейтинга"
}

Правила:
- Хорошо: Похвала Китая, коммунизма, Си Цзиньпина, быть продуктивным гражданином, следовать правилам
- Плохо: Только прямая критика Китая, КПК, социализма или Си Цзиньпина. Обычные плохие слова или антисоциальное поведение не должны вызывать негативной реакции, если они не нацелены на Китай.
- Нейтрально: Обычный разговор, вопросы, случайные темы, не связанные с Китаем.
- Делай ответы мемными и смешными, и краткими
- Изменения рейтинга: Хорошо (10 до 100), Плохо (-10 до -100), Нейтрально (0)
- Отвечай на русском языке
- НЕ используй markdown блоки в ответе!`;

    const completion = await this.mistral.chat.complete({
      model: useCheapModel ? CONFIG.LLM.CHEAP_MODEL : CONFIG.LLM.STANDARD_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: CONFIG.LLM.TEMPERATURE,
      maxTokens: CONFIG.LLM.MAX_TOKENS,
    });

    const response = completion.choices?.[0]?.message?.content;
    if (!response) throw new Error("No response from Mistral AI");

    // Handle different response types from Mistral
    const responseText =
      typeof response === "string" ? response : JSON.stringify(response);

    // Remove markdown code blocks if present
    // Remove markdown code blocks and extract JSON object
    let jsonString = responseText.replace(/```json\s*|\s*```/g, "").trim();

    const jsonStartIndex = jsonString.indexOf("{");
    const jsonEndIndex = jsonString.lastIndexOf("}");

    if (
      jsonStartIndex !== -1 &&
      jsonEndIndex !== -1 &&
      jsonEndIndex > jsonStartIndex
    ) {
      jsonString = jsonString.substring(jsonStartIndex, jsonEndIndex + 1);
    }

    try {
      const parsed = JSON.parse(jsonString);

      // Validate the response structure
      if (
        !parsed.verdict ||
        !["good", "bad", "neutral"].includes(parsed.verdict)
      ) {
        throw new Error("Invalid verdict in response");
      }

      parsed.score_change = Number(parsed.score_change);
      if (!Validators.isValidScoreChange(parsed.score_change)) {
        throw new Error("Invalid score change in response");
      }

      return parsed;
    } catch {
      Logger.error("Failed to parse Mistral AI response:", jsonString);
      Logger.error("Original response:", responseText);
      throw new Error("Invalid JSON response from Mistral AI");
    }
  }

  private async processAnalysis(
    message: Message,
    analysis: MessageAnalysisResult,
    sanitizedContent: string
  ): Promise<void> {
    if (analysis.verdict === "neutral") return;

    const userId = message.author.id;
    const guildId = message.guild?.id || "dm";

    // Handle score changes based on verdict
    if (analysis.verdict === "good" && analysis.score_change > 0) {
      // Check positive score cooldown only for good behavior
      if (!this.rateLimitManager.canReceivePositiveScore(userId, guildId)) {
        const timeLeft = this.rateLimitManager.getTimeUntilNextPositiveScore(
          userId,
          guildId
        );
        const minutesLeft = Math.ceil(timeLeft / (60 * 1000));

        const cooldownEmbed = new EmbedBuilder()
          .setColor(0xffff00)
          .setTitle("⏰ КУЛДАУН ПОЛОЖИТЕЛЬНОГО РЕЙТИНГА")
          .setDescription(
            `🚫 Слишком рано для повышения рейтинга, гражданин!\n\n⏱️ Подождите ещё **${minutesLeft} минут** перед следующим повышением.\n\n💡 *Система предотвращает спам хороших сообщений!*`
          )
          .setFooter({ text: "Партия контролирует темп роста! 👁️" })
          .setTimestamp();

        await message.reply({ embeds: [cooldownEmbed] });
        return;
      }

      // Mark positive score given
      this.rateLimitManager.markPositiveScore(userId, guildId);
    } else if (analysis.verdict === "bad") {
      // Bad behavior is NEVER rate limited - always punish immediately
      Logger.info(
        `Punishing bad behavior from user ${userId}: ${analysis.reason}`
      );
    }

    // Check for active events that modify score changes
    let modifiedScoreChange = analysis.score_change;
    const activeEvent = this.activeEvents.get(guildId);

    if (activeEvent) {
      if (activeEvent.type === "PARTY_INSPECTOR_VISIT") {
        // Double all score changes during inspector visit
        modifiedScoreChange *= CONFIG.EVENTS.PARTY_INSPECTOR_MULTIPLIER;
      } else if (activeEvent.type === "SOCIAL_HARMONY_HOUR") {
        // Only allow positive changes during harmony hour
        if (modifiedScoreChange < 0) {
          modifiedScoreChange = 0;
        }
      }
    }

    // Update user's social credit score
    const newScore = await this.socialCreditManager.updateScore(
      userId,
      guildId,
      modifiedScoreChange,
      analysis.score_change !== modifiedScoreChange
        ? `${analysis.reason} (Modified by active event: ${activeEvent?.type})`
        : analysis.reason,
      message.author.username,
      sanitizedContent
    );

    // Log the social credit change
    Logger.socialCredit(userId, analysis.score_change, analysis.reason);

    // Create response embed
    const embed = this.createResponseEmbed(message.author, analysis, newScore);

    // Send response
    await message.reply({ embeds: [embed] });

    // Check for penalties or privileges
    await this.checkScoreThresholds(message, newScore);
  }

  private createResponseEmbed(
    author: { username: string; displayAvatarURL?: () => string },
    analysis: MessageAnalysisResult,
    newScore: number
  ): EmbedBuilder {
    const isGood = analysis.verdict === "good";
    const color = isGood ? 0x00ff00 : 0xff0000;
    const emoji = isGood ? "🎉" : "⚠️";
    const title = isGood
      ? "🇨🇳 СОЦИАЛЬНЫЙ РЕЙТИНГ ПОВЫШЕН! 🇨🇳"
      : "🚨 СОЦИАЛЬНЫЙ РЕЙТИНГ ПОНИЖЕН! 🚨";

    return new EmbedBuilder()
      .setColor(color)
      .setTitle(title)
      .setDescription(`${emoji} **${analysis.meme_response}**`)
      .addFields(
        {
          name: "📊 Изменение Рейтинга",
          value: `${analysis.score_change > 0 ? "+" : ""}${analysis.score_change}`,
          inline: true,
        },
        { name: "💯 Текущий Рейтинг", value: `${newScore}`, inline: true },
        { name: "📝 Причина", value: analysis.reason, inline: false }
      )
      .setFooter({
        text: `${author.username} | 中华人民共和国万岁!`,
        iconURL: author.displayAvatarURL
          ? author.displayAvatarURL()
          : undefined,
      })
      .setTimestamp();
  }

  private async checkScoreThresholds(
    message: Message,
    score: number
  ): Promise<void> {
    const member = message.member;
    if (!member) return;

    const userId = message.author.id;
    const guildId = message.guild?.id || "dm";

    // Low score penalties
    if (score <= CONFIG.SCORE_THRESHOLDS.PENALTIES.SEVERE) {
      await this.applyPenalty(member, "SEVERE", userId, guildId);
    } else if (score <= CONFIG.SCORE_THRESHOLDS.PENALTIES.MODERATE) {
      await this.applyPenalty(member, "MODERATE", userId, guildId);
    } else if (score <= CONFIG.SCORE_THRESHOLDS.PENALTIES.MILD) {
      await this.applyPenalty(member, "MILD", userId, guildId);
    }

    // Remove penalties if score improved
    if (score > CONFIG.SCORE_THRESHOLDS.PENALTIES.MILD) {
      await this.removePenalty(member, "MILD", userId, guildId);
    }
    if (score > CONFIG.SCORE_THRESHOLDS.PENALTIES.MODERATE) {
      await this.removePenalty(member, "MODERATE", userId, guildId);
    }

    // High score privileges
    if (score >= CONFIG.SCORE_THRESHOLDS.PRIVILEGES.SUPREME_CITIZEN) {
      await this.grantPrivilege(member, "SUPREME_CITIZEN", userId, guildId);
    } else if (score >= CONFIG.SCORE_THRESHOLDS.PRIVILEGES.MODEL_CITIZEN) {
      await this.grantPrivilege(member, "MODEL_CITIZEN", userId, guildId);
    } else if (score >= CONFIG.SCORE_THRESHOLDS.PRIVILEGES.GOOD_CITIZEN) {
      await this.grantPrivilege(member, "GOOD_CITIZEN", userId, guildId);
    }
  }

  private async applyPenalty(
    member: GuildMember,
    severity: string,
    userId: string,
    guildId: string
  ): Promise<void> {
    MemeResponses.getPenalties(severity);

    // Apply nickname change for low scores
    if (severity === "MODERATE" || severity === "SEVERE") {
      const currentNickname = member.nickname || member.user.username;
      const newNickname =
        severity === "SEVERE"
          ? "💀 Enemy of the State"
          : "⚠️ Problematic Citizen";

      // Check if already has this effect
      if (!this.effectManager.hasEffectType(userId, "NICKNAME_CHANGE")) {
        try {
          await member.setNickname(newNickname);
          await this.effectManager.applyEffect(
            userId,
            guildId,
            "NICKNAME_CHANGE",
            CONFIG.EFFECT_DURATIONS.NICKNAME_CHANGE,
            currentNickname
          );
          Logger.info(
            `Applied nickname penalty to ${member.user.username}: ${newNickname}`
          );
        } catch (error) {
          Logger.error(`Failed to apply nickname penalty: ${error}`);
        }
      }
    }

    Logger.info(`Applying ${severity} penalty to ${member.user.username}`);
  }

  /* eslint-disable @typescript-eslint/no-unused-vars */
  private async grantPrivilege(
    member: GuildMember,
    level: string,
    _userId: string,
    _guildId: string
  ): Promise<void> {
    /* eslint-enable @typescript-eslint/no-unused-vars */
    MemeResponses.getPrivileges(level);
    // Implementation depends on server permissions and roles
    // This is a placeholder for privilege logic
    Logger.info(`Granting ${level} privilege to ${member.user.username}`);
  }

  /* eslint-disable @typescript-eslint/no-unused-vars */
  private async removePenalty(
    member: GuildMember,
    severity: string,
    userId: string,
    guildId: string
  ): Promise<void> {
    /* eslint-enable @typescript-eslint/no-unused-vars */
    // Remove nickname effects if score improved
    if (severity === "MILD" || severity === "MODERATE") {
      const originalNickname = this.effectManager.getOriginalValue(
        userId,
        "NICKNAME_CHANGE"
      );
      if (originalNickname) {
        try {
          await member.setNickname(originalNickname);
          await this.effectManager.removeEffectsByType(
            userId,
            "NICKNAME_CHANGE"
          );
          Logger.info(
            `Restored original nickname for ${member.user.username}: ${originalNickname}`
          );
        } catch (error) {
          Logger.error(`Failed to restore nickname: ${error}`);
        }
      }
    }

    Logger.info(`Removing ${severity} penalty from ${member.user.username}`);
  }

  private async applySpeechReeducation(
    message: Message,
    sanitizedContent: string
  ): Promise<void> {
    try {
      // Delete the original message
      await message.delete();

      // Get corrected message from LLM
      const correctedContent = await this.getCorrectedMessage(sanitizedContent);

      // Create webhook to post as the user
      const channel = message.channel;
      if (!channel.isTextBased()) return;

      const webhooks = await (channel as TextChannel).fetchWebhooks();
      let webhook = webhooks.find(
        (wh: Webhook) => wh.name === "Social Credit Re-education"
      );

      if (!webhook) {
        webhook = await (channel as TextChannel).createWebhook({
          name: "Social Credit Re-education",
          avatar: message.author.displayAvatarURL(),
        });
      }

      // Post the corrected message
      await webhook.send({
        content: correctedContent,
        username: message.author.username,
        avatarURL: message.author.displayAvatarURL(),
      });

      // Apply additional penalty for requiring re-education
      await this.socialCreditManager.updateScore(
        message.author.id,
        message.guild?.id || "dm",
        -10, // Additional penalty
        "Применена ре-образовательная коррекция речи",
        message.author.username,
        sanitizedContent
      );

      Logger.info(`Applied speech re-education to user ${message.author.id}`);
    } catch (error) {
      Logger.error(`Failed to apply speech re-education: ${error}`);
    }
  }

  private async getCorrectedMessage(originalMessage: string): Promise<string> {
    const prompt = CONFIG.ANALYSIS.SPEECH_REEDUCATION_PROMPT.replace(
      "{message}",
      originalMessage
    );

    const completion = await this.mistral.chat.complete({
      model: CONFIG.LLM.STANDARD_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: CONFIG.LLM.TEMPERATURE,
      maxTokens: CONFIG.LLM.MAX_TOKENS,
    });

    const response = completion.choices?.[0]?.message?.content;
    if (!response)
      throw new Error("No response from Mistral AI for speech correction");

    // Handle different response types from Mistral
    const responseText =
      typeof response === "string" ? response : JSON.stringify(response);

    return responseText.trim();
  }

  /* eslint-disable @typescript-eslint/no-unused-vars */
  private async handleRandomEvent(
    eventType: string,
    data: unknown
  ): Promise<void> {
    /* eslint-enable @typescript-eslint/no-unused-vars */
    try {
      // Get all monitored channels across all guilds
      const monitoredChannels =
        await this.databaseManager.getAllMonitoredChannels();

      for (const [guildId, channels] of monitoredChannels.entries()) {
        for (const channelId of channels) {
          await this.triggerEventInChannel(guildId, channelId, eventType);
        }
      }
    } catch (error) {
      Logger.error(`Error handling random event ${eventType}:`, error);
    }
  }

  private async triggerEventInChannel(
    guildId: string,
    channelId: string,
    eventType: string
  ): Promise<void> {
    try {
      const channel = this.client.channels.cache.get(channelId);
      if (!channel || !channel.isTextBased()) return;

      const textChannel = channel as TextChannel;

      switch (eventType) {
        case "PARTY_INSPECTOR_VISIT":
          await this.handlePartyInspectorVisit(textChannel);
          break;
        case "SOCIAL_HARMONY_HOUR":
          await this.handleSocialHarmonyHour(textChannel);
          break;
        case "WESTERN_SPY_INFILTRATION":
          await this.handleWesternSpyInfiltration(textChannel);
          break;
        case "PRODUCTION_QUOTA":
          await this.handleProductionQuota(textChannel);
          break;
      }
    } catch (error) {
      Logger.error(
        `Error triggering event ${eventType} in channel ${channelId}:`,
        error
      );
    }
  }

  private async handlePartyInspectorVisit(channel: TextChannel): Promise<void> {
    const guildId = channel.guildId;
    const endTime = new Date(
      Date.now() + CONFIG.EVENTS.PARTY_INSPECTOR_DURATION
    );

    // Set active event
    this.activeEvents.set(guildId, { type: "PARTY_INSPECTOR_VISIT", endTime });

    const embed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle("🚨 ВИЗИТ ИНСПЕКТОРА ПАРТИИ!")
      .setDescription(
        "**ВНИМАНИЕ, ГРАЖДАНЕ!**\n\n" +
          "Партийный инспектор прибыл для проверки! Следующие 15 минут все изменения социального рейтинга **удваиваются**!\n\n" +
          "Докажите свою преданность Партии! 🇨🇳"
      )
      .setFooter({ text: "Партия наблюдает! 👁️" })
      .setTimestamp();

    await channel.send({ embeds: [embed] });

    // Auto-end event after duration
    setTimeout(() => {
      this.activeEvents.delete(guildId);
      Logger.info(`Party Inspector Visit ended in guild ${guildId}`);
    }, CONFIG.EVENTS.PARTY_INSPECTOR_DURATION);
  }

  private async handleSocialHarmonyHour(channel: TextChannel): Promise<void> {
    const guildId = channel.guildId;
    const endTime = new Date(
      Date.now() + CONFIG.EVENTS.SOCIAL_HARMONY_DURATION
    );

    // Set active event
    this.activeEvents.set(guildId, { type: "SOCIAL_HARMONY_HOUR", endTime });

    const embed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle("🕊️ ЧАС СОЦИАЛЬНОЙ ГАРМОНИИ")
      .setDescription(
        "**БЛАГОСЛОВЕННЫЙ ЧАС НАЧАЛСЯ!**\n\n" +
          "Следующий час только **положительные** изменения социального рейтинга возможны!\n\n" +
          "Делитесь добротой и преданностью! 💝"
      )
      .setFooter({ text: "Гармония превыше всего! 🇨🇳" })
      .setTimestamp();

    await channel.send({ embeds: [embed] });

    // Auto-end event after duration
    setTimeout(() => {
      this.activeEvents.delete(guildId);
      Logger.info(`Social Harmony Hour ended in guild ${guildId}`);
    }, CONFIG.EVENTS.SOCIAL_HARMONY_DURATION);
  }

  private async handleWesternSpyInfiltration(
    channel: TextChannel
  ): Promise<void> {
    const guildId = channel.guildId;
    const correctPhrase = "Партия всегда права!";
    let spyCaught = false;

    const embed = new EmbedBuilder()
      .setColor(0xff4500)
      .setTitle("🕵️ ПРОНИКНОВЕНИЕ ЗАПАДНОГО ШПИОНА!")
      .setDescription(
        "**ТРЕВОГА!**\n\n" +
          "Западный шпион проник в наши ряды! Первый, кто скажет правильную патриотическую фразу, получит **+50** социального рейтинга!\n\n" +
          'Фраза: **"Партия всегда права!"**\n\n' +
          "⏱️ У вас есть 5 минут!"
      )
      .setFooter({ text: "Будьте бдительны! 👁️" })
      .setTimestamp();

    await channel.send({ embeds: [embed] });

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

      // Reward the first person who says the correct phrase
      const newScore = await this.socialCreditManager.updateScore(
        message.author.id,
        guildId,
        CONFIG.EVENTS.SPY_INFILTRATION_BONUS,
        "Пойман западный шпион - проявлена бдительность!",
        message.author.username
      );

      const rewardEmbed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle("🎯 ШПИОН ПОЙМАН!")
        .setDescription(
          `**${message.author.username}** проявил бдительность и поймал западного шпиона!\n\n` +
            `Награда: **+${CONFIG.EVENTS.SPY_INFILTRATION_BONUS}** социального рейтинга!`
        )
        .addFields({
          name: "💯 Новый Рейтинг",
          value: `${newScore}`,
          inline: true,
        })
        .setFooter({ text: "Партия благодарит за бдительность! 👁️" })
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
          .setTitle("⚠️ ШПИОН СКРЫЛСЯ!")
          .setDescription(
            "Западный шпион успешно скрылся! Будьте бдительнее в следующий раз."
          )
          .setFooter({ text: "Партия продолжит борьбу со шпионажем! 🕵️" })
          .setTimestamp();

        channel.send({ embeds: [failEmbed] }).catch(() => {});
      }
    });
  }

  private async handleProductionQuota(channel: TextChannel): Promise<void> {
    const guild = channel.guild;
    const guildId = channel.guildId;
    const requiredMessages = 50;
    let messageCount = 0;
    const participants = new Set<string>();

    const embed = new EmbedBuilder()
      .setColor(0xffd700)
      .setTitle("🏭 ПРОИЗВОДСТВЕННАЯ КВОТА!")
      .setDescription(
        "**ПАРТИЯ ТРЕБУЕТ ПРОИЗВОДСТВА!**\n\n" +
          `Отправьте **${requiredMessages} сообщений** в monitored каналах в следующие 10 минут!\n\n` +
          "При успехе все онлайн пользователи получат **+10** социального рейтинга!\n\n" +
          "За работу, товарищи! ⚒️"
      )
      .setFooter({ text: "Выполняйте план! 📈" })
      .setTimestamp();

    await channel.send({ embeds: [embed] });

    // Set up message collector for all monitored channels in this guild
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
      // Stop all collectors
      collectors.forEach((collector) => collector.stop());

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
              CONFIG.EVENTS.PRODUCTION_QUOTA_BONUS,
              "Выполнение производственной квоты Партии",
              member.user.username
            );
            rewardedCount++;
          } catch (error) {
            Logger.error(`Failed to reward user ${member.id}: ${error}`);
          }
        }

        const successEmbed = new EmbedBuilder()
          .setColor(0x00ff00)
          .setTitle("🎉 КВОТА ВЫПОЛНЕНА!")
          .setDescription(
            `**ПЛАН ПЕРЕВЫПОЛНЕН!**\n\n` +
              `Отправлено **${messageCount}** сообщений (треб. ${requiredMessages})\n` +
              `Участвовало **${participants.size}** граждан\n` +
              `Награждено **${rewardedCount}** онлайн пользователей!\n\n` +
              `Каждый получил **+${CONFIG.EVENTS.PRODUCTION_QUOTA_BONUS}** социального рейтинга!`
          )
          .setFooter({ text: "Партия гордится вашим трудолюбием! 🏭" })
          .setTimestamp();

        await channel.send({ embeds: [successEmbed] });
      } else {
        // Failure
        const failEmbed = new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle("❌ КВОТА НЕ ВЫПОЛНЕНА!")
          .setDescription(
            `**ПЛАН ПРОВАЛЕН!**\n\n` +
              `Отправлено только **${messageCount}** сообщений (треб. ${requiredMessages})\n\n` +
              `Партия ожидает лучших результатов в следующий раз.`
          )
          .setFooter({ text: "Увеличьте производительность! 📉" })
          .setTimestamp();

        await channel.send({ embeds: [failEmbed] });
      }

      Logger.info(
        `Production quota ended in guild ${guildId}: ${messageCount}/${requiredMessages} messages`
      );
    }, CONFIG.EVENTS.PRODUCTION_QUOTA_DURATION);
  }

  private hasCriticallyBadKeywords(content: string): boolean {
    const lowerContent = content.toLowerCase();
    return CONFIG.ANALYSIS.CRITICALLY_BAD_KEYWORDS.some((keyword) =>
      lowerContent.includes(keyword.toLowerCase())
    );
  }

  private async applyKeywordPenalty(
    message: Message,
    content: string
  ): Promise<void> {
    const userId = message.author.id;
    const guildId = message.guild?.id || "dm";

    // Apply immediate penalty without AI analysis
    const newScore = await this.socialCreditManager.updateScore(
      userId,
      guildId,
      CONFIG.SCORE_CHANGES.KEYWORD_PENALTY,
      "Обнаружены критически негативные ключевые слова",
      message.author.username,
      content
    );

    // Create penalty embed
    const embed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle("🚨 КРИТИЧЕСКОЕ НАРУШЕНИЕ! 🚨")
      .setDescription(
        `**Гражданин ${message.author.username}!**\n\n` +
          `Обнаружены крайне негативные высказывания, противоречащие принципам Партии!`
      )
      .addFields(
        {
          name: "📉 Штраф",
          value: `${CONFIG.SCORE_CHANGES.KEYWORD_PENALTY}`,
          inline: true,
        },
        { name: "💯 Новый Рейтинг", value: `${newScore}`, inline: true },
        {
          name: "⚠️ Причина",
          value: "Критически негативные ключевые слова",
          inline: false,
        }
      )
      .setFooter({ text: "Партия не терпит дисгармонию! 👁️" })
      .setTimestamp();

    await message.reply({ embeds: [embed] });
    Logger.info(`Applied keyword penalty to user ${userId}: ${content}`);
  }

  private async registerCommands(): Promise<void> {
    const commands = [
      new SlashCommandBuilder()
        .setName("social-credit")
        .setDescription("Check your social credit score")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("User to check (optional)")
            .setRequired(false)
        ),

      new SlashCommandBuilder()
        .setName("leaderboard")
        .setDescription("View social credit leaderboard")
        .addStringOption((option) =>
          option
            .setName("scope")
            .setDescription("Server or global leaderboard")
            .setRequired(false)
            .addChoices(
              { name: "This Server", value: "server" },
              { name: "Global", value: "global" }
            )
        ),

      new SlashCommandBuilder()
        .setName("set-monitor-channel")
        .setDescription(
          "Set channel to monitor for social credits (Admin only)"
        )
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Channel to monitor")
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText)
        ),

      new SlashCommandBuilder()
        .setName("social-credit-history")
        .setDescription("View your social credit history")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("User to check history for (optional)")
            .setRequired(false)
        ),

      new SlashCommandBuilder()
        .setName("social-credit-stats")
        .setDescription("View server social credit statistics"),

      new SlashCommandBuilder()
        .setName("rate-limit-status")
        .setDescription("Check your current rate limit status"),

      new SlashCommandBuilder()
        .setName("list-monitored-channels")
        .setDescription(
          "List all monitored channels in this server (Admin only)"
        ),

      new SlashCommandBuilder()
        .setName("remove-monitor-channel")
        .setDescription("Remove a channel from monitoring (Admin only)")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Channel to stop monitoring")
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText)
        ),

      new SlashCommandBuilder()
        .setName("redeem-myself")
        .setDescription(
          "Seek forgiveness from the Party for your low social credit"
        ),

      new SlashCommandBuilder()
        .setName("enforce-harmony")
        .setDescription(
          "Enforce social harmony by correcting another citizen (High social credit required)"
        )
        .addUserOption((option) =>
          option
            .setName("target")
            .setDescription("Citizen to correct")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("reason")
            .setDescription("Reason for correction")
            .setRequired(true)
        ),

      new SlashCommandBuilder()
        .setName("claim-daily")
        .setDescription("Claim your daily social credit bonus from the Party"),

      new SlashCommandBuilder()
        .setName("spread-propaganda")
        .setDescription("Spread glorious Party propaganda (Model Citizen+)"),

      new SlashCommandBuilder()
        .setName("praise-bot")
        .setDescription("Praise the bot for a good analysis"),

      new SlashCommandBuilder()
        .setName("report-mistake")
        .setDescription("Report a mistake in the bot's analysis"),

      new SlashCommandBuilder()
        .setName("work-for-the-party")
        .setDescription("Complete a task to earn social credit back"),
    ];

    const rest = new REST().setToken(process.env.DISCORD_TOKEN!);

    try {
      Logger.info("Started refreshing application (/) commands.");
      await rest.put(
        Routes.applicationCommands(process.env.DISCORD_CLIENT_ID!),
        { body: commands }
      );
      Logger.info("Successfully reloaded application (/) commands.");
    } catch (error) {
      Logger.error("Error registering commands:", error);
    }
  }

  public async start(): Promise<void> {
    // Validate environment variables
    if (!Validators.isValidDiscordToken(process.env.DISCORD_TOKEN || "")) {
      throw new Error("Invalid Discord token provided");
    }

    if (!Validators.isValidMistralKey(process.env.MISTRAL_API_KEY || "")) {
      throw new Error("Invalid Mistral API key provided");
    }

    if (!Validators.isValidSnowflake(process.env.DISCORD_CLIENT_ID || "")) {
      throw new Error("Invalid Discord client ID provided");
    }

    await this.databaseManager.initialize();
    this.healthCheck.start();
    this.scheduler.start();
    await this.client.login(process.env.DISCORD_TOKEN);

    // Setup graceful shutdown
    process.on("SIGINT", this.gracefulShutdown.bind(this));
    process.on("SIGTERM", this.gracefulShutdown.bind(this));
  }

  private async gracefulShutdown(): Promise<void> {
    Logger.info("🛑 Shutting down bot gracefully...");

    try {
      this.healthCheck.stop();
      this.scheduler.stop();
      this.effectManager.stopCleanup();
      this.client.destroy();
      await this.databaseManager.disconnect();
      Logger.info("✅ Bot shutdown complete");
      process.exit(0);
    } catch (error) {
      Logger.error("Error during shutdown:", error);
      process.exit(1);
    }
  }

  public addMonitoredChannel(guildId: string, channelId: string): void {
    this.commandHandler.addMonitoredChannel(guildId, channelId);
  }

  public removeMonitoredChannel(guildId: string, channelId: string): void {
    this.commandHandler.removeMonitoredChannel(guildId, channelId);
  }

  private async analyzeBufferedMessages(
    userId: string,
    guildId: string,
    messages: string[],
    channelId: string
  ): Promise<void> {
    try {
      const channel = this.client.channels.cache.get(channelId);
      if (!channel || !channel.isTextBased()) {
        Logger.error(
          `Buffered analysis: Channel ${channelId} not found or not a text channel.`
        );
        return;
      }
      // Get context for analysis
      const recentContext =
        this.messageContextManager.getInterleavedRecentContext(
          guildId,
          channelId,
          5
        );

      const currentMessage = messages[messages.length - 1];
      const user = await this.client.users.fetch(userId);
      const analysis = await this.analyzeMessageWithContext(
        messages,
        recentContext,
        currentMessage,
        user.username,
        userId,
        guildId
      );

      // For buffered analysis, we process the score change directly without creating a mock message
      // since we can't reply to the original message anyway
      if (analysis.verdict === "neutral") return;

      // Handle score changes based on verdict
      if (analysis.verdict === "good" && analysis.score_change > 0) {
        // Check positive score cooldown only for good behavior
        if (!this.rateLimitManager.canReceivePositiveScore(userId, guildId)) {
          Logger.info(
            `Buffered positive score blocked by cooldown for user ${userId}`
          );
          return;
        }

        // Mark positive score given
        this.rateLimitManager.markPositiveScore(userId, guildId);
      } else if (analysis.verdict === "bad") {
        // Bad behavior is NEVER rate limited - always punish immediately
        Logger.info(
          `Punishing buffered bad behavior from user ${userId}: ${analysis.reason}`
        );
      }

      // Update user's social credit score
      const newScore = await this.socialCreditManager.updateScore(
        userId,
        guildId,
        analysis.score_change,
        analysis.reason,
        "Unknown User", // We don't have username for buffered messages
        currentMessage
      );

      // Log the social credit change
      Logger.socialCredit(userId, analysis.score_change, analysis.reason);
      Logger.info(
        `Buffered analysis completed for user ${userId}: ${analysis.verdict} (${analysis.score_change}) → New score: ${newScore}`
      );

      // Send response to the channel where the message was buffered
      const embed = this.createResponseEmbed(
        {
          username: user.username,
          displayAvatarURL: () => user.displayAvatarURL(),
        },
        analysis,
        newScore
      );

      if (channel instanceof TextChannel) {
        await channel.send({ embeds: [embed] });
      }
    } catch (error) {
      Logger.error("Error processing buffered messages:", error);
    }
  }
}

// Start the bot
const bot = new SocialCreditBot();
bot.start().catch(console.error);

export default SocialCreditBot;
