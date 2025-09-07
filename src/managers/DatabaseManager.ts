import mongoose from 'mongoose';
import { User, IUser } from '../models/User';
import { ScoreHistory, IScoreHistory } from '../models/ScoreHistory';
import { SocialCreditEntry, ScoreHistory as ScoreHistoryType } from './SocialCreditManager';
import { Logger } from '../utils/Logger';

export class DatabaseManager {
    private connectionString: string;

    constructor() {
        this.connectionString = process.env.MONGODB_URI || 'mongodb://localhost:27017/social-credit-bot';
    }

    async initialize(): Promise<void> {
        try {
            await mongoose.connect(this.connectionString, {
                maxPoolSize: 10,
                serverSelectionTimeoutMS: 5000,
                socketTimeoutMS: 45000,
            });

            Logger.info('📊 MongoDB connected successfully!');
            
            // Create indexes if they don't exist
            await this.createIndexes();
            
            Logger.info('📊 Database initialized successfully!');
        } catch (error) {
            Logger.error('Failed to connect to MongoDB:', error);
            throw error;
        }
    }

    private async createIndexes(): Promise<void> {
        try {
            await User.createIndexes();
            await ScoreHistory.createIndexes();
            Logger.info('📊 Database indexes created successfully!');
        } catch (error) {
            Logger.error('Failed to create database indexes:', error);
        }
    }

    async disconnect(): Promise<void> {
        try {
            await mongoose.disconnect();
            Logger.info('📊 MongoDB disconnected successfully!');
        } catch (error) {
            Logger.error('Failed to disconnect from MongoDB:', error);
        }
    }


    async getUserScore(userId: string, guildId: string): Promise<SocialCreditEntry | null> {
        try {
            const user = await User.findOne({ userId, guildId }).lean();
            if (!user) return null;

            return {
                userId: user.userId,
                guildId: user.guildId,
                score: user.score,
                lastUpdated: user.lastUpdated,
                totalChanges: user.totalChanges
            };
        } catch (error) {
            Logger.error('Error getting user score:', error);
            return null;
        }
    }

    async updateUserScore(userId: string, guildId: string, newScore: number, username?: string): Promise<void> {
        try {
            await User.findOneAndUpdate(
                { userId, guildId },
                {
                    $set: {
                        score: newScore,
                        lastUpdated: new Date(),
                        ...(username && { username })
                    },
                    $inc: { totalChanges: 1 }
                },
                {
                    upsert: true,
                    new: true,
                    setDefaultsOnInsert: true
                }
            );
        } catch (error) {
            Logger.error('Error updating user score:', error);
            throw error;
        }
    }

    async addScoreHistory(
        userId: string, 
        guildId: string, 
        scoreChange: number, 
        previousScore: number,
        newScore: number,
        reason: string,
        messageContent?: string
    ): Promise<void> {
        try {
            const historyEntry = new ScoreHistory({
                userId,
                guildId,
                scoreChange,
                previousScore,
                newScore,
                reason,
                messageContent,
                timestamp: new Date()
            });

            await historyEntry.save();
        } catch (error) {
            Logger.error('Error adding score history:', error);
            throw error;
        }
    }

    async getServerLeaderboard(guildId: string, limit: number = 10): Promise<SocialCreditEntry[]> {
        try {
            const users = await User.find({ guildId })
                .sort({ score: -1 })
                .limit(limit)
                .lean();

            return users.map(user => ({
                userId: user.userId,
                guildId: user.guildId,
                score: user.score,
                lastUpdated: user.lastUpdated,
                totalChanges: user.totalChanges
            }));
        } catch (error) {
            Logger.error('Error getting server leaderboard:', error);
            return [];
        }
    }

    async getGlobalLeaderboard(limit: number = 10): Promise<SocialCreditEntry[]> {
        try {
            const pipeline: any[] = [
                {
                    $group: {
                        _id: '$userId',
                        totalScore: { $sum: '$score' },
                        lastUpdated: { $max: '$lastUpdated' },
                        totalChanges: { $sum: '$totalChanges' }
                    }
                },
                {
                    $sort: { totalScore: -1 }
                },
                {
                    $limit: limit
                }
            ];

            const results = await User.aggregate(pipeline);

            return results.map(result => ({
                userId: result._id,
                guildId: 'global',
                score: result.totalScore,
                lastUpdated: result.lastUpdated,
                totalChanges: result.totalChanges
            }));
        } catch (error) {
            Logger.error('Error getting global leaderboard:', error);
            return [];
        }
    }

    async getUserHistory(userId: string, guildId: string, limit: number = 10): Promise<ScoreHistoryType[]> {
        try {
            const history = await ScoreHistory.find({ userId, guildId })
                .sort({ timestamp: -1 })
                .limit(limit)
                .lean();

            return history.map(entry => ({
                id: entry._id.toString(),
                userId: entry.userId,
                guildId: entry.guildId,
                scoreChange: entry.scoreChange,
                reason: entry.reason,
                timestamp: entry.timestamp,
                messageContent: entry.messageContent
            }));
        } catch (error) {
            Logger.error('Error getting user history:', error);
            return [];
        }
    }

    async getServerStats(guildId: string): Promise<{
        totalUsers: number;
        averageScore: number;
        highestScore: number;
        lowestScore: number;
        totalScoreChanges: number;
    }> {
        try {
            const pipeline = [
                { $match: { guildId } },
                {
                    $group: {
                        _id: null,
                        totalUsers: { $sum: 1 },
                        averageScore: { $avg: '$score' },
                        highestScore: { $max: '$score' },
                        lowestScore: { $min: '$score' },
                        totalScoreChanges: { $sum: '$totalChanges' }
                    }
                }
            ];

            const results = await User.aggregate(pipeline);

            if (results.length === 0) {
                return {
                    totalUsers: 0,
                    averageScore: 1000,
                    highestScore: 1000,
                    lowestScore: 1000,
                    totalScoreChanges: 0
                };
            }

            const stats = results[0];
            return {
                totalUsers: stats.totalUsers,
                averageScore: Math.round(stats.averageScore),
                highestScore: stats.highestScore,
                lowestScore: stats.lowestScore,
                totalScoreChanges: stats.totalScoreChanges
            };
        } catch (error) {
            Logger.error('Error getting server stats:', error);
            return {
                totalUsers: 0,
                averageScore: 1000,
                highestScore: 1000,
                lowestScore: 1000,
                totalScoreChanges: 0
            };
        }
    }

    async cleanupOldHistory(daysToKeep: number = 90): Promise<void> {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

            const result = await ScoreHistory.deleteMany({
                timestamp: { $lt: cutoffDate }
            });

            Logger.info(`🧹 Cleaned up ${result.deletedCount} old history entries`);
        } catch (error) {
            Logger.error('Error cleaning up old history:', error);
        }
    }
}