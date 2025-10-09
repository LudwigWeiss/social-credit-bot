import { OpenAI } from "openai";
import { DatabaseManager } from "./DatabaseManager.js";
import { SocialCreditManager } from "./SocialCreditManager.js";

import { CONFIG } from "../config.js";
import { Logger } from "../utils/Logger.js";

export interface DailyDirective {
  id: string;
  userId: string;
  guildId: string;
  task: string;
  description: string;
  targetValue: number;
  currentProgress: number;
  reward: number;
  createdAt: Date;
  expiresAt: Date;
  completed: boolean;
  taskType:
    | "MESSAGE_COUNT"
    | "KEYWORD_USAGE"
    | "INTERACTION"
    | "SCORE_GAIN"
    | "CUSTOM";
  metadata?: Record<string, unknown>;
}

export interface WeeklyGoal {
  id: string;
  userId: string;
  guildId: string;
  goal: string;
  description: string;
  targetValue: number;
  currentProgress: number;
  reward: number;
  createdAt: Date;
  expiresAt: Date;
  completed: boolean;
  goalType: "NET_SCORE_GAIN" | "TOTAL_MESSAGES" | "HELP_OTHERS" | "CUSTOM";
  metadata?: Record<string, unknown>;
}

export interface DirectiveGenerationPrompt {
  userScore: number;
  recentActivity: string;
  completedDirectivesCount: number;
}

export class DirectiveManager {
  private dailyDirectives: Map<string, DailyDirective[]> = new Map(); // userId -> directives
  private weeklyGoals: Map<string, WeeklyGoal[]> = new Map(); // userId -> goals

  constructor(
    private openai: OpenAI,
    private databaseManager: DatabaseManager,
    private socialCreditManager: SocialCreditManager
  ) {
    this.startCleanupInterval();
  }

  /**
   * Generate a personalized daily directive for a user
   */
  async generateDailyDirective(
    userId: string,
    guildId: string,
    prompt: DirectiveGenerationPrompt
  ): Promise<DailyDirective | null> {
    const directiveId = `daily_${userId}_${guildId}_${Date.now()}`;

    // Check if user already has an active daily directive
    const existingDirectives = this.getDailyDirectives(userId, guildId);
    const activeDirective = existingDirectives.find(
      (d) => !d.completed && d.expiresAt > new Date()
    );

    if (activeDirective) {
      Logger.debug(`User ${userId} already has active daily directive`);
      return activeDirective;
    }

    const generationPrompt = `Create a personalized daily directive for a citizen in a Discord social credit system bot.

User Information:
- Current Social Credit: ${prompt.userScore}
- Recent Activity: ${prompt.recentActivity}
- Previously Completed Directives: ${prompt.completedDirectivesCount}

Create a directive that:
1. Is suitable for the user's current level.
2. Encourages positive interaction.
3. Is related to the social credit theme.
4. Is achievable in one day.

YOU MUST respond in the exact JSON format:
{
  "task": "A brief title for the task",
  "description": "A detailed description of what needs to be done",
  "taskType": "MESSAGE_COUNT" | "KEYWORD_USAGE" | "INTERACTION" | "SCORE_GAIN",
  "targetValue": target_number,
  "reward": reward_number_from_5_to_25,
  "metadata": {
    "keywords": ["keyword1", "keyword2"], // if taskType is KEYWORD_USAGE
    "interactions": ["reaction", "mention"] // if taskType is INTERACTION
  }
}

Examples:
- MESSAGE_COUNT: Send 5 messages in monitored channels.
- KEYWORD_USAGE: Use the words "harmony", "party", "unity" 3 times.
- INTERACTION: React to 10 messages or mention 3 citizens.
- SCORE_GAIN: Earn +15 social credit in a day.`;

    try {
      const completion = await this.openai.chat.completions.create({
        model: CONFIG.LLM.STANDARD_MODEL,
        messages: [{ role: "user", content: generationPrompt }],
        temperature: 0.8,
        max_tokens: 600,
      });

      const response = completion.choices?.[0]?.message?.content;
      if (!response) {
        Logger.error("No response from OpenAI for daily directive generation");
        return null;
      }

      // Parse the response
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

      const directiveData = JSON.parse(jsonString);

      // Validate and create directive
      if (
        !directiveData.task ||
        !directiveData.description ||
        !directiveData.taskType ||
        !directiveData.targetValue ||
        !directiveData.reward
      ) {
        throw new Error("Invalid directive data structure");
      }

      // Ensure reward is reasonable
      directiveData.reward = Math.max(5, Math.min(25, directiveData.reward));

      const directive: DailyDirective = {
        id: directiveId,
        userId,
        guildId,
        task: directiveData.task,
        description: directiveData.description,
        targetValue: directiveData.targetValue,
        currentProgress: 0,
        reward: directiveData.reward,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        completed: false,
        taskType: directiveData.taskType,
        metadata: directiveData.metadata || {},
      };

      // Store directive
      if (!this.dailyDirectives.has(userId)) {
        this.dailyDirectives.set(userId, []);
      }
      this.dailyDirectives.get(userId)!.push(directive);

      Logger.info(
        `Generated daily directive for user ${userId}: ${directive.task}`
      );
      return directive;
    } catch (error) {
      Logger.error(
        `Error generating daily directive for user ${userId}:`,
        error
      );
      return this.createFallbackDirective(userId, guildId);
    }
  }

