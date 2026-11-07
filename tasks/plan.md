# Implementation Plan: MediaConnect (Buffer + Metricool + Social SEO Hybrid)

## Overview
MediaConnect is an all-in-one social media management, visual scheduling, analytics, and content SEO platform modeled after Buffer and Metricool. It provides a drag-and-drop calendar, multi-account queue, real-time Social SEO & Hook Grader, audience activity heatmaps ("Best Time to Post"), and competitor benchmarking. To ensure 100% free local development without paid third-party API blockers, it introduces a dual-mode Social Provider Abstraction Layer (Zero-Cost Mock Sandbox vs. Live OAuth2/REST APIs for YouTube, Instagram, and X).

## Architecture Decisions
1. **Full-Stack Next.js 15 (App Router, React 19, TypeScript):** Single repository for high developer velocity, end-to-end type safety, and clean separation between Server Components and interactive client widgets.
2. **PostgreSQL + Prisma ORM (with SQLite fallback for zero-setup local dev):** Strongly-typed data models for Workspaces, Accounts, Posts, Metrics, and Competitors.
3. **Pluggable Social Provider Abstraction (`ISocialProvider`):** All social operations (auth, posting, insights, heatmaps) interface through a uniform protocol. Switching from Mock to Live requires only setting environment API keys.
4. **Hybrid Scheduling Engine:** Supports BullMQ + Redis for production, alongside a lightweight in-app scheduler runner so the entire workflow works locally out-of-the-box without requiring an external Redis server.
5. **Deterministic Heuristic + LLM Social SEO Engine:** Pure client/server heuristic scoring (Hook Score, CamelCase hashtag formatter, "See More" mobile cutoff simulator) for instantaneous zero-latency feedback, with optional Gemini API free-tier integration.

---

## Task List

### Phase 1: Foundation & Project Scaffolding
- [ ] Task 1: Next.js 15 App Scaffold & Tailwind CSS setup
- [ ] Task 2: Prisma ORM Schema & Database Seed (Multi-tenant Workspaces, Connected Accounts, Posts, Metrics)
- [ ] Task 3: Social Provider Abstraction Interface & Mock Sandbox Engine (YouTube, Instagram, X)

### Checkpoint: Foundation
- [ ] Next.js app builds cleanly (`npm run build`)
- [ ] Database migrations/push succeed
- [ ] Unit tests for Mock Provider interface pass

### Phase 2: Core Workspace & Account Connection
- [ ] Task 4: Workspace & Brand Profile Management UI (Metricool brand grouping)
- [ ] Task 5: Social Channel Connection Hub (1-Click Mock Connect & Live OAuth stubs)

### Checkpoint: Workspace & Accounts
- [ ] User can switch workspaces and connect/disconnect mock YouTube, Instagram, and X accounts

### Phase 3: Visual Calendar, Queue & Publisher
- [ ] Task 6: Multi-Channel Post Composer (Base post + channel-specific tabs for YouTube, Instagram, X)
- [ ] Task 7: Drag-and-Drop Visual Calendar & Buffer-style Queue Slot Manager
- [ ] Task 8: Scheduling Dispatcher & In-App Runner (Status transitions: DRAFT -> SCHEDULED -> PUBLISHING -> PUBLISHED)

### Checkpoint: Publishing Flow
- [ ] User can schedule posts on the visual calendar or queue slots
- [ ] Scheduled posts automatically transition to PUBLISHED with viewable mock live URLs

### Phase 4: Social SEO Studio & Content Assistant
- [ ] Task 9: Real-Time Caption & Hook SEO Grader (Score 0-100, Curiosity/Urgency power words, mobile cutoff preview)
- [ ] Task 10: CamelCase Hashtag Optimizer & Image Alt-Text Generator

### Checkpoint: SEO & Content Tools
- [ ] Live SEO score updates on keystroke in Composer and standalone SEO Studio
- [ ] Hashtags auto-convert to CamelCase and highlight tier reach

### Phase 5: Metricool-Style Analytics & Intelligence
- [ ] Task 11: Cross-Channel Performance Dashboard (Impressions, Engagement, Follower Growth)
- [ ] Task 12: 24x7 "Best Time to Post" Audience Activity Heatmap & Competitor Benchmarking
- [ ] Task 13: Exportable Client Reports (Print / PDF ready)

### Checkpoint: Full Platform Verification
- [x] End-to-end flow verified from connection to scheduling, SEO optimization, and analytics
- [x] Zero runtime console errors, clean build, and 100% free local execution

