import { 
    ChatInputCommandInteraction, 
    EmbedBuilder, 
    User, 
    PermissionFlagsBits,
    ChannelType 
} from 'discord.js';
import { SocialCreditManager } from '../managers/SocialCreditManager';
import { DatabaseManager } from '../managers/DatabaseManager';
import { MemeResponses } from '../utils/MemeResponses';

export class CommandHandler {
    private monitoredChannels: Map<string, Set<string>> = new Map(); // guildId -> Set of channelIds

    constructor(
        private socialCreditManager: SocialCreditManager,
        private databaseManager: DatabaseManager
    ) {}

    async handleInteraction(interaction: any): Promise<void> {
        if (!interaction.isChatInputCommand()) return;

        try {
            switch (interaction.commandName) {
                case 'social-credit':
                    await this.handleSocialCreditCommand(interaction);
                    break;
                case 'leaderboard':
                    await this.handleLeaderboardCommand(interaction);
                    break;
                case 'set-monitor-channel':
                    await this.handleSetMonitorChannelCommand(interaction);
                    break;
                case 'social-credit-history':
                    await this.handleHistoryCommand(interaction);
                    break;
                case 'social-credit-stats':
                    await this.handleStatsCommand(interaction);
                    break;
                default:
                    await interaction.reply({ 
                        content: '🤔 Unknown command, citizen. The Party computers are confused.',
                        ephemeral: true 
                    });
            }
        } catch (error) {
            console.error('Error handling command:', error);
            await interaction.reply({ 
                content: '🚨 ERROR: The social credit system has malfunctioned! Please contact your local Party representative.',
                ephemeral: true 
            });
        }
    }

    private async handleSocialCreditCommand(interaction: ChatInputCommandInteraction): Promise<void> {
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const guildId = interaction.guildId || 'dm';
        
        const score = await this.socialCreditManager.getUserScore(targetUser.id, guildId);
        const rankInfo = this.socialCreditManager.getScoreRank(score);
        
        const embed = new EmbedBuilder()
            .setColor(rankInfo.color)
            .setTitle(`${rankInfo.emoji} ОТЧЁТ О СОЦИАЛЬНОМ РЕЙТИНГЕ ${rankInfo.emoji}`)
            .setDescription(`**Гражданин:** ${targetUser.username}\n**Статус:** ${rankInfo.rank}`)
            .addFields(
                { name: '💯 Текущий Рейтинг', value: `${score}`, inline: true },
                { name: '🏅 Звание', value: rankInfo.rank, inline: true },
                { name: '📝 Оценка', value: rankInfo.description, inline: false }
            )
            .setThumbnail(targetUser.displayAvatarURL())
            .setFooter({ 
                text: `${MemeResponses.getRandomMemePhrase()}`,
                iconURL: 'https://upload.wikimedia.org/wikipedia/commons/f/fa/Flag_of_the_People%27s_Republic_of_China.svg'
            })
            .setTimestamp();

        // Add penalty/privilege info if applicable
        const penaltyLevel = this.socialCreditManager.getPenaltyLevel(score);
        const privilegeLevel = this.socialCreditManager.getPrivilegeLevel(score);

        if (penaltyLevel) {
            const penalty = MemeResponses.getPenalties(penaltyLevel);
            embed.addFields({ 
                name: '⚠️ Active Penalties', 
                value: penalty.memeText, 
                inline: false 
            });
        }

        if (privilegeLevel) {
            const privilege = MemeResponses.getPrivileges(privilegeLevel);
            embed.addFields({ 
                name: '🎁 Active Privileges', 
                value: privilege.memeText, 
                inline: false 
            });
        }

        await interaction.reply({ embeds: [embed] });
    }

    private async handleLeaderboardCommand(interaction: ChatInputCommandInteraction): Promise<void> {
        const scope = interaction.options.getString('scope') || 'server';
        const guildId = interaction.guildId || 'dm';
        
        let leaderboard;
        let title;
        
        if (scope === 'global') {
            leaderboard = await this.socialCreditManager.getGlobalLeaderboard(10);
            title = MemeResponses.getLeaderboardTitle(true);
        } else {
            leaderboard = await this.socialCreditManager.getServerLeaderboard(guildId, 10);
            title = MemeResponses.getLeaderboardTitle(false);
        }

        if (leaderboard.length === 0) {
            await interaction.reply({
                content: '📊 Данные о социальном рейтинге не найдены! Начните мониторинг канала для отслеживания поведения граждан!',
                ephemeral: true
            });
            return;
        }

        const embed = new EmbedBuilder()
            .setColor(0xFFD700)
            .setTitle('🏆 ТАБЛИЦА СОЦИАЛЬНОГО РЕЙТИНГА 🏆')
            .setDescription(title)
            .setTimestamp();

        let description = '';
        for (let i = 0; i < leaderboard.length; i++) {
            const entry = leaderboard[i];
            const rank = i + 1;
            const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`;
            const scoreEmoji = MemeResponses.getScoreEmoji(entry.score);
            
            try {
                const user = await interaction.client.users.fetch(entry.userId);
                description += `${medal} **${user.username}** ${scoreEmoji} \`${entry.score}\`\n`;
            } catch (error) {
                description += `${medal} **Unknown User** ${scoreEmoji} \`${entry.score}\`\n`;
            }
        }

        embed.addFields({ 
            name: '👥 Лучшие Граждане', 
            value: description || 'Данные недоступны', 
            inline: false 
        });

