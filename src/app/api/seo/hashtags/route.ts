import { NextRequest, NextResponse } from "next/server";
import { SeoService } from "@/services/seo.service";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { topic, rawTags } = body;

    let camelCaseTags: string[] = [];
    if (rawTags && Array.isArray(rawTags)) {
      camelCaseTags = rawTags.map((t: string) => SeoService.formatToCamelCaseHashtag(t));
    }

    const recommendations = SeoService.getHashtagRecommendations(topic || "marketing");

    return NextResponse.json({
      success: true,
      camelCaseTags,
      recommendations,
    });
  } catch (error: any) {
    console.error("SEO Hashtags API error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to process hashtags" },
      { status: 500 }
    );
  }
}