### Phase 6: Production Readiness & Enterprise Security

#### Milestone 6A: Security, Authentication, and Token Vault (Active)
- [ ] Task 14: Cryptographic Token Vault (AES-256-GCM, unique IV, AuthTag, Key Versioning, Key Rotation)
- [ ] Task 15: Schema Migration & Plaintext Token Migration (WorkspaceMember, User passwordHash, encrypted Account tokens)
- [ ] Task 16: Auth.js Session System & Documented RBAC Matrix (OWNER, APPROVER, EDITOR)
- [ ] Task 17: Multi-Tenant Server Authorization & API Sanitization (Zero token leaks, cross-tenant isolation)
- [ ] Task 18: Automated Security & Tenant Isolation Test Suite (Auth rejection, cross-tenant denial, role enforcement, tamper detection)

### Checkpoint: Milestone 6A Security Verification
- [ ] All security tests pass
- [ ] Zero plaintext tokens in database or API responses
- [ ] Cross-tenant access attempts cleanly rejected (401/403)
- [ ] Full build succeeds without errors
- [ ] Approval gate: Review with user before proceeding to 6B

#### Milestone 6B: Direct Storage & Social Adapters (Upcoming)
- Media Uploads: Cloudflare R2 / S3 presigned URLs with aspect ratio validation.
- YouTube Live Adapter: 100 `videos.insert` quota compliance, resumable upload.
- Instagram Live Adapter: Instagram Login vs Facebook Login evaluation, containerized publishing.
- X Live Adapter: Consumption-based billing disclaimer, mock mode preservation.
- Publishing Reliability: Upstash QStash / Redis distributed locks with retry policy.

#### Milestone 6C: Integration Hardening, Real Analytics Ingestion, AI SEO & Server PDF Reporting (Active)
- **Stage 0 (Mandatory Integration Corrections):**
  - Task 28: Schema extensions (`OAuthState.mode`, `PostTarget.remoteContainerId` & `leaseOwner`, `Account` sync metadata, `MetricSnapshot` provenance & deduplication constraint)
  - Task 29: OAuth state `mode` binding (`mock` | `live`) and Channel UI Live OAuth authorization gating
  - Task 30: SSRF-hardened YouTube media retrieval, post workspace ID enforcement on stored media, and 180s YouTube Shorts validation
  - Task 31: Shared project-level YouTube quota bucket with `America/Los_Angeles` midnight reset and atomic conditional reservation
  - Task 32: Ambiguous Instagram publish reconciliation (`remoteContainerId` + `platformPostId` persistence) and fenced worker leases (`leaseOwner` + `nextRetryAt`)
  - Task 33: Authenticated `/api/media/upload` and `/api/media/presign` endpoints with real storage round-trip
  - Task 34: Analytics workspace isolation (zero `workspace.findFirst()` calls) and strict separation of mock vs. live analytics provenance
- **Stage 1 (Real Analytics Ingestion):**
  - Task 35: Live YouTube Analytics & Instagram Insights ingestion, rate-limit/retry handling, incremental sync, and snapshot deduplication
- **Stage 2 (AI Social SEO Assistant):**
  - Task 36: Provider-independent AI SEO Assistant (`AI_MODEL` configurable, Gemini/OpenAI/Anthropic + free local Heuristic fallback, explicit provenance labels, no virality claims)
- **Stage 3 (Server-Generated PDF Reporting):**
  - Task 37: Server-side PDF 1.4 Report Generator (`ReportService`) and authorized `/api/reports/export` endpoint with source attribution, metric definitions, and unavailable-data markers
- **Verification & CI:**
  - Task 38: Comprehensive Phase 6C regression & integration test suite (`src/test-phase-6c.ts`) wired into `.github/workflows/ci.yml`

---

## Risks and Mitigations
| Risk | Impact | Mitigation |
| :--- | :--- | :--- |
| External Social APIs (Meta, X) require paid or business verification | High | Dual-mode Mock Provider Engine ensures 100% functionality and testing with zero external costs |
| Redis not installed on local developer machine | Med | Hybrid scheduler: runs in-app interval dispatcher locally, with BullMQ configured for production Redis |
| Video transcoding/processing complexity | Med | Direct URL uploads and client-side HTML5 video/image preview validation before dispatch |

---

## Open Questions & Review
- Any specific mock brand or preset profile you'd like loaded by default (e.g. "Acme Media" with pre-connected YouTube, Instagram, and X accounts)?
