import crypto from "crypto";
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

export class LeaseFencingError extends Error {
  constructor(message = "Worker lease fencing violation: Lease was superseded by another worker.") {
    super(message);
    this.name = "LeaseFencingError";
    Object.setPrototypeOf(this, LeaseFencingError.prototype);
  }
}

export class PublisherService {
  /**
   * Renews an active target lease if and only if the caller still owns the fencing token (leaseOwner).
   */
  static async renewTargetLease(
    targetId: string,
    leaseOwner: string,
    leaseDurationMs = 5 * 60 * 1000
  ): Promise<boolean> {
    const newExpiry = new Date(Date.now() + leaseDurationMs);
    const updated = await db.postTarget.updateMany({
      where: {
        id: targetId,
        status: "PUBLISHING",
        leaseOwner,
      },
      data: {
        leaseExpiresAt: newExpiry,
      },
    });
    return updated.count === 1;
  }

  /**
   * Commits a target state update fenced by `leaseOwner` so a stale worker whose lease expired
   * can never overwrite state written by a newer lease holder.
   */
  static async fencedUpdateTarget(
    targetId: string,
    leaseOwner: string,
    data: Record<string, unknown>
  ) {
    const updated = await db.postTarget.updateMany({
      where: {
        id: targetId,
        leaseOwner,
      },
      data,
    });

    if (updated.count === 0) {
      throw new LeaseFencingError(
        `Target ${targetId} lease owner '${leaseOwner}' was superseded; refusing to overwrite target state.`
      );
    }

    const current = await db.postTarget.findUnique({ where: { id: targetId } });
    return current!;
  }

