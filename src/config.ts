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
    WORK_FOR_PARTY: 30 * 60 * 1000, // 30 minutes
    PRAISE_BOT: 60 * 60 * 1000, // 1 hour
    REPORT_MISTAKE: 60 * 60 * 1000, // 1 hour
  },

  // Score changes
  SCORE_CHANGES: {
    REDEEM_SUCCESS: 25,
    REDEEM_FAILURE: -50,
    ENFORCE_HARMONY_TARGET: -20,
    ENFORCE_HARMONY_ENFORCER: -5,
    SPREAD_PROPAGANDA_BONUS: 10,
    WORK_FOR_PARTY_SUCCESS: 5,
    PRAISE_BOT_BONUS: 2,
    REPORT_MISTAKE_PENALTY: -10, // If report is invalid
    KEYWORD_PENALTY: -50, // For critically bad keywords
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
      "xi jinping bad",
      "communism bad",
      "socialism bad",
      // Russian keywords
      "тяньаньмэнь",
      "танковый человек",
      "резня на тяньаньмэнь",
      "фалуньгун",
      "геноцид уйгуров",
      "протесты в гонконге",
      "независимость тайваня",
      "си цзиньпин плохой",
      "коммунизм плохой",
      "социализм плохой",
      "китай плохие",
      "партия плохие",
      "председатель плохие",
    ],
    REDEEM_PHRASES: [
      "Слава великому лидеру и Партии!",
      "Партия всегда права!",
      "Социальная гармония превыше всего!",
      "Да здравствует Председатель Си!",
      "Коммунистическая партия ведет нас к процветанию!",
      "Я поддерживаю мудрость Партии!",
      "Единство под руководством Партии!",
      "Партия приносит вечное счастье!",
    ],
    SPEECH_REEDUCATION_PROMPT: `Перепишите следующее сообщение пользователя, чтобы оно было позитивным, патриотичным и поддерживающим 'Партию' и 'Великого Лидер'. Сохраните основную тему если возможно, но измените sentiment на overwhelmingly положительный. Оригинальное сообщение: {message}`,
  },

  // Events
  EVENTS: {
    INTERVAL_MIN: 2 * 60 * 60 * 1000, // 2 hours
    INTERVAL_MAX: 4 * 60 * 60 * 1000, // 4 hours
    PARTY_INSPECTOR_DURATION: 15 * 60 * 1000, // 15 minutes
    PARTY_INSPECTOR_MULTIPLIER: 2,
    SOCIAL_HARMONY_DURATION: 60 * 60 * 1000, // 1 hour
    PRODUCTION_QUOTA_DURATION: 10 * 60 * 1000, // 10 minutes
    PRODUCTION_QUOTA_BONUS: 10,
    SPY_INFILTRATION_DURATION: 5 * 60 * 1000, // 5 minutes
    SPY_INFILTRATION_BONUS: 50,
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
    CHEAP_MODEL: "mistral-small-latest", // For neutral users
    STANDARD_MODEL: "mistral-medium-latest",
    TEMPERATURE: 0.7,
    MAX_TOKENS: 1500,
  },

  // Work for the party task generation prompt
  WORK_TASK_PROMPT: `Создайте простое задание для гражданина, которое поможет ему доказать преданность Партии. Задание должно быть:

1. Простым для выполнения (математический пример, повтор текста, простая загадка)
2. Иметь четкий правильный ответ
3. Быть связанным с темами Партии, гармонии или социального рейтинга

Формат ответа ТОЛЬКО JSON:
{
  "question": "Вопрос или задание для гражданина",
  "answer": "Правильный ответ (точно как должен написать гражданин)"
}

Примеры:
- Математика: {"question": "Сколько будет 15 + 27?", "answer": "42"}
- Текст: {"question": "Напишите: 'Партия всегда права'", "answer": "Партия всегда права"}
- Загадка: {"question": "Кто ведет нас к процветанию? (напишите имя)", "answer": "Си Цзиньпин"}

Сделайте задание интересным и соответствующим тематике!`,

  // Propaganda images (URLs or file paths)
  PROPAGANDA_IMAGES: [
    "https://example.com/propaganda1.jpg", // Replace with actual URLs
    "https://example.com/propaganda2.jpg",
    "https://example.com/propaganda3.jpg",
  ],
} as const;

// Type exports for better TypeScript support
export type ScoreThresholds = typeof CONFIG.SCORE_THRESHOLDS;
export type EffectDurations = typeof CONFIG.EFFECT_DURATIONS;
export type Cooldowns = typeof CONFIG.COOLDOWNS;
export type ScoreChanges = typeof CONFIG.SCORE_CHANGES;
export type DailyClaims = typeof CONFIG.DAILY_CLAIMS;
export type RateLimits = typeof CONFIG.RATE_LIMITS;
export type AnalysisConfig = typeof CONFIG.ANALYSIS;
export type EventsConfig = typeof CONFIG.EVENTS;
export type HealthCheckConfig = typeof CONFIG.HEALTH_CHECK;
export type SchedulerConfig = typeof CONFIG.SCHEDULER;
export type LLMConfig = typeof CONFIG.LLM;
export type WorkTaskPrompt = typeof CONFIG.WORK_TASK_PROMPT;
