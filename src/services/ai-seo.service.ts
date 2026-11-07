import { SeoService, SeoAnalysisResult } from "./seo.service";
import { SocialPlatform } from "@/providers/types";

export type AiProviderType = "gemini" | "openai" | "anthropic" | "heuristic";

export class UnsupportedAiModelError extends Error {
  public model: string;
  constructor(model: string, message: string) {
    super(message);
    this.name = "UnsupportedAiModelError";
    this.model = model;
  }
}

export interface AiAssistantConfig {
  provider: AiProviderType;
  model: string;
  apiKey?: string;
}

export interface AiSeoAssistantInput {
  content: string;
  topic?: string;
  targetPlatform?: SocialPlatform;
  allowHeuristicFallback?: boolean;
}

export interface AiSeoAssistantResult {
  source: "AI_MODEL" | "HEURISTIC_FALLBACK";
  provider: AiProviderType;
  model: string;
  isAiGenerated: boolean;
  generatedAt: string;
  disclaimer: string;
  heuristicAnalysis: SeoAnalysisResult;
  captionImprovements: string[];
  hookAlternatives: Array<{
    style: "QUESTION" | "PROBLEM_SOLUTION" | "STRUCTURED_LIST";
    hook: string;
  }>;
  hashtagRecommendations: {
    broad: string[];
    niche: string[];
    community: string[];
  };
  platformFormatting: {
    YOUTUBE: {
      title: string;
      description: string;
      tags: string[];
    };
    INSTAGRAM: {
      caption: string;
      firstComment: string;
    };
    X: {
      post: string;
      charCount: number;
    };
  };
  contentSuggestions: string[];
}

const RETIRED_MODELS = new Set([
  "gemini-2.0-flash",
  "gemini-2.0-flash-exp",
  "gemini-1.5-flash",
  "gemini-1.5-pro",
  "gemini-pro",
]);

const NON_VIRALITY_DISCLAIMER_AI =
  "AI-generated editorial suggestions. Formatting and hook recommendations support readability, platform cutoffs, and search categorization, and do not predict or guarantee algorithmic reach or virality.";

const NON_VIRALITY_DISCLAIMER_HEURISTIC =
  "Rule-based heuristic suggestions (local free fallback). Recommendations are derived from platform character limits, line-break structure, and CamelCase accessibility standards, without any claim of predicted virality.";

/**
 * Strips any unsupported claims of guaranteed virality from model-generated text.
 */
function sanitizeUnsupportedViralityClaims(text: string): string {
  return text
    .replace(/\b(guaranteed to go viral|will go viral|100%\s*viral|guaranteed\s+reach)\b/gi, "structured for readability")
    .trim();
}

export class AiSeoService {
  /**
   * Resolves the active AI provider and configurable model identifier.
   * Rejects retired models (such as gemini-2.0-flash) and defaults to heuristic fallback when no API key is configured.
   */
  static resolveConfig(): AiAssistantConfig {
    const requestedModel = (
      process.env.AI_MODEL ||
      process.env.GEMINI_MODEL ||
      ""
    ).trim();

    if (requestedModel && RETIRED_MODELS.has(requestedModel.toLowerCase())) {
      throw new UnsupportedAiModelError(
        requestedModel,
        `Configured AI model '${requestedModel}' has been shut down / retired. Set AI_MODEL to a currently supported model (e.g., 'gemini-2.5-flash' or 'gpt-4o-mini').`
      );
    }

    const explicitProvider = (process.env.AI_PROVIDER || "").trim().toLowerCase();
    const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || "";
    const openaiKey = process.env.OPENAI_API_KEY || "";
    const anthropicKey = process.env.ANTHROPIC_API_KEY || "";

    if (explicitProvider === "heuristic") {
      return {
        provider: "heuristic",
        model: "local-heuristic-v1",
      };
    }

    if (explicitProvider === "gemini" || (!explicitProvider && geminiKey)) {
      if (!geminiKey) {
        return { provider: "heuristic", model: "local-heuristic-v1" };
      }
      return {
        provider: "gemini",
        model: requestedModel || "gemini-2.5-flash",
        apiKey: geminiKey,
      };
    }

    if (explicitProvider === "openai" || (!explicitProvider && openaiKey)) {
      if (!openaiKey) {
        return { provider: "heuristic", model: "local-heuristic-v1" };
      }
      return {
        provider: "openai",
        model: requestedModel || "gpt-4o-mini",
        apiKey: openaiKey,
      };
    }

    if (explicitProvider === "anthropic" || (!explicitProvider && anthropicKey)) {
      if (!anthropicKey) {
        return { provider: "heuristic", model: "local-heuristic-v1" };
      }
      return {
        provider: "anthropic",
        model: requestedModel || "claude-haiku-4-5",
        apiKey: anthropicKey,
      };
    }

    return {
      provider: "heuristic",
      model: "local-heuristic-v1",
    };
  }

