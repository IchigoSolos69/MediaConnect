# MediaConnect: Task Tracker

## Phase 1: Foundation & Project Scaffolding

### Task 1: Next.js 15 App Scaffold & Tailwind CSS setup
- **Description:** Initialize Next.js 15 project with TypeScript, Tailwind CSS, Lucide icons, and core layout components.
- **Acceptance criteria:**
  - [x] Next.js 15 App Router initialized in the root directory.
  - [x] Tailwind CSS configured and verified with base design tokens.
  - [x] App builds with `npm run build` and runs with `npm run dev`.
- **Verification:** `npm run build` succeeds.
- **Files:** `package.json`, `tsconfig.json`, `tailwind.config.ts`, `src/app/layout.tsx`, `src/app/page.tsx`
- **Scope:** M

### Task 2: Prisma ORM Schema & Database Seed
- **Description:** Define database models for Workspaces, Accounts, Posts, PostTargets, Metrics, and Competitors; configure SQLite/Postgres compatibility; create seed script with sample brand data.
- **Acceptance criteria:**
  - [x] Prisma schema with models: `Workspace`, `User`, `Account`, `Post`, `PostTarget`, `MetricSnapshot`, `Competitor`.
  - [x] Database push works via `npx prisma db push`.
  - [x] Seed script populates a default workspace ("Acme Brand") with sample scheduled posts and metrics.
- **Verification:** `npx prisma db push` and `npx prisma db seed` run without errors.
- **Files:** `prisma/schema.prisma`, `prisma/seed.ts`, `src/lib/db.ts`
- **Scope:** M

### Task 3: Social Provider Abstraction Interface & Mock Sandbox Engine
- **Description:** Build `ISocialProvider` protocol and concrete mock implementations for YouTube, Instagram, and X that simulate OAuth, post publishing, and realistic analytics.
- **Acceptance criteria:**
  - [x] `ISocialProvider` interface defined with auth, publishing, insights, and heatmap methods.
  - [x] Mock implementations for `YouTubeMockProvider`, `InstagramMockProvider`, and `XMockProvider` with realistic sample metrics and post URLs.
  - [x] Provider factory/registry to switch between `mock` and `live` modes.
- **Verification:** Unit tests verifying all 3 mock providers execute `publishPost` and `fetchInsights`.
- **Files:** `src/providers/types.ts`, `src/providers/mock/*.ts`, `src/providers/index.ts`
- **Scope:** M

### Checkpoint: Foundation Complete
- [x] Database schema pushed
- [x] Providers tested
- [x] Build clean

---

## Phase 2: Core Workspace & Account Connection

### Task 4: Workspace & Brand Profile Management UI
- **Description:** Build responsive navigation, workspace switcher, and brand settings dashboard view.
- **Acceptance criteria:**
  - [x] Main dashboard layout with sidebar navigation (Planner, Analytics, SEO Studio, Channels, Settings).
  - [x] Top bar with active workspace badge and brand switcher dropdown.
  - [x] Dashboard overview page summarizing scheduled posts and account health.
- **Verification:** Manual check of layout, navigation, and workspace switching.
- **Files:** `src/components/layout/*.tsx`, `src/app/(dashboard)/layout.tsx`, `src/app/page.tsx`
- **Scope:** M

### Task 5: Social Channel Connection Hub
- **Description:** Build the Connected Accounts management interface supporting 1-click mock connection and live OAuth configuration for YouTube, Instagram, and X.
- **Acceptance criteria:**
  - [x] Channels page displaying connection cards for YouTube, Instagram, and X.
  - [x] 1-Click "Connect Mock Account" button linking an account immediately with profile avatar and follower count.
  - [x] Disconnect/reconnect functionality and account status badges (Active, Token Expired).
- **Verification:** Connecting and disconnecting accounts updates database and UI immediately.
- **Files:** `src/app/channels/page.tsx`, `src/components/channels/*.tsx`, `src/app/api/accounts/route.ts`
- **Scope:** M

