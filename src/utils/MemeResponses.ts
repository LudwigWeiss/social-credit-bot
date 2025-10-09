export class MemeResponses {
  static getRandomGoodResponse(): string {
    const responses = [
      "🎉 BING CHILLING! Your social credit has been raised!",
      "Eva approves your message! +Social Credit!",
      "⭐ Excellent work, citizen! Imagination is pleased!",
      "🏆 Exemplary citizen behavior detected! Glory to Imagination!",
      "🌟 Your loyalty has been noted!",
      "👑 Eva is smiling upon you!",
      "🎊 Outstanding contribution to harmony!",
      "🥇 First-class citizen status maintained!",
      "🔥 Based and Imagination-pilled! Social credit is soaring! 📈",
      "💯 Absolutely brilliant, citizen! Keep it up!",
    ];
    return responses[Math.floor(Math.random() * responses.length)];
  }

  static getRandomBadResponse(): string {
    const responses = [
      "🚨 ATTENTION CITIZEN! Your social credit has been lowered!",
      "❌ Unacceptable behavior! Report to the nearest re-education center!",
      "⚠️ Imagination is disappointed in you, citizen.",
      "🚫 Your actions threaten harmony! -Social credit!",
      "💀 Enemy of Imagination behavior detected!",
      "🔴 CRITICAL: Anti-social activity recorded!",
      "⛔ This message contradicts the interests of Imagination!",
      "🚨 Immediate re-education required! Contact your local officials!",
      "❗ Your family has been notified of your poor conduct!",
      "🆘 HELP! This citizen needs ideological correction!",
    ];
    return responses[Math.floor(Math.random() * responses.length)];
  }

  static getPenalties(severity: string): {
    description: string;
    actions: string[];
    memeText: string;
  } {
    switch (severity) {
      case "MILD":
        return {
          description: "Minor infractions detected",
          actions: ["Warning issued", "Surveillance increased"],
          memeText:
            "⚠️ **WARNING TO CITIZEN** ⚠️\nYour recent behavior has been... questionable. Imagination is watching. 👁️",
        };
      case "MODERATE":
        return {
          description: "Significant anti-social behavior",
          actions: ["Movement restrictions", "Privilege reduction"],
          memeText:
            "🚫 **MOVEMENT RESTRICTIONS ACTIVATED** 🚫\nYou may not leave your current location without permission from local officials!",
        };
      case "SEVERE":
        return {
          description: "Extreme threat to social harmony",
          actions: ["Re-education required", "Family notified"],
          memeText:
            "🚨 **ASSIGNMENT TO RE-EDUCATION CAMP** 🚨\nReport to facility #1984 immediately! Your family has been notified of your crimes against Imagination!",
        };
      default:
        return {
          description: "Unknown penalty level",
          actions: [],
          memeText: "🤔 Something went wrong with the social credit system...",
        };
    }
  }

  static getPrivileges(level: string): {
    description: string;
    benefits: string[];
    memeText: string;
  } {
    switch (level) {
      case "GOOD_CITIZEN":
        return {
          description: "Decent social credit",
          benefits: ["Priority service", "Reduced waiting times"],
          memeText:
            "✅ **GOOD CITIZEN STATUS** ✅\nYou have earned Imagination's trust! Enjoy fast-tracked service at approved institutions!",
        };
      case "MODEL_CITIZEN":
        return {
          description: "Exemplary behavior recognized",
          benefits: [
            "VIP service",
            "Special discounts",
            "Priority housing",
          ],
          memeText:
            "⭐ **MODEL CITIZEN ACHIEVEMENT UNLOCKED** ⭐\nEva personally notes your dedication! Enjoy VIP privileges at all Imagination establishments!",
        };
      case "SUPREME_CITIZEN":
        return {
          description: "Highest social credit achievement",
          benefits: [
            "All privileges",
            "Right to a government position",
            "Lifelong honors",
          ],
          memeText:
            "👑 **SUPREME CITIZEN** 👑\nYou are a champion of Imagination! Your name will be remembered for all time!",
        };
      default:
        return {
          description: "Unknown privilege level",
          benefits: [],
          memeText: "🤔 Imagination's computers are confused...",
        };
    }
  }

  static getScoreEmoji(score: number): string {
    if (score >= 2000) return "👑";
    if (score >= 1000) return "⭐";
    if (score >= 500) return "✅";
    if (score >= 0) return "😐";
    if (score >= -200) return "⚠️";
    if (score >= -500) return "❌";
    return "💀";
  }

  static getRandomMemePhrase(): string {
    const phrases = [
      "Glory to Imagination!",
      "The ideas of Eva guide us! 🌟",
      "Harmony through unity! ✊",
      "Imagination knows best! 👁️",
      "Chilling with a high social credit score! 🧊",
      "Social credit system = true justice! ⚖️",
      "Loyalty to Imagination! 🏠",
    ];
    return phrases[Math.floor(Math.random() * phrases.length)];
  }

  static getLeaderboardTitle(isGlobal: boolean): string {
    if (isGlobal) {
      return "🌍 **GLOBAL SOCIAL CREDIT LEADERBOARD** 🌍\n*The most loyal citizens from all servers!*";
    } else {
      return "🏆 **SERVER SOCIAL CREDIT LEADERBOARD** 🏆\n*The most exemplary citizens of this server!*";
    }
  }

  static getHistoryTitle(): string {
    return "📜 **SOCIAL CREDIT HISTORY** 📜\n*Your journey through the social credit system*";
  }

  static getStatsTitle(): string {
    return "📊 **SERVER SOCIAL CREDIT STATISTICS** 📊\n*An overview of social harmony on this server*";
  }
}