  /**
   * Generate a weekly goal for a user
   */
  async generateWeeklyGoal(
    userId: string,
    guildId: string,
    prompt: DirectiveGenerationPrompt
  ): Promise<WeeklyGoal | null> {
    const goalId = `weekly_${userId}_${guildId}_${Date.now()}`;

    // Check if user already has an active weekly goal
    const existingGoals = this.getWeeklyGoals(userId, guildId);
    const activeGoal = existingGoals.find(
      (g) => !g.completed && g.expiresAt > new Date()
    );

    if (activeGoal) {
      Logger.debug(`User ${userId} already has active weekly goal`);
      return activeGoal;
    }

    const generationPrompt = `Create a personalized weekly goal for a citizen in a Discord social credit system bot.

User Information:
- Current Social Credit: ${prompt.userScore}
- Recent Activity: ${prompt.recentActivity}
- Previously Completed Directives: ${prompt.completedDirectivesCount}

Create a goal that:
1. Is achievable within a week.
2. Is meaningful and motivates activity.
3. Is suitable for the user's level.
4. Encourages community participation.

YOU MUST respond in the exact JSON format:
{
  "goal": "A brief title for the goal",
  "description": "A detailed description of what needs to be achieved",
  "goalType": "NET_SCORE_GAIN" | "TOTAL_MESSAGES" | "HELP_OTHERS",
  "targetValue": target_number,
  "reward": reward_number_from_25_to_100
}

Examples:
- NET_SCORE_GAIN: Achieve a net gain of +100 social credit in a week.
- TOTAL_MESSAGES: Send 50 helpful messages in monitored channels.
- HELP_OTHERS: Help 5 other citizens improve their score.`;

    try {
      const completion = await this.openai.chat.completions.create({
        model: CONFIG.LLM.STANDARD_MODEL,
        messages: [{ role: "user", content: generationPrompt }],
        temperature: 0.8,
        max_tokens: 500,
      });

      const response = completion.choices?.[0]?.message?.content;
      if (!response) {
        Logger.error("No response from OpenAI for weekly goal generation");
        return null;
      }

      // Parse the response
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

      const goalData = JSON.parse(jsonString);

      // Validate and create goal
      if (
        !goalData.goal ||
        !goalData.description ||
        !goalData.goalType ||
        !goalData.targetValue ||
        !goalData.reward
      ) {
        throw new Error("Invalid goal data structure");
      }

      // Ensure reward is reasonable
      goalData.reward = Math.max(25, Math.min(100, goalData.reward));

      const goal: WeeklyGoal = {
        id: goalId,
        userId,
        guildId,
        goal: goalData.goal,
        description: goalData.description,
        targetValue: goalData.targetValue,
        currentProgress: 0,
        reward: goalData.reward,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        completed: false,
        goalType: goalData.goalType,
        metadata: {},
      };

      // Store goal
      if (!this.weeklyGoals.has(userId)) {
        this.weeklyGoals.set(userId, []);
      }
      this.weeklyGoals.get(userId)!.push(goal);

      Logger.info(`Generated weekly goal for user ${userId}: ${goal.goal}`);
      return goal;
    } catch (error) {
      Logger.error(`Error generating weekly goal for user ${userId}:`, error);
      return this.createFallbackWeeklyGoal(userId, guildId);
    }
  }

