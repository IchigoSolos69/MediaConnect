import { AnalyticsService, AggregatedMetrics, AudienceHeatmapResult } from "./analytics.service";

export interface ReportMetricDefinition {
  metric: string;
  definition: string;
  availabilityNote: string;
}

export interface WorkspaceReportMetadata {
  reportTitle: string;
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
  generatedAt: string;
  dateRange: {
    days: number;
    startDate: string;
    endDate: string;
  };
  dataSource: string;
  lastSyncedAt: string;
  summary: {
    totalImpressions: string;
    totalReach: string;
    totalEngagements: string;
    totalFollowers: string;
    followerGrowth: string;
    engagementRate: string;
  };
  platforms: Array<{
    platform: string;
    source: string;
    lastSyncedAt: string;
    impressions: string;
    reach: string;
    engagements: string;
    followers: string;
    followerGrowth: string;
    engagementRate: string;
    unavailableMetrics: string[];
  }>;
  unavailableDisclosures: string[];
  metricDefinitions: ReportMetricDefinition[];
}

export const METRIC_DEFINITIONS: ReportMetricDefinition[] = [
  {
    metric: "Impressions / Views",
    definition:
      "Total number of times content was displayed or viewed across connected channels during the selected date window.",
    availabilityNote:
      "Reported by YouTube Analytics API v2 (views) and Instagram Graph API (views/impressions). Disabled for paid X API.",
  },
  {
    metric: "Aggregated Daily Reach (Non-Deduplicated)",
    definition:
      "Sum of daily reach reported across connected channels. Underlying social platform APIs do not support cross-platform or multi-day unique viewer deduplication.",
    availabilityNote:
      "Provided by Instagram Graph API daily reach. Marked UNAVAILABLE for YouTube daily channel reports. Not deduplicated across channels or dates.",
  },
  {
    metric: "Total Engagements",
    definition:
      "Aggregate count of likes, comments, shares, and direct content interactions recorded by the platform API.",
    availabilityNote:
      "Provided by YouTube Analytics (likes + comments + shares) and Instagram Insights (total_interactions).",
  },
  {
    metric: "Engagement Rate",
    definition:
      "Percentage of impressions that resulted in an interaction: (Total Engagements / Total Impressions) * 100.",
    availabilityNote: "Computed only when verified impressions are available.",
  },
  {
    metric: "Net Follower Growth",
    definition:
      "Net change in follower or subscriber count across verified daily snapshots within the selected date window.",
    availabilityNote:
      "Marked UNAVAILABLE when fewer than two verified follower snapshots exist; never estimated or fabricated.",
  },
];