  /**
   * Publishes a single post target with conditional lease claiming, lease fencing (leaseOwner),
   * nextRetryAt backoff enforcement, expired lease recovery, and bounded retries.
   */
  static async publishTarget(
    targetId: string,
    options?: { leaseDurationMs?: number; workerId?: string }
  ) {
    const now = new Date();
    const leaseDurationMs = options?.leaseDurationMs ?? 5 * 60 * 1000; // 5 minute execution lease
    const leaseExpires = new Date(now.getTime() + leaseDurationMs);
    const leaseOwner = options?.workerId || `worker_${crypto.randomUUID()}`;

    const existingTarget = await db.postTarget.findUnique({
      where: { id: targetId },
      include: { post: true, account: true },
    });

    if (!existingTarget) throw new Error(`Target ${targetId} not found`);

    if (existingTarget.status === "PUBLISHED") {
      return existingTarget;
    }

    // Bounded retries check: If target exceeded max retries, halt
    if (existingTarget.retryCount >= existingTarget.maxRetries) {
      return existingTarget;
    }

    // Enforce nextRetryAt backoff window before claiming
    if (
      existingTarget.nextRetryAt &&
      existingTarget.nextRetryAt.getTime() > now.getTime()
    ) {
      return existingTarget;
    }

    // 1. CONDITIONAL ATOMIC CLAIM AT TARGET LEVEL WITH LEASE OWNER FENCING
    // Includes:
    // a) PENDING or FAILED targets without active lease (or expired lease) whose nextRetryAt <= now
    // b) PUBLISHING targets whose lease expired (Crashed Worker / Timeout Recovery!)
    const claim = await db.postTarget.updateMany({
      where: {
        id: targetId,
        retryCount: { lt: existingTarget.maxRetries },
        AND: [
          {
            OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
          },
          {
            OR: [
              {
                status: { in: ["PENDING", "FAILED"] },
                OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }],
              },
              {
                status: "PUBLISHING",
                leaseExpiresAt: { lte: now }, // Expired lease recovery
              },
            ],
          },
        ],
      },
      data: {
        status: "PUBLISHING",
        claimedAt: now,
        leaseExpiresAt: leaseExpires,
        leaseOwner,
      },
    });

    if (claim.count === 0) {
      // Already claimed by an active concurrent worker, awaiting nextRetryAt, or completed
      return existingTarget;
    }

    const target = await db.postTarget.findUnique({
      where: { id: targetId },
      include: {
        post: true,
        account: true,
      },
    });

    if (!target || target.leaseOwner !== leaseOwner) {
      return existingTarget;
    }

    // 2. Verify workspace tenant integrity inside publishing engine
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
      return await this.fencedUpdateTarget(targetId, leaseOwner, {
        status: "FAILED",
        errorMessage: "Security violation: Account belongs to another workspace.",
        leaseExpiresAt: null,
        leaseOwner: null,
      });
    }

    // 3. Compute deterministic idempotency key for provider reconciliation
    const idempotencyKey =
      target.idempotencyKey || `pub_${target.id}_${target.createdAt.getTime()}`;

    await db.postTarget.updateMany({
      where: { id: targetId, leaseOwner },
      data: { idempotencyKey },
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
      workspaceId: target.post.workspaceId,
      content: target.customContent || target.post.content,
      customContent: target.customContent,
      mediaUrls,
      firstComment: target.firstComment,
      videoTitle: target.videoTitle || target.post.title,
      videoTags: target.videoTags,
      idempotencyKey,
      resumableSessionUri: target.resumableSessionUri,
      remoteContainerId: target.remoteContainerId,
      existingPlatformPostId: target.platformPostId,
    };

    // 4. Safely decrypt token just-in-time from vault envelope
    let decryptedAccessToken: string | null = null;
    let decryptedRefreshToken: string | null = null;
    try {
      decryptedAccessToken = target.account.accessToken
        ? TokenVault.decrypt(target.account.accessToken, target.account.id)
        : null;
      decryptedRefreshToken = target.account.refreshToken
        ? TokenVault.decrypt(target.account.refreshToken, target.account.id)
        : null;
    } catch (err: unknown) {
      const error = err as Error;
      SecurityAudit.log({
        event: "TOKEN_TAMPER_DETECTED",
        workspaceId: target.post.workspaceId,
        resourceId: target.account.id,
        details: { error: error.message },
      });
      const nextRetry = target.retryCount + 1;
      const backoffMs = Math.min(300_000, Math.pow(2, nextRetry) * 15_000);
      return await this.fencedUpdateTarget(targetId, leaseOwner, {
        status: "FAILED",
        errorMessage: `Decryption error: ${error.message}`,
        retryCount: nextRetry,
        nextRetryAt: new Date(Date.now() + backoffMs),
        leaseExpiresAt: null,
        leaseOwner: null,
      });
    }

    // 5. Proactive Token Expiry Check & Refresh-and-Persist Workflow
    const isTokenExpiredOrExpiring =
      target.account.tokenExpiresAt !== null &&
      target.account.tokenExpiresAt !== undefined &&
      target.account.tokenExpiresAt.getTime() <= Date.now() + 5 * 60 * 1000;

    const refreshAndPersistToken = async (): Promise<string> => {
      const tokenToRefresh =
        decryptedRefreshToken ||
        (target.platform === "INSTAGRAM" ? decryptedAccessToken : null);

      if (!tokenToRefresh) {
        await db.account.update({
          where: { id: target.account.id },
          data: { status: "EXPIRED" },
        });
        throw new Error(
          `Access token for account ${target.account.username} has expired and no refresh token is available.`
        );
      }

      try {
        const refreshed = await provider.refreshToken(tokenToRefresh);
        const keyVersion = (target.account.tokenKeyVersion as "v1" | "v2") || "v1";
        const newEncryptedAccess = TokenVault.encrypt(
          refreshed.accessToken,
          target.account.id,
          keyVersion
        );
        const newRefreshRaw = refreshed.refreshToken || tokenToRefresh;
        const newEncryptedRefresh = TokenVault.encrypt(
          newRefreshRaw,
          target.account.id,
          keyVersion
        );
        const newExpiresAt = new Date(
          Date.now() + (refreshed.expiresInSeconds || 3600) * 1000
        );

        await db.account.update({
          where: { id: target.account.id },
          data: {
            accessToken: newEncryptedAccess,
            refreshToken: newEncryptedRefresh,
            tokenExpiresAt: newExpiresAt,
            status: "ACTIVE",
            updatedAt: new Date(),
          },
        });

        decryptedAccessToken = refreshed.accessToken;
        decryptedRefreshToken = newRefreshRaw;
        return refreshed.accessToken;
      } catch (refreshErr) {
        const rErr = refreshErr as Error;
        await db.account.update({
          where: { id: target.account.id },
          data: { status: "EXPIRED" },
        });
        throw new Error(`OAuth token refresh failed: ${rErr.message}`);
      }
    };

    if (isTokenExpiredOrExpiring) {
      try {
        decryptedAccessToken = await refreshAndPersistToken();
      } catch (refreshErr) {
        const rErr = refreshErr as Error;
        const nextRetry = target.retryCount + 1;
        const exceeded = nextRetry >= target.maxRetries;
        const backoffMs = Math.min(300_000, Math.pow(2, nextRetry) * 15_000);
        return await this.fencedUpdateTarget(targetId, leaseOwner, {
          status: "FAILED",
          errorMessage: exceeded
            ? `Maximum retries (${target.maxRetries}) exceeded: ${rErr.message}`
            : rErr.message,
          retryCount: nextRetry,
          nextRetryAt: new Date(Date.now() + backoffMs),
          leaseExpiresAt: null,
          leaseOwner: null,
        });
      }
    }

    try {
      let result;
      try {
        result = await provider.publishPost(
          {
            id: target.account.id,
            workspaceId: target.post.workspaceId,
            platform: target.platform as "YOUTUBE" | "INSTAGRAM" | "X",
            platformAccountId: target.account.platformAccountId,
            username: target.account.username,
            displayName: target.account.displayName,
            isMock: target.account.isMock,
            accessToken: decryptedAccessToken,
            refreshToken: decryptedRefreshToken,
          },
          payload
        );
      } catch (firstAttemptErr) {
        const errMsg = (firstAttemptErr as Error).message || "";
        // Reactive refresh if remote API rejected token with 401 and we haven't refreshed yet
        if (
          !isTokenExpiredOrExpiring &&
          (errMsg.includes("(401)") || errMsg.toLowerCase().includes("unauthorized")) &&
          (decryptedRefreshToken || target.platform === "INSTAGRAM")
        ) {
          const freshAccess = await refreshAndPersistToken();
          result = await provider.publishPost(
            {
              id: target.account.id,
              workspaceId: target.post.workspaceId,
              platform: target.platform as "YOUTUBE" | "INSTAGRAM" | "X",
              platformAccountId: target.account.platformAccountId,
              username: target.account.username,
              displayName: target.account.displayName,
              isMock: target.account.isMock,
              accessToken: freshAccess,
              refreshToken: decryptedRefreshToken,
            },
            payload
          );
        } else {
          throw firstAttemptErr;
        }
      }

      if (result.success) {
        const updated = await this.fencedUpdateTarget(targetId, leaseOwner, {
          status: "PUBLISHED",
          platformPostId: result.platformPostId,
          liveUrl: result.liveUrl,
          resumableSessionUri: result.resumableSessionUri || target.resumableSessionUri,
          remoteContainerId: result.remoteContainerId || target.remoteContainerId,
          publishedAt: result.publishedAt || new Date(),
          leaseExpiresAt: null, // Clear lease
          leaseOwner: null,
          nextRetryAt: null,
          errorMessage: null,
        });

        // Increment account postsCount
        await db.account.update({
          where: { id: target.accountId },
          data: { postsCount: { increment: 1 } },
        });

        return updated;
      } else {
        const nextRetry = target.retryCount + 1;
        const exceeded = nextRetry >= target.maxRetries;
        const backoffMs = Math.min(300_000, Math.pow(2, nextRetry) * 15_000);
        return await this.fencedUpdateTarget(targetId, leaseOwner, {
          status: "FAILED",
          errorMessage: exceeded
            ? `Maximum retries (${target.maxRetries}) exceeded: ${result.error || "Publishing failed"}`
            : (result.error || "Publishing failed"),
          resumableSessionUri: result.resumableSessionUri || target.resumableSessionUri,
          remoteContainerId: result.remoteContainerId || target.remoteContainerId,
          platformPostId: result.platformPostId || target.platformPostId,
          retryCount: nextRetry,
          nextRetryAt: new Date(Date.now() + backoffMs),
          leaseExpiresAt: null, // Release lease so retry is possible
          leaseOwner: null,
        });
      }
    } catch (publishErr: unknown) {
      if (publishErr instanceof LeaseFencingError) {
        throw publishErr;
      }
      const pErr = publishErr as Error & {
        resumableSessionUri?: string;
        remoteContainerId?: string;
        platformPostId?: string;
      };
      const nextRetry = target.retryCount + 1;
      const exceeded = nextRetry >= target.maxRetries;
      const backoffMs = Math.min(300_000, Math.pow(2, nextRetry) * 15_000);
      return await this.fencedUpdateTarget(targetId, leaseOwner, {
        status: "FAILED",
        errorMessage: exceeded
          ? `Maximum retries (${target.maxRetries}) exceeded: ${pErr.message || "Provider runtime error"}`
          : (pErr.message || "Provider runtime error"),
        resumableSessionUri: pErr.resumableSessionUri || target.resumableSessionUri,
        remoteContainerId: pErr.remoteContainerId || target.remoteContainerId,
        platformPostId: pErr.platformPostId || target.platformPostId,
        retryCount: nextRetry,
        nextRetryAt: new Date(Date.now() + backoffMs),
        leaseExpiresAt: null,
        leaseOwner: null,
      });
    }
  }

  /**
   * Publishes all targets for a given post with approval checks and target status aggregation.
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

    // 3. Process each target individually with target-level claims
    for (const target of post.targets) {
      await this.publishTarget(target.id);
    }

    // 4. Refresh all targets from DB to compute accurate post-level status
    const allTargets = await db.postTarget.findMany({
      where: { postId },
    });

    const successfulCount = allTargets.filter((t) => t.status === "PUBLISHED").length;
    const failedCount = allTargets.filter((t) => t.status === "FAILED").length;
    const pendingCount = allTargets.filter(
      (t) => t.status === "PENDING" || t.status === "PUBLISHING"
    ).length;

    let finalPostStatus = "PUBLISHED";
    if (allTargets.length === 0 || successfulCount === 0) {
      finalPostStatus = "FAILED";
    } else if (failedCount > 0 || pendingCount > 0) {
      finalPostStatus = "PARTIALLY_PUBLISHED";
    }

    const updatedPost = await db.post.update({
      where: { id: postId },
      data: {
        status: finalPostStatus,
        publishedAt: successfulCount > 0 ? (post.publishedAt || new Date()) : null,
      },
      include: { targets: true },
    });

    return updatedPost;
  }

  /**
   * Scans for due posts and publishes them using atomic conditional claiming with crash recovery.
   */
  static async dispatchDuePosts(workspaceId?: string) {
    const now = new Date();

    const candidates = await db.post.findMany({
      where: {
        approvalStatus: "APPROVED",
        ...(workspaceId ? { workspaceId } : {}),
        OR: [
          {
            status: { in: ["SCHEDULED", "PARTIALLY_PUBLISHED"] },
            scheduledAt: { lte: now },
          },
          // Crash recovery: Post was left in PUBLISHING, but has been stuck (> 5 min)
          {
            status: "PUBLISHING",
            updatedAt: { lte: new Date(now.getTime() - 5 * 60 * 1000) },
          },
        ],
      },
      select: { id: true, status: true, workspaceId: true },
    });

    const dispatchedResults = [];

    for (const candidate of candidates) {
      // ATOMIC CLAIM: Transition conditionally to PUBLISHING
      const claim = await db.post.updateMany({
        where: {
          id: candidate.id,
          status: candidate.status,
          approvalStatus: "APPROVED",
        },
        data: {
          status: "PUBLISHING",
        },
      });

      if (claim.count === 0) {
        // Post claimed by another concurrent worker
        continue;
      }

      try {
        const published = await this.publishPostNow(candidate.id);
        dispatchedResults.push(published);
      } catch (err: unknown) {
        const error = err as Error;
        console.error(`Error publishing claimed post ${candidate.id}:`, error?.message || error);
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
   * Calculates next open queue slot for workspace.
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
