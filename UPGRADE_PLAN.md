# Social Credit Bot - Comprehensive Upgrade Plan

## Overview

This document outlines the complete upgrade plan for transforming the Social Credit Bot from a simple message analyzer into a feature-complete, highly engaging, and long-lasting interactive game. The upgrades have been implemented with a focus on persistent engagement, robust architecture, and scalable gamification mechanics.

## Section 1: Advanced Gameplay Mechanics

### A. Enhanced Sanctions (Low Social Credit Users)

#### 1. Public Re-education (Punishment)
- **Command**: `/public-confession`
- **Required Score**: < -200
- **Cooldown**: 6 hours
- **Implementation**: `EnhancedSanctionCommands.ts`
- **Logic**: 
  - User initiates confession request
  - LLM generates personalized confession based on user's negative history
  - User has 60 seconds to copy-paste the exact confession text
  - Success: +50 social credit
  - Failure: -25 social credit penalty
  - Uses OpenAI API for dynamic confession generation

#### 2. Community Service (Grind)
- **Command**: `/community-service`
- **Required Score**: < 0
- **Cooldown**: 2 hours
- **Logic**: 
  - Bot assigns task: React with 🇨🇳 emoji to next 10 messages from Good Citizens (score > 500)
  - 30-minute time limit
  - Real-time progress tracking
  - Success: +15 social credit
  - No penalty for failure, just retry cooldown

#### 3. Ideological Quiz (Challenge)
- **Command**: `/loyalty-quiz`
- **Required Score**: < -100
- **Cooldown**: 4 hours
- **Logic**: 
  - LLM generates 3-question multiple-choice quiz about Party loyalty
  - Interactive button-based interface
  - Each correct answer: +10 social credit (max +30)
  - Immediate feedback with explanations
  - Visual progress tracking

### B. Enhanced Privileges (High Social Credit Users)

#### 1. Propaganda Broadcast (Influence)
- **Command**: `/propaganda-broadcast <message>`
- **Required Score**: > 1000 (Model Citizen)
- **Cooldown**: 12 hours
- **Implementation**: `EnhancedPrivilegeCommands.ts`
- **Logic**: 
  - High-ranking user submits custom message
  - LLM moderates and enhances message for "party approval"
  - Broadcasts in official embed format
  - User receives +10 social credit reward
  - Rejected inappropriate content

#### 2. Request Party Favor (Utility)
- **Command**: `/party-favor`
- **Required Score**: > 2000 (Supreme Citizen)
- **Cooldown**: 24 hours
- **Logic**: 
  - User selects from three server-wide buff options:
    - **Glorious Production**: +10% positive credit gains (15 min)
    - **Harmony Festival**: No negative credit losses (15 min)
    - **Loyalty Test**: All credit changes doubled (15 min)
  - Server-wide announcement
  - Effects apply to entire guild

#### 3. Citizen Investigation (Power)
- **Command**: `/investigate <user>`
- **Required Score**: > 1500
- **Cooldown**: 8 hours
- **Logic**: 
  - View comprehensive user profile in private message
  - Last 25 score history entries
  - Behavioral analysis and trends
  - Risk assessment
  - Social intrigue element

## Section 2: System Architecture Improvements

### A. Persistent Effect Manager
- **File**: `src/models/ActiveEffect.ts`
- **Problem Solved**: Effects were memory-only and lost on restart
- **Implementation**: 
  - MongoDB schema for persistent effect storage
  - Automatic TTL (Time To Live) expiration
  - Database sync on startup with `loadActiveEffects()`
  - Cleanup operations remove expired effects from both memory and database
  - Support for new effect types (cooldowns, buffs, etc.)

### B. Dynamic Event Manager
- **File**: `src/managers/EventManager.ts`
- **Problem Solved**: Static, exploitable events across multiple channels
- **Implementation**: 
  - Guild-scoped events (one active event per guild)
  - Random monitored channel selection for announcements
  - LLM-generated dynamic events with JSON parsing
  - Centralized event lifecycle management
  - Enhanced event effects integration
  - Fallback mechanisms for LLM failures

