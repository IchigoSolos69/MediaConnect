import { db } from "@/lib/db";
import { getSocialProvider } from "@/providers";
import { TokenVault } from "@/lib/crypto/vault";

export class PublisherService {
  /**
   * Publishes a single post target to its designated social platform.
   */
  static async publishTarget(targetId: string) {
    const target = await db.postTarget.findUnique({
      where: { id: targetId },
      include: {
        post: true,
        account: true,
      },
    });

    if (!target) throw new Error(`Target ${targetId} not found`);
    if (target.status === "PUBLISHED") return target;

    await db.postTarget.update({
      where: { id: targetId },
      data: { status: "PUBLISHING" },
    });

    const provider = getSocialProvider(target.platform, target.account.isMock ? "mock" : "live");

    let mediaUrls: string[] = [];
    try {
      mediaUrls = JSON.parse(target.post.mediaUrls || "[]");
    } catch {
      mediaUrls = [];
    }

    const payload = {
      postId: target.postId,
      targetId: target.id,
      content: target.customContent || target.post.content,
      customContent: target.customContent,
      mediaUrls,
      firstComment: target.firstComment,
      videoTitle: target.videoTitle || target.post.title,
      videoTags: target.videoTags,
    };

    // Safely decrypt the token from the vault envelope just-in-time
    const decryptedAccessToken = target.account.accessToken
      ? TokenVault.decrypt(target.account.accessToken, target.account.id)
      : null;

    const result = await provider.publishPost(
      {
        id: target.account.id,
        platform: target.platform as any,
        platformAccountId: target.account.platformAccountId,
        username: target.account.username,
        displayName: target.account.displayName,
        isMock: target.account.isMock,
        accessToken: decryptedAccessToken,
      },
      payload
    );

    if (result.success) {
      const updated = await db.postTarget.update({
        where: { id: targetId },
        data: {
          status: "PUBLISHED",
          platformPostId: result.platformPostId,
          liveUrl: result.liveUrl,
          publishedAt: result.publishedAt,
        },
      });

      // Increment account postsCount
      await db.account.update({
        where: { id: target.accountId },
        data: { postsCount: { increment: 1 } },
      });

      return updated;
    } else {
      return await db.postTarget.update({
        where: { id: targetId },
        data: {
          status: "FAILED",
          errorMessage: result.error || "Publishing failed",
        },
      });
    }
  }

  /**
   * Immediately publishes all targets for a given post.
   */
  static async publishPostNow(postId: string) {
    const post = await db.post.findUnique({
      where: { id: postId },
      include: { targets: true },
    });

    if (!post) throw new Error(`Post ${postId} not found`);

    await db.post.update({
      where: { id: postId },
      data: { status: "PUBLISHING" },
    });

    for (const target of post.targets) {
      await this.publishTarget(target.id);
    }

    const updatedPost = await db.post.update({
      where: { id: postId },
      data: {
        status: "PUBLISHED",
        publishedAt: new Date(),
      },
      include: { targets: true },
    });

    return updatedPost;
  }

  /**
   * Scans for all posts with SCHEDULED status whose scheduledAt has arrived.
   */
  static async dispatchDuePosts() {
    const now = new Date();

    const duePosts = await db.post.findMany({
      where: {
        status: "SCHEDULED",
        scheduledAt: {
          lte: now,
        },
      },
      include: { targets: true },
    });

    const results = [];
    for (const post of duePosts) {
      const published = await this.publishPostNow(post.id);
      results.push(published);
    }

    return {
      dispatchedCount: results.length,
      posts: results,
    };
  }

  /**
   * Calculates the next open queue time slot for a workspace.
   */
  static async getNextQueueSlot(workspaceId: string): Promise<Date> {
    const slots = await db.queueSlot.findMany({
      where: { workspaceId, isActive: true },
      orderBy: [{ dayOfWeek: "asc" }, { time: "asc" }],
    });

    const now = new Date();

    if (slots.length === 0) {
      // Default fallback: 1 hour from now
      const fallback = new Date(now);
      fallback.setHours(fallback.getHours() + 1, 0, 0, 0);
      return fallback;
    }

    // Look up to 14 days ahead for an unfilled slot
    for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
      const checkDate = new Date(now);
      checkDate.setDate(checkDate.getDate() + dayOffset);
      const currentDayOfWeek = checkDate.getDay();

      const daySlots = slots.filter((s) => s.dayOfWeek === currentDayOfWeek);

      for (const slot of daySlots) {
        const [hours, minutes] = slot.time.split(":").map(Number);
        const slotDate = new Date(checkDate);
        slotDate.setHours(hours, minutes, 0, 0);

        if (slotDate > now) {
          // Check if a post is already scheduled for this approximate time
          const windowStart = new Date(slotDate.getTime() - 15 * 60 * 1000);
          const windowEnd = new Date(slotDate.getTime() + 15 * 60 * 1000);

          const existingPost = await db.post.findFirst({
            where: {
              workspaceId,
              scheduledAt: {
                gte: windowStart,
                lte: windowEnd,
              },
            },
          });

          if (!existingPost) {
            return slotDate;
          }
        }
      }
    }

    // Default fallback: tomorrow 9am
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    return tomorrow;
  }
}
