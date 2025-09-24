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
  Webhook,
} from "discord.js";
import OpenAI from "openai";
import * as dotenv from "dotenv";
import { SocialCreditManager } from "./managers/SocialCreditManager.js";
import { DatabaseManager } from "./managers/DatabaseManager.js";
import { EffectManager } from "./managers/EffectManager.js";
import { EventManager } from "./managers/EventManager.js";
import { DirectiveManager } from "./managers/DirectiveManager.js";
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
  private openai: OpenAI;
  private socialCreditManager: SocialCreditManager;
  private databaseManager: DatabaseManager;
  private effectManager: EffectManager;
  private eventManager: EventManager;
  private directiveManager: DirectiveManager;
  private scheduler: Scheduler;
  private healthCheck: HealthCheck;
  private commandHandler: CommandHandler;
  private rateLimitManager: RateLimitManager;
  private messageContextManager: MessageContextManager;

  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
      ],
    });

    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || "",
      baseURL: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    });

    this.databaseManager = new DatabaseManager();
    this.socialCreditManager = new SocialCreditManager(this.databaseManager);
    this.effectManager = new EffectManager(this.databaseManager);
    this.eventManager = new EventManager(
      this.client,
      this.openai,
      this.databaseManager,
      this.socialCreditManager
    );
    this.directiveManager = new DirectiveManager(
      this.openai,
      this.databaseManager,
      this.socialCreditManager
    );
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
      this.openai,
      this.rateLimitManager,
      this.messageContextManager
    );

    // Set up event callback for EventManager
    this.scheduler.setEventCallback(
      this.handleRandomEventWithManager.bind(this)
    );

    this.setupEventListeners();
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
    const userId = message.author.id;
    const guildId = message.guild?.id || "dm";
    const sanitizedContent = Validators.sanitizeMessage(message.content);

    Logger.debug(
      `Handling message from user ${userId} in guild ${guildId}, channel ${message.channelId}: ${sanitizedContent.substring(0, 100)}...`
    );

    // Ignore bot messages and non-monitored channels
    if (message.author.bot) {
      Logger.debug(`Skipping bot message from ${userId}`);
      return;
    }
    if (!this.commandHandler.isChannelMonitored(guildId, message.channelId)) {
      Logger.debug(
        `Skipping message in non-monitored channel ${message.channelId} for guild ${guildId}`
      );
      return;
    }

    // Add message to context history
    this.messageContextManager.addMessage(message);
    Logger.debug(`Added message to context history for user ${userId}`);

    // Skip messages with attachments, links, or embeds
    if (
      message.attachments.size > 0 ||
      message.embeds.length > 0 ||
      Validators.containsLinks(message.content)
    ) {
      Logger.debug(
        `Skipping message with attachments/links/embeds from user ${userId}`
      );
      return;
    }

    // Skip empty messages
    if (!message.content.trim()) {
      Logger.debug(`Skipping empty message from user ${userId}`);
      return;
    }

    // Check for critically bad keywords (immediate penalty, no AI cost)
    if (this.hasCriticallyBadKeywords(sanitizedContent)) {
      Logger.info(
        `Detected critically bad keywords in message from user ${userId}: ${sanitizedContent}`
      );
      await this.applyKeywordPenalty(message, sanitizedContent);
      return; // Don't process further
    }

    // Check for speech re-education (critically low scores)
    const userScore = await this.socialCreditManager.getUserScore(
      userId,
      guildId
    );
    Logger.debug(`User ${userId} current score: ${userScore}`);
    if (userScore <= CONFIG.SCORE_THRESHOLDS.PENALTIES.SEVERE) {
      Logger.info(
        `Applying speech re-education to user ${userId} with score ${userScore}`
      );
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

    Logger.info(
      `Starting message analysis for user ${userId} in guild ${guildId}`
    );
    try {
      // Get context for analysis
      const recentContext =
        this.messageContextManager.getInterleavedRecentContext(
          guildId,
          message.channelId,
          5
        );
      Logger.debug(
        `Retrieved ${recentContext.length} context messages for analysis`
      );

      const messagesToAnalyze = rateLimitResult.bufferedMessages || [
        sanitizedContent,
      ];
      Logger.debug(
        `Analyzing ${messagesToAnalyze.length} messages (buffered: ${!!rateLimitResult.bufferedMessages})`
      );
      const analysis = await this.analyzeMessageWithContext(
        messagesToAnalyze,
        recentContext,
        sanitizedContent,
        message.author.username,
        userId,
        guildId
      );

      Logger.info(
        `Analysis completed for user ${userId}: verdict=${analysis.verdict}, score_change=${analysis.score_change}`
      );
      await this.processAnalysis(message, analysis, sanitizedContent);
    } catch (error) {
      Logger.error(`Error processing message for user ${userId}:`, error);
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
    Logger.debug(
      `Starting message analysis with context for user ${userId || "unknown"} in guild ${guildId || "unknown"}`
    );

    const contextString = this.messageContextManager.buildContextString(
      userMessages,
      recentContext,
      currentMessage,
      authorUsername
    );
    Logger.debug(
      `Built context string of length ${contextString.length} characters`
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
      Logger.debug(
        `Retrieved user history: ${userHistory.length} entries, current score: ${userScore}`
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
        Logger.debug(
          `Using cheap model and simplified prompt for user ${userId} (neutral ratio: ${neutralRatio})`
        );
      } else {
        Logger.debug(
          `Using standard model and full prompt for user ${userId} (score: ${userScore}, neutral ratio: ${neutralRatio})`
        );
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

    Logger.debug(
      `Sending analysis request to OpenAI using ${useCheapModel ? "cheap" : "standard"} model`
    );
    const completion = await this.openai.chat.completions.create({
      model: useCheapModel ? CONFIG.LLM.CHEAP_MODEL : CONFIG.LLM.STANDARD_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: CONFIG.LLM.TEMPERATURE,
      max_tokens: CONFIG.LLM.MAX_TOKENS,
    });

    const response = completion.choices?.[0]?.message?.content;
    if (!response) {
      Logger.error("No response received from OpenAI API");
      throw new Error("No response from OpenAI API");
    }

    // Handle different response types from Mistral
    const responseText =
      typeof response === "string" ? response : JSON.stringify(response);
    Logger.debug(
      `Received response from OpenAI: ${responseText.substring(0, 200)}...`
    );

    // Remove markdown code blocks if present
    // Remove markdown code blocks and extract JSON object
    let jsonString = responseText.replace(/```json\s*|\s*```/g, "").trim();
    Logger.debug(`Cleaned response string: ${jsonString.substring(0, 100)}...`);

    const jsonStartIndex = jsonString.indexOf("{");
    const jsonEndIndex = jsonString.lastIndexOf("}");

    if (
      jsonStartIndex !== -1 &&
      jsonEndIndex !== -1 &&
      jsonEndIndex > jsonStartIndex
    ) {
      jsonString = jsonString.substring(jsonStartIndex, jsonEndIndex + 1);
      Logger.debug(`Extracted JSON substring: ${jsonString}`);
    }

    try {
      const parsed = JSON.parse(jsonString);
      Logger.debug(`Successfully parsed JSON response`);

      // Validate the response structure
      if (
        !parsed.verdict ||
        !["good", "bad", "neutral"].includes(parsed.verdict)
      ) {
        Logger.error(`Invalid verdict in parsed response: ${parsed.verdict}`);
        throw new Error("Invalid verdict in response");
      }

      parsed.score_change = Number(parsed.score_change);
      if (!Validators.isValidScoreChange(parsed.score_change)) {
        Logger.error(
          `Invalid score change in parsed response: ${parsed.score_change}`
        );
        throw new Error("Invalid score change in response");
      }

      Logger.info(
        `Analysis result: verdict=${parsed.verdict}, score_change=${parsed.score_change}, reason=${parsed.reason}`
      );
      return parsed;
    } catch (parseError) {
      Logger.error("Failed to parse OpenAI API response:", jsonString);
      Logger.error("Original response:", responseText);
      Logger.error("Parse error:", parseError);
      throw new Error("Invalid JSON response from OpenAI API");
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

    // Check for active events that modify score changes using EventManager
    let modifiedScoreChange = analysis.score_change;
    modifiedScoreChange = this.eventManager.applyEventEffects(
      guildId,
      modifiedScoreChange
    );

    // Update user's social credit score
    const newScore = await this.socialCreditManager.updateScore(
      userId,
      guildId,
      modifiedScoreChange,
      analysis.score_change !== modifiedScoreChange
        ? `${analysis.reason} (Modified by active event)`
        : analysis.reason,
      message.author.username,
      sanitizedContent
    );

    // Log the social credit change
    Logger.socialCredit(userId, analysis.score_change, analysis.reason);

    // Update directive progress
    await this.directiveManager.updateDirectiveProgress(
      userId,
      guildId,
      "message_sent",
      1
    );

    // Track score changes for directive progress
    if (modifiedScoreChange !== 0) {
      await this.directiveManager.updateDirectiveProgress(
        userId,
        guildId,
        "score_changed",
        modifiedScoreChange
      );
    }

    // Check for keyword usage in directives
    const messageWords = sanitizedContent.toLowerCase().split(/\s+/);
    const keywordsToTrack = [
      "партия",
      "гармония",
      "единство",
      "лидер",
      "общество",
    ];
    for (const keyword of keywordsToTrack) {
      if (messageWords.includes(keyword)) {
        await this.directiveManager.updateDirectiveProgress(
          userId,
          guildId,
          "keyword_used",
          1,
          { keyword: keyword }
        );
      }
    }

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

    const completion = await this.openai.chat.completions.create({
      model: CONFIG.LLM.STANDARD_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: CONFIG.LLM.TEMPERATURE,
      max_tokens: CONFIG.LLM.MAX_TOKENS,
    });

    const response = completion.choices?.[0]?.message?.content;
    if (!response)
      throw new Error("No response from OpenAI API for speech correction");

    // Handle different response types from Mistral
    const responseText =
      typeof response === "string" ? response : JSON.stringify(response);

    return responseText.trim();
  }

  private async handleRandomEventWithManager(): Promise<void> {
    try {
      // Get all monitored guilds and trigger events using EventManager
      const monitoredChannels =
        await this.databaseManager.getAllMonitoredChannels();

      for (const [guildId] of monitoredChannels.entries()) {
        // Only start event if no active event in this guild
        const activeEvent = this.eventManager.getActiveEvent(guildId);
        if (!activeEvent) {
          await this.eventManager.startRandomEvent(guildId);
        }
      }
    } catch (error) {
      Logger.error(`Error handling random event with EventManager:`, error);
    }
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

      // Enhanced Sanction Commands
      new SlashCommandBuilder()
        .setName("public-confession")
        .setDescription("Public confession for redemption (Score < -200)"),

      new SlashCommandBuilder()
        .setName("community-service")
        .setDescription(
          "Perform community service to improve your standing (Score < 0)"
        ),

      new SlashCommandBuilder()
        .setName("loyalty-quiz")
        .setDescription(
          "Take a loyalty test to prove your devotion (Score < -100)"
        ),

      // Enhanced Privilege Commands
      new SlashCommandBuilder()
        .setName("propaganda-broadcast")
        .setDescription("Broadcast Party-approved propaganda (Model Citizen+)")
        .addStringOption((option) =>
          option
            .setName("message")
            .setDescription("Your propaganda message to broadcast")
            .setRequired(true)
        ),

      new SlashCommandBuilder()
        .setName("party-favor")
        .setDescription("Request a server-wide Party favor (Supreme Citizen+)"),

      new SlashCommandBuilder()
        .setName("investigate")
        .setDescription("Investigate another citizen's social credit history")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("Citizen to investigate")
            .setRequired(true)
        ),

      // Directive System Command
      new SlashCommandBuilder()
        .setName("directive")
        .setDescription("View your current daily directive and weekly goal"),
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

    if (!Validators.isValidSnowflake(process.env.DISCORD_CLIENT_ID || "")) {
      throw new Error("Invalid Discord client ID provided");
    }

    await this.databaseManager.initialize();
    await this.effectManager.initialize();
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
      this.eventManager.cleanup();
      this.directiveManager.cleanup();
      await this.databaseManager.disconnect();
      this.client.destroy();
      Logger.info("✅ Bot shutdown completed");
    } catch (error) {
      Logger.error("❌ Error during shutdown:", error);
    } finally {
      process.exit(0);
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
    Logger.info(
      `Starting buffered message analysis for user ${userId} in guild ${guildId}, channel ${channelId} (${messages.length} messages)`
    );
    try {
      const channel = this.client.channels.cache.get(channelId);
      if (!channel || !channel.isTextBased()) {
        Logger.error(
          `Buffered analysis: Channel ${channelId} not found or not a text channel.`
        );
        return;
      }
      Logger.debug(`Retrieved channel ${channelId} for buffered analysis`);

      // Get context for analysis
      const recentContext =
        this.messageContextManager.getInterleavedRecentContext(
          guildId,
          channelId,
          5
        );
      Logger.debug(
        `Retrieved ${recentContext.length} context messages for buffered analysis`
      );

      const currentMessage = messages[messages.length - 1];
      const user = await this.client.users.fetch(userId);
      Logger.debug(
        `Fetched user ${userId} (${user.username}) for buffered analysis`
      );

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
      if (analysis.verdict === "neutral") {
        Logger.debug(`Buffered analysis result: neutral - no action taken`);
        return;
      }

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
        Logger.debug(
          `Marked positive score for buffered analysis user ${userId}`
        );
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
        Logger.debug(
          `Sent buffered analysis response embed to channel ${channelId}`
        );
      }
    } catch (error) {
      Logger.error(
        `Error processing buffered messages for user ${userId}:`,
        error
      );
    }
  }
}

// Start the bot
const bot = new SocialCreditBot();
bot.start().catch(console.error);

export default SocialCreditBot;
