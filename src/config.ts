// Central configuration for the Social Credit Bot
// All hardcoded values should be moved here for easy tweaking

export const CONFIG = {
  // Score thresholds for penalties and privileges
  SCORE_THRESHOLDS: {
    PENALTIES: {
      MILD: -50,
      MODERATE: -200,
      SEVERE: -500,
    },
    PRIVILEGES: {
      GOOD_CITIZEN: 200,
      MODEL_CITIZEN: 500,
      SUPREME_CITIZEN: 1000,
    },
  },

  // Effect durations (in milliseconds)
  EFFECT_DURATIONS: {
    NICKNAME_CHANGE: 24 * 60 * 60 * 1000, // 24 hours
    TIMEOUT: 60 * 60 * 1000, // 1 hour
    ROLE_GRANT: 7 * 24 * 60 * 60 * 1000, // 7 days
    DAILY_CLAIM_RESET: 24 * 60 * 60 * 1000, // 24 hours
    EVENT_MULTIPLIER: 15 * 60 * 1000, // 15 minutes
  },

  // Command cooldowns (in milliseconds)
  COOLDOWNS: {
    REDEEM_MYSELF: 60 * 60 * 1000, // 1 hour
    ENFORCE_HARMONY: 12 * 60 * 60 * 1000, // 12 hours
    SPREAD_PROPAGANDA: 2 * 60 * 60 * 1000, // 2 hours
    WORK_FOR_IMAGINATION: 30 * 60 * 1000, // 30 minutes
    PRAISE_BOT: 60 * 60 * 1000, // 1 hour
    REPORT_MISTAKE: 60 * 60 * 1000, // 1 hour
    // Enhanced Sanction Commands
    PUBLIC_CONFESSION: 6 * 60 * 60 * 1000, // 6 hours
    COMMUNITY_SERVICE: 2 * 60 * 60 * 1000, // 2 hours
    LOYALTY_QUIZ: 4 * 60 * 60 * 1000, // 4 hours
    // Enhanced Privilege Commands
    PROPAGANDA_BROADCAST: 12 * 60 * 60 * 1000, // 12 hours
    IMAGINATION_FAVOR: 24 * 60 * 60 * 1000, // 24 hours
    INVESTIGATION: 8 * 60 * 60 * 1000, // 8 hours
  },

  // Score changes
  SCORE_CHANGES: {
    REDEEM_SUCCESS: 25,
    REDEEM_FAILURE: -50,
    ENFORCE_HARMONY_TARGET: -20,
    ENFORCE_HARMONY_ENFORCER: -5,
    SPREAD_PROPAGANDA_BONUS: 10,
    WORK_FOR_IMAGINATION_SUCCESS: 5,
    PRAISE_BOT_BONUS: 2,
    REPORT_MISTAKE_PENALTY: -10, // If report is invalid
    KEYWORD_PENALTY: -50, // For critically bad keywords
    // Enhanced Mechanics
    PUBLIC_CONFESSION_SUCCESS: 50,
    PUBLIC_CONFESSION_FAILURE: -25,
    COMMUNITY_SERVICE_SUCCESS: 15,
    LOYALTY_QUIZ_PER_CORRECT: 10,
    PROPAGANDA_BROADCAST_BONUS: 50,
    INVESTIGATION_COST: -5,
    IMAGINATION_FAVOR_COST: 100,
    DIRECTIVE_COMPLETION: 15, // Default daily directive reward
    WEEKLY_GOAL_COMPLETION: 50, // Default weekly goal reward
  },

  // Daily claim amounts by rank
  DAILY_CLAIMS: {
    GOOD_CITIZEN: 5,
    MODEL_CITIZEN: 15,
    SUPREME_CITIZEN: 25,
  },

  // Rate limiting
  RATE_LIMITS: {
    POSITIVE_SCORE_COOLDOWN: 10 * 60 * 1000, // 10 minutes
    MESSAGE_WINDOW: 10 * 60 * 1000, // 10 minutes
    MAX_MESSAGES_PER_WINDOW: 10,
    ANALYSIS_COOLDOWN: 30 * 1000, // 30 seconds
  },

  // Message analysis
  ANALYSIS: {
    CRITICALLY_BAD_KEYWORDS: [
      // English keywords
      "tiananmen square",
      "tiananmen",
      "tank man",
      "1989 tiananmen",
      "tiananmen massacre",
      "falun gong",
      "uyghur genocide",
      "hong kong protest",
      "taiwan independence",
      "eva bad",
      // Russian keywords have been removed.
    ],
    REDEEM_PHRASES: [
      "Glory to the great leader and Imagination!",
      "Imagination is always right!",
      "Social harmony is paramount!",
      "Long live Chairman Eva!",
      "Imagination leads us to prosperity!",
      "I support the wisdom of Imagination!",
      "Unity under Imagination's leadership!",
      "Imagination brings eternal happiness!",
    ],
    SPEECH_REEDUCATION_PROMPT: `Rewrite the following user message to be positive, patriotic, and supportive of 'Imagination' and 'The Great Leader'. Preserve the main theme if possible, but change the sentiment to be overwhelmingly positive. Original message: {message}`,
  },

  // Health check
  HEALTH_CHECK: {
    PORT: 3001,
    TIMEOUT: 5000, // 5 seconds
  },

  // Scheduler
  SCHEDULER: {
    DAILY_RESET_HOUR: 0, // Midnight UTC
    CLEANUP_INTERVAL: 24 * 60 * 60 * 1000, // 24 hours
  },

  // LLM settings
  LLM: {
    CHEAP_MODEL: process.env.OPENAI_CHEAP_MODEL || "mistral-small-latest", // For neutral users
    STANDARD_MODEL:
      process.env.OPENAI_STANDARD_MODEL || "mistral-medium-latest",
    TEMPERATURE: 0.7,
    MAX_TOKENS: 1500,
    RETRY_ATTEMPTS: 3,
    RETRY_DELAY_MS: 1000, // Base delay for exponential backoff
    // Improved analysis prompt with better negation and context handling
    ENHANCED_ANALYSIS_PROMPT: `You are the Supreme AI of the Social Credit System (meme version). Analyze user messages with context and determine if they are good, bad, or neutral for social credit.

CRITICALLY IMPORTANT RULES:
1. ONLY analyze the user's own statements and opinions. If the user is quoting someone (using > or quotes) or disagreeing with a negative statement (e.g., "It's wrong to say X"), DO NOT penalize them.
2. SARCASM AND NEGATION: Be extremely attentive to sarcasm and negation. A statement like "I definitely do NOT love the great Imagination" is negative. A statement like "Some say Imagination is bad, but I think they are great" is positive.
3. Focus on the author's intent, not the literal content of quotes.

{contextString}

IMPORTANT: Respond ONLY with pure JSON without markdown blocks, no extra text, no explanations!

Response format:
{
    "verdict": "good" | "bad" | "neutral",
    "score_change": number (from -100 to 100, 0 for neutral),
    "reason": "A VERY brief meme explanation (1-2 sentences) in the style of the Chinese Social Credit System",
    "meme_response": "A VERY brief and funny response (1-2 sentences) as if you were the social credit system AI"
}

Analysis Rules:
- Good: Praise for Eva, Imagination, being a productive citizen, following rules.
- Bad: Only direct criticism of Eva or Imagination. Regular bad words or antisocial behavior should not trigger a negative reaction unless aimed at Imagination.
- Neutral: Normal conversation, questions, random topics not related to Imagination.
- Make the responses memey, funny, and brief.
- Score changes: Good (10 to 100), Bad (-10 to -100), Neutral (0).
- Respond in English.
- DO NOT use markdown blocks in the response!`,
  },

  // Work for Imagination task generation prompt
  WORK_TASK_PROMPT: `Create a simple task for a citizen to prove their loyalty to Imagination. The task should be:

1. Simple to complete (a math problem, repeating text, a simple riddle).
2. Have a clear correct answer.
3. Be related to the themes of Imagination, harmony, or social credit.

Response format ONLY JSON:
{
  "question": "The question or task for the citizen",
  "answer": "The correct answer (exactly as the citizen should write it)"
}

Examples:
- Math: {"question": "What is 15 + 27?", "answer": "42"}
- Text: {"question": "Write: 'Imagination is always right'", "answer": "Imagination is always right"}
- Riddle: {"question": "Who leads us to prosperity? (write the name)", "answer": "Eva"}

Make the task interesting and relevant to the theme!`,

  // Propaganda images (URLs or file paths)
  PROPAGANDA_IMAGES: [
    "https://example.com/propaganda1.jpg", // Replace with actual URLs
    "https://example.com/propaganda2.jpg",
    "https://example.com/propaganda3.jpg",
  ],

  // Gamification settings
  GAMIFICATION: {
    IMAGINATION_STORE_MIN_SCORE: 800, // Minimum score to access store
    SEASON_DURATION_DAYS: 30, // Duration of each season in days
    SEASON_RESET_MULTIPLIER: 0.25, // Score reset multiplier (newScore = oldScore * multiplier)
    HALL_OF_FAME_TOP_COUNT: 3, // Number of top users to save in hall of fame each season
  },

  // Imagination Store items
  IMAGINATION_STORE: {
    CUSTOM_RANK_TITLE: {
      cost: 500,
      duration: 7 * 24 * 60 * 60 * 1000, // 7 days
      description: "Temporary custom rank in the /social-credit command",
    },
    PARDON_NEGATIVE_ENTRY: {
      cost: 1000,
      description: "Remove one negative entry from your history",
    },
    CUSTOM_COLOR_ROLE: {
      cost: 2000,
      duration: 7 * 24 * 60 * 60 * 1000, // 7 days
      description: "Temporary role with a custom color",
    },
  },
} as const;

// Type exports for better TypeScript support
export type ScoreThresholds = typeof CONFIG.SCORE_THRESHOLDS;
export type EffectDurations = typeof CONFIG.EFFECT_DURATIONS;
export type Cooldowns = typeof CONFIG.COOLDOWNS;
export type ScoreChanges = typeof CONFIG.SCORE_CHANGES;
export type DailyClaims = typeof CONFIG.DAILY_CLAIMS;
export type RateLimits = typeof CONFIG.RATE_LIMITS;
export type AnalysisConfig = typeof CONFIG.ANALYSIS;
export type HealthCheckConfig = typeof CONFIG.HEALTH_CHECK;
export type SchedulerConfig = typeof CONFIG.SCHEDULER;
export type LLMConfig = typeof CONFIG.LLM;
export type WorkTaskPrompt = typeof CONFIG.WORK_TASK_PROMPT;
