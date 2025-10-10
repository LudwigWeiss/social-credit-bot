import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  ActionRowBuilder,
  ComponentType,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  StringSelectMenuInteraction,
} from "discord.js";
import { BaseCommandHandler } from "./BaseCommandHandler.js";
import { CONFIG } from "../config.js";
import { Logger } from "../utils/Logger.js";

interface ImaginationFavorOption {
  id: string;
  name: string;
  description: string;
  duration: number; // in milliseconds
  effect: string;
}

export class PrivilegeCommands extends BaseCommandHandler {
  private readonly imaginationFavorOptions: ImaginationFavorOption[] = [
    {
      id: "GLORIOUS_PRODUCTION",
      name: "🏭 Glorious Production",
      description: "All positive score changes are increased by 10%",
      duration: 15 * 60 * 1000, // 15 minutes
      effect: "positive_boost",
    },
    {
      id: "HARMONY_FESTIVAL",
      name: "🕊️ Harmony Festival",
      description: "No one can lose social credit",
      duration: 15 * 60 * 1000, // 15 minutes
      effect: "no_negative",
    },
    {
      id: "LOYALTY_TEST",
      name: "📊 Loyalty Test",
      description: "All social credit changes are doubled",
      duration: 15 * 60 * 1000, // 15 minutes
      effect: "double_changes",
    },
  ];

