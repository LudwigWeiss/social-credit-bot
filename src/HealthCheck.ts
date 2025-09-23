import express from "express";
import { Client } from "discord.js";
import { DatabaseManager } from "./managers/DatabaseManager.js";
import { CONFIG } from "./config.js";

export class HealthCheck {
  private app: express.Application;
  private server: import("http").Server | undefined;

  constructor(
    private client: Client,
    private databaseManager: DatabaseManager
  ) {
    this.app = express();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    this.app.get("/health", async (req, res) => {
      try {
        // Check Discord client readiness
        const discordReady = this.client.isReady();

        // Check MongoDB connection
        const mongoConnected = await this.checkMongoConnection();

        const isHealthy = discordReady && mongoConnected;

        const healthData = {
          status: isHealthy ? "healthy" : "unhealthy",
          timestamp: new Date().toISOString(),
          checks: {
            discord: {
              status: discordReady ? "healthy" : "unhealthy",
              message: discordReady
                ? "Discord client is ready"
                : "Discord client is not ready",
            },
            mongodb: {
              status: mongoConnected ? "healthy" : "unhealthy",
              message: mongoConnected
                ? "MongoDB connected"
                : "MongoDB not connected",
            },
          },
        };

        res.status(isHealthy ? 200 : 503).json(healthData);
      } catch (error) {
        res.status(503).json({
          status: "unhealthy",
          timestamp: new Date().toISOString(),
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    // Basic info endpoint
    this.app.get("/info", (req, res) => {
      res.json({
        name: "Social Credit Bot",
        version: "2.0.0",
        description: "Discord bot for social credit scoring with gamification",
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      });
    });
  }

  private async checkMongoConnection(): Promise<boolean> {
    try {
      // Simple ping to check connection
      await this.databaseManager.getServerStats("test");
      return true;
    } catch {
      return false;
    }
  }

  start(): void {
    this.server = this.app.listen(CONFIG.HEALTH_CHECK.PORT, () => {
      console.log(
        `🚀 Health check server running on port ${CONFIG.HEALTH_CHECK.PORT}`
      );
    });
  }

  stop(): void {
    if (this.server) {
      this.server.close();
      console.log("🛑 Health check server stopped");
    }
  }
}
