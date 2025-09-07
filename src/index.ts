import { Client, GatewayIntentBits, Events, Message, EmbedBuilder, SlashCommandBuilder, REST, Routes, ChannelType } from 'discord.js';
import { Mistral } from '@mistralai/mistralai';
import * as dotenv from 'dotenv';
import { SocialCreditManager } from './managers/SocialCreditManager';
import { DatabaseManager } from './managers/DatabaseManager';
import { MemeResponses } from './utils/MemeResponses';
import { CommandHandler } from './handlers/CommandHandler';
import { Logger } from './utils/Logger';
import { Validators } from './utils/Validators';

dotenv.config();

class SocialCreditBot {
    private client: Client;
    private mistral: Mistral;
    private socialCreditManager: SocialCreditManager;
    private databaseManager: DatabaseManager;
    private commandHandler: CommandHandler;
    private monitoredChannels: Set<string> = new Set();

    constructor() {
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.GuildMembers
            ]
        });

        this.mistral = new Mistral({
            apiKey: process.env.MISTRAL_API_KEY || ''
        });

        this.databaseManager = new DatabaseManager();
        this.socialCreditManager = new SocialCreditManager(this.databaseManager);
        this.commandHandler = new CommandHandler(this.socialCreditManager, this.databaseManager);

        this.setupEventListeners();
    }

    private setupEventListeners(): void {
        this.client.once(Events.ClientReady, (readyClient) => {
            Logger.info(`🚀 ${readyClient.user.tag} is ready to monitor social credits!`);
            this.registerCommands();
        });

        this.client.on(Events.MessageCreate, this.handleMessage.bind(this));
        this.client.on(Events.InteractionCreate, this.commandHandler.handleInteraction.bind(this.commandHandler));
    }

    private async handleMessage(message: Message): Promise<void> {
        // Ignore bot messages and non-monitored channels
        if (message.author.bot) return;
        const guildId = message.guild?.id || 'dm';
        if (!this.commandHandler.isChannelMonitored(guildId, message.channelId)) return;

        // Skip messages with attachments, links, or embeds
        if (message.attachments.size > 0 || 
            message.embeds.length > 0 || 
            Validators.containsLinks(message.content)) {
            return;
        }

        // Skip empty messages
        if (!message.content.trim()) return;

        try {
            const sanitizedContent = Validators.sanitizeMessage(message.content);
            const analysis = await this.analyzeMessage(sanitizedContent);
            await this.processAnalysis(message, analysis, sanitizedContent);
        } catch (error) {
            Logger.error('Error processing message:', error);
        }
    }


    private async analyzeMessage(content: string): Promise<any> {
        const prompt = `Ты - Верховный ИИ Китайской Системы Социального Рейтинга (мем версия). Проанализируй это сообщение и определи, хорошо ли оно, плохо или нейтрально для социального рейтинга.

Сообщение: "${content}"

ВАЖНО: Отвечай ТОЛЬКО чистым JSON без markdown блоков, без дополнительного текста, без объяснений!

Формат ответа:
{
    "verdict": "good" | "bad" | "neutral",
    "score_change": число (от -100 до +100, 0 для нейтрального),
    "reason": "краткое мем объяснение в стиле Китайской Системы Социального Рейтинга",
    "meme_response": "смешной ответ как будто ты ИИ системы социального рейтинга"
}

Правила:
- Хорошо: Похвала Китая, коммунизма, Си Цзиньпина, быть продуктивным гражданином, следовать правилам
- Плохо: Критика Китая/КПК, упоминание независимости Тайваня/Гонконга, площадь Тяньаньмэнь, лень, антисоциальное поведение
- Нейтрально: Обычный разговор, вопросы, случайные темы
- Делай ответы мемными и смешными
- Изменения рейтинга: Хорошо (+10 до +100), Плохо (-10 до -100), Нейтрально (0)
- Отвечай на русском языке
- НЕ используй markdown блоки в ответе!`;

        const completion = await this.mistral.chat.complete({
            model: 'mistral-small-latest',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
            maxTokens: 300
        });

        const response = completion.choices?.[0]?.message?.content;
        if (!response) throw new Error('No response from Mistral AI');
        
        // Handle different response types from Mistral
        const responseText = typeof response === 'string' ? response : JSON.stringify(response);
        
        // Remove markdown code blocks if present
        const cleanedResponse = responseText.replace(/```json\s*|\s*```/g, '').trim();

        try {
            const parsed = JSON.parse(cleanedResponse);
            
            // Validate the response structure
            if (!parsed.verdict || !['good', 'bad', 'neutral'].includes(parsed.verdict)) {
                throw new Error('Invalid verdict in response');
            }
            
            if (!Validators.isValidScoreChange(parsed.score_change)) {
                throw new Error('Invalid score change in response');
            }
            
            return parsed;
        } catch (error) {
            Logger.error('Failed to parse Mistral AI response:', cleanedResponse);
            Logger.error('Original response:', responseText);
            throw new Error('Invalid JSON response from Mistral AI');
        }
    }

    private async processAnalysis(message: Message, analysis: any, sanitizedContent: string): Promise<void> {
        if (analysis.verdict === 'neutral') return;

        const userId = message.author.id;
        const guildId = message.guild?.id || 'dm';
        
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

    private createResponseEmbed(author: any, analysis: any, newScore: number): EmbedBuilder {
        const isGood = analysis.verdict === 'good';
        const color = isGood ? 0x00ff00 : 0xff0000;
        const emoji = isGood ? '🎉' : '⚠️';
        const title = isGood ? 
            '🇨🇳 СОЦИАЛЬНЫЙ РЕЙТИНГ ПОВЫШЕН! 🇨🇳' : 
            '🚨 СОЦИАЛЬНЫЙ РЕЙТИНГ ПОНИЖЕН! 🚨';

        return new EmbedBuilder()
            .setColor(color)
            .setTitle(title)
            .setDescription(`${emoji} **${analysis.meme_response}**`)
            .addFields(
                { name: '📊 Изменение Рейтинга', value: `${analysis.score_change > 0 ? '+' : ''}${analysis.score_change}`, inline: true },
                { name: '💯 Текущий Рейтинг', value: `${newScore}`, inline: true },
                { name: '📝 Причина', value: analysis.reason, inline: false }
            )
            .setFooter({ 
                text: `${author.username} | 中华人民共和国万岁!`,
                iconURL: author.displayAvatarURL()
            })
            .setTimestamp();
    }

    private async checkScoreThresholds(message: Message, score: number): Promise<void> {
        const member = message.member;
        if (!member) return;

        // Low score penalties
        if (score <= -500) {
            await this.applyPenalty(member, 'SEVERE');
        } else if (score <= -200) {
            await this.applyPenalty(member, 'MODERATE');
        } else if (score <= -50) {
            await this.applyPenalty(member, 'MILD');
        }

        // High score privileges
        if (score >= 1000) {
            await this.grantPrivilege(member, 'SUPREME_CITIZEN');
        } else if (score >= 500) {
            await this.grantPrivilege(member, 'MODEL_CITIZEN');
        } else if (score >= 200) {
            await this.grantPrivilege(member, 'GOOD_CITIZEN');
        }
    }

    private async applyPenalty(member: any, severity: string): Promise<void> {
        const penalties = MemeResponses.getPenalties(severity);
        // Implementation depends on server permissions and roles
        // This is a placeholder for penalty logic
        console.log(`Applying ${severity} penalty to ${member.user.username}`);
    }

    private async grantPrivilege(member: any, level: string): Promise<void> {
        const privileges = MemeResponses.getPrivileges(level);
        // Implementation depends on server permissions and roles
        // This is a placeholder for privilege logic
        console.log(`Granting ${level} privilege to ${member.user.username}`);
    }

    private async registerCommands(): Promise<void> {
        const commands = [
            new SlashCommandBuilder()
                .setName('social-credit')
                .setDescription('Check your social credit score')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('User to check (optional)')
                        .setRequired(false)
                ),
            
            new SlashCommandBuilder()
                .setName('leaderboard')
                .setDescription('View social credit leaderboard')
                .addStringOption(option =>
                    option.setName('scope')
                        .setDescription('Server or global leaderboard')
                        .setRequired(false)
                        .addChoices(
                            { name: 'This Server', value: 'server' },
                            { name: 'Global', value: 'global' }
                        )
                ),

            new SlashCommandBuilder()
                .setName('set-monitor-channel')
                .setDescription('Set channel to monitor for social credits (Admin only)')
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('Channel to monitor')
                        .setRequired(true)
                        .addChannelTypes(ChannelType.GuildText)
                ),

            new SlashCommandBuilder()
                .setName('social-credit-history')
                .setDescription('View your social credit history')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('User to check history for (optional)')
                        .setRequired(false)
                ),

            new SlashCommandBuilder()
                .setName('social-credit-stats')
                .setDescription('View server social credit statistics')
        ];

        const rest = new REST().setToken(process.env.DISCORD_TOKEN!);

        try {
            Logger.info('Started refreshing application (/) commands.');
            await rest.put(
                Routes.applicationCommands(process.env.DISCORD_CLIENT_ID!),
                { body: commands }
            );
            Logger.info('Successfully reloaded application (/) commands.');
        } catch (error) {
            Logger.error('Error registering commands:', error);
        }
    }

    public async start(): Promise<void> {
        // Validate environment variables
        if (!Validators.isValidDiscordToken(process.env.DISCORD_TOKEN || '')) {
            throw new Error('Invalid Discord token provided');
        }
        
        if (!Validators.isValidMistralKey(process.env.MISTRAL_API_KEY || '')) {
            throw new Error('Invalid Mistral API key provided');
        }
        
        if (!Validators.isValidSnowflake(process.env.DISCORD_CLIENT_ID || '')) {
            throw new Error('Invalid Discord client ID provided');
        }

        await this.databaseManager.initialize();
        await this.client.login(process.env.DISCORD_TOKEN);

        // Setup graceful shutdown
        process.on('SIGINT', this.gracefulShutdown.bind(this));
        process.on('SIGTERM', this.gracefulShutdown.bind(this));
    }

    private async gracefulShutdown(): Promise<void> {
        Logger.info('🛑 Shutting down bot gracefully...');
        
        try {
            this.client.destroy();
            await this.databaseManager.disconnect();
            Logger.info('✅ Bot shutdown complete');
            process.exit(0);
        } catch (error) {
            Logger.error('Error during shutdown:', error);
            process.exit(1);
        }
    }

    public addMonitoredChannel(guildId: string, channelId: string): void {
        this.commandHandler.addMonitoredChannel(guildId, channelId);
    }

    public removeMonitoredChannel(guildId: string, channelId: string): void {
        this.commandHandler.removeMonitoredChannel(guildId, channelId);
    }
}

// Start the bot
const bot = new SocialCreditBot();
bot.start().catch(console.error);

export default SocialCreditBot;