function escapePdfText(input: string): string {
  return input
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function wrapPdfText(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const words = text.split(" ");
  const result: string[] = [];
  let current = "";
  for (const word of words) {
    if (!current) {
      if (word.length > maxChars) {
        for (let i = 0; i < word.length; i += maxChars) {
          result.push(word.slice(i, i + maxChars));
        }
      } else {
        current = word;
      }
    } else if (current.length + 1 + word.length <= maxChars) {
      current += ` ${word}`;
    } else {
      result.push(current);
      if (word.length > maxChars) {
        for (let i = 0; i < word.length; i += maxChars) {
          result.push(word.slice(i, i + maxChars));
        }
        current = "";
      } else {
        current = word;
      }
    }
  }
  if (current) {
    result.push(current);
  }
  return result;
}

interface FormattedLine {
  text: string;
  bold: boolean;
  size: number;
  indent: number;
  leading: number;
}

/**
 * Generates a standards-compliant multi-page PDF 1.4 binary document from structured text lines.
 * Wraps overflowing text, paginates dynamically, emits valid /Page objects linked into /Pages,
 * and numbers every page without clipping lines.
 */
function buildPdf14Binary(
  lines: Array<{ text: string; bold?: boolean; size?: number; indent?: number }>
): Buffer {
  const formattedLines: FormattedLine[] = [];
  for (const line of lines) {
    const size = line.size || 9;
    const indent = line.indent || 0;
    const bold = Boolean(line.bold);
    const usableWidth = 528 - indent;
    const charWidth = 0.52 * size;
    const maxChars = Math.max(20, Math.floor(usableWidth / charWidth));
    const chunks = wrapPdfText(line.text, maxChars);
    for (let cIdx = 0; cIdx < chunks.length; cIdx++) {
      formattedLines.push({
        text: chunks[cIdx],
        bold,
        size,
        indent: cIdx === 0 ? indent : indent + 8,
        leading: size + 4,
      });
    }
  }

  const pages: FormattedLine[][] = [];
  let currentPage: FormattedLine[] = [];
  let currentY = 740;
  const BOTTOM_MARGIN = 55;

  for (const line of formattedLines) {
    if (currentY - line.leading < BOTTOM_MARGIN && currentPage.length > 0) {
      pages.push(currentPage);
      currentPage = [];
      currentY = 740;
    }
    currentPage.push(line);
    currentY -= line.leading;
  }
  if (currentPage.length > 0) {
    pages.push(currentPage);
  }
  if (pages.length === 0) {
    pages.push([]);
  }

  const totalPages = pages.length;
  const pageStreams: string[] = [];

  for (let pIdx = 0; pIdx < totalPages; pIdx++) {
    const pLines = pages[pIdx];
    const streamOps: string[] = ["BT"];

    if (pIdx > 0) {
      streamOps.push("/F2 8 Tf");
      streamOps.push("1 0 0 1 42 760 Tm");
      streamOps.push(
        `(${escapePdfText("MediaConnect Executive Performance Report (Continued)")}) Tj`
      );
    }

    let y = 740;
    for (const item of pLines) {
      const font = item.bold ? "/F2" : "/F1";
      const x = 42 + item.indent;
      streamOps.push(`${font} ${item.size} Tf`);
      streamOps.push(`1 0 0 1 ${x} ${y} Tm`);
      streamOps.push(`(${escapePdfText(item.text)}) Tj`);
      y -= item.leading;
    }

    // Page footer
    streamOps.push("/F1 8 Tf");
    streamOps.push("1 0 0 1 42 38 Tm");
    streamOps.push(
      `(${escapePdfText(
        `Page ${pIdx + 1} of ${totalPages} | Confidential - MediaConnect Enterprise Analytics`
      )}) Tj`
    );

    streamOps.push("ET");
    pageStreams.push(streamOps.join("\n"));
  }

  const kidsRefs = Array.from(
    { length: totalPages },
    (_, idx) => `${5 + 2 * idx} 0 R`
  ).join(" ");

  const objects: string[] = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    `2 0 obj\n<< /Type /Pages /Kids [${kidsRefs}] /Count ${totalPages} >>\nendobj\n`,
    "3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n",
  ];

  for (let i = 0; i < totalPages; i++) {
    const pageObjId = 5 + 2 * i;
    const contentObjId = 5 + 2 * i + 1;
    const content = pageStreams[i];
    const len = Buffer.byteLength(content, "utf8");

    objects.push(
      `${pageObjId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjId} 0 R >>\nendobj\n`
    );
    objects.push(
      `${contentObjId} 0 obj\n<< /Length ${len} >>\nstream\n${content}\nendstream\nendobj\n`
    );
  }

  const header = "%PDF-1.4\n";
  const offsets: number[] = [];
  let body = "";
  let runningOffset = Buffer.byteLength(header, "utf8");

  for (const obj of objects) {
    offsets.push(runningOffset);
    body += obj;
    runningOffset += Buffer.byteLength(obj, "utf8");
  }

  const xrefOffset = runningOffset;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    xref += `${String(off).padStart(10, "0")} 00000 n \n`;
  }

  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(header + body + xref + trailer, "utf8");
}

