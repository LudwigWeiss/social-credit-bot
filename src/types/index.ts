export interface MessageAnalysis {
  verdict: "good" | "bad" | "neutral";
  score_change: number;
  reason: string;
  meme_response: string;
}

export interface BotConfig {
  discordToken: string;
  discordClientId: string;
  openaiApiKey: string;
  monitoredChannelId?: string;
}

export interface UserScoreData {
  userId: string;
  guildId: string;
  score: number;
  rank: string;
  lastUpdated: Date;
  totalChanges: number;
}

export interface ScoreChangeEvent {
  userId: string;
  guildId: string;
  oldScore: number;
  newScore: number;
  change: number;
  reason: string;
  timestamp: Date;
}

export interface LeaderboardEntry {
  position: number;
  userId: string;
  username: string;
  score: number;
  rank: string;
  emoji: string;
}

export interface ServerStats {
  totalUsers: number;
  averageScore: number;
  highestScore: number;
  lowestScore: number;
  totalScoreChanges: number;
  harmonyLevel: string;
}

export interface PenaltyInfo {
  level: "MILD" | "MODERATE" | "SEVERE";
  description: string;
  actions: string[];
  memeText: string;
}

export interface PrivilegeInfo {
  level: "GOOD_CITIZEN" | "MODEL_CITIZEN" | "SUPREME_CITIZEN";
  description: string;
  benefits: string[];
  memeText: string;
}

export interface RankInfo {
  rank: string;
  emoji: string;
  description: string;
  color: number;
}

export interface MessageAnalysisResult {
  verdict: "good" | "bad" | "neutral";
  score_change: number;
  reason: string;
  meme_response: string;
}

export interface MessageContextEntry {
  content: string;
  timestamp: number;
  userId: string;
  username: string;
}