  async handleInteraction(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    try {
      switch (interaction.commandName) {
        // Basic privilege commands
        case "enforce-harmony":
          await this.handleEnforceHarmonyCommand(interaction);
          break;
        case "claim-daily":
          await this.handleClaimDailyCommand(interaction);
          break;
        case "spread-propaganda":
          await this.handleSpreadPropagandaCommand(interaction);
          break;
        // Enhanced privilege commands
        case "propaganda-broadcast":
          await this.handlePropagandaBroadcastCommand(interaction);
          break;
        case "imagination-favor":
          await this.handleImaginationFavorCommand(interaction);
          break;
        case "investigate":
          await this.handleInvestigateCommand(interaction);
          break;
        default:
          throw new Error(
            `Unknown privilege command: ${interaction.commandName}`
          );
      }
    } catch (error) {
      Logger.error(
        `Error in privilege command ${interaction.commandName}:`,
        error
      );

      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content:
            "🚨 An error occurred while executing the command. Please try again later.",
          flags: MessageFlags.Ephemeral,
        });
      }
    }
  }

  // Basic Privilege Commands

  private async handleEnforceHarmonyCommand(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const enforcerId = interaction.user.id;
    const guildId = interaction.guildId || "dm";
    const targetUser = interaction.options.getUser("target", true);
    const reason = interaction.options.getString("reason", true);

    // Check if enforcer has high enough score
    const enforcerScore = await this.socialCreditManager.getUserScore(
      enforcerId,
      guildId
    );
    if (enforcerScore < CONFIG.SCORE_THRESHOLDS.PRIVILEGES.SUPREME_CITIZEN) {
      await interaction.reply({
        content: `❌ Insufficient social credit! Requires ${CONFIG.SCORE_THRESHOLDS.PRIVILEGES.SUPREME_CITIZEN}+ to execute the Citizen's Mandate.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Can't enforce on yourself
    if (targetUser.id === enforcerId) {
      await interaction.reply({
        content: "🤔 You cannot enforce harmony upon yourself, citizen!",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Can't enforce on bots
    if (targetUser.bot) {
      await interaction.reply({
        content: "🤖 Bots are already perfectly harmonious!",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Check cooldown
    const cooldownCheck = this.effectManager.isOnCooldown(
      enforcerId,
      "DAILY_CLAIM_RESET"
    );
    if (cooldownCheck.onCooldown && cooldownCheck.timeLeft) {
      const hoursLeft = Math.ceil(cooldownCheck.timeLeft / (60 * 60 * 1000));
      await interaction.reply({
        content: `⏰ Please wait another ${hoursLeft} hours before executing the Citizen's Mandate again!`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Apply enforcement
    const targetNewScore = await this.socialCreditManager.updateScore(
      targetUser.id,
      guildId,
      CONFIG.SCORE_CHANGES.ENFORCE_HARMONY_TARGET,
      `Citizen's Mandate: ${reason} (from ${
        (interaction.member?.user as any)?.displayName ??
        interaction.user.username
      })`,
      targetUser.username
    );

    const enforcerNewScore = await this.socialCreditManager.updateScore(
      enforcerId,
      guildId,
      CONFIG.SCORE_CHANGES.ENFORCE_HARMONY_ENFORCER,
      `Execution of Citizen's Mandate on ${targetUser.username}`,
      (interaction.member?.user as any)?.displayName ??
        interaction.user.username
    );

    // Set cooldown
    await this.effectManager.applyEffect(
      enforcerId,
      guildId,
      "DAILY_CLAIM_RESET",
      CONFIG.COOLDOWNS.ENFORCE_HARMONY
    );

    const embed = new EmbedBuilder()
      .setColor(0xffd700)
      .setTitle("Citizen's Mandate Executed")
      .setDescription(
        `**${
          (interaction.member?.user as any)?.displayName ??
          interaction.user.username
        }** has enforced harmony upon **${
          targetUser.username
        }** for the following reason: *${reason}*`
      )
      .addFields(
        {
          name: "Violator's New Score",
          value: `\`${targetNewScore}\` (${CONFIG.SCORE_CHANGES.ENFORCE_HARMONY_TARGET})`,
          inline: true,
        },
        {
          name: "Enforcer's New Score",
          value: `\`${enforcerNewScore}\` (${CONFIG.SCORE_CHANGES.ENFORCE_HARMONY_ENFORCER})`,
          inline: true,
        }
      )
      .setFooter({ text: "Imagination values your vigilance! 👁️" })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }

  private async handleClaimDailyCommand(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const userId = interaction.user.id;
    const guildId = interaction.guildId || "dm";

    // Check cooldown
    const cooldownCheck = this.effectManager.isOnCooldown(
      userId,
      "DAILY_CLAIM_RESET"
    );
    if (cooldownCheck.onCooldown && cooldownCheck.timeLeft) {
      const hoursLeft = Math.ceil(cooldownCheck.timeLeft / (60 * 60 * 1000));
      await interaction.reply({
        content: `⏰ You have already claimed your daily bonus today! The next bonus is in ${hoursLeft} hours.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Get user's rank to determine bonus amount
    const userScore = await this.socialCreditManager.getUserScore(
      userId,
      guildId
    );
    const rankInfo = this.socialCreditManager.getScoreRank(userScore);

    let bonusAmount = 0;
    if (userScore >= CONFIG.SCORE_THRESHOLDS.PRIVILEGES.SUPREME_CITIZEN) {
      bonusAmount = CONFIG.DAILY_CLAIMS.SUPREME_CITIZEN;
    } else if (userScore >= CONFIG.SCORE_THRESHOLDS.PRIVILEGES.MODEL_CITIZEN) {
      bonusAmount = CONFIG.DAILY_CLAIMS.MODEL_CITIZEN;
    } else if (userScore >= CONFIG.SCORE_THRESHOLDS.PRIVILEGES.GOOD_CITIZEN) {
      bonusAmount = CONFIG.DAILY_CLAIMS.GOOD_CITIZEN;
    } else {
      await interaction.reply({
        content:
          "❌ Insufficient social credit to claim the daily bonus! Improve your score.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Apply the bonus
    const newScore = await this.socialCreditManager.updateScore(
      userId,
      guildId,
      bonusAmount,
      `Imagination's Daily Bonus (${rankInfo.rank})`,
      (interaction.member?.user as any)?.displayName ??
        interaction.user.username
    );

    // Set claim cooldown
    await this.effectManager.applyEffect(
      userId,
      guildId,
      "DAILY_CLAIM_RESET",
      CONFIG.EFFECT_DURATIONS.DAILY_CLAIM_RESET,
      undefined,
      { type: "daily_claim" }
    );

    const embed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle("Daily Bonus Claimed")
      .setDescription(
        `Citizen ${
          (interaction.member?.user as any)?.displayName ??
          interaction.user.username
        }, your loyalty has been rewarded with a daily bonus.`
      )
      .addFields(
        { name: "Rank", value: rankInfo.rank, inline: true },
        { name: "Bonus", value: `+${bonusAmount}`, inline: true },
        { name: "New Score", value: `${newScore}`, inline: true }
      )
      .setFooter({ text: "Imagination takes care of its best citizens! 💫" })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }

  private async handleSpreadPropagandaCommand(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const userId = interaction.user.id;
    const guildId = interaction.guildId || "dm";

    // Check if user has high enough score
    const userScore = await this.socialCreditManager.getUserScore(
      userId,
      guildId
    );
    if (userScore < CONFIG.SCORE_THRESHOLDS.PRIVILEGES.MODEL_CITIZEN) {
      await interaction.reply({
        content: `❌ Insufficient social credit! Requires ${CONFIG.SCORE_THRESHOLDS.PRIVILEGES.MODEL_CITIZEN}+ to spread propaganda.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Check cooldown
    const cooldownCheck = this.effectManager.isOnCooldown(
      userId,
      "DAILY_CLAIM_RESET"
    );
    if (cooldownCheck.onCooldown && cooldownCheck.timeLeft) {
      const hoursLeft = Math.ceil(cooldownCheck.timeLeft / (60 * 60 * 1000));
      await interaction.reply({
        content: `⏰ Please wait another ${hoursLeft} hours before spreading propaganda again!`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Select random propaganda image
    const imageUrl =
      CONFIG.PROPAGANDA_IMAGES[
        Math.floor(Math.random() * CONFIG.PROPAGANDA_IMAGES.length)
      ];

    // Create embed with propaganda
    const embed = new EmbedBuilder()
      .setColor(0xffd700)
      .setAuthor({
        name: `${
          (interaction.member?.user as any)?.displayName ??
          interaction.user.username
        } is spreading glorious propaganda!`,
        iconURL: interaction.user.displayAvatarURL(),
      })
      .setDescription(
        `*"Social harmony is achieved through unity under Imagination's leadership!"*`
      )
      .setImage(imageUrl)
      .setFooter({ text: "Imagination is always right! Imagination is eternal!" })
      .setTimestamp();

    // Send to current channel
    await interaction.reply({ embeds: [embed] });

    // Apply bonus
    const newScore = await this.socialCreditManager.updateScore(
      userId,
      guildId,
      CONFIG.SCORE_CHANGES.SPREAD_PROPAGANDA_BONUS,
      "Spreading Imagination's glorious propaganda",
      interaction.user.username
    );

    // Set cooldown
    await this.effectManager.applyEffect(
      userId,
      guildId,
      "DAILY_CLAIM_RESET",
      CONFIG.COOLDOWNS.SPREAD_PROPAGANDA
    );

    // Send confirmation
    const confirmEmbed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle("Propaganda Spread")
      .setDescription(
        `Thank you for your loyalty, citizen. Your efforts to spread the truth have been rewarded.`
      )
      .addFields(
        {
          name: "Bonus",
          value: `+${CONFIG.SCORE_CHANGES.SPREAD_PROPAGANDA_BONUS}`,
          inline: true,
        },
        { name: "New Score", value: `\`${newScore}\``, inline: true }
      )
      .setFooter({ text: "Continue to serve Imagination! 👁️" })
      .setTimestamp();

    await interaction.followUp({
      embeds: [confirmEmbed],
      flags: MessageFlags.Ephemeral,
    });
  }

  // Enhanced Privilege Commands

  private async handlePropagandaBroadcastCommand(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const userId = interaction.user.id;
    const guildId = interaction.guildId || "dm";
    const message = interaction.options.getString("message", true);

    // Check if user qualifies (score > 1000)
    const score = await this.socialCreditManager.getUserScore(userId, guildId);
    if (score <= CONFIG.SCORE_THRESHOLDS.PRIVILEGES.MODEL_CITIZEN) {
      await interaction.reply({
        content:
          "❌ Insufficient social credit to broadcast propaganda! Model Citizen status (1000+ score) is required.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Check cooldown
    const cooldownCheck = this.effectManager.isOnCooldown(
      userId,
      "PROPAGANDA_BROADCAST_COOLDOWN"
    );
    if (cooldownCheck.onCooldown && cooldownCheck.timeLeft) {
      const hoursLeft = Math.ceil(cooldownCheck.timeLeft / (60 * 60 * 1000));
      await interaction.reply({
        content: `⏰ Please wait another ${hoursLeft} hours before your next propaganda broadcast!`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Defer reply since moderation might take time
    await interaction.deferReply();

    try {
      // Moderate and enhance the message
      const enhancedMessage = await this.moderateAndEnhancePropaganda(message);

      // Create broadcast embed
      const embed = new EmbedBuilder()
        .setColor(0xdc143c)
        .setTitle("Official State Broadcast")
        .setAuthor({
          name: `From the Ministry of Propaganda, by ${
            (interaction.member?.user as any)?.displayName ??
            interaction.user.username
          }`,
        })
        .setDescription(`*${enhancedMessage}*`)
        .setFooter({
          text: `Broadcast approved by the Ministry of Propaganda | ${new Date().toLocaleDateString("en-US")}`,
        })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

      // Apply score bonus
      const newScore = await this.socialCreditManager.updateScore(
        userId,
        guildId,
        CONFIG.SCORE_CHANGES.PROPAGANDA_BROADCAST_BONUS || 50,
        "Successful broadcast of Imagination propaganda",
        (interaction.member?.user as any)?.displayName ??
          interaction.user.username
      );

    // Set cooldown
      await this.effectManager.applyEffect(
        userId,
        guildId,
        "PROPAGANDA_BROADCAST_COOLDOWN",
        CONFIG.COOLDOWNS.PROPAGANDA_BROADCAST
      );

      // Send confirmation to user
      const confirmEmbed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle("Broadcast Successful")
        .setDescription(`Your message was approved and broadcast to all citizens.`)
        .addFields(
          {
            name: "Reward",
            value: `+${CONFIG.SCORE_CHANGES.PROPAGANDA_BROADCAST_BONUS || 50}`,
            inline: true,
          },
          { name: "New Score", value: `\`${newScore}\``, inline: true }
        )
        .setFooter({ text: "Imagination is proud of your loyalty! 💫" });

      await interaction.followUp({
        embeds: [confirmEmbed],
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      Logger.error(`Error in propaganda broadcast: ${error}`);
      await interaction.editReply({
        content:
          "❌ An error occurred while processing your message. It may contain inappropriate content.",
      });
    }
  }

  private async handleImaginationFavorCommand(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const userId = interaction.user.id;
    const guildId = interaction.guildId || "dm";

    // Check if user qualifies (Supreme Citizen)
    const score = await this.socialCreditManager.getUserScore(userId, guildId);
    if (score < CONFIG.SCORE_THRESHOLDS.PRIVILEGES.SUPREME_CITIZEN) {
      await interaction.reply({
        content: `❌ Insufficient social credit! Supreme Citizen status (${CONFIG.SCORE_THRESHOLDS.PRIVILEGES.SUPREME_CITIZEN}+ score) is required to activate Imagination Favors.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Check cooldown
    const cooldownCheck = this.effectManager.isOnCooldown(
      userId,
      "IMAGINATION_FAVOR_COOLDOWN"
    );
    if (cooldownCheck.onCooldown && cooldownCheck.timeLeft) {
      const hoursLeft = Math.ceil(cooldownCheck.timeLeft / (60 * 60 * 1000));
      await interaction.reply({
        content: `⏰ Please wait another ${hoursLeft} hours before using Imagination Favors again!`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Create selection menu
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId("imagination_favor_select")
      .setPlaceholder("Select an Imagination Favor...")
      .addOptions(
        this.imaginationFavorOptions.map((option) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(option.name)
            .setDescription(option.description)
            .setValue(option.id)
        )
      );

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      selectMenu
    );

    const embed = new EmbedBuilder()
      .setColor(0xffd700)
      .setTitle("Decree from the Party")
      .setDescription(
        `As a Supreme Citizen, ${
          (interaction.member?.user as any)?.displayName ??
          interaction.user.username
        }, you may issue a decree to influence the server for 15 minutes.`
      )
      .setFooter({ text: "Select a favor from the menu below 👇" })
      .setTimestamp();

    const response = await interaction.reply({
      embeds: [embed],
      components: [row],
      flags: MessageFlags.Ephemeral,
    });

    try {
      const confirmation = await response.awaitMessageComponent({
        componentType: ComponentType.StringSelect,
        time: 60000,
        filter: (i) => i.user.id === userId,
      });

      const selectedOption = this.imaginationFavorOptions.find(
        (option) => option.id === confirmation.values[0]
      );

      if (!selectedOption) {
        await confirmation.update({
          content: "❌ Invalid favor selection.",
          components: [],
          embeds: [],
        });
        return;
      }

      await this.applyImaginationFavor(confirmation, selectedOption, guildId);
    } catch (error) {
      Logger.error(`Error in imagination favor selection: ${error}`);
      await interaction.editReply({
        content: "⏰ Selection time expired. Please try the command again.",
        components: [],
        embeds: [],
      });
    }
  }

  private async handleInvestigateCommand(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const investigatorId = interaction.user.id;
    const guildId = interaction.guildId || "dm";
    const targetUser = interaction.options.getUser("target", true);

    // Check if investigator qualifies (Model Citizen)
    const investigatorScore = await this.socialCreditManager.getUserScore(
      investigatorId,
      guildId
    );
    if (investigatorScore < CONFIG.SCORE_THRESHOLDS.PRIVILEGES.MODEL_CITIZEN) {
      await interaction.reply({
        content: `❌ Insufficient social credit to conduct investigations! Model Citizen status (${CONFIG.SCORE_THRESHOLDS.PRIVILEGES.MODEL_CITIZEN}+ score) is required.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Can't investigate yourself
    if (targetUser.id === investigatorId) {
      await interaction.reply({
        content: "🤔 You cannot investigate yourself, citizen!",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Can't investigate bots
    if (targetUser.bot) {
      await interaction.reply({
        content:
          "🤖 Bots do not need investigation - they are always loyal to Imagination!",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Check cooldown
    const cooldownCheck = this.effectManager.isOnCooldown(
      investigatorId,
      "INVESTIGATION_COOLDOWN"
    );
    if (cooldownCheck.onCooldown && cooldownCheck.timeLeft) {
      const hoursLeft = Math.ceil(cooldownCheck.timeLeft / (60 * 60 * 1000));
      await interaction.reply({
        content: `⏰ Please wait another ${hoursLeft} hours before the next investigation!`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      // Get target's info
      const targetScore = await this.socialCreditManager.getUserScore(
        targetUser.id,
        guildId
      );
      const targetRank = this.socialCreditManager.getScoreRank(targetScore);
      const targetStatus = this.getUserStatusByScore(targetScore);

      // Get recent history
      const recentHistory = await this.socialCreditManager.getUserHistory(
        targetUser.id,
        guildId,
        25
      );

      // Get active effects
      const activeEffects = this.effectManager.getActiveEffects(targetUser.id);

      // Create investigation report
      const embed = new EmbedBuilder()
        .setColor(targetScore >= 0 ? 0x00ff00 : 0xff0000)
        .setAuthor({
          name: `Citizen Dossier: ${targetUser.username}`,
          iconURL: targetUser.displayAvatarURL(),
        })
        .setDescription(
          `Investigation conducted by **${interaction.user.username}**.`
        )
        .addFields(
          {
            name: "Score",
            value: `**${targetScore}**`,
            inline: true,
          },
          {
            name: "Rank",
            value: targetRank.rank,
            inline: true,
          },
          {
            name: "Status",
            value: targetStatus,
            inline: true,
          },
          {
            name: "Active Effects",
            value:
              activeEffects.length > 0
                ? activeEffects.map((e) => `• ${e.effectType}`).join("\n")
                : "None",
            inline: false,
          }
        )
        .setFooter({
          text: `Dossier prepared by the Ministry of State Security`,
        })
        .setTimestamp();

      if (recentHistory && recentHistory.length > 0) {
        const historyText = recentHistory
          .map(
            (h) =>
              `• ${h.reason} (${h.scoreChange > 0 ? "+" : ""}${h.scoreChange})`
          )
          .join("\n");

        embed.addFields({
          name: "📝 Recent Activity",
          value: historyText || "No recent activity",
          inline: false,
        });
      }

      await interaction.editReply({ embeds: [embed] });

      // Apply investigation cost
      await this.socialCreditManager.updateScore(
        investigatorId,
        guildId,
        CONFIG.SCORE_CHANGES.INVESTIGATION_COST,
        `Investigation of citizen ${targetUser.username}`,
        (interaction.member?.user as any)?.displayName ??
          interaction.user.username
      );

      // Set cooldown
      await this.effectManager.applyEffect(
        investigatorId,
        guildId,
        "INVESTIGATION_COOLDOWN",
        CONFIG.COOLDOWNS.INVESTIGATION
      );
    } catch (error) {
      Logger.error(`Error in investigation: ${error}`);
      await interaction.editReply({
        content:
          "❌ An error occurred during the investigation. Please try again later.",
      });
    }
  }

  // Helper methods

  private async moderateAndEnhancePropaganda(message: string): Promise<string> {
    try {
      const prompt = `
        You are an editor for the propaganda department of Imagination.
        Your task is to improve and moderate a message for official broadcast.

        Rules:
        1. Remove any inappropriate language or insults.
        2. Add suitable phrases about Imagination.
        3. Make the message more solemn and official.
        4. Maximum 200 words.
        5. Respond ONLY with the final text, without explanations.

        Original message: "${message}"
      `;

      const completion = await this.openai.chat.completions.create({
        model: CONFIG.LLM.STANDARD_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 300,
      });

      const enhancedMessage = completion.choices?.[0]?.message?.content;
      return enhancedMessage || message;
    } catch (error) {
      Logger.error(`Error enhancing propaganda: ${error}`);
      return message; // Fallback to original message
    }
  }

  private async applyImaginationFavor(
    interaction: ChatInputCommandInteraction | StringSelectMenuInteraction,
    option: ImaginationFavorOption,
    guildId: string
  ): Promise<void> {
    try {
      // Apply the server-wide effect
      await this.effectManager.applyEffect(
        "SERVER",
        guildId,
        "EVENT_MULTIPLIER",
        option.duration,
        undefined,
        {
          type: "imagination_favor",
          activatedBy: interaction.user.id,
          activatedByName:
            (interaction.member?.user as any)?.displayName ??
            interaction.user.username,
          favorType: option.effect,
        }
      );

      // Deduct score cost
      const cost = CONFIG.SCORE_CHANGES.IMAGINATION_FAVOR_COST;
      const newScore = await this.socialCreditManager.updateScore(
        interaction.user.id,
        guildId,
        -cost,
        `Activation of Imagination Favor: ${option.name}`,
        (interaction.member?.user as any)?.displayName ??
          interaction.user.username
      );

      // Set cooldown
      await this.effectManager.applyEffect(
        interaction.user.id,
        guildId,
        "IMAGINATION_FAVOR_COOLDOWN",
        CONFIG.COOLDOWNS.IMAGINATION_FAVOR
      );

      // Update the interaction with success message
      const successEmbed = new EmbedBuilder()
       .setColor(0x00ff00)
       .setTitle("Decree Issued")
       .setDescription(
         `Your decree, **${option.name}**, is now in effect for 15 minutes.`
       )
       .addFields(
         { name: "Cost", value: `${cost}`, inline: true },
         { name: "New Score", value: `\`${newScore}\``, inline: true }
       )
        .setFooter({ text: "Imagination thanks you for your service! 🏛️" })
        .setTimestamp();

      if ("update" in interaction) {
        await interaction.update({
          embeds: [successEmbed],
          components: [],
        });
      } else {
        await interaction.editReply({
          embeds: [successEmbed],
          components: [],
        });
      }

      // Announce to the server (if in a guild)
      if (interaction.guild && interaction.channel) {
        const announceEmbed = new EmbedBuilder()
          .setColor(0xffd700)
          .setTitle("A Decree from the Party!")
          .setDescription(
            `Supreme Citizen **${
              (interaction.member?.user as any)?.displayName ??
              interaction.user.username
            }** has issued a decree:\n\n**${option.name}**\n*${
              option.description
            }*\n\nThis will be in effect for the next 15 minutes.`
          )
          .setFooter({ text: "All citizens reap the benefits! 💫" })
          .setTimestamp();

        if (
          interaction.guild &&
          interaction.channel &&
          !interaction.ephemeral
        ) {
          await interaction.followUp({ embeds: [announceEmbed] });
        }
      }
    } catch (error) {
      Logger.error(`Error applying imagination favor: ${error}`);
      if ("update" in interaction) {
        await interaction.update({
          content: "❌ An error occurred while activating the favor.",
          components: [],
          embeds: [],
        });
      } else {
        await interaction.editReply({
          content: "❌ An error occurred while activating the favor.",
          components: [],
          embeds: [],
        });
      }
    }
  }

  private getUserStatusByScore(score: number): string {
    if (score >= CONFIG.SCORE_THRESHOLDS.PRIVILEGES.SUPREME_CITIZEN) {
      return "🏛️ Supreme Citizen";
    } else if (score >= CONFIG.SCORE_THRESHOLDS.PRIVILEGES.MODEL_CITIZEN) {
      return "🏅 Model Citizen";
    } else if (score >= CONFIG.SCORE_THRESHOLDS.PRIVILEGES.GOOD_CITIZEN) {
      return "✅ Good Citizen";
    } else if (score >= CONFIG.SCORE_THRESHOLDS.PENALTIES.MILD) {
      return "⚠️ Average Citizen";
    } else if (score >= CONFIG.SCORE_THRESHOLDS.PENALTIES.MODERATE) {
      return "❌ Questionable Element";
    } else if (score >= CONFIG.SCORE_THRESHOLDS.PENALTIES.SEVERE) {
      return "🚫 Enemy of the People";
    } else {
      return "💀 Traitor to the Motherland";
    }
  }
}
