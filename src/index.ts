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
} from "discord.js";
import { Mistral } from "@mistralai/mistralai";
import * as dotenv from "dotenv";
import { SocialCreditManager } from "./managers/SocialCreditManager.js";
import { DatabaseManager } from "./managers/DatabaseManager.js";
import { MemeResponses } from "./utils/MemeResponses.js";
import { CommandHandler } from "./handlers/CommandHandler.js";
import { Logger } from "./utils/Logger.js";
import { Validators } from "./utils/Validators.js";
import { RateLimitManager } from "./managers/RateLimitManager.js";
import { MessageContextManager } from "./managers/MessageContextManager.js";
import { MessageAnalysisResult, MessageContextEntry } from "./types/index.js";

dotenv.config();

class SocialCreditBot {
  private client: Client;
  private mistral: Mistral;
  private socialCreditManager: SocialCreditManager;
  private databaseManager: DatabaseManager;
  private commandHandler: CommandHandler;
  private rateLimitManager: RateLimitManager;
  private messageContextManager: MessageContextManager;
  private monitoredChannels: Set<string> = new Set();

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
    this.rateLimitManager = new RateLimitManager();
    this.messageContextManager = new MessageContextManager();

    // Set up buffer analysis callback
    this.rateLimitManager.setAnalysisCallback(
      this.analyzeBufferedMessages.bind(this)
    );

    this.commandHandler = new CommandHandler(
      this.socialCreditManager,
      this.databaseManager,
      this.rateLimitManager,
      this.messageContextManager
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
        message.author.username
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
    authorUsername: string
  ): Promise<MessageAnalysisResult> {
    const contextString = this.messageContextManager.buildContextString(
      userMessages,
      recentContext,
      currentMessage,
      authorUsername
    );

    const prompt = `Ты - Верховный ИИ Китайской Системы Социального Рейтинга (мем версия). Проанализируй сообщения пользователя с учётом контекста и определи, хорошо ли это, плохо или нейтрально для социального рейтинга.

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
      model: "mistral-medium-latest",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      maxTokens: 800,
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

    // Update user's social credit score
    const newScore = await this.socialCreditManager.updateScore(
      userId,
      guildId,
      analysis.score_change,
      analysis.reason,
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

    // Low score penalties
    if (score <= -500) {
      await this.applyPenalty(member, "SEVERE");
    } else if (score <= -200) {
      await this.applyPenalty(member, "MODERATE");
    } else if (score <= -50) {
      await this.applyPenalty(member, "MILD");
    }

    // High score privileges
    if (score >= 1000) {
      await this.grantPrivilege(member, "SUPREME_CITIZEN");
    } else if (score >= 500) {
      await this.grantPrivilege(member, "MODEL_CITIZEN");
    } else if (score >= 200) {
      await this.grantPrivilege(member, "GOOD_CITIZEN");
    }
  }

  private async applyPenalty(
    member: { user: { username: string } },
    severity: string
  ): Promise<void> {
    MemeResponses.getPenalties(severity);
    // Implementation depends on server permissions and roles
    // This is a placeholder for penalty logic
    Logger.info(`Applying ${severity} penalty to ${member.user.username}`);
  }

  private async grantPrivilege(
    member: { user: { username: string } },
    level: string
  ): Promise<void> {
    MemeResponses.getPrivileges(level);
    // Implementation depends on server permissions and roles
    // This is a placeholder for privilege logic
    Logger.info(`Granting ${level} privilege to ${member.user.username}`);
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
    await this.client.login(process.env.DISCORD_TOKEN);

    // Setup graceful shutdown
    process.on("SIGINT", this.gracefulShutdown.bind(this));
    process.on("SIGTERM", this.gracefulShutdown.bind(this));
  }

  private async gracefulShutdown(): Promise<void> {
    Logger.info("🛑 Shutting down bot gracefully...");

    try {
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
        user.username
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
