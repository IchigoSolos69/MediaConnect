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
