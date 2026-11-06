# MediaConnect Security Architecture & Threat Model

**Version:** 1.1 (Milestone 6A.1 Remediation)  
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
       [ Boundary 1: Edge Transport & Rate Limiting ]
       - HTTPS enforcement & Security Headers
       - Sliding window IP/account brute-force throttle (429 Too Many Requests)
                                    │
                                    ▼
       [ Boundary 2: Session & Identity Boundary ]
       - Edge-compatible signed JWT cookies (mc_session)
       - HttpOnly, Secure, SameSite=Lax (anti-XSS / anti-CSRF)
       - Zero session tokens returned in JSON responses
                                    │
                                    ▼
       [ Boundary 3: Multi-Tenant Workspace & RBAC Boundary ]
       - Server-side workspace authorization on every API and DB query
       - Never trust client-supplied workspaceId or role
       - Cross-tenant account references rejected with 403 Forbidden
                                    │
                                    ▼
       [ Boundary 4: Publishing Engine & Approval Integrity ]
       - publishPostNow strictly requires approvalStatus === 'APPROVED'
       - Atomic conditional claiming prevents concurrent duplicate publishing
       - Target-level status tracking (PUBLISHED, PARTIALLY_PUBLISHED, FAILED)
                                    │
                                    ▼
       [ Boundary 5: Cryptographic Token Vault (At-Rest) ]
       - AES-256-GCM envelope encryption: enc:<version>:<iv>:<ciphertext>:<tag>
       - Unique 12-byte CSPRNG IV per encryption (zero IV reuse)
       - AAD bound to Account ID (prevents cross-account token swapping)
       - Decryption strictly fails closed on unencrypted plaintext in production
                                    │
                                    ▼
       [ Boundary 6: Output Sanitization & Audit Logging ]
       - sanitizeAccount strips tokens from all serialized API output
       - Structured JSON security audit logging (zero credentials logged)
```

---

## 2. Secrets Management & Fail-Closed Controls

All secrets are managed through `src/lib/config/secrets.ts`.
- `AUTH_SECRET`: Used solely for signing user session JWTs. Must be $\ge$ 32 characters.
- `TOKEN_VAULT_KEY_V1` / `TOKEN_VAULT_KEY_V2`: 32-byte cryptographic keys for AES-256-GCM credential encryption.
- `DISPATCH_SECRET`: Dedicated secret for service-to-service internal dispatch calls (`/api/posts/dispatch`).

### Production Fail-Closed Policy
In production (`NODE_ENV === "production"`), the application strictly halts startup and rejects operations if any secret is missing or set to a development fallback:
```typescript
if (isProduction()) {
  if (!secret || secret.trim().length < 32 || secret === DEV_ONLY_AUTH_SECRET) {
    throw new ConfigError("FATAL: Production security requirement violated: AUTH_SECRET must be set in production.");
  }
}
```

---

## 3. Session Security vs. Auth.js Equivalence

MediaConnect implements an Edge-compatible signed JWT session architecture using `jose`:
- **Strict HttpOnly Cookies:** Session tokens are stored exclusively in `httpOnly`, `secure` (in production), `sameSite: "lax"`, `path: "/"` cookies.
- **No Token in JSON:** The `/api/auth/login` endpoint never exposes the JWT in the response body, preventing client-side script theft (XSS resistance).
- **Embedded Tenant Context:** The signed payload contains `userId`, `email`, `activeWorkspaceId`, and `role`, cryptographically signed with HS256.
- **Server-Side Validation:** Every API route verifies the signature and validates workspace membership against the database (`authorizeWorkspaceAccess`).

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

## 5. Token Vault Envelope Specification

Social provider OAuth credentials (`accessToken`, `refreshToken`) are encrypted before database insertion:

```
enc:<version>:<iv_hex>:<ciphertext_hex>:<tag_hex>
```

- `version`: Key version identifier (`v1`, `v2`, etc.) enabling zero-downtime key rotation.
- `iv_hex`: 12-byte (96-bit) cryptographically secure pseudorandom IV (`crypto.randomBytes(12)`).
- `ciphertext_hex`: AES-256-GCM encrypted payload.
- `tag_hex`: 16-byte (128-bit) authentication tag.
- **Additional Authenticated Data (AAD):** Bound to `account.id`. Modifying the database record or swapping ciphertext between accounts immediately fails authentication tag verification with `TamperDetectedError`.
- **Fail-Closed Plaintext Rejection:** In production, unencrypted plaintext values throw `PlaintextTokenRejectedError`.

---

## 6. Atomic Job Claiming & Concurrency Defense

To guarantee idempotency during cron publishing, `PublisherService.dispatchDuePosts()` utilizes atomic state transitions:
```typescript
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
  // Post was already claimed by another concurrent worker; skip
  continue;
}
```
This guarantees zero duplicate publishing events even under heavy multi-worker execution.