### Checkpoint: Workspace & Accounts Complete
- [x] Connected channels display in real time with operational status

---

## Phase 3: Visual Calendar, Queue & Publisher

### Task 6: Multi-Channel Post Composer
- **Description:** Build modal/panel composer allowing users to write copy, attach media, select target channels, and tailor platform-specific fields (YouTube title/tags, Instagram reel/caption, X thread/char counter).
- **Acceptance criteria:**
  - [x] Multi-channel selector (YouTube, Instagram, X toggles).
  - [x] Platform-specific tab views for custom captions and overrides.
  - [x] Live character counters with platform limits (280 for X, 2,200 for Instagram, 5,000 for YouTube).
  - [x] Image/video preview support.
- **Verification:** Saving a post creates record in database with individual `PostTarget` entries.
- **Files:** `src/components/planner/ComposerModal.tsx`, `src/app/api/posts/route.ts`
- **Scope:** M

### Task 7: Drag-and-Drop Visual Calendar & Queue Manager
- **Description:** Interactive monthly and weekly calendar displaying scheduled posts, with drag-and-drop rescheduling and Buffer-style fixed queue time slots.
- **Acceptance criteria:**
  - [x] Visual calendar view showing scheduled posts colored by platform icon.
  - [x] Date navigation, post click inspection, and day slot quick-scheduling.
  - [x] Queue slot configuration (auto-schedule into the next open slot).
- **Verification:** Moving/scheduling a post on the calendar updates its scheduled time in the database.
- **Files:** `src/app/planner/page.tsx`, `src/components/planner/*.tsx`
- **Scope:** M

### Task 8: Scheduling Dispatcher & In-App Runner
- **Description:** Build background publisher that polls for due posts, calls target provider `publishPost()`, and updates status from `SCHEDULED` to `PUBLISHED` (or `FAILED` with error log).
- **Acceptance criteria:**
  - [x] Dispatcher service checks for posts where `scheduledAt <= now` and status is `SCHEDULED`.
  - [x] Calls provider `publishPost()` for each target account.
  - [x] Status updates to `PUBLISHED` with simulated or live post URL.
  - [x] Manual "Publish Now" button for instant testing.
- **Verification:** Scheduled post automatically transitions to `PUBLISHED` upon trigger.
- **Files:** `src/services/publisher.service.ts`, `src/app/api/posts/dispatch/route.ts`
- **Scope:** M

### Checkpoint: Publishing Flow Complete
- [x] End-to-end post creation, calendar scheduling, and automated publishing verified

---

## Phase 4: Social SEO Studio & Content Assistant

### Task 9: Real-Time Caption & Hook SEO Grader
- **Description:** Implement scoring algorithm evaluating caption hooks (curiosity gap, question triggers, power words), character density, and visual preview of mobile "See more" fold cutoff.
- **Acceptance criteria:**
  - [x] Hook score calculator (0 to 100) with actionable tips ("Add an opening question", "Shorten first sentence").
  - [x] Mobile preview showing exactly where text will be truncated on Instagram/X.
  - [x] Standalone `/seo-studio` tool and integrated side-panel inside Composer.
- **Verification:** Unit test for `seo.service.ts` scoring logic.
- **Files:** `src/services/seo.service.ts`, `src/components/seo/*.tsx`, `src/app/seo-studio/page.tsx`
- **Scope:** M

### Task 10: CamelCase Hashtag Optimizer & Image Alt-Text Generator
- **Description:** Tool that converts raw hashtags into accessible CamelCase, classifies tags by volume tier, and generates keyword-rich alt-text for image accessibility and search indexing.
- **Acceptance criteria:**
  - [x] CamelCase formatter converts `#digitalmarketingstrategy` to `#DigitalMarketingStrategy`.
  - [x] Hashtag category badge display (High Volume, Niche, Trending).
  - [x] Image alt-text generator incorporating target keywords.
