# MediaConnect Security Architecture & Threat Model

**Version:** 1.2 (Milestone 6A.2 Final Hardening)  
**Standard:** Zero-Trust Multi-Tenancy & Cryptographic Vault  

---

## 1. Threat Model & Trust Boundaries

MediaConnect manages multiple client workspaces, user roles, social media access tokens, and automated publishing dispatchers. The system enforces strict defense-in-depth across six core boundaries:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        External Internet Traffic                       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
       [ Boundary 1: Edge Transport & Proxy IP Resolution ]
       - HTTPS enforcement & Security Headers
       - Sanitized client IP extraction (RFC-compliant proxy header validation)
       - Durable sliding-window IP/account throttle (429 Too Many Requests)
                                    │
                                    ▼
       [ Boundary 2: Session & Identity Boundary ]
       - Edge-compatible signed JWT cookies (mc_session)
       - HttpOnly, Secure, SameSite=Lax (anti-XSS / anti-CSRF)
       - Zero session tokens returned in JSON responses
       - Server-side revocation: jti revocation table on logout & replay denial
       - Global user tokenVersion invalidation on password change/deactivation
                                    │
                                    ▼
       [ Boundary 3: Multi-Tenant Workspace & RBAC Boundary ]
       - Server-side workspace authorization on every API and DB query
       - Never trust client-supplied workspaceId or role
       - Cross-tenant account references rejected with 403 Forbidden
                                    │
                                    ▼
       [ Boundary 4: Publishing Engine & Concurrency Model ]
       - publishPostNow strictly requires approvalStatus === 'APPROVED'
       - Target-level conditional lease claims (status: PUBLISHING + leaseExpiresAt)
       - At-least-once delivery with deterministic idempotency keys for provider reconciliation
       - Target outcome aggregation: PUBLISHED, PARTIALLY_PUBLISHED, or FAILED
                                    │
                                    ▼
       [ Boundary 5: Cryptographic Token Vault (At-Rest) ]
       - AES-256-GCM envelope encryption: enc:<version>:<iv>:<ciphertext>:<tag>
       - Unique 12-byte CSPRNG IV per encryption (zero IV reuse)
       - AAD bound to Account ID (prevents cross-account token swapping)
       - Strict fail-closed on unencrypted plaintext in production (PlaintextTokenRejectedError)
       - Strict production secret validation (exact 64-char hex key required)
                                    │
                                    ▼
       [ Boundary 6: Output Sanitization & Audit Logging ]
       - sanitizeAccount strips tokens from all serialized API output
       - Structured JSON security audit logging (zero credentials logged)