  /**
   * Update progress on user's directives based on activity
   */
  async updateDirectiveProgress(
    userId: string,
    guildId: string,
    activityType: string,
    value: number = 1,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const dailyDirectives = this.getDailyDirectives(userId, guildId);
    const weeklyGoals = this.getWeeklyGoals(userId, guildId);

    // Update daily directives
    for (const directive of dailyDirectives) {
      if (directive.completed || directive.expiresAt <= new Date()) continue;

      let shouldUpdate = false;
      let progressIncrease = 0;

      switch (directive.taskType) {
        case "MESSAGE_COUNT":
          if (activityType === "message_sent") {
            shouldUpdate = true;
            progressIncrease = value;
          }
          break;

        case "KEYWORD_USAGE":
          if (activityType === "keyword_used" && metadata?.keyword) {
            const targetKeywords =
              (directive.metadata?.keywords as string[]) || [];
            if (targetKeywords.includes(metadata.keyword as string)) {
              shouldUpdate = true;
              progressIncrease = value;
            }
          }
          break;

        case "INTERACTION":
          if (
            activityType === "reaction_added" ||
            activityType === "user_mentioned"
          ) {
            shouldUpdate = true;
            progressIncrease = value;
          }
          break;

        case "SCORE_GAIN":
          if (activityType === "score_changed" && value > 0) {
            shouldUpdate = true;
            progressIncrease = value;
          }
          break;
      }

      if (shouldUpdate) {
        directive.currentProgress += progressIncrease;

        // Check if directive is completed
        if (directive.currentProgress >= directive.targetValue) {
          await this.completeDirective(directive);
        }
      }
    }

    // Update weekly goals
    for (const goal of weeklyGoals) {
      if (goal.completed || goal.expiresAt <= new Date()) continue;

      let shouldUpdate = false;
      let progressIncrease = 0;

      switch (goal.goalType) {
        case "NET_SCORE_GAIN":
          if (activityType === "score_changed") {
            shouldUpdate = true;
            progressIncrease = value; // Can be negative
          }
          break;

        case "TOTAL_MESSAGES":
          if (activityType === "message_sent") {
            shouldUpdate = true;
            progressIncrease = value;
          }
          break;

        case "HELP_OTHERS":
          if (activityType === "helped_other_user") {
            shouldUpdate = true;
            progressIncrease = value;
          }
          break;
      }

      if (shouldUpdate) {
        goal.currentProgress += progressIncrease;

        // Check if goal is completed
        if (goal.currentProgress >= goal.targetValue) {
          await this.completeWeeklyGoal(goal);
        }
      }
    }
  }

  /**
   * Complete a daily directive and grant reward
   */
  private async completeDirective(directive: DailyDirective): Promise<void> {
    if (directive.completed) return;

    directive.completed = true;

    try {
      await this.socialCreditManager.updateScore(
        directive.userId,
        directive.guildId,
        directive.reward,
        `Completed daily directive: ${directive.task}`,
        undefined
      );

      Logger.info(
        `User ${directive.userId} completed daily directive: ${directive.task} (+${directive.reward} score)`
      );
    } catch (error) {
      Logger.error(
        `Error completing directive for user ${directive.userId}:`,
        error
      );
    }
  }

  /**
   * Complete a weekly goal and grant reward
   */
  private async completeWeeklyGoal(goal: WeeklyGoal): Promise<void> {
    if (goal.completed) return;

    goal.completed = true;

    try {
      await this.socialCreditManager.updateScore(
        goal.userId,
        goal.guildId,
        goal.reward,
        `Completed weekly goal: ${goal.goal}`,
        undefined
      );

      Logger.info(
        `User ${goal.userId} completed weekly goal: ${goal.goal} (+${goal.reward} score)`
      );
    } catch (error) {
      Logger.error(
        `Error completing weekly goal for user ${goal.userId}:`,
        error
      );
    }
  }

  /**
   * Get active daily directives for user
   */
  getDailyDirectives(userId: string, guildId?: string): DailyDirective[] {
    const userDirectives = this.dailyDirectives.get(userId) || [];

    if (guildId) {
      return userDirectives.filter(
        (d) => d.guildId === guildId && d.expiresAt > new Date()
      );
    }

    return userDirectives.filter((d) => d.expiresAt > new Date());
  }

  /**
   * Get active weekly goals for user
   */
  getWeeklyGoals(userId: string, guildId?: string): WeeklyGoal[] {
    const userGoals = this.weeklyGoals.get(userId) || [];

    if (guildId) {
      return userGoals.filter(
        (g) => g.guildId === guildId && g.expiresAt > new Date()
      );
    }

    return userGoals.filter((g) => g.expiresAt > new Date());
  }

  /**
   * Create fallback directive when LLM fails
   */
  private createFallbackDirective(
    userId: string,
    guildId: string
  ): DailyDirective {
    const directiveId = `daily_${userId}_${guildId}_${Date.now()}`;

    const fallbackDirectives = [
      {
        task: "Active Citizen",
        description: "Send 3 messages in monitored channels",
        taskType: "MESSAGE_COUNT" as const,
        targetValue: 3,
        reward: 10,
      },
      {
        task: "Loyalty to the Party",
        description:
          "Use the words 'party', 'harmony', or 'unity' 2 times in messages",
        taskType: "KEYWORD_USAGE" as const,
        targetValue: 2,
        reward: 15,
        metadata: { keywords: ["party", "harmony", "unity"] },
      },
      {
        task: "Social Interaction",
        description: "React to 5 messages from other users",
        taskType: "INTERACTION" as const,
        targetValue: 5,
        reward: 12,
      },
    ];

    const selected =
      fallbackDirectives[Math.floor(Math.random() * fallbackDirectives.length)];

    const directive: DailyDirective = {
      id: directiveId,
      userId,
      guildId,
      task: selected.task,
      description: selected.description,
      targetValue: selected.targetValue,
      currentProgress: 0,
      reward: selected.reward,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      completed: false,
      taskType: selected.taskType,
      metadata: selected.metadata || {},
    };

    if (!this.dailyDirectives.has(userId)) {
      this.dailyDirectives.set(userId, []);
    }
    this.dailyDirectives.get(userId)!.push(directive);

    return directive;
  }