- **Verification:** User enters comma-separated hashtags and receives formatted, tagged recommendations.
- **Files:** `src/components/seo/HashtagOptimizer.tsx`, `src/components/seo/AltTextAssistant.tsx`
- **Scope:** S

### Checkpoint: SEO Studio Complete
- [x] Live SEO feedback and formatting components functional

---

## Phase 5: Metricool-Style Analytics & Intelligence

### Task 11: Cross-Channel Performance Dashboard
- **Description:** Interactive dashboard displaying aggregated and per-network metrics: Impressions, Reach, Engagement Rate, and Follower Net Growth with time-range filtering.
- **Acceptance criteria:**
  - [x] KPI cards for total impressions, engagements, clicks, followers.
  - [x] Time-series metrics and platform breakdown cards (YouTube, Instagram, X).
  - [x] Network filter (All, YouTube, Instagram, X) and date range switcher (7d, 14d, 30d).
- **Verification:** Changing network or date filter updates displayed analytics graphs.
- **Files:** `src/app/analytics/page.tsx`, `src/services/analytics.service.ts`, `src/app/api/analytics/route.ts`
- **Scope:** M

### Task 12: 24x7 "Best Time to Post" Heatmap & Competitor Benchmarking
- **Description:** Metricool-signature 24x7 heatmap highlighting optimal posting hours based on audience online activity, plus competitor profile tracker.
- **Acceptance criteria:**
  - [x] Interactive 7-day x 24-hour heatmap matrix with color intensity corresponding to audience activity (168 cells).
  - [x] Clickable heatmap cell to directly schedule a post at that optimal time slot.
  - [x] Competitor tracking widget comparing follower growth and post frequency.
- **Verification:** Heatmap renders 168 hourly cells correctly and clicking a cell opens composer pre-filled with that time.
- **Files:** `src/components/analytics/AudienceHeatmap.tsx`, `src/components/analytics/CompetitorTracker.tsx`, `src/app/api/competitors/route.ts`
- **Scope:** M

### Task 13: Exportable Client Reports & Verification
- **Description:** Generate client-ready printable/PDF summary reports and perform end-to-end audit of all features.
- **Acceptance criteria:**
  - [x] "Export Report" button generating a clean printable/PDF layout with brand logo and date range.
  - [x] All tests passing, zero TypeScript/build errors.
- **Verification:** `npm run build` succeeds; full user journey verified without errors.
- **Files:** `src/components/analytics/ReportView.tsx`
- **Scope:** S

### Final Checkpoint: Project Complete & Verified
- [x] End-to-end verification completed (All 5 phases verified)

---

## Phase 6: Production Readiness & Enterprise Security

### Milestone 6A: Security, Authentication, and Token Vault

#### Task 14: Cryptographic Token Vault
- **Description:** Implement AES-256-GCM encryption with unique 12-byte IV/nonce per encryption, 16-byte authTag, key versioning, tamper detection, and key rotation.
- **Acceptance criteria:**
  - [x] `TokenVault.encrypt(plaintext, keyVersion)` returns `v1:<iv>:<ciphertext>:<tag>`.
  - [x] `TokenVault.decrypt(encryptedPayload)` successfully decrypts with corresponding version key.
  - [x] Modifying ciphertext or authTag triggers `TamperDetectedError`.
  - [x] Key rotation function `TokenVault.rotate(payload, targetVersion)` verified.
- **Verification:** Unit test `src/test-token-vault.ts` passes.
- **Files:** `src/lib/crypto/vault.ts`, `src/lib/crypto/__tests__/vault.test.ts`
- **Scope:** M

#### Task 15: Schema Migration & Plaintext Token Migration
- **Description:** Introduce `WorkspaceMember` model, add `passwordHash` to `User`, update `Account` with token key versioning and approval fields on `Post`. Safely migrate existing plaintext tokens to encrypted ciphertext without resetting database.
- **Acceptance criteria:**
  - [x] Prisma schema updated with `WorkspaceMember` and password hash.
  - [x] `npx prisma db push` executes cleanly without data loss.
  - [x] Migration script encrypts all existing plaintext tokens and seeds test credentials for OWNER, APPROVER, and EDITOR roles.
