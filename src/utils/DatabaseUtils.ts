import { DatabaseManager } from '../managers/DatabaseManager';
import { Logger } from './Logger';

export class DatabaseUtils {
    static async performMaintenance(db: DatabaseManager): Promise<void> {
        Logger.info('🔧 Starting database maintenance...');
        
        try {
            // Clean up old history entries (keep last 90 days)
            await db.cleanupOldHistory(90);
            
            Logger.info('✅ Database maintenance completed successfully');
        } catch (error) {
            Logger.error('❌ Database maintenance failed:', error);
        }
    }

    static async getHealthCheck(db: DatabaseManager): Promise<{
        status: 'healthy' | 'unhealthy';
        details: {
            mongodb: boolean;
            collections: {
                users: boolean;
                scoreHistory: boolean;
            };
        };
    }> {
        try {
            // Test basic database operations
            const testUserId = 'health-check-user';
            const testGuildId = 'health-check-guild';
            
            // Try to get user score (should return null for non-existent user)
            const userScore = await db.getUserScore(testUserId, testGuildId);
            
            // Try to get server stats
            const stats = await db.getServerStats(testGuildId);
            
            return {
                status: 'healthy',
                details: {
                    mongodb: true,
                    collections: {
                        users: true,
                        scoreHistory: true
                    }
                }
            };
        } catch (error) {
            Logger.error('Database health check failed:', error);
            return {
                status: 'unhealthy',
                details: {
                    mongodb: false,
                    collections: {
                        users: false,
                        scoreHistory: false
                    }
                }
            };
        }
    }

    static async migrateData(): Promise<void> {
        // This function can be used for future data migrations
        Logger.info('🔄 No migrations needed at this time');
    }
}