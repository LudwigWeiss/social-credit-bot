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
    // Enhanced Sanction Commands
    PUBLIC_CONFESSION: 6 * 60 * 60 * 1000, // 6 hours
    COMMUNITY_SERVICE: 2 * 60 * 60 * 1000, // 2 hours
    LOYALTY_QUIZ: 4 * 60 * 60 * 1000, // 4 hours
    // Enhanced Privilege Commands
    PROPAGANDA_BROADCAST: 12 * 60 * 60 * 1000, // 12 hours
    PARTY_FAVOR: 24 * 60 * 60 * 1000, // 24 hours
    INVESTIGATION: 8 * 60 * 60 * 1000, // 8 hours
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
    // Enhanced Mechanics
    PUBLIC_CONFESSION_SUCCESS: 50,
    PUBLIC_CONFESSION_FAILURE: -25,
    COMMUNITY_SERVICE_SUCCESS: 15,
    LOYALTY_QUIZ_PER_CORRECT: 10,
    PROPAGANDA_BROADCAST_BONUS: 50,
    INVESTIGATION_COST: -5,
    PARTY_FAVOR_COST: 100,
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
    CHEAP_MODEL: process.env.OPENAI_CHEAP_MODEL || "mistral-small-latest", // For neutral users
    STANDARD_MODEL:
      process.env.OPENAI_STANDARD_MODEL || "mistral-medium-latest",
    TEMPERATURE: 0.7,
    MAX_TOKENS: 1500,
    RETRY_ATTEMPTS: 3,
    RETRY_DELAY_MS: 1000, // Base delay for exponential backoff
    // Improved analysis prompt with better negation and context handling
    ENHANCED_ANALYSIS_PROMPT: `Ты - Верховный ИИ Китайской Системы Социального Рейтинга (мем версия). Проанализируй сообщения пользователя с учётом контекста и определи, хорошо ли это, плохо или нейтрально для социального рейтинга.

КРИТИЧЕСКИ ВАЖНЫЕ ПРАВИЛА:
1. Анализируй ТОЛЬКО собственные высказывания и мнения пользователя. Если пользователь цитирует кого-то (используя > или кавычки) или выражает несогласие с негативным утверждением (например, "Неправильно говорить X"), НЕ наказывай их.
2. САРКАЗМ И ОТРИЦАНИЕ: Будь крайне внимателен к сарказму и отрицанию. Утверждение типа "Я определённо НЕ люблю великую КПК" является негативным. Утверждение типа "Некоторые говорят, что партия плохая, но я думаю они великие" является позитивным.
3. Фокусируйся на намерениях автора, а не на буквальном содержании цитат.

{contextString}

ВАЖНО: Отвечай ТОЛЬКО чистым JSON без markdown блоков, без дополнительного текста, без объяснений!

Формат ответа:
{
    "verdict": "good" | "bad" | "neutral",
    "score_change": число (от -100 до 100, 0 для нейтрального),
    "reason": "ОЧЕНЬ краткое мем объяснение (1-2 предложения) в стиле Китайской Системы Социального Рейтинга",
    "meme_response": "ОЧЕНЬ краткий и смешной ответ (1-2 предложения) как будто ты ИИ системы социального рейтинга"
}

Правила анализа:
- Хорошо: Похвала Китая, коммунизма, Си Цзиньпина, быть продуктивным гражданином, следовать правилам
- Плохо: Только прямая критика Китая, КПК, социализма или Си Цзиньпина. Обычные плохие слова или антисоциальное поведение не должны вызывать негативной реакции, если они не нацелены на Китай.
- Нейтрально: Обычный разговор, вопросы, случайные темы, не связанные с Китаем.
- Делай ответы мемными и смешными, и краткими
- Изменения рейтинга: Хорошо (10 до 100), Плохо (-10 до -100), Нейтрально (0)
- Отвечай на русском языке
- НЕ используй markdown блоки в ответе!`,
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

  // Gamification settings
  GAMIFICATION: {
    PARTY_STORE_MIN_SCORE: 800, // Minimum score to access party store
    SEASON_DURATION_DAYS: 30, // Duration of each season in days
    SEASON_RESET_MULTIPLIER: 0.25, // Score reset multiplier (newScore = oldScore * multiplier)
    HALL_OF_FAME_TOP_COUNT: 3, // Number of top users to save in hall of fame each season
  },

  // Party Store items
  PARTY_STORE: {
    CUSTOM_RANK_TITLE: {
      cost: 500,
      duration: 7 * 24 * 60 * 60 * 1000, // 7 days
      description: "Временный кастомный ранг в команде /social-credit",
    },
    PARDON_NEGATIVE_ENTRY: {
      cost: 1000,
      description: "Удалить одну негативную запись из истории",
    },
    CUSTOM_COLOR_ROLE: {
      cost: 2000,
      duration: 7 * 24 * 60 * 60 * 1000, // 7 days
      description: "Временная роль с кастомным цветом",
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
export type EventsConfig = typeof CONFIG.EVENTS;
export type HealthCheckConfig = typeof CONFIG.HEALTH_CHECK;
export type SchedulerConfig = typeof CONFIG.SCHEDULER;
export type LLMConfig = typeof CONFIG.LLM;
export type WorkTaskPrompt = typeof CONFIG.WORK_TASK_PROMPT;