- **Verification:** Database contains encrypted tokens (`enc:v1:...`) and valid workspace memberships.
- **Files:** `prisma/schema.prisma`, `prisma/seed.ts`, `src/scripts/migrate-tokens.ts`
- **Scope:** M

#### Task 16: Auth.js Session System & Documented RBAC Matrix
- **Description:** Implement Auth.js with credentials provider (bcrypt password verification), session management, and role-based permissions matrix (`OWNER`, `APPROVER`, `EDITOR`).
- **Acceptance criteria:**
  - [x] Secure session creation with email/password authentication.
  - [x] Role-based permission matrix mapping each role to allowed actions.
  - [x] Application auth completely separated from social OAuth credentials.
  - [x] Sign-in page at `/login` and session provider in layout.
- **Verification:** Successful login yields verified session with active workspace membership.
- **Files:** `src/auth.ts`, `src/lib/auth/permissions.ts`, `src/lib/auth/server.ts`, `src/app/login/page.tsx`
- **Scope:** M

#### Task 17: Multi-Tenant Server Authorization & API Sanitization
- **Description:** Enforce strict server-side authorization on all API routes (`/api/accounts`, `/api/posts`, `/api/analytics`, `/api/workspaces`), reject cross-tenant requests, and strip tokens from all responses.
- **Acceptance criteria:**
  - [x] Unauthenticated requests return 401.
  - [x] Requests to a workspace where user is not a member return 403 Forbidden.
  - [x] Unauthorized actions (e.g. EDITOR attempting to disconnect account) return 403.
  - [x] Account tokens are never exposed in any API response or serialized state.
- **Verification:** API audit tests pass with 401/403 responses on unauthorized attempts.
- **Files:** `src/app/api/accounts/route.ts`, `src/app/api/posts/route.ts`, `src/app/api/analytics/route.ts`, `src/lib/auth/server.ts`
- **Scope:** M

#### Task 18: Automated Security & Tenant Isolation Test Suite
- **Description:** Build automated test script validating authentication, authorization, cross-tenant isolation, role boundaries, token encryption, tamper detection, and key rotation.
- **Acceptance criteria:**
  - [x] Test 1: Unauthenticated access rejected with 401.
  - [x] Test 2: Cross-tenant access rejected with 403.
  - [x] Test 3: Role escalation (EDITOR disconnecting channel) rejected with 403.
  - [x] Test 4: Token vault encryption, decryption, and tamper detection pass.
  - [x] Test 5: Key rotation from v1 to v2 verified.
  - [x] Test 6: Zero plaintext tokens in database or API responses.
- **Verification:** `npx tsx src/test-milestone-6a.ts` passes all tests with exit code 0.
- **Files:** `src/test-milestone-6a.ts`
- **Scope:** M

### Checkpoint: Milestone 6A Foundation Complete
- [x] Initial security & auth implemented

---

### Milestone 6A.1: Mandatory Security Remediation

#### Task 19: Fail-Closed Secrets Management
- **Description:** Centralize secrets in `src/lib/config/secrets.ts`. Enforce that missing or weak secrets in production (`AUTH_SECRET`, `TOKEN_VAULT_KEY_V1`, `DISPATCH_SECRET`) fail immediately with `ConfigError`.
- **Acceptance criteria:**
  - [x] No predictable production fallbacks.
  - [x] Distinct session-signing and token-encryption keys.
  - [x] Verified fail-closed startup in production mode.
- **Files:** `src/lib/config/secrets.ts`, `src/lib/auth/session.ts`, `src/lib/crypto/vault.ts`, `.env.example`

#### Task 20: HttpOnly Session Isolation & Login Hardening
- **Description:** Ensure login JSON body never returns session JWTs; strictly enforce `httpOnly`, `secure`, `sameSite: lax` cookies. Add IP & email brute-force sliding-window rate limiting.
- **Acceptance criteria:**
  - [x] Zero session tokens returned in login JSON body.
  - [x] 6th failed attempt throttled with HTTP 429 and `Retry-After`.
  - [x] Audit logging on auth events.