### C. Enhanced Message Analysis
- **Configuration**: Updated `CONFIG.LLM.ENHANCED_ANALYSIS_PROMPT`
- **Improvements**: 
  - Better negation detection ("I don't love the party" = negative)
  - Context-aware quoting handling (don't penalize for quoting others)
  - Sarcasm detection improvements
  - Intent-focused analysis over literal content
  - Reduced false positives

## Section 3: Gamification & Long-Term Engagement

### A. Daily Directives & Weekly Goals
- **File**: `src/managers/DirectiveManager.ts`
- **Command**: `/directive` (to be implemented in command handlers)
- **Features**: 
  - LLM-generated personalized daily tasks
  - Progress tracking for various activity types:
    - Message count
    - Keyword usage 
    - Social interactions
    - Score gains
  - Weekly goals for sustained engagement
  - Automatic completion detection and rewards

### B. The Party Store (Future Implementation)
- **Configuration**: `CONFIG.PARTY_STORE`
- **Items Available**: 
  - Custom rank title (500 credits, 7 days)
  - Pardon negative entry (1000 credits)
  - Custom color role (2000 credits, 7 days)
- **Minimum Score**: 800+ to access

### C. Leaderboard Seasons (Future Implementation)
- **Configuration**: `CONFIG.GAMIFICATION`
- **Features**: 
  - Monthly seasons (30 days)
  - Top 3 users archived to Hall of Fame
  - Score soft-reset: `newScore = oldScore * 0.25`
  - `/hall-of-fame` command to view past winners

## Implementation Status

### ✅ Completed Components

1. **ActiveEffect Model** - Persistent effect storage with MongoDB
2. **EventManager** - Dynamic, guild-scoped events with LLM generation
3. **DirectiveManager** - Daily/weekly goals system with progress tracking
4. **EnhancedSanctionCommands** - Three new low-score redemption mechanics
5. **EnhancedPrivilegeCommands** - Three new high-score privilege mechanics
6. **Enhanced EffectManager** - Database persistence and improved lifecycle
7. **Improved Config** - New prompts, cooldowns, and scoring systems
8. **Full System Integration** - All components integrated into main bot

### ✅ Integration Completed

All major integrations have been successfully completed:

#### 1. ✅ Main Bot Class Updated (`src/index.ts`)
- Added new managers (EventManager, DirectiveManager) to constructor
- Integrated EventManager initialization and event handling
- Added EffectManager database initialization
- Updated message analysis pipeline with directive progress tracking
- Replaced old activeEvents system with EventManager
- Added proper cleanup in gracefulShutdown

#### 2. ✅ Command System Enhanced
- Added all 6 new slash commands to registration:
  - `public-confession` - Public redemption for score < -200
  - `community-service` - React-based community service for score < 0  
  - `loyalty-quiz` - Interactive quiz for score < -100
  - `propaganda-broadcast` - Message broadcasting for Model Citizens
  - `party-favor` - Server-wide buffs for Supreme Citizens
  - `investigate` - User history investigation for score > 1500
  - `directive` - View current daily/weekly goals (placeholder)
- Updated CommandHandler routing for all enhanced commands
- Added EnhancedSanctionCommands and EnhancedPrivilegeCommands handlers

#### 3. ✅ Message Analysis Pipeline Enhanced
- Integrated directive progress tracking for messages, keywords, and score changes
- Applied EventManager effects to score calculations
- Enhanced prompt with improved negation and context handling
- Keyword tracking for directive completion ("партия", "гармония", etc.)

#### 4. ✅ Database Schema & Persistence
- ActiveEffect collection with TTL indexing for automatic cleanup
- Resolved duplicate index warnings in MongoDB
- Fixed all deprecated Discord.js ephemeral usage
- All linting and formatting issues resolved

### 🔄 Ready for Deployment

The system is now fully integrated and ready for deployment:

### 🚀 Advanced Features (Future)

#### 1. Party Store Implementation
- Create `PartyStoreManager.ts`
- Add `/party-store` command
- Implement item purchase and activation logic
- Role management for color roles
- Title storage and display system

#### 2. Season System
- Create `SeasonManager.ts` 
- Implement `/hall-of-fame` command
- Automatic monthly resets with cron jobs
- Archive system for historical data
- Achievement tracking across seasons

#### 3. Additional Gamification
- User achievement system
- Faction/guild mechanics within servers
- Special event days (Double XP weekends)
- Referral systems for user growth
- Social features (friend lists, comparisons)

## Technical Architecture

### Database Schema

```
Users Collection (existing):
- userId, guildId, score, totalChanges, etc.

ActiveEffects Collection (new):
- effectId, userId, guildId, effectType, expiresAt, metadata
- TTL index on expiresAt for automatic cleanup

ScoreHistory Collection (existing):
- Extended usage for investigation feature

Future Collections:
- Directives: Daily/weekly goals storage
- Seasons: Historical leaderboard data  
- PartyStore: Purchase history and active items
```

### Performance Considerations

1. **Database Indexing**: All new collections have proper compound indexes
2. **Memory Management**: In-memory caches with periodic cleanup
3. **Rate Limiting**: Enhanced cooldown systems prevent spam
4. **LLM Cost Optimization**: Cheap model usage for neutral users
5. **Event Scoping**: Guild-specific events reduce server load

### Security & Moderation

1. **Content Filtering**: LLM-based moderation for propaganda broadcasts
2. **Cooldown Enforcement**: Database-backed cooldown system
3. **Score Limits**: Existing min/max score constraints maintained
4. **Investigation Privacy**: Results only visible to investigator
5. **Effect Isolation**: Guild-scoped effects prevent cross-server issues

## Deployment Steps

### ✅ Phase 1-4: Core Integration (COMPLETED)
All major systems have been successfully integrated:
1. ✅ ActiveEffect model with persistent storage deployed
2. ✅ Enhanced command handlers (Sanctions & Privileges) integrated
3. ✅ EventManager system replacing old event handling
4. ✅ DirectiveManager with progress tracking active
5. ✅ All 6 new slash commands registered and functional
6. ✅ Message analysis enhanced with directive tracking
7. ✅ Database persistence and cleanup systems operational

**Current Status:** All core upgrades are integrated and ready for production use.

### 🚀 Immediate Deployment Ready
The bot can be deployed immediately with all enhanced features:
- Enhanced sanction commands for low-score users
- Enhanced privilege commands for high-score users  
- Dynamic event system with LLM generation
- Persistent effect management
- Directive progress tracking (framework ready)

### Phase 5: Advanced Features (Next Development Cycle)
1. Implement full DirectiveManager UI with `/directive` command functionality
2. Deploy Party Store system with credit spending
3. Add Season management with leaderboard resets
4. Implement achievement tracking system
5. Add social features and faction mechanics

### Phase 6: Optimization (Ongoing)
1. Monitor LLM API costs and optimize cheap model usage
2. Performance tuning based on user metrics
3. Feature refinement based on community feedback
4. Additional gamification mechanics

## Monitoring & Analytics

### Key Metrics to Track
- Daily/Weekly Active Users
- Command usage frequency
- Score distribution changes
- Event participation rates
- Directive completion rates
- LLM API costs and response times
- Database performance metrics

### Success Indicators
- Increased user retention (>7 days)
- Higher engagement per session
- Balanced score distribution
- Positive user feedback
- Stable system performance
- Controlled operational costs

## Conclusion

This comprehensive upgrade has successfully transformed the Social Credit Bot into a sophisticated gamification platform while maintaining its humorous meme foundation. **The implementation is now complete and ready for production deployment.**

### 🎯 Achieved Engagement Systems:
- **Immediate engagement** through 6 interactive enhanced commands with real-time feedback
- **Progressive gameplay** via score-gated privileges and redemption mechanics  
- **Server-wide dynamics** through party favors and investigation systems
- **Persistent progression** with database-backed effects and history tracking
- **Dynamic content** via LLM-generated events, confessions, and quizzes

### 🏗️ Technical Achievements:
- **Robust Architecture** with persistent storage and automatic cleanup
- **Scalable Design** supporting multiple guilds with isolated events
- **Error Resilience** with comprehensive fallback systems
- **Modern Standards** using current Discord.js APIs and TypeScript best practices
- **Performance Optimized** with smart caching and database indexing

### 📊 Production Readiness:
- ✅ All linting and formatting standards met
- ✅ Database persistence operational  
- ✅ MongoDB TTL indexing for automatic cleanup
- ✅ Enhanced error handling and logging
- ✅ Deprecated API usage resolved
- ✅ Full command integration tested

**The bot is ready for immediate deployment with all enhanced features active.** The modular architecture supports future expansion, and the directive system framework is prepared for the next development phase.

**Deployment Status: 🟢 READY FOR PRODUCTION**