import { SeoService } from "./services/seo.service";

async function verifyPhase4() {
  console.log("🧪 Verifying Phase 4: Social SEO Studio & Content Assistant...\n");

  // 1. Test High-Quality Hook Analysis
  const goodPost = `Are you still struggling with reach? The proven 3-step framework that scaled our audience by 10x without paying for ads.\n\nWhich strategy works best for you? Let us know below! 👇 #SocialMediaGrowth #ContentMarketing #CreatorHacks`;
  const goodResult = SeoService.analyze(goodPost);

  console.log("1. High-Quality Hook Analysis:");
  console.log(`   - Overall SEO Score: ${goodResult.scores.overallScore}/100`);
  console.log(`   - Hook Score: ${goodResult.scores.hookScore}/100 (Power words: ${goodResult.detectedPowerWords.join(", ")})`);
  console.log(`   - Question detected: ${goodResult.detectedQuestion}`);
  console.log(`   - Hashtags detected: ${goodResult.hashtagCount}`);

  if (goodResult.scores.overallScore < 75) {
    throw new Error(`Expected high score, got ${goodResult.scores.overallScore}`);
  }

  // 2. Test Weak Post (Wall of text)
  const weakPost = `We are announcing our new features today we have added several things to our website and we think they will be helpful for people who use computers.`;
  const weakResult = SeoService.analyze(weakPost);

  console.log("\n2. Weak Hook Analysis:");
  console.log(`   - Overall SEO Score: ${weakResult.scores.overallScore}/100`);
  console.log(`   - Recommendations: ${weakResult.recommendations.map((r) => `[${r.type}] ${r.text}`).join("; ")}`);

  if (weakResult.scores.overallScore >= goodResult.scores.overallScore) {
    throw new Error("Weak post should score significantly lower than optimized post");
  }

  // 3. Test CamelCase Hashtag Engine
  console.log("\n3. CamelCase Hashtag Formatter:");
  const testCases = [
    { input: "social media marketing", expected: "#SocialMediaMarketing" },
    { input: "content_creator_tips", expected: "#ContentCreatorTips" },
    { input: "growth-hacks", expected: "#GrowthHacks" },
    { input: "#alreadyhashtagged", expected: "#Alreadyhashtagged" },
  ];

  for (const tc of testCases) {
    const output = SeoService.formatToCamelCaseHashtag(tc.input);
    console.log(`   - "${tc.input}" -> "${output}"`);
    if (output !== tc.expected) {
      throw new Error(`Expected "${tc.expected}", got "${output}"`);
    }
  }

  // 4. Test Mobile Cutoff Logic
  console.log("\n4. Mobile Fold Cutoffs:");
  const cutoffs = goodResult.mobileCutoffs;
  console.log(`   - Instagram Cutoff: visible = ${cutoffs.instagram.visibleText.length} chars, truncated = ${cutoffs.instagram.truncatedText.length} chars`);
  console.log(`   - X Cutoff: visible = ${cutoffs.x.visibleText.length} chars`);

  if (cutoffs.instagram.cutoffLimit !== 125) {
    throw new Error("Instagram cutoff limit must be 125");
  }

  console.log("\n🎉 PHASE 4 VERIFICATION PASSED SUCCESSFULLY!");
}

verifyPhase4().catch((err) => {
  console.error("❌ Verification failed:", err);
  process.exit(1);
});
