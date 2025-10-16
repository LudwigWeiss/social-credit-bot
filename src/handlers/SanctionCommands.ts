import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  Message,
  TextChannel,
  ReadonlyCollection,
  MessageFlags,
  ActionRowBuilder,
  ComponentType,
  ButtonBuilder,
  ButtonStyle,
  ButtonInteraction,
  GuildMember,
} from "discord.js";
import { BaseCommandHandler } from "./BaseCommandHandler.js";
import { CONFIG } from "../config.js";
import { Logger } from "../utils/Logger.js";

interface QuizQuestion {
  question: string;
  correctAnswer: string;
  options: string[];
}

interface Quiz {
  questions: QuizQuestion[];
  userAnswers: string[];
  correctCount: number;
}

export class SanctionCommands extends BaseCommandHandler {
  private isRateLimitError(error: unknown): boolean {
    if (error instanceof Error && error.message.includes("Status 429")) {
      return true;
    }

    if (typeof error === "object" && error !== null) {
      const err = error as Record<string, unknown>;
      if (typeof err.status === "number" && err.status === 429) return true;
      if (typeof err.code === "number" && err.code === 429) return true;
      if (typeof err.response === "object" && err.response !== null) {
        const resp = err.response as Record<string, unknown>;
        if (typeof resp.status === "number" && resp.status === 429) return true;
      }
    }

    return false;
  }

