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
import { AchievementManager } from "./managers/AchievementManager.js";
import { Scheduler } from "./managers/Scheduler.js";
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
  private achievementManager: AchievementManager;
  private scheduler: Scheduler;
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
    this.achievementManager = new AchievementManager(
      this.databaseManager,
      this.socialCreditManager,
      this.effectManager
    );
    this.effectManager.setSocialCreditManager(this.socialCreditManager);
    this.socialCreditManager.setEffectManager(this.effectManager);
    this.socialCreditManager.setAchievementManager(this.achievementManager);
    this.scheduler = new Scheduler(this.effectManager, this.databaseManager);
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
      this.messageContextManager,
      this.achievementManager
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
      // The re-education is now handled by the AdminCommands handler
      // We need to pass a synthetic interaction to the handler
      if(message.channel instanceof TextChannel) {
        await this.commandHandler.adminCommands.applySpeechReeducation(
          {
            channel: message.channel,
            guild: message.guild,
            user: this.client.user,
            client: this.client,
          } as any,
          message.author,
          sanitizedContent,
          message.channel
        );
        await message.delete();
      }
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
      ? `Analyze the message for its sentiment towards Imagination. Respond ONLY with JSON: {"verdict": "good/bad/neutral", "score_change": number, "reason": "briefly", "meme_response": "memey"}`
      : CONFIG.LLM.ENHANCED_ANALYSIS_PROMPT.replace(
          "{contextString}",
          contextString
        );

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
          .setTitle("⏰ POSITIVE SCORE COOLDOWN")
          .setDescription(
            `🚫 Too early to increase score, citizen!\n\n⏱️ Wait another **${minutesLeft} minutes** before the next increase.\n\n💡 *The system prevents spamming of good messages!*`
          )
          .setFooter({ text: "Imagination controls the rate of growth! 👁️" })
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
      message.member,
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
      ? "💫SOCIAL CREDIT SCORE INCREASED!💫"
      : "🚨 SOCIAL CREDIT SCORE DECREASED! 🚨";

    return new EmbedBuilder()
      .setColor(color)
      .setTitle(title)
      .setDescription(`${emoji} **${analysis.meme_response}**`)
      .addFields(
        {
          name: "📊 Score Change",
          value: `${analysis.score_change > 0 ? "+" : ""}${analysis.score_change}`,
          inline: true,
        },
        { name: "💯 Current Score", value: `${newScore}`, inline: true },
        { name: "📝 Reason", value: analysis.reason, inline: false }
      )
      .setFooter({
        text: `${author.username} | Imagination is eternal!`,
        iconURL: author.displayAvatarURL
          ? author.displayAvatarURL()
          : undefined,
      })
      .setTimestamp();
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
      "Critically negative keywords detected",
      message.member,
      message.author.username,
      content
    );

    // Create penalty embed
    const embed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle("🚨 CRITICAL VIOLATION! 🚨")
      .setDescription(
        `**Citizen ${message.author.username}!**\n\n` +
          `Extremely negative statements contradicting Imagination's principles have been detected!`
      )
      .addFields(
        {
          name: "📉 Penalty",
          value: `${CONFIG.SCORE_CHANGES.KEYWORD_PENALTY}`,
          inline: true,
        },
        { name: "💯 New Score", value: `${newScore}`, inline: true },
        {
          name: "⚠️ Reason",
          value: "Critically negative keywords",
          inline: false,
        }
      )
      .setFooter({ text: "Imagination does not tolerate disharmony! 👁️" })
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
        .setName("reeducate")
        .setDescription("Manually re-educate a user's message (Admin only)")
        .addUserOption(option =>
          option
            .setName("target")
            .setDescription("The user to re-educate")
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName("message_id")
            .setDescription("The ID of the message to re-educate")
            .setRequired(true)
        )
        .setDefaultMemberPermissions(0),

      new SlashCommandBuilder()
        .setName("redeem-myself")
        .setDescription(
          "Seek forgiveness from Imagination for your low social credit"
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
        .setDescription("Claim your daily social credit bonus from Imagination"),

      new SlashCommandBuilder()
        .setName("spread-propaganda")
        .setDescription("Spread glorious Imagination propaganda (Model Citizen+)"),

      new SlashCommandBuilder()
        .setName("praise-bot")
        .setDescription("Praise the bot for a good analysis"),

      new SlashCommandBuilder()
        .setName("report-mistake")
        .setDescription("Report a mistake in the bot's analysis"),

      new SlashCommandBuilder()
        .setName("labor-for-the-state")
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
        .setDescription("Broadcast Imagination-approved propaganda (Model Citizen+)")
        .addStringOption((option) =>
          option
            .setName("message")
            .setDescription("Your propaganda message to broadcast")
            .setRequired(true)
        ),

      new SlashCommandBuilder()
        .setName("decree-from-the-party")
        .setDescription("Request a server-wide Imagination favor (Supreme Citizen+)"),

      new SlashCommandBuilder()
        .setName("investigate")
        .setDescription("Investigate another citizen's social credit history")
        .addUserOption((option) =>
          option
            .setName("target")
            .setDescription("Citizen to investigate")
            .setRequired(true)
        ),
      
      new SlashCommandBuilder()
        .setName("achievements")
        .setDescription("View your unlocked achievements")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("User to check achievements for (optional)")
            .setRequired(false)
        ),

      new SlashCommandBuilder()
        .setName("achievements-list")
        .setDescription("List all available achievements"),
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
    await this.achievementManager.initialize();
    this.scheduler.start();
    await this.client.login(process.env.DISCORD_TOKEN);

    // Setup graceful shutdown
    process.on("SIGINT", this.gracefulShutdown.bind(this));
    process.on("SIGTERM", this.gracefulShutdown.bind(this));
  }

  private async gracefulShutdown(): Promise<void> {
    Logger.info("🛑 Shutting down bot gracefully...");

    try {
      this.scheduler.stop();
      this.effectManager.stopCleanup();
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
        null,
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
