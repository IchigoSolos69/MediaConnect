export interface SeoScoreBreakdown {
  hookScore: number; // 0-100
  readabilityScore: number; // 0-100
  ctaScore: number; // 0-100
  hashtagScore: number; // 0-100
  overallScore: number; // 0-100
}

export interface MobileCutoff {
  visibleText: string;
  truncatedText: string;
  cutoffIndex: number;
  cutoffLimit: number;
}

export interface SeoAnalysisResult {
  scores: SeoScoreBreakdown;
  mobileCutoffs: {
    instagram: MobileCutoff;
    x: MobileCutoff;
    youtube: MobileCutoff;
  };
  detectedPowerWords: string[];
  detectedQuestion: boolean;
  wordCount: number;
  charCount: number;
  hashtagCount: number;
  recommendations: Array<{
    type: "CRITICAL" | "RECOMMENDATION" | "PERFECT";
    text: string;
  }>;
}

const POWER_WORDS = [
  "proven",
  "framework",
  "mistake",
  "mistakes",
  "growth",
  "guide",
  "uncovered",
  "secret",
  "secrets",
  "simple",
  "effortless",
  "blueprint",
  "rules",
  "warning",
  "hack",
  "hacks",
  "strategy",
  "scale",
  "free",
  "stop doing",
  "why you",
  "how to",
  "truth about",
  "insane",
  "revealed",
  "breakthrough",
];

const QUESTION_STARTERS = [
  "how",
  "why",
  "what",
  "are you",
  "do you",
  "have you",
  "can you",
  "would you",
  "want to",
  "which",
  "is it",
];

const CTA_PHRASES = [
  "comment below",
  "link in bio",
  "save this",
  "bookmark",
  "share this",
  "drop a",
  "let me know",
  "what do you think",
  "tap the link",
  "follow for more",
  "thoughts?",
  "reply",
  "retweet",
];