```

---

## 2. Secrets Management & Fail-Closed Controls

All secrets are managed through `src/lib/config/secrets.ts`.
- `AUTH_SECRET`: Used solely for signing user session JWTs. In production, must be $\ge$ 32 characters of high-entropy key.
- `TOKEN_VAULT_KEY_V1` / `TOKEN_VAULT_KEY_V2`: 32-byte cryptographic keys for AES-256-GCM credential encryption. In production, **must be an exact 64-character hexadecimal string**. Silent hashing of arbitrary weak strings is strictly rejected in production.
- `DISPATCH_SECRET`: Dedicated secret for service-to-service internal dispatch calls (`/api/posts/dispatch`).

### Key Generation & Rotation Procedure
1. **Generate New Key:**
   ```bash
   openssl rand -hex 32
   ```
2. **Key Rotation Configuration:**
   - Set the newly generated key as `TOKEN_VAULT_KEY_V2`.
   - Update `TOKEN_VAULT_ACTIVE_VERSION="v2"`.
   - Existing credentials encrypted under `v1` continue to decrypt seamlessly using `TOKEN_VAULT_KEY_V1`.
   - Run the zero-downtime rotation routine `TokenVault.rotate(envelope, "v2", accountId)` to re-encrypt stored credentials.
   - Once all accounts are re-encrypted under `v2`, decommission `TOKEN_VAULT_KEY_V1`.

---

## 3. Session Security, Revocation & Replay Denial

MediaConnect implements an Edge-compatible signed JWT session architecture using `jose` with server-side revocation:
- **Strict HttpOnly Cookies:** Session tokens are transmitted exclusively in `httpOnly`, `secure` (in production), `sameSite: "lax"`, `path: "/"` cookies.
- **Zero Tokens in JSON:** `/api/auth/login` never returns JWTs in the JSON response body.
- **Per-Session JTI Revocation:** Every session contains a unique `jti` (UUID). When the user logs out (`POST /api/auth/session`), the server inserts the `jti` into the `RevokedSession` database table. Replaying a captured or logged-out session token is rejected with `401 Unauthorized`.
- **Global User Token Versioning:** Each user has a `tokenVersion: Int` in the database. When a password is changed or an account is deactivated, `invalidateAllUserSessions(userId)` increments `user.tokenVersion`, instantly invalidating all active sessions across all devices.

---

## 4. RBAC Permission Matrix

The system enforces three standard roles:

| Action | OWNER | APPROVER | EDITOR | Description |
| :--- | :---: | :---: | :---: | :--- |
| `workspace:manage` | ✅ | ❌ | ❌ | Workspace settings, member invites, billing, manual cron dispatch |
| `channels:connect` | ✅ | ❌ | ❌ | Connect / disconnect social channels |
| `posts:create` | ✅ | ✅ | ✅ | Create drafts or submit posts for approval |
| `posts:edit_own` | ✅ | ✅ | ✅ | Edit user's own draft posts |
| `posts:edit_all` | ✅ | ✅ | ❌ | Edit any post across the workspace |
| `posts:submit_approval` | ✅ | ✅ | ✅ | Submit draft to content approver |
| `posts:approve` | ✅ | ✅ | ❌ | Review and approve scheduled posts |
| `posts:publish_now` | ✅ | ✅ | ❌ | Immediately publish live to social networks |
| `posts:delete` | ✅ | ✅ | ❌ | Delete posts |
| `analytics:view` | ✅ | ✅ | ✅ | View analytics and reports |
| `reports:export` | ✅ | ✅ | ❌ | Export client PDF reports |

---

## 5. Publishing Concurrency & Idempotency Reality

### The Distributed Delivery Reality
External social network APIs (YouTube Data API, Meta Graph API, X API v2) do not participate in distributed two-phase commits. If a network partition occurs after a social network accepts a video/post but before the HTTP response reaches MediaConnect, an ambiguous state exists.

Therefore, MediaConnect adopts the industry-standard **At-Least-Once Delivery with Target Leases and Idempotency Reconciliation**:

1. **Target-Level Conditional Claims:**
   Before dispatching any publication call to an external provider, the individual target is claimed atomically:
   ```typescript
   const claim = await db.postTarget.updateMany({
     where: {
       id: targetId,
       status: { in: ["PENDING", "FAILED"] },
       OR: [
         { leaseExpiresAt: null },
         { leaseExpiresAt: { lte: now } }, // Expired lease recovery
       ],
     },
     data: {
       status: "PUBLISHING",
       claimedAt: now,
       leaseExpiresAt: leaseExpires,
     },
   });
   ```
2. **Provider Idempotency Keys:**
   Each target generates a deterministic idempotency key (`pub_<targetId>_<timestamp>_r<retryCount>`) forwarded to providers that support deduplication headers.
3. **Lease Expiration & Recovery:**
   If a publishing worker crashes or times out while processing a target, the 5-minute lease expires, enabling recovery and retry without stranding posts in perpetual `PUBLISHING` state.
4. **Target Status Aggregation:**
   - All targets succeeded $\rightarrow$ `status: "PUBLISHED"`.
   - Some targets succeeded, others failed $\rightarrow$ `status: "PARTIALLY_PUBLISHED"`.
   - All targets failed $\rightarrow$ `status: "FAILED"`.

---

## 7. Live Provider Architecture & OAuth 2.0 Security (Phase 6B)

MediaConnect features a modular provider abstraction supporting both zero-cost local sandboxes and live social platform APIs:

1. **OAuth 2.0 Cryptographic State Protection:**
   - Authorization initiates at `/api/auth/connect/[provider]`.
   - Generates a signed HMAC-SHA256 `state` parameter encapsulating `{ workspaceId, userId, platform, timestamp, nonce }`.
   - Validated at `/api/auth/callback/[provider]` to guarantee:
     - Anti-CSRF: The redirect matches the initiating browser session.
     - Anti-Session Fixation: The redeeming user matches the state initiator.
     - Tenant Integrity: Channel tokens are strictly bound to the authorized workspace.
     - Replay Protection: 15-minute strict expiration window.

2. **Live Adapter Implementations:**
   - **YouTube Data API v3 (`YouTubeLiveProvider`):** Google OAuth 2.0 with `youtube.upload` and `yt-analytics.readonly` scopes; chunked resumable upload protocol; daily upload quota tracker enforcing Google's 100 `videos.insert`/day limit.
   - **Instagram Graph API (`InstagramLiveProvider`):** Direct Instagram Login for creator and business accounts (no Facebook Page linkage required); short-lived to long-lived (60-day) token exchange; 2-step media container flow (`POST /{ig-user-id}/media` $\rightarrow$ `POST /{ig-user-id}/media_publish`); first-comment auto-posting.
   - **X API v2 Guardrail (`XLiveProvider`):** Strict consumption-based billing guardrail. Automatically blocks live post writes ($0.015/post) with `PaidApiGuardrailError` unless `ALLOW_PAID_X_API="true"` is explicitly provided.

3. **Reconciliation & Idempotency:**
   - Every dispatch generates a deterministic `idempotencyKey` cached by the provider adapters to guarantee idempotent delivery under network retries.

---

## 8. Media Storage & Aspect Ratio Validation (Phase 6B)

1. **Storage Abstraction (`StorageService`):**
   - Pluggable `IStorageProvider`: `LocalStorageProvider` for zero-cost development/test; `S3CompatibleStorageProvider` for Cloudflare R2 / AWS S3 production storage.
   - Directory traversal protection: Storage keys are sanitized and prefixed with workspace UUIDs.
2. **Technical Compliance & Aspect Ratio Rules:**
   - Size limits: 100MB for video, 10MB for images.
   - YouTube Shorts & Instagram Reels: Strictly enforces vertical 9:16 aspect ratio (~0.5625) with duration caps (60s Shorts, 90s Reels).
   - YouTube Long-form: 16:9 widescreen recommended with pillarbox warnings for non-standard aspect ratios.
   - Instagram Feed: 1:1 square, 4:5 portrait, and 1.91:1 landscape validation.

