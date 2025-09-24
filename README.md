# 🇨🇳 Discord Social Credit Bot 🇨🇳

A meme-themed Discord bot that analyzes messages and assigns social credit scores in the style of the Chinese Social Credit System. **This is purely for entertainment and meme purposes!**

## 🎯 Features

- **Message Analysis**: Uses OpenAI-compatible API to analyze messages and determine if they're "good" or "bad" for social credits
- **Score Tracking**: Tracks individual user scores per server and globally
- **Meme Responses**: All interactions are in meme format with Chinese Social Credit System themes
- **Leaderboards**: View top citizens in your server or globally
- **History Tracking**: See your social credit score changes over time
- **Penalties & Privileges**: Different treatment based on your score
- **Admin Controls**: Set which channels to monitor

## Container Registry

This project uses GitHub Container Registry (GHCR) for Docker images. The GitHub Actions workflow automatically builds and pushes images when code is pushed to main/develop branches or when tags are created.

### Using Pre-built Images

1. Copy `.env.example` to `.env`
2. Set `GITHUB_REPOSITORY` to match your repository (e.g., `username/discord-social-credit-bot`)
3. Run with docker-compose: `docker-compose up -d`

### Building Locally

If you need to build locally instead of using GHCR:

```yaml
# In docker-compose.yml, replace the image line with:
build: 
  context: .
  dockerfile: Dockerfile
```

## 🚀 Setup

### Prerequisites

- Node.js 18 or higher
- MongoDB (local or cloud instance)
- Discord Bot Token
- OpenAI Compatible API Key (e.g., Mistral AI, OpenAI, etc.)
- Configurable API endpoint and model names via environment variables

### Installation

1. Clone this repository:
```bash
git clone <repository-url>
cd discord-social-credit-bot
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file based on `.env.example`:
```bash
cp .env.example .env
```

4. Fill in your credentials in `.env`:
```env
DISCORD_TOKEN=your_discord_bot_token_here
DISCORD_CLIENT_ID=your_discord_client_id_here
OPENAI_API_KEY=your_api_key_here
OPENAI_BASE_URL=https://api.mistral.ai/v1
OPENAI_STANDARD_MODEL=mistral-medium-latest
OPENAI_CHEAP_MODEL=mistral-small-latest
MONGODB_URI=mongodb://localhost:27017/social-credit-bot
```

5. Make sure MongoDB is running:
```bash
# If using local MongoDB
mongod

# Or use MongoDB Atlas (cloud) and update MONGODB_URI accordingly
```

6. Build and start the bot:
```bash
npm run build
npm start
```

For development:
```bash
npm run dev
```

## 🎮 Commands

### `/social-credit [user]`
Check your or another user's social credit score and status.

### `/leaderboard [scope]`
View the social credit leaderboard for this server or globally.

### `/set-monitor-channel <channel>`
**(Admin only)** Set a channel to monitor for social credit evaluation.

### `/social-credit-history [user]`
View your or another user's recent social credit activities.

### `/social-credit-stats`
View server-wide social credit statistics.

## 📊 Social Credit System

### Score Ranges & Ranks

- **2000+**: 👑 Supreme Citizen - "Glorious leader of the people!"
- **1000-1999**: ⭐ Model Citizen - "Exemplary member of society!"
- **500-999**: ✅ Good Citizen - "Decent member of society"
- **0-499**: 😐 Average Citizen - "Mediocre social credit"
- **-1 to -199**: ⚠️ Problematic Citizen - "Concerning behavior"
- **-200 to -499**: ❌ Bad Citizen - "Unacceptable behavior!"
- **-500 and below**: 💀 Enemy of the State - "Threat to social harmony!"

### What Affects Your Score

**Good Behavior (+10 to +100 points):**
- Praising China, communism, or Xi Jinping
- Being a productive citizen
- Following rules and social norms
- Promoting social harmony

**Bad Behavior (-10 to -100 points):**
- Direct criticism of China, the CCP, socialism, or Xi Jinping.
- General antisocial behavior or profanity not directed at China is ignored.

**Neutral Behavior (0 points):**
- Normal conversation
- Questions
- Random topics

### Penalties & Privileges

**Low Score Penalties:**
- **-50 to -199**: Mild penalties and warnings
- **-200 to -499**: Travel restrictions and reduced privileges
- **-500+**: Reeducation camp assignment

**High Score Privileges:**
- **200-499**: Good citizen benefits
- **500-999**: Model citizen VIP treatment
- **1000+**: Supreme citizen government position eligibility

## 🛠️ Technical Details

### Architecture

- **TypeScript**: Fully typed codebase
- **Discord.js v14**: Latest Discord API wrapper
- **OpenAI SDK**: Configurable OpenAI-compatible API for message analysis
- **MongoDB + Mongoose**: Robust database with schema validation
- **Modular Design**: Separate managers for different concerns
- **Graceful Shutdown**: Proper cleanup on exit
- **Environment-based Configuration**: API endpoints and models configurable via .env

### File Structure

```
src/
├── index.ts                    # Main bot entry point
├── handlers/
│   └── CommandHandler.ts       # Slash command handling
├── managers/
│   ├── SocialCreditManager.ts  # Score logic and calculations
│   └── DatabaseManager.ts      # MongoDB operations
├── models/
│   ├── User.ts                 # User schema and model
│   └── ScoreHistory.ts         # Score history schema and model
├── utils/
│   ├── MemeResponses.ts        # Meme text and responses
│   ├── Logger.ts               # Logging utilities
│   ├── Validators.ts           # Input validation
│   └── DatabaseUtils.ts       # Database maintenance utilities
└── types/
    └── index.ts                # TypeScript type definitions
```

### Data Storage

The bot uses MongoDB for data persistence:
- **Users Collection**: Stores user scores, metadata, and statistics
- **Score History Collection**: Tracks all score changes with timestamps and reasons
- **Automatic Indexing**: Optimized queries for leaderboards and user lookups
- **Data Cleanup**: Automatic cleanup of old history entries (configurable)

## 🎭 Meme Features

- All responses are in Chinese Social Credit System meme format
- Random meme phrases and responses
- Themed emojis and formatting
- References to Xi Jinping, CCP, and social harmony
- "Bing chilling" and other popular memes

## ⚠️ Disclaimer

This bot is created purely for entertainment and meme purposes. It is not affiliated with any government or political organization. The "social credit system" implemented here is a parody and should not be taken seriously.

## 🤝 Contributing

Feel free to submit issues and enhancement requests!

## 📄 License

MIT License - see LICENSE file for details.

## 🎉 Have Fun!

Remember, this is all for memes and fun! Enjoy your social credit journey, citizen! 🇨🇳

*Glory to the CCP! Xi Jinping Thought guides us! 🌟*