export class SeoService {
  /**
   * Analyzes social media caption content for discoverability, hook engagement, and mobile truncation.
   */
  static analyze(content: string): SeoAnalysisResult {
    const trimmed = content.trim();
    const charCount = trimmed.length;
    const words = trimmed.length > 0 ? trimmed.split(/\s+/) : [];
    const wordCount = words.length;

    const lines = trimmed.split("\n").filter((l) => l.trim().length > 0);
    const firstLine = lines[0] || "";
    const firstLineWords = firstLine.split(/\s+/).filter(Boolean);

    // 1. Hook Score calculation
    let hookScore = 50; // base score
    const detectedPowerWords: string[] = [];

    const lowerFirstLine = firstLine.toLowerCase();
    for (const pw of POWER_WORDS) {
      if (lowerFirstLine.includes(pw)) {
        detectedPowerWords.push(pw);
        hookScore += 12;
      }
    }

    const detectedQuestion =
      firstLine.includes("?") ||
      QUESTION_STARTERS.some((qs) => lowerFirstLine.startsWith(qs));

    if (detectedQuestion) {
      hookScore += 18;
    }

    // Penalize if first line is a massive run-on sentence (> 16 words)
    if (firstLineWords.length > 16) {
      hookScore -= 15;
    } else if (firstLineWords.length >= 4 && firstLineWords.length <= 12) {
      hookScore += 10; // ideal punchy visual hook length
    }

    hookScore = Math.min(100, Math.max(10, hookScore));

    // 2. Readability & Spacing
    let readabilityScore = 70;
    if (charCount > 150 && lines.length === 1) {
      // Wall of text penalty
      readabilityScore -= 30;
    } else if (lines.length >= 2 && lines.length <= 6) {
      readabilityScore += 20;
    }

    const emojiRegex = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu;
    const emojiMatches = trimmed.match(emojiRegex) || [];
    if (emojiMatches.length >= 1 && emojiMatches.length <= 4) {
      readabilityScore += 10;
    } else if (emojiMatches.length > 8) {
      readabilityScore -= 15; // too spammy
    }
    readabilityScore = Math.min(100, Math.max(10, readabilityScore));

    // 3. CTA Score
    let ctaScore = 30;
    const lowerContent = trimmed.toLowerCase();
    for (const cta of CTA_PHRASES) {
      if (lowerContent.includes(cta)) {
        ctaScore = 95;
        break;
      }
    }

    // 4. Hashtag Score
    const hashtags = trimmed.match(/#[a-zA-Z0-9_]+/g) || [];
    const hashtagCount = hashtags.length;
    let hashtagScore = 50;
    if (hashtagCount >= 2 && hashtagCount <= 5) {
      hashtagScore = 95; // Sweet spot for modern algorithms
    } else if (hashtagCount === 0) {
      hashtagScore = 35;
    } else if (hashtagCount > 10) {
      hashtagScore = 40; // Penalized for hashtag stuffing
    }

    // CamelCase check on hashtags
    const nonCamelCase = hashtags.filter(
      (tag) => tag.length > 5 && tag === tag.toLowerCase()
    );
    if (nonCamelCase.length > 0) {
      hashtagScore -= nonCamelCase.length * 5;
    }
    hashtagScore = Math.min(100, Math.max(10, hashtagScore));

    // Overall Score
    const overallScore = Math.round(
      hookScore * 0.4 +
        readabilityScore * 0.25 +
        hashtagScore * 0.2 +
        ctaScore * 0.15
    );

    // 5. Calculate Mobile Fold Cutoffs
    // Instagram cutoff is ~125 chars or line 2
    const igLimit = 125;
    const igVisible = trimmed.slice(0, igLimit);
    const igTruncated = trimmed.slice(igLimit);

    // X cutoff is 280 chars total
    const xLimit = 280;
    const xVisible = trimmed.slice(0, xLimit);
    const xTruncated = trimmed.slice(xLimit);

    // YouTube fold is ~100 chars
    const ytLimit = 100;
    const ytVisible = trimmed.slice(0, ytLimit);
    const ytTruncated = trimmed.slice(ytLimit);

    // 6. Actionable Recommendations
    const recommendations: Array<{
      type: "CRITICAL" | "RECOMMENDATION" | "PERFECT";
      text: string;
    }> = [];

    if (!detectedQuestion && detectedPowerWords.length === 0) {
      recommendations.push({
        type: "CRITICAL",
        text: "Add a compelling opening question or curiosity trigger in line 1 to stop the mobile scroll.",
      });
    } else {
      recommendations.push({
        type: "PERFECT",
        text: `Strong hook detected (${detectedPowerWords.length} power words used).`,
      });
    }

    if (hashtagCount === 0) {
      recommendations.push({
        type: "RECOMMENDATION",
        text: "Add 3-5 targeted hashtags to help algorithms categorize your post into relevant search clusters.",
      });
    } else if (nonCamelCase.length > 0) {
      recommendations.push({
        type: "RECOMMENDATION",
        text: `Convert ${nonCamelCase.length} hashtag(s) to CamelCase (e.g. #SocialMediaTips) for screen reader accessibility and higher click-through.`,
      });
    } else {
      recommendations.push({
        type: "PERFECT",
        text: "Hashtag density is optimal (3–5 tags) with clean CamelCase formatting.",
      });
    }

    if (ctaScore < 60) {
      recommendations.push({
        type: "RECOMMENDATION",
        text: "Add a clear Call-To-Action (e.g. 'Save this for later', 'Drop your thoughts below') to boost comments and bookmark algorithms.",
      });
    }

    if (charCount > 150 && lines.length === 1) {
      recommendations.push({
        type: "CRITICAL",
        text: "Break your caption into 2–3 short paragraphs. Dense walls of text suffer a 42% lower read-through rate on mobile.",
      });
    }

    return {
      scores: {
        hookScore,
        readabilityScore,
        ctaScore,
        hashtagScore,
        overallScore,
      },
      mobileCutoffs: {
        instagram: {
          visibleText: igVisible,
          truncatedText: igTruncated,
          cutoffIndex: igLimit,
          cutoffLimit: igLimit,
        },
        x: {
          visibleText: xVisible,
          truncatedText: xTruncated,
          cutoffIndex: xLimit,
          cutoffLimit: xLimit,
        },
        youtube: {
          visibleText: ytVisible,
          truncatedText: ytTruncated,
          cutoffIndex: ytLimit,
          cutoffLimit: ytLimit,
        },
      },
      detectedPowerWords,
      detectedQuestion,
      wordCount,
      charCount,
      hashtagCount,
      recommendations,
    };
  }

  /**
   * Converts raw text / hashtags into CamelCase format.
   * e.g. "social media marketing" -> "#SocialMediaMarketing"
   */
  static formatToCamelCaseHashtag(input: string): string {
    const cleaned = input.replace(/^#/, "").trim();
    if (!cleaned) return "";

    const words = cleaned.split(/[\s_-]+/);
    const camel = words
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join("");

    return `#${camel}`;
  }

  /**
   * Generates tiered hashtag recommendations for a given topic.
   */
  static getHashtagRecommendations(topic: string) {
    const baseTopic = topic.trim().toLowerCase();

    const dictionary: Record<
      string,
      {
        broad: string[];
        niche: string[];
        community: string[];
      }
    > = {
      marketing: {
        broad: ["#MarketingStrategy", "#DigitalMarketing", "#SocialMediaTips"],
        niche: ["#ContentRepurposing", "#SocialMediaAudit", "#B2BMarketingHacks"],
        community: ["#MarketersOfInstagram", "#GrowthHackerCommunity"],
      },
      creator: {
        broad: ["#CreatorEconomy", "#ContentCreator", "#OnlineBusiness"],
        niche: ["#MonetizeYourAudience", "#VideoEditingHacks", "#CreatorWorkflow"],
        community: ["#CreatorsSupportingCreators", "#IndieMakers"],
      },
      productivity: {
        broad: ["#ProductivityHacks", "#TimeManagement", "#WorkSmarter"],
        niche: ["#AutomatedWorkflows", "#BufferMetricoolClone", "#AsyncWork"],
        community: ["#ProductivityGeeks", "#BuildInPublic"],
      },
    };

    const matchKey = Object.keys(dictionary).find((k) => baseTopic.includes(k)) || "marketing";
    return dictionary[matchKey];
  }
}