  /**
   * Create fallback weekly goal when LLM fails
   */
  private createFallbackWeeklyGoal(
    userId: string,
    guildId: string
  ): WeeklyGoal {
    const goalId = `weekly_${userId}_${guildId}_${Date.now()}`;

    const fallbackGoals = [
      {
        goal: "Weekly Progress",
        description:
          "Achieve a net gain of +50 social credit in a week",
        goalType: "NET_SCORE_GAIN" as const,
        targetValue: 50,
        reward: 40,
      },
      {
        goal: "Active Participation",
        description: "Send 25 messages in monitored channels in a week",
        goalType: "TOTAL_MESSAGES" as const,
        targetValue: 25,
        reward: 35,
      },
    ];

    const selected =
      fallbackGoals[Math.floor(Math.random() * fallbackGoals.length)];

    const goal: WeeklyGoal = {
      id: goalId,
      userId,
      guildId,
      goal: selected.goal,
      description: selected.description,
      targetValue: selected.targetValue,
      currentProgress: 0,
      reward: selected.reward,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      completed: false,
      goalType: selected.goalType,
      metadata: {},
    };

    if (!this.weeklyGoals.has(userId)) {
      this.weeklyGoals.set(userId, []);
    }
    this.weeklyGoals.get(userId)!.push(goal);

    return goal;
  }

  /**
   * Clean up expired directives and goals
   */
  private cleanupExpired(): void {
    const now = new Date();
    let totalCleaned = 0;

    // Clean daily directives
    for (const [userId, directives] of this.dailyDirectives.entries()) {
      const activeDirectives = directives.filter((d) => d.expiresAt > now);
      const cleanedCount = directives.length - activeDirectives.length;

      if (cleanedCount > 0) {
        this.dailyDirectives.set(userId, activeDirectives);
        totalCleaned += cleanedCount;
      }

      if (activeDirectives.length === 0) {
        this.dailyDirectives.delete(userId);
      }
    }

    // Clean weekly goals
    for (const [userId, goals] of this.weeklyGoals.entries()) {
      const activeGoals = goals.filter((g) => g.expiresAt > now);
      const cleanedCount = goals.length - activeGoals.length;

      if (cleanedCount > 0) {
        this.weeklyGoals.set(userId, activeGoals);
        totalCleaned += cleanedCount;
      }

      if (activeGoals.length === 0) {
        this.weeklyGoals.delete(userId);
      }
    }

    if (totalCleaned > 0) {
      Logger.info(`Cleaned up ${totalCleaned} expired directives and goals`);
    }
  }

  /**
   * Start cleanup interval
   */
  private startCleanupInterval(): void {
    // Clean up every hour
    setInterval(
      () => {
        this.cleanupExpired();
      },
      60 * 60 * 1000
    );
  }

  /**
   * Get directive/goal statistics
   */
  getStats(): {
    totalActiveDirectives: number;
    totalActiveGoals: number;
    usersWithDirectives: number;
    usersWithGoals: number;
    completedDirectivesToday: number;
    completedGoalsThisWeek: number;
  } {
    let totalActiveDirectives = 0;
    let totalActiveGoals = 0;
    let completedDirectivesToday = 0;
    let completedGoalsThisWeek = 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    // Count directives
    for (const directives of this.dailyDirectives.values()) {
      for (const directive of directives) {
        if (directive.expiresAt > new Date()) {
          totalActiveDirectives++;
        }
        if (directive.completed && directive.createdAt >= today) {
          completedDirectivesToday++;
        }
      }
    }

    // Count goals
    for (const goals of this.weeklyGoals.values()) {
      for (const goal of goals) {
        if (goal.expiresAt > new Date()) {
          totalActiveGoals++;
        }
        if (goal.completed && goal.createdAt >= weekAgo) {
          completedGoalsThisWeek++;
        }
      }
    }

    return {
      totalActiveDirectives,
      totalActiveGoals,
      usersWithDirectives: this.dailyDirectives.size,
      usersWithGoals: this.weeklyGoals.size,
      completedDirectivesToday,
      completedGoalsThisWeek,
    };
  }

  /**
   * Cleanup method for graceful shutdown
   */
  cleanup(): void {
    // Clear all data
    this.dailyDirectives.clear();
    this.weeklyGoals.clear();
    Logger.info("DirectiveManager cleanup completed");
  }
}
