# 🇨🇳 Discord Social Credit Bot 🇨🇳

A meme-themed Discord bot that analyzes messages and assigns social credit scores in the style of the Chinese Social Credit System. **This is purely for entertainment and meme purposes!**



## 🎯 Features

- **Advanced Message Analysis**: Utilizes an OpenAI-compatible API to analyze messages for sentiment and assign social credit scores.
- **Comprehensive Score Tracking**: Monitors user scores on a per-server basis and aggregates them for a global leaderboard.
- **Thematic Meme Responses**: All interactions are styled in the theme of the Chinese Social Credit System, providing an immersive and humorous experience.
- **Dynamic Leaderboards**: View the top-ranked citizens in your server or across all servers globally.
- **Detailed History Tracking**: Review your recent score changes to understand your standing with the Party.
- **Penalties & Privileges**: Your social credit score determines your fate, unlocking special privileges for loyal citizens and applying penalties for dissidents.
-**Administrative Controls**: Server administrators can designate specific channels for monitoring.

## 🚀 Setup

### Prerequisites

- A Discord Bot Token
- An OpenAI-compatible API Key (e.g., from Mistral AI, OpenAI)

### Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/LudwigWeiss/social-credit-bot.git
    cd social-credit-bot
    ```

2.  **Create a `.env` file:**
    Duplicate the `.env.example` file, rename it to `.env`, and configure your environment variables in `.env`!

3.  **In docker-compose.yml, replace the image line with:
    ```yaml
    build: 
      context: .
      dockerfile: Dockerfile
    ```

4.  **Start the bot:**
    ```bash
    sudo docker compose up --build -d
    ```

## 🎮 Commands

### General Commands

-   `/social-credit [user]` - Displays the social credit report for you or another user.
-   `/leaderboard [scope]` - Shows the social credit leaderboard for the server or globally.
-   `/social-credit-history [user]` - Shows the recent score history for you or another user.
-   `/social-credit-stats` - Displays social credit statistics for the entire server.
-   `/rate-limit-status` - Checks your current message analysis rate limit.

### Sanction Commands

-   `/redeem-myself` - Seek forgiveness from the State for your low score.
-   `/labor-for-the-state` - Complete a task to earn back social credit.
-   `/public-confession` - Issue a public confession to demonstrate your remorse.
-   `/community-service` - Undertake a community task to improve your standing.
-   `/loyalty-quiz` - Take a quiz to prove your loyalty to the Party.

### Privilege Commands

-   `/enforce-harmony` - As a high-ranking citizen, correct another user's behavior.
-   `/claim-daily` - Claim your daily social credit bonus.
-   `/spread-propaganda` - Spread glorious State-approved propaganda.
-   `/propaganda-broadcast` - As a Model Citizen, broadcast your own propaganda message.
---
-   `/decree-from-the-party` - As a Supreme Citizen, issue a temporary server-wide decree.
-   `/investigate` - Investigate another citizen's social credit history.

### Feedback Commands

-   `/praise-bot` - Praise the bot for its diligent work.
-   `/report-mistake` - Report a potential error in the bot's analysis.

### Admin Commands

-   `/set-monitor-channel <channel>` - Sets a channel to be monitored for social credit.
-   `/remove-monitor-channel <channel>` - Removes a channel from monitoring.
-   `/list-monitored-channels` - Lists all channels currently being monitored.

## 📊 The Social Credit System

The bot's scoring system is based on a set of configurable rules. Here’s a breakdown of how it works.

### Score Tiers and Ranks

| Score Range          | Rank                  | Description                               |
| -------------------- | --------------------- | ----------------------------------------- |
| 2000+                | 👑 Supreme Citizen     | A glorious leader of the people!          |
| 1000–1999            | ⭐ Model Citizen      | An exemplary member of society.           |
| 500–999              | ✅ Good Citizen       | A trustworthy and respected citizen.      |
| 0–499                | 😐 Average Citizen    | A citizen with a neutral standing.      |
| -1 to -199           | ⚠️ Problematic Citizen | Behavior that is concerning to the State. |
| -200 to -499         | ❌ Bad Citizen        | Unacceptable behavior.                    |
| -500 and below       | 💀 Enemy of the State | A threat to social harmony.               |

### Penalties and Privileges

**Low Score Penalties:**
- **-50 to -199**: Receive warnings and increased surveillance.
- **-200 to -499**: Movement is restricted, and privileges are reduced.
- **-500+**: Re-education is required.

**High Score Privileges:**
- **200-499**: Enjoy the benefits of being a Good Citizen, such as prioritized service.
- **500-999**: Recognized as a Model Citizen with VIP treatment.
- **1000+**: Honored as a Supreme Citizen with the highest privileges.

## ⚠️ Disclaimer

This bot is a satirical parody and intended for entertainment purposes only. It is not affiliated with any government or political entity.

*Glory to Imagination!*