- **Files:** `src/app/api/auth/login/route.ts`, `src/lib/security/rate-limiter.ts`, `src/lib/security/audit.ts`

#### Task 21: Production UI De-Scaffolding
- **Description:** Remove pre-filled test credentials, quick-login buttons, and exposed test passwords from production builds (`process.env.NODE_ENV !== 'production'`).
- **Acceptance criteria:**
  - [x] Default email/password form inputs are empty strings.
  - [x] Quick-fill test panel completely eliminated in production builds.
  - [x] Exposed passwords removed from UI footer.
- **Files:** `src/app/login/page.tsx`

#### Task 22: Unauthenticated Route Lockdown
- **Description:** Protect `/api/posts/dispatch` and `/api/queue-slots` against unauthenticated calls.
- **Acceptance criteria:**
  - [x] `/api/posts/dispatch` requires valid `DISPATCH_SECRET` Bearer token or authenticated `OWNER` session.
  - [x] `/api/queue-slots` GET/POST enforces session authentication and workspace membership (never blind `db.workspace.findFirst()`).
- **Files:** `src/app/api/posts/dispatch/route.ts`, `src/app/api/queue-slots/route.ts`

#### Task 23: Cross-Tenant Account Validation on Post Creation
- **Description:** Query and verify that every target account ID in a post creation request belongs to the authorized workspace.
- **Acceptance criteria:**
  - [x] Cross-workspace account IDs rejected with 403 Forbidden.
  - [x] Account platform verified against target platform.
- **Files:** `src/app/api/posts/route.ts`

#### Task 24: Publishing Engine Approval & Integrity Enforcement
- **Description:** Enforce `approvalStatus === 'APPROVED'` and workspace boundary inside `PublisherService.publishPostNow()`. Accurately compute `PUBLISHED`, `PARTIALLY_PUBLISHED`, and `FAILED` status.
- **Acceptance criteria:**
  - [x] Unapproved posts throw `UnapprovedPostError` and are blocked from publishing.
  - [x] Accurate status tracking on target failure.
- **Files:** `src/services/publisher.service.ts`

#### Task 25: Atomic Job Claiming in Dispatcher
- **Description:** Implement atomic conditional state transitions (`status: SCHEDULED` -> `PUBLISHING`) to prevent concurrent dispatcher race conditions and duplicate publishing.
- **Acceptance criteria:**
  - [x] 5 concurrent workers processing due posts produce zero duplicate executions.
- **Files:** `src/services/publisher.service.ts`

#### Task 26: Safe Migration & Fail-Closed Plaintext Vault
- **Description:** Make `TokenVault.decrypt` fail closed on unencrypted plaintext in production. Update migration script so it never overwrites existing user passwords on reruns and includes roundtrip verification.
- **Acceptance criteria:**
  - [x] Plaintext tokens in production throw `PlaintextTokenRejectedError`.
  - [x] Migration script preserves existing user passwords.
- **Files:** `src/lib/crypto/vault.ts`, `src/scripts/migrate-tokens.ts`

#### Task 27: Automated Security Remediation Test Suite & GitHub Actions CI
- **Description:** Build comprehensive 12-test integration suite covering all remediations and configure GitHub Actions CI workflow.
- **Acceptance criteria:**
  - [x] 12/12 security integration tests pass (`npm run test:security`).
  - [x] `.github/workflows/ci.yml` configured to run lint, typecheck, tests, and build on PRs.
- **Files:** `src/test-milestone-6a1.ts`, `.github/workflows/ci.yml`, `package.json`

### Checkpoint: Milestone 6A.1 Remediation Complete
- [x] All 12 critical & high findings resolved
- [x] Test suite 100% green (12/12)
- [x] Production build clean
- [ ] Approval gate: User review before proceeding to Milestone 6B
