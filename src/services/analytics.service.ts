import { db } from "@/lib/db";
import { getSocialProvider } from "@/providers";

export interface AggregatedMetrics {
  totalImpressions: number;
  totalReach: number;
  totalEngagements: number;
  totalFollowers: number;
  followerGrowth: number;
  engagementRate: number;
  byPlatform: Record<
    string,
    {
      impressions: number;
      reach: number;
      engagements: number;
      followers: number;
      engagementRate: number;
      postsCount: number;
    }
  >;
  dailyTimeline: Array<{
    date: string;
    impressions: number;
    reach: number;
    engagements: number;
    clicks: number;
  }>;
}

export class AnalyticsService {
  /**
   * Aggregates metrics from DB snapshots for the workspace.
   */
  static async getOverview(workspaceId: string, days = 14): Promise<AggregatedMetrics> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

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
    });

    let totalImpressions = 0;
    let totalReach = 0;
    let totalEngagements = 0;
    let totalFollowers = 0;
    let followerGrowth = 0;

    const byPlatform: AggregatedMetrics["byPlatform"] = {};
    const dailyMap: Record<string, { impressions: number; reach: number; engagements: number; clicks: number }> = {};

    for (const acc of accounts) {
      totalFollowers += acc.followersCount;

      let platImpressions = 0;
      let platReach = 0;
      let platEngagements = 0;

      for (const m of acc.metrics) {
        platImpressions += m.impressions;
        platReach += m.reach;
        platEngagements += m.engagements;

        const dateKey = m.date.toISOString().split("T")[0];
        if (!dailyMap[dateKey]) {
          dailyMap[dateKey] = { impressions: 0, reach: 0, engagements: 0, clicks: 0 };
        }
        dailyMap[dateKey].impressions += m.impressions;
        dailyMap[dateKey].reach += m.reach;
        dailyMap[dateKey].engagements += m.engagements;
        dailyMap[dateKey].clicks += m.clicks;
      }

      totalImpressions += platImpressions;
      totalReach += platReach;
      totalEngagements += platEngagements;

      // Estimate follower growth from snapshot difference
      if (acc.metrics.length > 1) {
        const first = acc.metrics[0].followers;
        const last = acc.metrics[acc.metrics.length - 1].followers;
        followerGrowth += Math.max(0, last - first);
      } else {
        followerGrowth += Math.floor(acc.followersCount * 0.02);
      }

      const pEngRate =
        platImpressions > 0
          ? Number(((platEngagements / platImpressions) * 100).toFixed(2))
          : 0;

      byPlatform[acc.platform] = {
        impressions: platImpressions,
        reach: platReach,
        engagements: platEngagements,
        followers: acc.followersCount,
        engagementRate: pEngRate,
        postsCount: acc.postsCount,
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

    return {
      totalImpressions,
      totalReach,
      totalEngagements,
      totalFollowers,
      followerGrowth,
      engagementRate: overallEngagementRate,
      byPlatform,
      dailyTimeline,
    };
  }

  /**
   * Fetches the 168-cell audience activity heatmap.
   * If platform is 'ALL', combines the scores across YouTube, Instagram, and X.
   */
  static async getAudienceHeatmap(platform: string = "ALL") {
    const defaultWorkspace = await db.workspace.findFirst({
      include: { accounts: true },
    });
    if (!defaultWorkspace) throw new Error("Workspace not found");

    const targetPlatforms =
      platform === "ALL" ? ["YOUTUBE", "INSTAGRAM", "X"] : [platform.toUpperCase()];

    // Generate combined 168 cells
    const combinedCells: Array<{ dayOfWeek: number; hour: number; activityScore: number }> = [];

    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 24; hour++) {
        let totalScore = 0;
        let count = 0;

        for (const plat of targetPlatforms) {
          const provider = getSocialProvider(plat as any, "mock");
          const account = defaultWorkspace.accounts.find((a) => a.platform === plat);
          if (account) {
            const data = await provider.fetchAudienceActivity({
              id: account.id,
              platform: plat as any,
              platformAccountId: account.platformAccountId,
              username: account.username,
              displayName: account.displayName,
              isMock: true,
            });
            const cell = data.cells.find((c) => c.dayOfWeek === day && c.hour === hour);
            if (cell) {
              totalScore += cell.activityScore;
              count++;
            }
          }
        }

        const avgScore = count > 0 ? Math.round(totalScore / count) : 30;
        combinedCells.push({ dayOfWeek: day, hour, activityScore: avgScore });
      }
    }

    // Identify top 3 slots
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

    return {
      cells: combinedCells,
      bestSlots: topSlots,
    };
  }
}
