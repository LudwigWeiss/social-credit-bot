export class MemeResponses {
  static getRandomGoodResponse(): string {
    const responses = [
      "🎉 BING CHILLING! Your social credit has been raised!",
      "🇨🇳 Xi Jinping approves your message! +Social Credit!",
      "⭐ Excellent work, comrade! The Party is pleased!",
      "🏆 Exemplary citizen behavior detected! Glory to the CCP!",
      "🌟 Your loyalty to the Motherland has been noted!",
      "👑 Chairman Xi is smiling upon you!",
      "🎊 Outstanding contribution to social harmony!",
      "🥇 First-class citizen status maintained!",
      "🔥 Based and CCP-pilled! Social credit is soaring! 📈",
      "💯 Absolutely brilliant, citizen! Keep it up!",
    ];
    return responses[Math.floor(Math.random() * responses.length)];
  }

  static getRandomBadResponse(): string {
    const responses = [
      "🚨 ATTENTION CITIZEN! Your social credit has been lowered!",
      "❌ Unacceptable behavior! Report to the nearest re-education center!",
      "⚠️ The CCP is disappointed in you, citizen.",
      "🚫 Your actions threaten social harmony! -Social Credit!",
      "💀 Enemy of the state behavior detected!",
      "🔴 CRITICAL: Anti-social activity recorded!",
      "⛔ This message contradicts the interests of the people!",
      "🚨 Immediate re-education required! Contact your local party officials!",
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
            "⚠️ **WARNING TO CITIZEN** ⚠️\nYour recent behavior has been... questionable. The Party is watching. 👁️",
        };
      case "MODERATE":
        return {
          description: "Significant anti-social behavior",
          actions: ["Movement restrictions", "Privilege reduction"],
          memeText:
            "🚫 **MOVEMENT RESTRICTIONS ACTIVATED** 🚫\nYou may not leave your current location without permission from local party officials!",
        };
      case "SEVERE":
        return {
          description: "Extreme threat to social harmony",
          actions: ["Re-education required", "Family notified"],
          memeText:
            "🚨 **ASSIGNMENT TO RE-EDUCATION CAMP** 🚨\nReport to facility #1984 immediately! Your family has been notified of your crimes against the people!",
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
            "✅ **GOOD CITIZEN STATUS** ✅\nYou have earned the Party's trust! Enjoy fast-tracked service at state institutions!",
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
            "⭐ **MODEL CITIZEN ACHIEVEMENT UNLOCKED** ⭐\nXi Jinping personally notes your dedication! Enjoy VIP privileges at all Party establishments!",
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
            "👑 **SUPREME CITIZEN OF THE PEOPLE'S REPUBLIC** 👑\nYou are now eligible for a position in the Politburo! Your name will be remembered in communist history! 🇨🇳",
        };
      default:
        return {
          description: "Unknown privilege level",
          benefits: [],
          memeText: "🤔 The Party's computers are confused...",
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
      "Glory to the CCP! 🇨🇳",
      "The ideas of Xi Jinping guide us! 🌟",
      "Social harmony through unity! ✊",
      "The Party knows best! 👁️",
      "Bing chilling with a high social credit score! 🧊",
      "Taiwan? Never heard of it! 🤷‍♂️",
      "Winnie the Pooh? I only know Chairman Xi! 🐻",
      "Nothing happened in 1989! 📅",
      "Social credit system = social justice! ⚖️",
      "Loyalty to the Motherland! 🏠",
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
