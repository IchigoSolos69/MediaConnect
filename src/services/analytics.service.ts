import { db } from "@/lib/db";
import {
  getSocialProvider,
  SocialPlatform,
  LiveAnalyticsNotSupportedError,
} from "@/providers";
import { PaidApiGuardrailError } from "@/providers/live/x.provider";
import { TokenVault } from "@/lib/crypto/vault";

export type DataSourceLabel =
  | "MOCK_SANDBOX"
  | "LIVE_YOUTUBE_ANALYTICS"
  | "LIVE_INSTAGRAM_INSIGHTS"
  | "LIVE_PROVIDER"
  | "MIXED"
  | "UNSUPPORTED_PAID"
  | "UNSYNCED_LIVE"
  | "NO_DATA";

export interface PlatformBreakdownItem {
  impressions: number | null;
  reach: number | null;
  engagements: number | null;
  followers: number;
  followerGrowth: number | null;
  engagementRate: number | null;
  postsCount: number;
  isMock: boolean;
  source: DataSourceLabel;
  syncStatus: string;
  syncError: string | null;
  lastSyncedAt: string | null;
  unavailableMetrics: string[];
  reportingDelayHours: number | null;
}

export interface AggregatedMetrics {
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
  days: number;
  startDate: string;
  endDate: string;
  dataSource: DataSourceLabel;
  lastSyncedAt: string | null;
  unavailableMetrics: string[];
  totalImpressions: number;
  totalReach: number;
  totalEngagements: number;
  totalFollowers: number;
  followerGrowth: number | null;
  engagementRate: number;
  byPlatform: Record<string, PlatformBreakdownItem>;
  dailyTimeline: Array<{
    date: string;
    impressions: number;
    reach: number;
    engagements: number;
    clicks: number;
    source: string;
  }>;
}

export interface AudienceHeatmapResult {
  workspaceId: string;
  platform: string;
  available: boolean;
  source: DataSourceLabel | "UNAVAILABLE";
  lastSyncedAt: string | null;
  reason?: string;
  unavailablePlatforms: Array<{ platform: string; reason: string }>;
  cells: Array<{ dayOfWeek: number; hour: number; activityScore: number }>;
  bestSlots: Array<{ dayOfWeek: number; hour: number; score: number; label: string }>;
}

export interface AccountSyncSummary {
  accountId: string;
  platform: string;
  username: string;
  isMock: boolean;
  status: "SYNCED" | "SKIPPED_PAID" | "RATE_LIMITED" | "ERROR";
  source: DataSourceLabel;
  snapshotsUpserted: number;
  lastSyncedAt: string | null;
  unavailableMetrics: string[];
  error?: string;
}