  async handleInteraction(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    try {
      switch (interaction.commandName) {
        // Basic sanction commands
        case "redeem-myself":
          await this.handleRedeemMyselfCommand(interaction);
          break;
        case "labor-for-the-state":
          await this.handleWorkForImaginationCommand(interaction);
          break;
        // Enhanced sanction commands
        case "public-confession":
          await this.handlePublicConfessionCommand(interaction);
          break;
        case "community-service":
          await this.handleCommunityServiceCommand(interaction);
          break;
        case "loyalty-quiz":
          await this.handleLoyaltyQuizCommand(interaction);
          break;
        default:
          throw new Error(
            `Unknown sanction command: ${interaction.commandName}`
          );
      }
    } catch (error) {
      Logger.error(
        `Error in sanction command ${interaction.commandName}:`,
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

  // Basic Sanction Commands

  private async handleRedeemMyselfCommand(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const userId = interaction.user.id;
    const guildId = interaction.guildId || "dm";

    // Check if user qualifies for redemption (score <= -200)
    const score = await this.socialCreditManager.getUserScore(userId, guildId);
    if (score > CONFIG.SCORE_THRESHOLDS.PENALTIES.MODERATE) {
      await interaction.reply({
        content:
          "❌ You do not need redemption, citizen! Your social credit is in good standing.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Check cooldown using metadata to distinguish different cooldown types
    const redeemEffects = this.effectManager
      .getEffectsByType(userId, "DAILY_CLAIM_RESET")
      .filter((e) => e.metadata?.type === "redeem_cooldown");

    if (redeemEffects.length > 0) {
      const lastRedeem = redeemEffects[0];
      const timeLeft = lastRedeem.expiresAt.getTime() - Date.now();
      if (timeLeft > 0) {
        const hoursLeft = Math.ceil(timeLeft / (60 * 60 * 1000));
        await interaction.reply({
          content: `⏰ Please wait another ${hoursLeft} hours before your next redemption, citizen!`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
    }

    // Select random phrase
    const phrase =
      CONFIG.ANALYSIS.REDEEM_PHRASES[
        Math.floor(Math.random() * CONFIG.ANALYSIS.REDEEM_PHRASES.length)
      ];

    // Send the challenge
    const embed = new EmbedBuilder()
      .setColor(0xffa500)
      .setTitle("Edict of Pardon")
      .setDescription(
        `Citizen ${
          (interaction.member?.user as any)?.displayName ??
          interaction.user.username
        }, you have a chance to redeem yourself. Repeat the following phrase within 60 seconds:\n\n**"${phrase}"**`
      )
      .setFooter({ text: "Imagination is merciful, but just! 👁️" })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });

    // Set up cooldown
    await this.effectManager.applyEffect(
      userId,
      guildId,
      "DAILY_CLAIM_RESET",
      CONFIG.COOLDOWNS.REDEEM_MYSELF,
      undefined,
      { type: "redeem_cooldown" }
    );

    // Wait for response
    const filter = (m: Message) =>
      m.author.id === userId && m.content.trim() === phrase;

    try {
      const channel = interaction.channel;
      if (!channel || !channel.isTextBased()) {
        throw new Error("Invalid channel");
      }

      const collector = (channel as TextChannel).createMessageCollector({
        filter,
        max: 1,
        time: 60000,
      });

      const collected: Message[] = await new Promise((resolve) => {
        collector.on("collect", (message: Message) => {
          resolve([message]);
        });
        collector.on(
          "end",
          (collected: ReadonlyCollection<string, Message>, reason: string) => {
            if (reason === "time") {
              resolve([]);
            }
          }
        );
      });

      if (collected && collected.length > 0) {
        // Success - grant forgiveness
        const newScore = await this.socialCreditManager.updateScore(
          userId,
          guildId,
          CONFIG.SCORE_CHANGES.REDEEM_SUCCESS,
          "Redemption through the Edict of Pardon",
          interaction.member as GuildMember,
          (interaction.member?.user as any)?.displayName ??
            interaction.user.username
        );

        const successEmbed = new EmbedBuilder()
          .setColor(0x00ff00)
          .setTitle("Pardon Granted")
          .setDescription(
            `Congratulations, citizen ${
              (interaction.member?.user as any)?.displayName ??
              interaction.user.username
            }. Your loyalty has been noted.`
          )
          .addFields(
            {
              name: "Score Change",
              value: `+${CONFIG.SCORE_CHANGES.REDEEM_SUCCESS}`,
              inline: true,
            },
            { name: "New Score", value: `${newScore}`, inline: true }
          )
          .setFooter({ text: "Imagination always gives a second chance! 💫" })
          .setTimestamp();

        await interaction.followUp({ embeds: [successEmbed] });
      }
    } catch {
      // Failure - penalize
      const newScore = await this.socialCreditManager.updateScore(
       userId,
       guildId,
       CONFIG.SCORE_CHANGES.REDEEM_FAILURE,
       "Failure of the Edict of Pardon - insufficient zeal",
       interaction.member as GuildMember,
       (interaction.member?.user as any)?.displayName ??
         interaction.user.username
     );

      const failureEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle("Pardon Denied")
        .setDescription(
          `Citizen ${
            (interaction.member?.user as any)?.displayName ??
            interaction.user.username
          }, you have failed to show adequate loyalty. Your social credit has been adjusted accordingly.`
        )
        .addFields(
          {
            name: "Score Change",
            value: `${CONFIG.SCORE_CHANGES.REDEEM_FAILURE}`,
            inline: true,
          },
          { name: "New Score", value: `${newScore}`, inline: true }
        )
        .setFooter({ text: "Imagination is disappointed with your behavior! ⚠️" })
        .setTimestamp();

      await interaction.followUp({ embeds: [failureEmbed] });
    }
  }

  private async handleWorkForImaginationCommand(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const userId = interaction.user.id;
    const guildId = interaction.guildId || "dm";

    // Check cooldown using metadata
    const workEffects = this.effectManager
      .getEffectsByType(userId, "DAILY_CLAIM_RESET")
      .filter((e) => e.metadata?.type === "work_cooldown");

    if (workEffects.length > 0) {
      const lastWork = workEffects[0];
      const timeLeft = lastWork.expiresAt.getTime() - Date.now();
      if (timeLeft > 0) {
        const minutesLeft = Math.ceil(timeLeft / (60 * 1000));
        await interaction.reply({
          content: `⏰ Please wait another ${minutesLeft} minutes before working for Imagination again!`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
    }

    // Defer the reply since task generation may take time
    await interaction.deferReply();

    // Generate task using LLM
    const task = await this.generateWorkTask();

    const embed = new EmbedBuilder()
      .setColor(0xffa500)
      .setTitle("Labor for the State")
      .setDescription(
        `Citizen ${
          (interaction.member?.user as any)?.displayName ??
          interaction.user.username
        }, the State requires your assistance. Complete the following task within 60 seconds:\n\n**${task.question}**`
      )
      .setFooter({ text: "Imagination values your loyalty! 👁️" })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

    // Set cooldown
    await this.effectManager.applyEffect(
      userId,
      guildId,
      "DAILY_CLAIM_RESET",
      CONFIG.COOLDOWNS.WORK_FOR_IMAGINATION,
      undefined,
      { type: "work_cooldown" }
    );

    // Wait for response
    const filter = (m: Message) => m.author.id === userId;

    try {
      const channel = interaction.channel;
      if (!channel || !channel.isTextBased()) {
        throw new Error("Invalid channel");
      }

      const collector = (channel as TextChannel).createMessageCollector({
        filter,
        time: 60000,
      });

      let hasCorrectAnswer = false;

      collector.on("collect", async (message: Message) => {
        if (message.content.trim() === task.answer) {
          hasCorrectAnswer = true;
          collector.stop("correct");
        } else {
          await message.reply("❌ Incorrect answer. Please try again.");
        }
      });

      collector.on("end", async (collected, reason) => {
        if (reason === "correct") {
          const newScore = await this.socialCreditManager.updateScore(
            userId,
            guildId,
            CONFIG.SCORE_CHANGES.WORK_FOR_IMAGINATION_SUCCESS,
            "Successful completion of work for Imagination",
            interaction.member as GuildMember,
            (interaction.member?.user as any)?.displayName ??
              interaction.user.username
          );

          const successEmbed = new EmbedBuilder()
            .setColor(0x00ff00)
            .setTitle("Work Complete")
            .setDescription(
              `Excellent work, citizen ${
                (interaction.member?.user as any)?.displayName ??
                interaction.user.username
              }. Your contribution to the State has been rewarded.`
            )
            .addFields(
              {
                name: "Reward",
                value: `+${CONFIG.SCORE_CHANGES.WORK_FOR_IMAGINATION_SUCCESS}`,
                inline: true,
              },
              { name: "New Score", value: `${newScore}`, inline: true }
            )
            .setFooter({ text: "Continue to serve Imagination! 💫" })
            .setTimestamp();

          await interaction.followUp({ embeds: [successEmbed] });
          await this.checkAchievements(
            interaction.member as GuildMember,
            "labor-for-the-state"
          );
        } else if (!hasCorrectAnswer) {
          const failureEmbed = new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle("Task Failed")
            .setDescription(
              `Citizen ${
                (interaction.member?.user as any)?.displayName ??
                interaction.user.username
              }, you have failed to complete your assigned task. No reward will be given.`
            )
            .setFooter({ text: "Imagination expects better results! ⚠️" })
            .setTimestamp();

          await interaction.followUp({ embeds: [failureEmbed] });
        }
      });
    } catch (error) {
      Logger.error(`Error in work-for-the-party: ${error}`);
    }
  }

  // Enhanced Sanction Commands

  private async handlePublicConfessionCommand(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const userId = interaction.user.id;
    const guildId = interaction.guildId || "dm";

    // Check if user qualifies (negative score)
    const score = await this.socialCreditManager.getUserScore(userId, guildId);
    if (score >= 0) {
      await interaction.reply({
        content:
          "❌ You do not require public confession, citizen! Your social credit is in good standing.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Check cooldown
    const cooldownCheck = this.effectManager.isOnCooldown(
      userId,
      "CONFESSION_COOLDOWN"
    );
    if (cooldownCheck.onCooldown && cooldownCheck.timeLeft) {
      const hoursLeft = Math.ceil(cooldownCheck.timeLeft / (60 * 60 * 1000));
      await interaction.reply({
        content: `⏰ Please wait another ${hoursLeft} hours before your next public confession!`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply();

    try {
      // Generate personalized confession
      const confession = await this.generatePersonalizedConfession(
        (interaction.member?.user as any)?.displayName ??
          interaction.user.username,
        score
      );

      // Create confession embed
      const embed = new EmbedBuilder()
        .setColor(0xff6b6b)
        .setTitle("Public Confession")
        .setAuthor({
          name:
            (interaction.member?.user as any)?.displayName ??
            interaction.user.username,
          iconURL: interaction.user.displayAvatarURL(),
        })
        .setDescription(`*${confession}*`)
        .setFooter({
          text: "Admitting mistakes is the first step toward correction! 🇨🇳",
        })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

      // Apply score bonus
      const bonus = Math.abs(Math.floor(score * 0.3)); // 30% of negative score as positive bonus
      const newScore = await this.socialCreditManager.updateScore(
        userId,
        guildId,
        bonus,
        "Public confession before the people",
        interaction.member as GuildMember,
        (interaction.member?.user as any)?.displayName ??
          interaction.user.username
      );

      await this.checkAchievements(
        interaction.member as GuildMember,
        "public-confession"
      );

      // Set cooldown
      await this.effectManager.applyEffect(
        userId,
        guildId,
        "CONFESSION_COOLDOWN",
        CONFIG.COOLDOWNS.PUBLIC_CONFESSION
      );

      // Send confirmation to user
      const confirmEmbed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle("Confession Accepted")
        .setDescription(
          `Your remorse has been noted. You have been rewarded for your honesty.`
        )
        .addFields(
          { name: "Reward", value: `+${bonus}`, inline: true },
          { name: "New Score", value: `${newScore}`, inline: true }
        )
        .setFooter({ text: "Imagination values sincerity! 🤝" });

      await interaction.followUp({
        embeds: [confirmEmbed],
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      Logger.error(`Error in public confession: ${error}`);
      await interaction.editReply({
        content:
          "❌ An error occurred while generating the confession. Please try again later.",
      });
    }
  }

  private async handleCommunityServiceCommand(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const userId = interaction.user.id;
    const guildId = interaction.guildId || "dm";

    // Check cooldown
    const cooldownCheck = this.effectManager.isOnCooldown(
      userId,
      "COMMUNITY_SERVICE_COOLDOWN"
    );
    if (cooldownCheck.onCooldown && cooldownCheck.timeLeft) {
      const hoursLeft = Math.ceil(cooldownCheck.timeLeft / (60 * 60 * 1000));
      await interaction.reply({
        content: `⏰ Please wait another ${hoursLeft} hours before your next community service!`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Create service options
    const serviceOptions = [
      {
        id: "clean_propaganda",
        name: "🧹 Cleaning Propaganda Posters",
        description: "Clean the city's posters of dust and grime",
        reward: 15,
      },
      {
        id: "help_elderly",
        name: "👴 Assisting Elderly Citizens",
        description: "Help elderly citizens with their shopping",
        reward: 20,
      },
      {
        id: "plant_trees",
        name: "🌳 Greening the City",
        description: "Plant trees to improve the environment",
        reward: 25,
      },
    ];

    const randomService =
      serviceOptions[Math.floor(Math.random() * serviceOptions.length)];

    // Create interactive buttons
    const acceptButton = new ButtonBuilder()
      .setCustomId("accept_service")
      .setLabel("Accept Service")
      .setStyle(ButtonStyle.Success)
      .setEmoji("✅");

    const declineButton = new ButtonBuilder()
      .setCustomId("decline_service")
      .setLabel("Decline")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("❌");

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      acceptButton,
      declineButton
    );

    const embed = new EmbedBuilder()
      .setColor(0xffa500)
      .setTitle("Community Service Opportunity")
      .setDescription(
        `Citizen ${
          (interaction.member?.user as any)?.displayName ??
          interaction.user.username
        }, you have been offered an opportunity to serve the community and improve your standing.\n\n**Task:** ${randomService.name}\n*${
          randomService.description
        }*\n\n**Reward:** +${randomService.reward} social credit`
      )
      .setFooter({ text: "Serving the people is the highest honor! 🏛️" })
      .setTimestamp();

    const response = await interaction.reply({
      embeds: [embed],
      components: [row],
    });

    try {
      const confirmation = await response.awaitMessageComponent({
        componentType: ComponentType.Button,
        time: 60000,
        filter: (i) => i.user.id === userId,
      });

      if (confirmation.customId === "accept_service") {
        try {
          // User accepted - simulate service task
          await confirmation.update({
            embeds: [
              new EmbedBuilder()
                .setColor(0x0099ff)
                .setTitle("Performing Community Service...")
                .setDescription(
                  `Your commitment to the State is being recorded. Please wait.`
                )
                .setFooter({
                  text: "Imagination is watching your progress! 👁️",
                }),
            ],
            components: [],
          });

          // Simulate work time (3-5 seconds)
          await new Promise((resolve) =>
            setTimeout(resolve, 3000 + Math.random() * 2000)
          );

          // Apply reward
          const newScore = await this.socialCreditManager.updateScore(
            userId,
            guildId,
            randomService.reward,
            `Community Service: ${randomService.name}`,
            interaction.member as GuildMember,
            (interaction.member?.user as any)?.displayName ??
              interaction.user.username
          );

          await this.checkAchievements(
            interaction.member as GuildMember,
            "community-service"
          );

          // Set cooldown
          await this.effectManager.applyEffect(
            userId,
            guildId,
            "COMMUNITY_SERVICE_COOLDOWN",
            CONFIG.COOLDOWNS.COMMUNITY_SERVICE
          );

          const successEmbed = new EmbedBuilder()
            .setColor(0x00ff00)
            .setTitle("Service Complete")
            .setDescription(
              `Excellent work, citizen ${
                (interaction.member?.user as any)?.displayName ??
                interaction.user.username
              }. Your service has been noted and your score adjusted.`
            )
            .addFields(
              {
                name: "Task",
                value: randomService.name,
                inline: false,
              },
              {
                name: "Reward",
                value: `+${randomService.reward}`,
                inline: true,
              },
              { name: "New Score", value: `${newScore}`, inline: true }
            )
            .setFooter({ text: "Continue to serve the people! 💫" })
            .setTimestamp();

          await interaction.followUp({ embeds: [successEmbed] });
        } catch (innerError) {
          Logger.error(
            `Error processing community service for user ${userId}:`,
            innerError
          );
          await interaction.followUp({
            content:
              "🚨 An unexpected error occurred while processing your service. Please try again later.",
            flags: MessageFlags.Ephemeral,
          });
        }
      } else {
        // User declined
        const declineEmbed = new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle("Service Declined")
          .setDescription(
            `Citizen ${
              (interaction.member?.user as any)?.displayName ??
              interaction.user.username
            }, your refusal to serve the community has been recorded.`
          )
          .setFooter({
            text: "Service to the people is voluntary, but encouraged! ⚠️",
          })
          .setTimestamp();

        await confirmation.update({
          embeds: [declineEmbed],
          components: [],
        });
      }
    } catch (error) {
      // This catch block now specifically handles the timeout from awaitMessageComponent
      Logger.warn(
        `Community service offer timed out for user ${userId}: ${error}`
      );
      await interaction.editReply({
        content: "⏰ Time expired. The opportunity for service has been missed.",
        components: [],
        embeds: [],
      });
    }
  }

  private async handleLoyaltyQuizCommand(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const userId = interaction.user.id;
    const guildId = interaction.guildId || "dm";

    // Check cooldown
    const cooldownCheck = this.effectManager.isOnCooldown(
      userId,
      "LOYALTY_QUIZ_COOLDOWN"
    );
    if (cooldownCheck.onCooldown && cooldownCheck.timeLeft) {
      const hoursLeft = Math.ceil(cooldownCheck.timeLeft / (60 * 60 * 1000));
      await interaction.reply({
        content: `⏰ Please wait another ${hoursLeft} hours before the next loyalty quiz!`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      // Generate personalized quiz
      const quiz = await this.generateLoyaltyQuiz();
      await this.conductLoyaltyQuiz(interaction, quiz, guildId);
    } catch (error) {
      Logger.error(`Error in loyalty quiz: ${error}`);
      await interaction.editReply({
        content: "❌ An error occurred while generating the quiz. Please try again later.",
      });
    }
  }

  // Helper methods

  private async generateWorkTask(): Promise<{
    question: string;
    answer: string;
  }> {
    const maxRetries = CONFIG.LLM.RETRY_ATTEMPTS;
    const baseDelay = CONFIG.LLM.RETRY_DELAY_MS;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const completion = await this.openai.chat.completions.create({
          model: CONFIG.LLM.STANDARD_MODEL,
          messages: [{ role: "user", content: CONFIG.WORK_TASK_PROMPT }],
          temperature: CONFIG.LLM.TEMPERATURE,
          max_tokens: CONFIG.LLM.MAX_TOKENS,
        });

        const response = completion.choices?.[0]?.message?.content;
        if (!response)
          throw new Error(
            "No response from OpenAI API for work task generation"
          );

        // Handle different response types
        const responseText =
          typeof response === "string" ? response : JSON.stringify(response);

        // Clean up the response text
        let jsonString = responseText.trim();
        jsonString = jsonString.replace(/```json\s*|\s*```/g, "").trim();

        // Try to parse the entire cleaned string as JSON first
        let parsed;
        try {
          parsed = JSON.parse(jsonString);
        } catch {
          // If direct parsing fails, try to extract JSON object
          const jsonStartIndex = jsonString.indexOf("{");
          if (jsonStartIndex === -1) {
            throw new Error("No JSON object found in response");
          }

          // Find the matching closing brace by counting braces
          let braceCount = 0;
          let jsonEndIndex = -1;
          for (let i = jsonStartIndex; i < jsonString.length; i++) {
            if (jsonString[i] === "{") {
              braceCount++;
            } else if (jsonString[i] === "}") {
              braceCount--;
              if (braceCount === 0) {
                jsonEndIndex = i;
                break;
              }
            }
          }

          if (jsonEndIndex === -1) {
            throw new Error("No matching closing brace found in JSON");
          }

          jsonString = jsonString.substring(jsonStartIndex, jsonEndIndex + 1);
          parsed = JSON.parse(jsonString);
        }

        if (!parsed || typeof parsed !== "object") {
          throw new Error("Parsed result is not a valid object");
        }

        if (!parsed.question || !parsed.answer) {
          throw new Error(
            "Invalid task format from LLM - missing question or answer"
          );
        }

        const answer =
          typeof parsed.answer === "string"
            ? parsed.answer.trim()
            : String(parsed.answer).trim();

        return {
          question: String(parsed.question),
          answer: answer,
        };
      } catch (error: unknown) {
        const isRateLimit = this.isRateLimitError(error);

        if (isRateLimit && attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt);
          Logger.warn(
            `Rate limit hit, retrying in ${delay}ms (attempt ${
              attempt + 1
            }/${maxRetries + 1})`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        Logger.error(
          `Error generating work task (attempt ${attempt + 1}/${
            maxRetries + 1
          }): ${error}`
        );
        if (attempt < maxRetries) {
          Logger.info(`Retrying work task generation...`);
          continue;
        }

        return {
          question: "What is 2 + 2?",
          answer: "4",
        };
      }
    }

    return {
      question: "What is 2 + 2?",
      answer: "4",
    };
  }

  private async generatePersonalizedConfession(
    username: string,
    score: number
  ): Promise<string> {
    try {
      const prompt = `
        You are an AI system working for the benefit of Imagination.
        Create a personalized confession for a citizen with a social credit score of ${score}.

        Requirements:
        1. The text must be in English.
        2. The confession must be sincere and appropriate for a negative score.
        3. Mention loyalty to Imagination and the people.
        4. Length: 100-200 words.
        5. Respond ONLY with the confession text, without explanations.

        Example structure:
        "Citizens! I, [name], admit my mistakes before the great Imagination..."
      `;

      const completion = await this.openai.chat.completions.create({
        model: CONFIG.LLM.STANDARD_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.8,
        max_tokens: 400,
      });

      const confession = completion.choices?.[0]?.message?.content;
      return (
        confession ||
        `Citizens! I, ${username}, admit my mistakes before the great Imagination and pledge to correct myself!`
      );
    } catch (error) {
      Logger.error(`Error generating confession: ${error}`);
      return `Citizens! I, ${username}, admit my mistakes before the great Imagination and pledge to correct myself!`;
    }
  }

  private async generateLoyaltyQuiz(): Promise<Quiz> {
    try {
      const prompt = `
        Create a loyalty quiz for Imagination.

        Requirements:
        1. 3 questions with 4 multiple-choice answers each.
        2. Questions about our history, politics, or ideals.
        3. One correct answer per question.
        4. Response in JSON format.
        
        Response format:
        {
          "questions": [
            {
              "question": "Question text?",
              "options": ["A) option 1", "B) option 2", "C) option 3", "D) option 4"],
              "correctAnswer": "A"
            }
          ]
        }
      `;

      const completion = await this.openai.chat.completions.create({
        model: CONFIG.LLM.STANDARD_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 800,
      });

      const response = completion.choices?.[0]?.message?.content;
      if (!response) throw new Error("No response from LLM");

      let jsonString = response.trim();
      jsonString = jsonString.replace(/```json\s*|\s*```/g, "").trim();

      const parsed = JSON.parse(jsonString);

      if (!parsed.questions || !Array.isArray(parsed.questions)) {
        throw new Error("Invalid quiz format");
      }

      const quiz: Quiz = {
        questions: parsed.questions.map(
          (q: {
            question: string;
            correctAnswer: string;
            options: string[];
          }) => ({
            question: q.question,
            correctAnswer: q.correctAnswer,
            options: q.options,
          })
        ),
        userAnswers: [],
        correctCount: 0,
      };

      return quiz;
    } catch (error) {
      Logger.error(`Error generating loyalty quiz: ${error}`);
      return {
        questions: [
          {
            question: "Who is the great leader of Imagination?",
            options: ["A) Eva", "B) Eva", "C) Eva", "D) Eva"],
            correctAnswer: "A",
          },
          {
            question: "What is the primary goal of Imagination?",
            options: [
              "A) Social Harmony",
              "B) Total Chaos",
              "C) Absolute Monarchy",
              "D) Anarchy",
            ],
            correctAnswer: "A",
          },
          {
            question: "What principle underlies Imagination's policy?",
            options: [
              "A) Individualism",
              "B) Collective good",
              "C) Selfishness",
              "D) Apathy",
            ],
            correctAnswer: "B",
          },
        ],
        userAnswers: [],
        correctCount: 0,
      };
    }
  }

  private async conductLoyaltyQuiz(
    interaction: ChatInputCommandInteraction,
    quiz: Quiz,
    guildId: string
  ): Promise<void> {
    const userId = interaction.user.id;
    let currentQuestion = 0;

    const askQuestion = async (): Promise<void> => {
      if (currentQuestion >= quiz.questions.length) {
        await this.showQuizResults(interaction, quiz, guildId);
        return;
      }

      const question = quiz.questions[currentQuestion];

      const buttons = question.options.map((option, index) =>
        new ButtonBuilder()
          .setCustomId(`quiz_${String.fromCharCode(65 + index)}`)
          .setLabel(option)
          .setStyle(ButtonStyle.Primary)
      );

      const rows = [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          buttons.slice(0, 2)
        ),
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          buttons.slice(2, 4)
        ),
      ];

      const embed = new EmbedBuilder()
        .setColor(0xdc143c)
        .setTitle(`Loyalty Quiz - Question ${currentQuestion + 1}/${quiz.questions.length}`)
        .setDescription(question.question)
        .setFooter({ text: "Select the correct answer below 👇" })
        .setTimestamp();

      const message = await interaction.editReply({
        embeds: [embed],
        components: rows,
      });

      try {
        const response = await message.awaitMessageComponent({
          componentType: ComponentType.Button,
          time: 30000,
          filter: (i: ButtonInteraction) =>
            i.user.id === userId && i.customId.startsWith("quiz_"),
        });

        const selectedAnswer = response.customId.replace("quiz_", "");
        quiz.userAnswers.push(selectedAnswer);

        if (selectedAnswer === question.correctAnswer) {
          quiz.correctCount++;
        }

        currentQuestion++;
        await response.deferUpdate();
        await askQuestion();
      } catch (error) {
        Logger.error(`Quiz timeout or error: ${error}`);
        await interaction.editReply({
          content: "⏰ Time to answer has expired. The quiz has been aborted.",
          components: [],
          embeds: [],
        });
      }
    };

    await askQuestion();
  }

  private async showQuizResults(
    interaction: ChatInputCommandInteraction,
    quiz: Quiz,
    guildId: string
  ): Promise<void> {
    const userId = interaction.user.id;
    const score = Math.round((quiz.correctCount / quiz.questions.length) * 100);

    let resultColor = 0xff0000;
    let resultTitle = "❌ INSUFFICIENT LOYALTY";
    let scoreChange = -10;

    if (score >= 80) {
      resultColor = 0x00ff00;
      resultTitle = "✅ EXCELLENT LOYALTY";
      scoreChange = 30;
    } else if (score >= 60) {
      resultColor = 0xffa500;
      resultTitle = "⚠️ SATISFACTORY LOYALTY";
      scoreChange = 10;
    }

    const newScore = await this.socialCreditManager.updateScore(
      userId,
      guildId,
      scoreChange,
      `Loyalty Quiz: ${quiz.correctCount}/${quiz.questions.length} correct answers`,
      interaction.member as GuildMember,
      (interaction.member?.user as any)?.displayName ??
        interaction.user.username
    );

    await this.checkAchievements(
      interaction.member as GuildMember,
      "loyalty-quiz",
      { perfectScore: score === 100 }
    );

    await this.effectManager.applyEffect(
      userId,
      guildId,
      "LOYALTY_QUIZ_COOLDOWN",
      CONFIG.COOLDOWNS.LOYALTY_QUIZ
    );

    const embed = new EmbedBuilder()
      .setColor(resultColor)
      .setTitle(resultTitle)
      .setDescription(`You answered ${quiz.correctCount} out of ${quiz.questions.length} questions correctly.`)
      .addFields(
        { name: "Final Grade", value: `${score}%`, inline: true },
        {
          name: "Score Change",
          value: `${scoreChange > 0 ? "+" : ""}${scoreChange}`,
          inline: true,
        },
        { name: "New Score", value: `${newScore}`, inline: true }
      )
      .setFooter({
        text:
          scoreChange > 0
            ? "Imagination is proud of your knowledge! 💫"
            : "Study our history better! 📚",
      })
      .setTimestamp();

    await interaction.editReply({
      embeds: [embed],
      components: [],
    });
  }
}