export class ReportService {
  /**
   * Generates a workspace-scoped PDF report and structured metadata with source attribution,
   * metric definitions, date range, workspace branding, and explicit unavailable-data disclosures.
   */
  static async generateWorkspaceReport(
    workspaceId: string,
    days = 14
  ): Promise<{ pdfBuffer: Buffer; metadata: WorkspaceReportMetadata }> {
    const [overview, heatmap]: [AggregatedMetrics, AudienceHeatmapResult] = await Promise.all([
      AnalyticsService.getOverview(workspaceId, days),
      AnalyticsService.getAudienceHeatmap(workspaceId, "ALL"),
    ]);

    const generatedAt = new Date().toISOString();
    const lastSyncedAt = overview.lastSyncedAt || "NOT_YET_SYNCED";

    const platforms = Object.entries(overview.byPlatform).map(([platform, p]) => ({
      platform,
      source: p.source,
      lastSyncedAt: p.lastSyncedAt || "NOT_YET_SYNCED",
      impressions: p.impressions !== null ? p.impressions.toLocaleString("en-US") : "UNAVAILABLE",
      reach: p.reach !== null ? p.reach.toLocaleString("en-US") : "UNAVAILABLE",
      engagements: p.engagements !== null ? p.engagements.toLocaleString("en-US") : "UNAVAILABLE",
      followers: p.followers.toLocaleString("en-US"),
      followerGrowth:
        p.followerGrowth !== null
          ? `${p.followerGrowth >= 0 ? "+" : ""}${p.followerGrowth.toLocaleString("en-US")}`
          : "UNAVAILABLE",
      engagementRate: p.engagementRate !== null ? `${p.engagementRate}%` : "UNAVAILABLE",
      unavailableMetrics: p.unavailableMetrics,
    }));

    const unavailableDisclosures: string[] = [];
    if (overview.unavailableMetrics.length > 0) {
      unavailableDisclosures.push(
        `Unavailable Platform Metrics: ${overview.unavailableMetrics.join(", ")}`
      );
    }
    if (!heatmap.available) {
      unavailableDisclosures.push(
        `Audience Activity Heatmap: UNAVAILABLE (${heatmap.reason || "Not supported by live API"})`
      );
    }
    for (const p of platforms) {
      if (p.source === "UNSUPPORTED_PAID") {
        unavailableDisclosures.push(
          `${p.platform}: Live paid analytics disabled (ALLOW_PAID_X_API is not enabled).`
        );
      } else if (p.unavailableMetrics.length > 0) {
        unavailableDisclosures.push(
          `${p.platform} Unavailable Fields: ${p.unavailableMetrics.join(", ")}`
        );
      }
    }
    unavailableDisclosures.push(
      "Reach Semantics: Cross-platform and multi-day unique viewer deduplication is not supported by underlying social platform APIs. Total reach represents non-deduplicated daily aggregated reach."
    );
    if (unavailableDisclosures.length === 0) {
      unavailableDisclosures.push(
        "All reported metrics are available from the active workspace data source."
      );
    }

    const metadata: WorkspaceReportMetadata = {
      reportTitle: `MediaConnect Executive Performance Report - ${overview.workspaceName}`,
      workspaceId: overview.workspaceId,
      workspaceName: overview.workspaceName,
      workspaceSlug: overview.workspaceSlug,
      generatedAt,
      dateRange: {
        days: overview.days,
        startDate: overview.startDate,
        endDate: overview.endDate,
      },
      dataSource: overview.dataSource,
      lastSyncedAt,
      summary: {
        totalImpressions: overview.totalImpressions.toLocaleString("en-US"),
        totalReach: overview.unavailableMetrics.includes("YOUTUBE:reach")
          ? `${overview.totalReach.toLocaleString("en-US")} (Partial - YouTube Reach UNAVAILABLE)`
          : overview.totalReach.toLocaleString("en-US"),
        totalEngagements: overview.totalEngagements.toLocaleString("en-US"),
        totalFollowers: overview.totalFollowers.toLocaleString("en-US"),
        followerGrowth:
          overview.followerGrowth !== null
            ? `${overview.followerGrowth >= 0 ? "+" : ""}${overview.followerGrowth.toLocaleString("en-US")}`
            : "UNAVAILABLE (Insufficient snapshot history)",
        engagementRate: `${overview.engagementRate}%`,
      },
      platforms,
      unavailableDisclosures,
      metricDefinitions: METRIC_DEFINITIONS,
    };

    const pdfLines: Array<{ text: string; bold?: boolean; size?: number; indent?: number }> = [
      {
        text: `MEDIACONNECT EXECUTIVE PERFORMANCE REPORT`,
        bold: true,
        size: 13,
      },
      {
        text: `Workspace Branding: ${metadata.workspaceName} (${metadata.workspaceSlug}) | ID: ${metadata.workspaceId}`,
        bold: true,
        size: 10,
      },
      {
        text: `Reporting Window: ${metadata.dateRange.startDate} to ${metadata.dateRange.endDate} (${metadata.dateRange.days} Days)`,
        size: 9,
      },
      {
        text: `Data Provenance / Source Attribution: ${metadata.dataSource} | Last Synced: ${metadata.lastSyncedAt}`,
        bold: true,
        size: 9,
      },
      {
        text: `Report Generated (UTC): ${metadata.generatedAt}`,
        size: 8,
      },
      { text: "--------------------------------------------------------------------------------", size: 8 },
      { text: "1. EXECUTIVE KPI SUMMARY", bold: true, size: 10 },
      {
        text: `Total Impressions: ${metadata.summary.totalImpressions} | Daily Reach (Non-Dedup): ${metadata.summary.totalReach}`,
        indent: 10,
        size: 9,
      },
      {
        text: `Total Engagements: ${metadata.summary.totalEngagements} | Engagement Rate: ${metadata.summary.engagementRate}`,
        indent: 10,
        size: 9,
      },
      {
        text: `Audience Base: ${metadata.summary.totalFollowers} | Net Follower Growth: ${metadata.summary.followerGrowth}`,
        indent: 10,
        size: 9,
      },
      { text: "--------------------------------------------------------------------------------", size: 8 },
      { text: "2. CHANNEL PERFORMANCE & SOURCE ATTRIBUTION", bold: true, size: 10 },
    ];

    if (platforms.length === 0) {
      pdfLines.push({
        text: "No social channels connected to this workspace.",
        indent: 10,
        size: 9,
      });
    } else {
      for (const p of platforms) {
        pdfLines.push({
          text: `${p.platform} [Source: ${p.source}] (Synced: ${p.lastSyncedAt})`,
          bold: true,
          indent: 8,
          size: 9,
        });
        pdfLines.push({
          text: `Impressions: ${p.impressions} | Reach: ${p.reach} | Engagements: ${p.engagements} | Rate: ${p.engagementRate}`,
          indent: 16,
          size: 8,
        });
        pdfLines.push({
          text: `Followers: ${p.followers} | Net Growth: ${p.followerGrowth} | Unavailable: ${
            p.unavailableMetrics.length > 0 ? p.unavailableMetrics.join(", ") : "None"
          }`,
          indent: 16,
          size: 8,
        });
      }

      if (overview.accounts && overview.accounts.length > 0) {
        pdfLines.push({
          text: "Connected Account Breakdowns:",
          bold: true,
          indent: 8,
          size: 9,
        });
        for (const acc of overview.accounts) {
          pdfLines.push({
            text: `@${acc.username} (${acc.platform}) - Audience: ${acc.followers.toLocaleString("en-US")} | Impressions: ${
              acc.impressions !== null ? acc.impressions.toLocaleString("en-US") : "UNAVAILABLE"
            } | Status: ${acc.syncStatus}`,
            indent: 16,
            size: 8,
          });
        }
      }
    }

    pdfLines.push({
      text: "--------------------------------------------------------------------------------",
      size: 8,
    });
    pdfLines.push({
      text: "3. UNAVAILABLE DATA & PROVIDER LIMITATION DISCLOSURES",
      bold: true,
      size: 10,
    });
    for (const disc of unavailableDisclosures) {
      pdfLines.push({ text: `- ${disc}`, indent: 10, size: 8 });
    }

    pdfLines.push({
      text: "--------------------------------------------------------------------------------",
      size: 8,
    });
    pdfLines.push({
      text: "4. METRIC DEFINITIONS & METHODOLOGY",
      bold: true,
      size: 10,
    });
    for (const def of METRIC_DEFINITIONS) {
      pdfLines.push({
        text: `${def.metric}: ${def.definition}`,
        indent: 10,
        size: 8,
      });
      pdfLines.push({
        text: `Availability: ${def.availabilityNote}`,
        indent: 18,
        size: 7,
      });
    }

    const pdfBuffer = buildPdf14Binary(pdfLines);
    return { pdfBuffer, metadata };
  }
}