        embed.setFooter({ 
            text: `${MemeResponses.getRandomMemePhrase()}` 
        });

        await interaction.reply({ embeds: [embed] });
    }

    private async handleSetMonitorChannelCommand(interaction: ChatInputCommandInteraction): Promise<void> {
        // Check if user has admin permissions
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            await interaction.reply({
                content: '🚫 Доступ запрещён! Только партийные чиновники (администраторы) могут устанавливать каналы мониторинга!',
                ephemeral: true
            });
            return;
        }

        const channel = interaction.options.getChannel('channel');
        const guildId = interaction.guildId!;

        if (!channel || channel.type !== ChannelType.GuildText) {
            await interaction.reply({
                content: '❌ Неверный канал! Пожалуйста, выберите текстовый канал для мониторинга.',
                ephemeral: true
            });
            return;
        }

        // Add channel to monitored channels
        this.addMonitoredChannel(guildId, channel.id);
        
        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('🎯 МОНИТОРИНГ АКТИВИРОВАН')
            .setDescription(`Канал ${channel} теперь отслеживается для оценки социального рейтинга!`)
            .addFields(
                { name: '📺 Отслеживаемый Канал', value: `${channel}`, inline: true },
                { name: '👁️ Статус', value: 'АКТИВЕН', inline: true }
            )
            .setFooter({ text: 'Партия видит всё! 👁️' })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }

    private async handleHistoryCommand(interaction: ChatInputCommandInteraction): Promise<void> {
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const guildId = interaction.guildId || 'dm';
        
        const history = await this.socialCreditManager.getUserHistory(targetUser.id, guildId, 10);
        
        if (history.length === 0) {
            await interaction.reply({
                content: `📜 История социального рейтинга для ${targetUser.username} не найдена. Чистый лист, гражданин!`,
                ephemeral: true
            });
            return;
        }

        const embed = new EmbedBuilder()
            .setColor(0x4169E1)
            .setTitle('📜 ИСТОРИЯ СОЦИАЛЬНОГО РЕЙТИНГА')
            .setDescription(`**Гражданин:** ${targetUser.username}\n*Недавние изменения социального рейтинга*`)
            .setThumbnail(targetUser.displayAvatarURL())
            .setTimestamp();

        let historyText = '';
        for (const entry of history) {
            const date = entry.timestamp.toLocaleDateString();
            const time = entry.timestamp.toLocaleTimeString();
            const changeEmoji = entry.scoreChange > 0 ? '📈' : '📉';
            const changeText = entry.scoreChange > 0 ? `+${entry.scoreChange}` : `${entry.scoreChange}`;
            
            historyText += `${changeEmoji} **${changeText}** - ${entry.reason}\n`;
            historyText += `*${date} at ${time}*\n\n`;
        }

        embed.addFields({ 
            name: '📊 Недавняя Активность', 
            value: historyText || 'Нет недавней активности', 
            inline: false 
        });

        embed.setFooter({ 
            text: `${MemeResponses.getRandomMemePhrase()}` 
        });

        await interaction.reply({ embeds: [embed] });
    }

    private async handleStatsCommand(interaction: ChatInputCommandInteraction): Promise<void> {
        const guildId = interaction.guildId || 'dm';
        
        const stats = await this.socialCreditManager.getServerStats(guildId);
        
        const embed = new EmbedBuilder()
            .setColor(0x9932CC)
            .setTitle('📊 СТАТИСТИКА СОЦИАЛЬНОГО РЕЙТИНГА СЕРВЕРА')
            .setDescription(MemeResponses.getStatsTitle())
            .addFields(
                { name: '👥 Всего Граждан', value: `${stats.totalUsers}`, inline: true },
                { name: '📊 Средний Рейтинг', value: `${stats.averageScore}`, inline: true },
                { name: '🏆 Высший Рейтинг', value: `${stats.highestScore}`, inline: true },
                { name: '💀 Низший Рейтинг', value: `${stats.lowestScore}`, inline: true },
                { name: '📈 Всего Изменений', value: `${stats.totalScoreChanges}`, inline: true },
                { name: '🎯 Уровень Социальной Гармонии', value: this.calculateHarmonyLevel(stats.averageScore), inline: true }
            )
            .setFooter({ 
                text: `${MemeResponses.getRandomMemePhrase()}` 
            })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }

    private calculateHarmonyLevel(averageScore: number): string {
        if (averageScore >= 1500) return '🌟 ВЫСШАЯ ГАРМОНИЯ';
        if (averageScore >= 1000) return '✅ ВЫСОКАЯ ГАРМОНИЯ';
        if (averageScore >= 500) return '😐 УМЕРЕННАЯ ГАРМОНИЯ';
        if (averageScore >= 0) return '⚠️ НИЗКАЯ ГАРМОНИЯ';
        return '🚨 СОЦИАЛЬНЫЕ БЕСПОРЯДКИ';
    }

    public isChannelMonitored(guildId: string, channelId: string): boolean {
        return this.monitoredChannels.get(guildId)?.has(channelId) || false;
    }

    public addMonitoredChannel(guildId: string, channelId: string): void {
        if (!this.monitoredChannels.has(guildId)) {
            this.monitoredChannels.set(guildId, new Set());
        }
        this.monitoredChannels.get(guildId)!.add(channelId);
    }

    public removeMonitoredChannel(guildId: string, channelId: string): void {
        this.monitoredChannels.get(guildId)?.delete(channelId);
    }
}