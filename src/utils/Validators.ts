export class Validators {
  static isValidDiscordToken(token: string): boolean {
    // Discord bot tokens are typically 24+ characters and contain specific patterns
    return Boolean(
      token && token.length >= 24 && /^[A-Za-z0-9._-]+$/.test(token)
    );
  }

  static isValidMistralKey(key: string): boolean {
    // Mistral API keys are typically long alphanumeric strings
    return Boolean(key && key.length >= 20 && /^[A-Za-z0-9]+$/.test(key));
  }

  static isValidSnowflake(id: string): boolean {
    // Discord snowflakes are 17-19 digit numbers
    return /^\d{17,19}$/.test(id);
  }

  static containsLinks(content: string): boolean {
    const urlRegex =
      /(https?:\/\/[^\s]+|www\.[^\s]+|\b[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b)/gi;
    return urlRegex.test(content);
  }

  static isValidScoreChange(change: number): boolean {
    return typeof change === "number" && change >= -100 && change <= 100;
  }

  static sanitizeMessage(content: string): string {
    // Remove potential harmful content and limit length
    return content
      .replace(/[<>@#&!]/g, "") // Remove Discord mentions and special chars
      .substring(0, 1000) // Limit length
      .trim();
  }

  static isValidGuildId(guildId: string): boolean {
    return guildId === "dm" || this.isValidSnowflake(guildId);
  }
}
