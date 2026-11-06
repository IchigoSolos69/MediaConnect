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
- [ ] End-to-end flow verified from connection to scheduling, SEO optimization, and analytics
- [ ] Zero runtime console errors, clean build, and 100% free local execution

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