  /**
   * Generates deterministic, zero-cost local heuristic SEO suggestions and platform formatting.
   */
  static generateHeuristicFallback(
    input: AiSeoAssistantInput
  ): AiSeoAssistantResult {
    const rawContent = (input.content || "").trim();
    const heuristicAnalysis = SeoService.analyze(rawContent);
    const topic = (input.topic || "marketing").trim();
    const hashtags = SeoService.getHashtagRecommendations(topic);

    const lines = rawContent
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const firstSentence =
      lines[0] || `Key workflow lessons for ${topic}`;
    const coreSubject = firstSentence.replace(/[?.!]+$/, "").slice(0, 80);

    const hookAlternatives: AiSeoAssistantResult["hookAlternatives"] = [
      {
        style: "QUESTION",
        hook: `How are you currently structuring your ${topic} workflow to avoid manual bottlenecks?`,
      },
      {
        style: "PROBLEM_SOLUTION",
        hook: `Common mistake in ${topic}: publishing identical copy across every network without adjusting for mobile truncation.`,
      },
      {
        style: "STRUCTURED_LIST",
        hook: `3 practical steps to organize ${coreSubject.toLowerCase()}:`,
      },
    ];

    const bodyParagraph =
      lines.slice(1).join("\n\n") ||
      rawContent ||
      `Here is a concise breakdown of our ${topic} process.`;
    const primaryTags = [
      ...hashtags.broad.slice(0, 2),
      ...hashtags.niche.slice(0, 2),
    ].map((t) => SeoService.formatToCamelCaseHashtag(t));

    const captionImprovements = [
      `${hookAlternatives[0].hook}\n\n${bodyParagraph}\n\nWhat part of this process would you adapt first? Let me know in the comments.\n\n${primaryTags.join(" ")}`,
      `${hookAlternatives[2].hook}\n\n• Keep the opening hook under 100 characters\n• Separate key points with line breaks\n• Use 3–5 CamelCase hashtags\n\nSave this checklist for your next campaign. ${primaryTags.slice(0, 3).join(" ")}`,
    ];

    const xBase = `${firstSentence}\n\n${primaryTags.slice(0, 2).join(" ")}`.trim();
    const xPost = xBase.length <= 280 ? xBase : `${xBase.slice(0, 276)}...`;

    const ytTitle =
      firstSentence.length <= 70
        ? firstSentence
        : `${firstSentence.slice(0, 67)}...`;

    const contentSuggestions = heuristicAnalysis.recommendations.map((r) => r.text);
    if (rawContent.length > 250) {
      contentSuggestions.push(
        "Place your primary summary in the first 100 characters so it remains visible above the mobile fold on YouTube and Instagram."
      );
    }

    return {
      source: "HEURISTIC_FALLBACK",
      provider: "heuristic",
      model: "local-heuristic-v1",
      isAiGenerated: false,
      generatedAt: new Date().toISOString(),
      disclaimer: NON_VIRALITY_DISCLAIMER_HEURISTIC,
      heuristicAnalysis,
      captionImprovements,
      hookAlternatives,
      hashtagRecommendations: {
        broad: hashtags.broad.map((t) => SeoService.formatToCamelCaseHashtag(t)),
        niche: hashtags.niche.map((t) => SeoService.formatToCamelCaseHashtag(t)),
        community: hashtags.community.map((t) => SeoService.formatToCamelCaseHashtag(t)),
      },
      platformFormatting: {
        YOUTUBE: {
          title: ytTitle,
          description: `${rawContent || bodyParagraph}\n\nTopics: ${primaryTags.join(", ")}`,
          tags: primaryTags.map((t) => t.replace(/^#/, "")),
        },
        INSTAGRAM: {
          caption: `${firstSentence}\n\n${bodyParagraph}\n\nSave this post for reference or share your thoughts below.`,
          firstComment: primaryTags.join(" "),
        },
        X: {
          post: xPost,
          charCount: xPost.length,
        },
      },
      contentSuggestions,
    };
  }

  /**
   * Generates SEO suggestions using the configured LLM provider (Gemini, OpenAI, or Anthropic),
   * or falls back to the local heuristic engine when unconfigured or on transient error.
   */
  static async generateSuggestions(
    input: AiSeoAssistantInput
  ): Promise<AiSeoAssistantResult> {
    const config = this.resolveConfig();
    if (config.provider === "heuristic" || !config.apiKey) {
      return this.generateHeuristicFallback(input);
    }

    const fallback = this.generateHeuristicFallback(input);
    const systemPrompt = [
      "You are a factual social media editorial assistant.",
      "Do NOT make claims about predicted virality, guaranteed reach, or algorithm hacks.",
      "Return ONLY valid JSON matching the schema:",
      JSON.stringify({
        captionImprovements: ["string"],
        hookAlternatives: [
          { style: "QUESTION", hook: "string" },
          { style: "PROBLEM_SOLUTION", hook: "string" },
          { style: "STRUCTURED_LIST", hook: "string" },
        ],
        hashtagRecommendations: {
          broad: ["#CamelCaseTag"],
          niche: ["#CamelCaseTag"],
          community: ["#CamelCaseTag"],
        },
        platformFormatting: {
          YOUTUBE: { title: "string", description: "string", tags: ["tag"] },
          INSTAGRAM: { caption: "string", firstComment: "#Tag1 #Tag2" },
          X: { post: "string (max 280 chars)" },
        },
        contentSuggestions: ["string"],
      }),
    ].join("\n");

    const userPrompt = `Draft content: ${JSON.stringify(input.content)}\nTopic: ${input.topic || "general"}\nTarget Platform: ${input.targetPlatform || "ALL"}`;

    try {
      let rawJsonText = "";

      if (config.provider === "gemini") {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
          config.model
        )}:generateContent?key=${encodeURIComponent(config.apiKey)}`;

        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: [{ role: "user", parts: [{ text: userPrompt }] }],
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0.3,
            },
          }),
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Gemini API request failed (${res.status}): ${errText}`);
        }

        const data = await res.json();
        rawJsonText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      } else if (config.provider === "openai") {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: config.model,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            response_format: { type: "json_object" },
            temperature: 0.3,
          }),
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`OpenAI API request failed (${res.status}): ${errText}`);
        }

        const data = await res.json();
        rawJsonText = data.choices?.[0]?.message?.content || "";
      } else if (config.provider === "anthropic") {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": config.apiKey,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: config.model,
            max_tokens: 1024,
            system: systemPrompt,
            messages: [{ role: "user", content: userPrompt }],
          }),
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Anthropic API request failed (${res.status}): ${errText}`);
        }

        const data = await res.json();
        rawJsonText = data.content?.[0]?.text || "";
      }

      const parsed = JSON.parse(rawJsonText);
      const xPostRaw = sanitizeUnsupportedViralityClaims(
        String(parsed.platformFormatting?.X?.post || fallback.platformFormatting.X.post)
      ).slice(0, 280);

      return {
        source: "AI_MODEL",
        provider: config.provider,
        model: config.model,
        isAiGenerated: true,
        generatedAt: new Date().toISOString(),
        disclaimer: NON_VIRALITY_DISCLAIMER_AI,
        heuristicAnalysis: fallback.heuristicAnalysis,
        captionImprovements: Array.isArray(parsed.captionImprovements)
          ? parsed.captionImprovements.map((c: string) =>
              sanitizeUnsupportedViralityClaims(String(c))
            )
          : fallback.captionImprovements,
        hookAlternatives: Array.isArray(parsed.hookAlternatives)
          ? parsed.hookAlternatives.map((h: { style?: string; hook?: string }) => ({
              style:
                h.style === "QUESTION" ||
                h.style === "PROBLEM_SOLUTION" ||
                h.style === "STRUCTURED_LIST"
                  ? h.style
                  : "QUESTION",
              hook: sanitizeUnsupportedViralityClaims(String(h.hook || "")),
            }))
          : fallback.hookAlternatives,
        hashtagRecommendations: {
          broad: Array.isArray(parsed.hashtagRecommendations?.broad)
            ? parsed.hashtagRecommendations.broad.map((t: string) =>
                SeoService.formatToCamelCaseHashtag(String(t))
              )
            : fallback.hashtagRecommendations.broad,
          niche: Array.isArray(parsed.hashtagRecommendations?.niche)
            ? parsed.hashtagRecommendations.niche.map((t: string) =>
                SeoService.formatToCamelCaseHashtag(String(t))
              )
            : fallback.hashtagRecommendations.niche,
          community: Array.isArray(parsed.hashtagRecommendations?.community)
            ? parsed.hashtagRecommendations.community.map((t: string) =>
                SeoService.formatToCamelCaseHashtag(String(t))
              )
            : fallback.hashtagRecommendations.community,
        },
        platformFormatting: {
          YOUTUBE: {
            title: sanitizeUnsupportedViralityClaims(
              String(
                parsed.platformFormatting?.YOUTUBE?.title ||
                  fallback.platformFormatting.YOUTUBE.title
              )
            ),
            description: sanitizeUnsupportedViralityClaims(
              String(
                parsed.platformFormatting?.YOUTUBE?.description ||
                  fallback.platformFormatting.YOUTUBE.description
              )
            ),
            tags: Array.isArray(parsed.platformFormatting?.YOUTUBE?.tags)
              ? parsed.platformFormatting.YOUTUBE.tags.map(String)
              : fallback.platformFormatting.YOUTUBE.tags,
          },
          INSTAGRAM: {
            caption: sanitizeUnsupportedViralityClaims(
              String(
                parsed.platformFormatting?.INSTAGRAM?.caption ||
                  fallback.platformFormatting.INSTAGRAM.caption
              )
            ),
            firstComment: String(
              parsed.platformFormatting?.INSTAGRAM?.firstComment ||
                fallback.platformFormatting.INSTAGRAM.firstComment
            ),
          },
          X: {
            post: xPostRaw,
            charCount: xPostRaw.length,
          },
        },
        contentSuggestions: Array.isArray(parsed.contentSuggestions)
          ? parsed.contentSuggestions.map((s: string) =>
              sanitizeUnsupportedViralityClaims(String(s))
            )
          : fallback.contentSuggestions,
      };
    } catch (err) {
      if (input.allowHeuristicFallback === false) {
        throw err;
      }
      return fallback;
    }
  }
}
