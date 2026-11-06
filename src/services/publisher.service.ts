import { db } from "@/lib/db";
import { getSocialProvider } from "@/providers";
import { TokenVault } from "@/lib/crypto/vault";
import { SecurityAudit } from "@/lib/security/audit";

export class UnapprovedPostError extends Error {
  constructor(message = "Cannot publish post: post approval status must be APPROVED.") {
    super(message);
    this.name = "UnapprovedPostError";
    Object.setPrototypeOf(this, UnapprovedPostError.prototype);
  }
}

export class CrossTenantPublishError extends Error {
  constructor(message = "Cross-tenant security violation: Target account does not belong to the post workspace.") {
    super(message);
    this.name = "CrossTenantPublishError";
    Object.setPrototypeOf(this, CrossTenantPublishError.prototype);
  }
}

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

    // 1. Verify workspace tenant integrity inside publishing engine
    if (target.account.workspaceId !== target.post.workspaceId) {
      SecurityAudit.log({
        event: "CROSS_TENANT_ATTEMPT",
        workspaceId: target.post.workspaceId,
        resourceId: target.id,
        details: {
          postWorkspaceId: target.post.workspaceId,
          accountWorkspaceId: target.account.workspaceId,
        },
      });
      await db.postTarget.update({
        where: { id: targetId },
        data: {
          status: "FAILED",
          errorMessage: "Security violation: Account belongs to another workspace.",
        },
      });
      throw new CrossTenantPublishError();
    }

    // 2. Transition target to PUBLISHING
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

    // 3. Safely decrypt token just-in-time from vault envelope
    let decryptedAccessToken: string | null = null;
    try {
      decryptedAccessToken = target.account.accessToken
        ? TokenVault.decrypt(target.account.accessToken, target.account.id)
        : null;
    } catch (err: any) {
      SecurityAudit.log({
        event: "TOKEN_TAMPER_DETECTED",
        workspaceId: target.post.workspaceId,
        resourceId: target.account.id,
        details: { error: err.message },
      });
      return await db.postTarget.update({
        where: { id: targetId },
        data: {
          status: "FAILED",
          errorMessage: `Decryption error: ${err.message}`,
        },
      });
    }

    try {
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
            publishedAt: result.publishedAt || new Date(),
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
    } catch (publishErr: any) {
      return await db.postTarget.update({
        where: { id: targetId },
        data: {
          status: "FAILED",
          errorMessage: publishErr.message || "Provider runtime error",
        },
      });
    }
  }

  /**
   * Immediately publishes all targets for a given post.
   * Strictly enforces approvalStatus === 'APPROVED' and accurately calculates status.
   */
  static async publishPostNow(postId: string) {
    const post = await db.post.findUnique({
      where: { id: postId },
      include: {
        targets: {
          include: { account: true },
        },
      },
    });

    if (!post) throw new Error(`Post ${postId} not found`);

    // 1. Enforce approval status inside publisher service
    if (post.approvalStatus !== "APPROVED") {
      SecurityAudit.log({
        event: "UNAPPROVED_PUBLISH_BLOCKED",
        workspaceId: post.workspaceId,
        resourceId: post.id,
        details: { approvalStatus: post.approvalStatus },
      });
      throw new UnapprovedPostError(
        `Cannot publish post ${postId}: approval status is [${post.approvalStatus}]. Post must be APPROVED first.`
      );
    }

    // 2. Mark post as PUBLISHING
    await db.post.update({
      where: { id: postId },
      data: { status: "PUBLISHING" },
    });

    const targetResults = [];
    for (const target of post.targets) {
      const res = await this.publishTarget(target.id);
      targetResults.push(res);
    }

    // 3. Accurately calculate overall post status based on target outcomes
    const successfulCount = targetResults.filter((t) => t.status === "PUBLISHED").length;
    const failedCount = targetResults.filter((t) => t.status === "FAILED").length;

    let finalPostStatus = "PUBLISHED";
    if (post.targets.length === 0 || successfulCount === 0) {
      finalPostStatus = "FAILED";
    } else if (failedCount > 0 && successfulCount > 0) {
      finalPostStatus = "PARTIALLY_PUBLISHED";
    }

    const updatedPost = await db.post.update({
      where: { id: postId },
      data: {
        status: finalPostStatus,
        publishedAt: successfulCount > 0 ? new Date() : null,
      },
      include: { targets: true },
    });

    return updatedPost;
  }

  /**
   * Scans for all posts with SCHEDULED status whose scheduledAt has arrived.
   * Employs ATOMIC JOB CLAIMING (conditional status update) to prevent concurrent double-publishing.
   */
  static async dispatchDuePosts(workspaceId?: string) {
    const now = new Date();

    const whereClause: any = {
      status: "SCHEDULED",
      approvalStatus: "APPROVED",
      scheduledAt: {
        lte: now,
      },
    };

    if (workspaceId) {
      whereClause.workspaceId = workspaceId;
    }

    // Find candidate posts due for publication
    const candidates = await db.post.findMany({
      where: whereClause,
      select: { id: true, workspaceId: true },
    });

    const dispatchedResults = [];

    for (const candidate of candidates) {
      // ATOMIC CLAIM: Transition from SCHEDULED to PUBLISHING conditionally
      // If another worker claimed it between findMany and now, count is 0
      const claim = await db.post.updateMany({
        where: {
          id: candidate.id,
          status: "SCHEDULED",
          approvalStatus: "APPROVED",
        },
        data: {
          status: "PUBLISHING",
        },
      });

      if (claim.count === 0) {
        // Post already claimed by another concurrent worker or already processed
        continue;
      }

      try {
        const published = await this.publishPostNow(candidate.id);
        dispatchedResults.push(published);
      } catch (err: any) {
        console.error(`Error publishing claimed post ${candidate.id}:`, err?.message || err);
        // Ensure post doesn't get stuck in PUBLISHING
        await db.post.update({
          where: { id: candidate.id },
          data: { status: "FAILED" },
        }).catch(() => {});
      }
    }

    return {
      dispatchedCount: dispatchedResults.length,
      posts: dispatchedResults,
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
      const fallback = new Date(now);
      fallback.setHours(fallback.getHours() + 1, 0, 0, 0);
      return fallback;
    }

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

    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    return tomorrow;
  }
}