export class AnalyticsService {
  /**
   * Incrementally synchronizes analytics snapshots for all accounts in the authorized workspace.
   * Deduplicates daily rows via (accountId, date), respects rate limits and reporting delays,
   * and never fabricates metrics for live accounts or disabled paid X accounts.
   */
  static async syncWorkspaceAnalytics(
    workspaceId: string,
    options?: { days?: number; forceFullSync?: boolean }
  ): Promise<{
    workspaceId: string;
    syncedAt: string;
    accounts: AccountSyncSummary[];
  }> {
    if (!workspaceId || typeof workspaceId !== "string") {
      throw new Error("workspaceId is required for analytics synchronization.");
    }

    const days = options?.days || 14;
    const accounts = await db.account.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "asc" },
    });

    const summaries: AccountSyncSummary[] = [];
    const now = new Date();

    for (const account of accounts) {
      // 1. Respect paid X API guardrail for live X accounts
      if (!account.isMock && account.platform === "X" && process.env.ALLOW_PAID_X_API !== "true") {
        const msg =
          "Paid X analytics ingestion is disabled (ALLOW_PAID_X_API is not enabled). Metrics are marked unavailable.";
        await db.account.update({
          where: { id: account.id },
          data: {
            syncStatus: "UNSUPPORTED_PAID",
            syncError: msg,
          },
        });
        summaries.push({
          accountId: account.id,
          platform: account.platform,
          username: account.username,
          isMock: false,
          status: "SKIPPED_PAID",
          source: "UNSUPPORTED_PAID",
          snapshotsUpserted: 0,
          lastSyncedAt: account.lastSyncedAt ? account.lastSyncedAt.toISOString() : null,
          unavailableMetrics: [
            "impressions",
            "reach",
            "engagements",
            "followerGrowth",
            "audienceHeatmap",
          ],
          error: msg,
        });
        continue;
      }

      // 2. Compute incremental time range (2-day overlap on incremental sync for provider reporting delays)
      let startDate = new Date(now);
      startDate.setUTCDate(startDate.getUTCDate() - days);
      startDate.setUTCHours(0, 0, 0, 0);

      if (!options?.forceFullSync && account.lastSyncedAt) {
        const incrementalStart = new Date(
          account.lastSyncedAt.getTime() - 2 * 24 * 60 * 60 * 1000
        );
        incrementalStart.setUTCHours(0, 0, 0, 0);
        if (incrementalStart > startDate && incrementalStart <= now) {
          startDate = incrementalStart;
        }
      }

      const endDate = new Date(now);
      const mode = account.isMock ? "mock" : "live";
      const provider = getSocialProvider(account.platform as SocialPlatform, mode);

      let decryptedAccessToken: string | null = null;
      let decryptedRefreshToken: string | null = null;

      try {
        decryptedAccessToken = account.accessToken
          ? TokenVault.decrypt(account.accessToken, account.id)
          : null;
        decryptedRefreshToken = account.refreshToken
          ? TokenVault.decrypt(account.refreshToken, account.id)
          : null;
      } catch (err) {
        const e = err as Error;
        await db.account.update({
          where: { id: account.id },
          data: {
            syncStatus: "ERROR",
            syncError: `Token decryption error: ${e.message}`,
          },
        });
        summaries.push({
          accountId: account.id,
          platform: account.platform,
          username: account.username,
          isMock: account.isMock,
          status: "ERROR",
          source: account.isMock ? "MOCK_SANDBOX" : "UNSYNCED_LIVE",
          snapshotsUpserted: 0,
          lastSyncedAt: account.lastSyncedAt ? account.lastSyncedAt.toISOString() : null,
          unavailableMetrics: [],
          error: e.message,
        });
        continue;
      }

      // 3. Proactive token refresh for live accounts if expired
      if (
        !account.isMock &&
        account.tokenExpiresAt &&
        account.tokenExpiresAt.getTime() <= Date.now() + 5 * 60 * 1000
      ) {
        const tokenToRefresh =
          decryptedRefreshToken ||
          (account.platform === "INSTAGRAM" ? decryptedAccessToken : null);
        if (tokenToRefresh) {
          try {
            const refreshed = await provider.refreshToken(tokenToRefresh);
            const keyVersion = (account.tokenKeyVersion as "v1" | "v2") || "v1";
            decryptedAccessToken = refreshed.accessToken;
            decryptedRefreshToken = refreshed.refreshToken || tokenToRefresh;
            await db.account.update({
              where: { id: account.id },
              data: {
                accessToken: TokenVault.encrypt(refreshed.accessToken, account.id, keyVersion),
                refreshToken: TokenVault.encrypt(decryptedRefreshToken, account.id, keyVersion),
                tokenExpiresAt: new Date(
                  Date.now() + (refreshed.expiresInSeconds || 3600) * 1000
                ),
                status: "ACTIVE",
              },
            });
          } catch (refreshErr) {
            const rErr = refreshErr as Error;
            await db.account.update({
              where: { id: account.id },
              data: {
                status: "EXPIRED",
                syncStatus: "ERROR",
                syncError: `OAuth token refresh failed: ${rErr.message}`,
              },
            });
            summaries.push({
              accountId: account.id,
              platform: account.platform,
              username: account.username,
              isMock: account.isMock,
              status: "ERROR",
              source: "UNSYNCED_LIVE",
              snapshotsUpserted: 0,
              lastSyncedAt: account.lastSyncedAt ? account.lastSyncedAt.toISOString() : null,
              unavailableMetrics: [],
              error: rErr.message,
            });
            continue;
          }
        }
      }

      const connectedAccountData = {
        id: account.id,
        workspaceId: account.workspaceId,
        platform: account.platform as SocialPlatform,
        platformAccountId: account.platformAccountId,
        username: account.username,
        displayName: account.displayName,
        accessToken: decryptedAccessToken,
        refreshToken: decryptedRefreshToken,
        isMock: account.isMock,
      };

      const sourceLabel: DataSourceLabel = account.isMock
        ? "MOCK_SANDBOX"
        : account.platform === "YOUTUBE"
        ? "LIVE_YOUTUBE_ANALYTICS"
        : "LIVE_INSTAGRAM_INSIGHTS";

      try {
        const insights = await provider.fetchInsights(connectedAccountData, {
          startDate,
          endDate,
        });

        const syncedAt = new Date();
        let upsertedCount = 0;

        for (const daily of insights.dailyMetrics) {
          const utcDate = new Date(`${daily.date}T00:00:00.000Z`);
          if (Number.isNaN(utcDate.getTime())) continue;

          const baseAvail =
            daily.availableMetrics ||
            (account.isMock
              ? [
                  "impressions",
                  "reach",
                  "engagements",
                  "likes",
                  "comments",
                  "shares",
                  "clicks",
                  "followers",
                ]
              : ["impressions", "engagements"]);

          const availWithDelta =
            typeof daily.followerGrowth === "number"
              ? [
                  ...baseAvail.filter((k) => !k.startsWith("followerDelta:")),
                  `followerDelta:${daily.followerGrowth}`,
                ]
              : baseAvail;

          const availableMetricsJson = JSON.stringify(availWithDelta);

          const followersForDay =
            typeof daily.followers === "number" && daily.followers > 0
              ? daily.followers
              : insights.totalFollowers > 0
              ? insights.totalFollowers
              : account.followersCount;

          await db.metricSnapshot.upsert({
            where: {
              accountId_date: {
                accountId: account.id,
                date: utcDate,
              },
            },
            update: {
              impressions: daily.impressions || 0,
              reach: daily.reach || 0,
              engagements: daily.engagements || 0,
              likes: daily.likes || 0,
              comments: daily.comments || 0,
              shares: daily.shares || 0,
              clicks: daily.clicks || 0,
              videoViews: daily.videoViews || 0,
              followers: followersForDay,
              source: sourceLabel,
              availableMetrics: availableMetricsJson,
              syncedAt,
            },
            create: {
              accountId: account.id,
              date: utcDate,
              impressions: daily.impressions || 0,
              reach: daily.reach || 0,
              engagements: daily.engagements || 0,
              likes: daily.likes || 0,
              comments: daily.comments || 0,
              shares: daily.shares || 0,
              clicks: daily.clicks || 0,
              videoViews: daily.videoViews || 0,
              followers: followersForDay,
              source: sourceLabel,
              availableMetrics: availableMetricsJson,
              syncedAt,
            },
          });
          upsertedCount++;
        }

        // Sync audience activity if supported by the provider
        let audienceActivityJson: string | null = null;
        try {
          const activity = await provider.fetchAudienceActivity(connectedAccountData);
          audienceActivityJson = JSON.stringify({
            source: sourceLabel,
            syncedAt: syncedAt.toISOString(),
            cells: activity.cells,
            bestTimeSlots: activity.bestTimeSlots,
          });
        } catch (activityErr) {
          if (!(activityErr instanceof LiveAnalyticsNotSupportedError)) {
            console.warn(
              `Audience activity sync warning for ${account.username}:`,
              (activityErr as Error).message
            );
          }
          audienceActivityJson = null;
        }

        await db.account.update({
          where: { id: account.id },
          data: {
            followersCount:
              insights.totalFollowers > 0 ? insights.totalFollowers : account.followersCount,
            lastSyncedAt: syncedAt,
            syncStatus: "SYNCED",
            syncError: null,
            audienceActivityJson,
          },
        });

        summaries.push({
          accountId: account.id,
          platform: account.platform,
          username: account.username,
          isMock: account.isMock,
          status: "SYNCED",
          source: sourceLabel,
          snapshotsUpserted: upsertedCount,
          lastSyncedAt: syncedAt.toISOString(),
          unavailableMetrics: insights.unavailableMetrics || [],
        });
      } catch (err) {
        const error = err as Error;
        const isRateLimit =
          error.message.includes("429") ||
          error.message.toLowerCase().includes("quota") ||
          error.message.toLowerCase().includes("rate limit");
        const isPaidBlocked = error instanceof PaidApiGuardrailError;

        const syncStatus = isPaidBlocked
          ? "UNSUPPORTED_PAID"
          : isRateLimit
          ? "RATE_LIMITED"
          : "ERROR";

        await db.account.update({
          where: { id: account.id },
          data: {
            syncStatus,
            syncError: error.message,
          },
        });

        summaries.push({
          accountId: account.id,
          platform: account.platform,
          username: account.username,
          isMock: account.isMock,
          status: isPaidBlocked ? "SKIPPED_PAID" : isRateLimit ? "RATE_LIMITED" : "ERROR",
          source: sourceLabel,
          snapshotsUpserted: 0,
          lastSyncedAt: account.lastSyncedAt ? account.lastSyncedAt.toISOString() : null,
          unavailableMetrics: [
            "impressions",
            "reach",
            "engagements",
            "followerGrowth",
            "audienceHeatmap",
          ],
          error: error.message,
        });
      }
    }

    return {
      workspaceId,
      syncedAt: now.toISOString(),
      accounts: summaries,
    };
  }

  /**
   * Aggregates metrics from DB snapshots strictly scoped to the authorized workspaceId.
   * Never uses workspace.findFirst() and never fabricates missing live metrics or follower growth.
   */
  static async getOverview(workspaceId: string, days = 14): Promise<AggregatedMetrics> {
    if (!workspaceId || typeof workspaceId !== "string") {
      throw new Error("Authorized workspaceId is required for AnalyticsService.getOverview");
    }

    const workspace = await db.workspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    const endDate = new Date();
    const startDate = new Date(endDate);
    startDate.setUTCDate(startDate.getUTCDate() - days);
    startDate.setUTCHours(0, 0, 0, 0);

    const accounts = await db.account.findMany({
      where: { workspaceId },
      include: {
        metrics: {
          where: {
            date: {
              gte: startDate,
            },
          },
          orderBy: { date: "asc" },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    let totalImpressions = 0;
    let totalReach = 0;
    let totalEngagements = 0;
    let totalFollowers = 0;
    let followerGrowthTotal = 0;
    let hasValidFollowerGrowth = false;

    const byPlatform: Record<string, PlatformBreakdownItem> = {};
    const dailyMap: Record<
      string,
      { impressions: number; reach: number; engagements: number; clicks: number; source: string }
    > = {};

    const workspaceUnavailableMetrics = new Set<string>();
    const sourcesSeen = new Set<DataSourceLabel>();
    let latestSyncDate: Date | null = null;

    for (const acc of accounts) {
      totalFollowers += acc.followersCount;

      if (acc.lastSyncedAt && (!latestSyncDate || acc.lastSyncedAt > latestSyncDate)) {
        latestSyncDate = acc.lastSyncedAt;
      }

      // Live X accounts without paid API authorization must never show fabricated metrics
      if (!acc.isMock && acc.platform === "X" && process.env.ALLOW_PAID_X_API !== "true") {
        sourcesSeen.add("UNSUPPORTED_PAID");
        workspaceUnavailableMetrics.add("X:all_paid_metrics");
        byPlatform[acc.platform] = {
          impressions: null,
          reach: null,
          engagements: null,
          followers: acc.followersCount,
          followerGrowth: null,
          engagementRate: null,
          postsCount: acc.postsCount,
          isMock: false,
          source: "UNSUPPORTED_PAID",
          syncStatus: acc.syncStatus || "UNSUPPORTED_PAID",
          syncError:
            acc.syncError ||
            "Live X analytics require paid API consumption (ALLOW_PAID_X_API=true).",
          lastSyncedAt: acc.lastSyncedAt ? acc.lastSyncedAt.toISOString() : null,
          unavailableMetrics: ["impressions", "reach", "engagements", "followerGrowth"],
          reportingDelayHours: null,
        };
        continue;
      }

      // Filter snapshots so a live account never aggregates legacy MOCK_SANDBOX rows
      const validSnapshots = acc.isMock
        ? acc.metrics
        : acc.metrics.filter((m) => m.source !== "MOCK_SANDBOX");

      let platImpressions = 0;
      let platReach = 0;
      let platEngagements = 0;
      let platFollowerDeltaSum = 0;
      let hasExplicitFollowerDelta = false;
      const accAvailableSet = new Set<string>();

      for (const m of validSnapshots) {
        platImpressions += m.impressions;
        platReach += m.reach;
        platEngagements += m.engagements;

        try {
          const parsedAvail: string[] = JSON.parse(m.availableMetrics || "[]");
          for (const k of parsedAvail) {
            if (k.startsWith("followerDelta:")) {
              const deltaVal = Number(k.slice("followerDelta:".length));
              if (Number.isFinite(deltaVal)) {
                platFollowerDeltaSum += deltaVal;
                hasExplicitFollowerDelta = true;
              }
            } else {
              accAvailableSet.add(k);
            }
          }
        } catch {
          // ignore
        }

        const dateKey = m.date.toISOString().split("T")[0];
        if (!dailyMap[dateKey]) {
          dailyMap[dateKey] = {
            impressions: 0,
            reach: 0,
            engagements: 0,
            clicks: 0,
            source: m.source,
          };
        }
        dailyMap[dateKey].impressions += m.impressions;
        dailyMap[dateKey].reach += m.reach;
        dailyMap[dateKey].engagements += m.engagements;
        dailyMap[dateKey].clicks += m.clicks;
      }

      totalImpressions += platImpressions;
      totalReach += platReach;
      totalEngagements += platEngagements;

      // Determine follower growth strictly from real snapshot deltas — NEVER fabricate 2% growth!
      let accFollowerGrowth: number | null = null;
      if (hasExplicitFollowerDelta) {
        accFollowerGrowth = platFollowerDeltaSum;
        followerGrowthTotal += accFollowerGrowth;
        hasValidFollowerGrowth = true;
      } else {
        const snapshotsWithFollowers = validSnapshots.filter((s) => s.followers > 0);
        if (snapshotsWithFollowers.length >= 2) {
          const first = snapshotsWithFollowers[0].followers;
          const last = snapshotsWithFollowers[snapshotsWithFollowers.length - 1].followers;
          accFollowerGrowth = last - first;
          followerGrowthTotal += accFollowerGrowth;
          hasValidFollowerGrowth = true;
        }
      }

      const accSource: DataSourceLabel = acc.isMock
        ? "MOCK_SANDBOX"
        : validSnapshots.length > 0
        ? acc.platform === "YOUTUBE"
          ? "LIVE_YOUTUBE_ANALYTICS"
          : "LIVE_INSTAGRAM_INSIGHTS"
        : "UNSYNCED_LIVE";

      sourcesSeen.add(accSource);

      const accUnavailable: string[] = [];
      if (!acc.isMock) {
        if (acc.platform === "YOUTUBE") {
          accUnavailable.push("reach", "clicks", "audienceHeatmap");
          workspaceUnavailableMetrics.add("YOUTUBE:reach");
          workspaceUnavailableMetrics.add("YOUTUBE:clicks");
          workspaceUnavailableMetrics.add("YOUTUBE:audienceHeatmap");
        }
        if (validSnapshots.length === 0) {
          accUnavailable.push("impressions", "reach", "engagements", "followerGrowth");
          workspaceUnavailableMetrics.add(`${acc.platform}:unsynced`);
        } else if (accFollowerGrowth === null) {
          accUnavailable.push("followerGrowth");
          workspaceUnavailableMetrics.add(`${acc.platform}:followerGrowth`);
        }
      } else if (accFollowerGrowth === null) {
        accUnavailable.push("followerGrowth");
      }

      const pEngRate =
        platImpressions > 0
          ? Number(((platEngagements / platImpressions) * 100).toFixed(2))
          : validSnapshots.length === 0 && !acc.isMock
          ? null
          : 0;

      const reachReported =
        acc.isMock ||
        (acc.platform === "INSTAGRAM" &&
          validSnapshots.length > 0 &&
          accAvailableSet.has("reach"));

      byPlatform[acc.platform] = {
        impressions: validSnapshots.length === 0 && !acc.isMock ? null : platImpressions,
        reach: !reachReported ? null : platReach,
        engagements: validSnapshots.length === 0 && !acc.isMock ? null : platEngagements,
        followers: acc.followersCount,
        followerGrowth: accFollowerGrowth,
        engagementRate: pEngRate,
        postsCount: acc.postsCount,
        isMock: acc.isMock,
        source: accSource,
        syncStatus: acc.syncStatus || (acc.isMock ? "SYNCED" : "IDLE"),
        syncError: acc.syncError || null,
        lastSyncedAt: acc.lastSyncedAt ? acc.lastSyncedAt.toISOString() : null,
        unavailableMetrics: Array.from(new Set(accUnavailable)),
        reportingDelayHours: acc.isMock ? 0 : acc.platform === "YOUTUBE" ? 48 : 24,
      };
    }

    const overallEngagementRate =
      totalImpressions > 0
        ? Number(((totalEngagements / totalImpressions) * 100).toFixed(2))
        : 0;

    const dailyTimeline = Object.entries(dailyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({
        date,
        ...data,
      }));

    let overallDataSource: DataSourceLabel = "NO_DATA";
    const hasMock = sourcesSeen.has("MOCK_SANDBOX");
    const hasLive =
      sourcesSeen.has("LIVE_YOUTUBE_ANALYTICS") ||
      sourcesSeen.has("LIVE_INSTAGRAM_INSIGHTS") ||
      sourcesSeen.has("UNSYNCED_LIVE") ||
      sourcesSeen.has("UNSUPPORTED_PAID");

    if (hasMock && hasLive) {
      overallDataSource = "MIXED";
    } else if (hasLive) {
      overallDataSource = "LIVE_PROVIDER";
    } else if (hasMock) {
      overallDataSource = "MOCK_SANDBOX";
    }

    return {
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      workspaceSlug: workspace.slug,
      days,
      startDate: startDate.toISOString().slice(0, 10),
      endDate: endDate.toISOString().slice(0, 10),
      dataSource: overallDataSource,
      lastSyncedAt: latestSyncDate ? latestSyncDate.toISOString() : null,
      unavailableMetrics: Array.from(workspaceUnavailableMetrics),
      totalImpressions,
      totalReach,
      totalEngagements,
      totalFollowers,
      followerGrowth: hasValidFollowerGrowth ? followerGrowthTotal : null,
      engagementRate: overallEngagementRate,
      byPlatform,
      dailyTimeline,
    };
  }

  /**
   * Fetches the 168-cell audience activity heatmap strictly scoped to the authorized workspaceId.
   * Never uses workspace.findFirst(), and never returns synthetic mock heatmaps for live accounts.
   */
  static async getAudienceHeatmap(
    workspaceId: string,
    platform: string = "ALL"
  ): Promise<AudienceHeatmapResult> {
    if (!workspaceId || typeof workspaceId !== "string") {
      throw new Error(
        "Authorized workspaceId is required for AnalyticsService.getAudienceHeatmap"
      );
    }

    const workspace = await db.workspace.findUnique({
      where: { id: workspaceId },
      include: { accounts: true },
    });

    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    const normalizedFilter = platform.toUpperCase();
    const targetPlatforms =
      normalizedFilter === "ALL" ? ["YOUTUBE", "INSTAGRAM", "X"] : [normalizedFilter];

    const matchingAccounts = workspace.accounts.filter((a) =>
      targetPlatforms.includes(a.platform)
    );

    const unavailablePlatforms: Array<{ platform: string; reason: string }> = [];
    const activeCellMatrices: Array<{
      source: DataSourceLabel;
      cells: Array<{ dayOfWeek: number; hour: number; activityScore: number }>;
    }> = [];
    let latestSyncedAt: Date | null = null;

    for (const account of matchingAccounts) {
      if (account.lastSyncedAt && (!latestSyncedAt || account.lastSyncedAt > latestSyncedAt)) {
        latestSyncedAt = account.lastSyncedAt;
      }

      if (account.isMock) {
        const mockProvider = getSocialProvider(account.platform as SocialPlatform, "mock");
        const data = await mockProvider.fetchAudienceActivity({
          id: account.id,
          workspaceId: account.workspaceId,
          platform: account.platform as SocialPlatform,
          platformAccountId: account.platformAccountId,
          username: account.username,
          displayName: account.displayName,
          isMock: true,
        });
        activeCellMatrices.push({
          source: "MOCK_SANDBOX",
          cells: data.cells,
        });
      } else {
        // Live account: NEVER call mockProvider! Only use verified synced live audience activity if available.
        if (account.platform === "YOUTUBE") {
          unavailablePlatforms.push({
            platform: "YOUTUBE",
            reason:
              "YouTube Data and Analytics APIs do not provide a 168-hour online-subscriber heatmap endpoint.",
          });
        } else if (account.platform === "X") {
          unavailablePlatforms.push({
            platform: "X",
            reason:
              "Live X audience activity heatmaps are disabled to prevent paid API consumption.",
          });
        } else if (account.platform === "INSTAGRAM") {
          if (account.audienceActivityJson) {
            try {
              const parsed = JSON.parse(account.audienceActivityJson);
              if (Array.isArray(parsed.cells) && parsed.cells.length === 168) {
                activeCellMatrices.push({
                  source: "LIVE_INSTAGRAM_INSIGHTS",
                  cells: parsed.cells,
                });
              } else {
                unavailablePlatforms.push({
                  platform: "INSTAGRAM",
                  reason: "Instagram online_followers heatmap has not been synchronized yet.",
                });
              }
            } catch {
              unavailablePlatforms.push({
                platform: "INSTAGRAM",
                reason: "Instagram online_followers heatmap data could not be parsed.",
              });
            }
          } else {
            unavailablePlatforms.push({
              platform: "INSTAGRAM",
              reason:
                "Live Instagram online_followers insight is not yet synchronized or account has fewer than 100 followers.",
            });
          }
        }
      }
    }

    if (activeCellMatrices.length === 0) {
      const reason =
        unavailablePlatforms.length > 0
          ? unavailablePlatforms.map((u) => `${u.platform}: ${u.reason}`).join(" | ")
          : "No connected accounts with available audience activity data in this workspace.";

      return {
        workspaceId,
        platform: normalizedFilter,
        available: false,
        source: "UNAVAILABLE",
        lastSyncedAt: latestSyncedAt ? latestSyncedAt.toISOString() : null,
        reason,
        unavailablePlatforms,
        cells: [],
        bestSlots: [],
      };
    }

    const combinedCells: Array<{ dayOfWeek: number; hour: number; activityScore: number }> = [];

    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 24; hour++) {
        let totalScore = 0;
        let count = 0;

        for (const matrix of activeCellMatrices) {
          const cell = matrix.cells.find((c) => c.dayOfWeek === day && c.hour === hour);
          if (cell) {
            totalScore += cell.activityScore;
            count++;
          }
        }

        const avgScore = count > 0 ? Math.round(totalScore / count) : 0;
        combinedCells.push({ dayOfWeek: day, hour, activityScore: avgScore });
      }
    }

    const sorted = [...combinedCells].sort((a, b) => b.activityScore - a.activityScore);
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const topSlots = sorted.slice(0, 3).map((slot) => {
      const h = slot.hour % 12 || 12;
      const ampm = slot.hour >= 12 ? "PM" : "AM";
      return {
        dayOfWeek: slot.dayOfWeek,
        hour: slot.hour,
        score: slot.activityScore,
        label: `${dayNames[slot.dayOfWeek]} ${h}:00 ${ampm}`,
      };
    });

    const hasMock = activeCellMatrices.some((m) => m.source === "MOCK_SANDBOX");
    const hasLive = activeCellMatrices.some((m) => m.source === "LIVE_INSTAGRAM_INSIGHTS");
    const heatmapSource: DataSourceLabel =
      hasMock && hasLive
        ? "MIXED"
        : hasLive
        ? "LIVE_INSTAGRAM_INSIGHTS"
        : "MOCK_SANDBOX";

    return {
      workspaceId,
      platform: normalizedFilter,
      available: true,
      source: heatmapSource,
      lastSyncedAt: latestSyncedAt ? latestSyncedAt.toISOString() : null,
      unavailablePlatforms,
      cells: combinedCells,
      bestSlots: topSlots,
    };
  }
}
