import { NextRequest, NextResponse } from "next/server";
import { SeoService } from "@/services/seo.service";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { content } = body;

    if (!content && content !== "") {
      return NextResponse.json(
        { success: false, error: "Content string is required" },
        { status: 400 }
      );
    }

    const analysis = SeoService.analyze(content);
    return NextResponse.json({ success: true, analysis });
  } catch (error: any) {
    console.error("SEO Analysis API error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to analyze content" },
      { status: 500 }
    );
  }
}
