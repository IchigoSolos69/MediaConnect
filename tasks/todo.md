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
  - [ ] Main dashboard layout with sidebar navigation (Planner, Analytics, SEO Studio, Channels, Settings).
  - [ ] Top bar with active workspace badge and brand switcher dropdown.
  - [ ] Dashboard overview page summarizing scheduled posts and account health.
- **Verification:** Manual check of layout, navigation, and workspace switching.
- **Files:** `src/components/layout/*.tsx`, `src/app/(dashboard)/layout.tsx`, `src/app/(dashboard)/page.tsx`
- **Scope:** M

### Task 5: Social Channel Connection Hub
- **Description:** Build the Connected Accounts management interface supporting 1-click mock connection and live OAuth configuration for YouTube, Instagram, and X.
- **Acceptance criteria:**
  - [ ] Channels page displaying connection cards for YouTube, Instagram, and X.
  - [ ] 1-Click "Connect Mock Account" button linking an account immediately with profile avatar and follower count.
  - [ ] Disconnect/reconnect functionality and account status badges (Active, Token Expired).
- **Verification:** Connecting and disconnecting accounts updates database and UI immediately.
- **Files:** `src/app/(dashboard)/channels/page.tsx`, `src/components/channels/*.tsx`, `src/app/api/accounts/route.ts`
- **Scope:** M

### Checkpoint: Workspace & Accounts Complete
- [ ] Connected channels display in real time with operational status

---

## Phase 3: Visual Calendar, Queue & Publisher

### Task 6: Multi-Channel Post Composer
- **Description:** Build modal/panel composer allowing users to write copy, attach media, select target channels, and tailor platform-specific fields (YouTube title/tags, Instagram reel/caption, X thread/char counter).
- **Acceptance criteria:**
  - [ ] Multi-channel selector (YouTube, Instagram, X toggles).
  - [ ] Platform-specific tab views for custom captions and overrides.
  - [ ] Live character counters with platform limits (280 for X, 2,200 for Instagram, 5,000 for YouTube).
  - [ ] Image/video preview support.
- **Verification:** Saving a post creates record in database with individual `PostTarget` entries.
- **Files:** `src/components/composer/*.tsx`, `src/app/api/posts/route.ts`
- **Scope:** M

### Task 7: Drag-and-Drop Visual Calendar & Queue Manager
- **Description:** Interactive monthly and weekly calendar displaying scheduled posts, with drag-and-drop rescheduling and Buffer-style fixed queue time slots.
- **Acceptance criteria:**
  - [ ] Visual calendar view showing scheduled posts colored by platform icon.
  - [ ] Drag-and-drop or click-to-reschedule date & time.
  - [ ] Queue slot configuration (e.g., auto-schedule into the next open slot).
- **Verification:** Moving a post on the calendar updates its scheduled time in the database.
- **Files:** `src/app/(dashboard)/planner/page.tsx`, `src/components/planner/*.tsx`
- **Scope:** M

### Task 8: Scheduling Dispatcher & In-App Runner
- **Description:** Build background publisher that polls for due posts, calls target provider `publishPost()`, and updates status from `SCHEDULED` to `PUBLISHED` (or `FAILED` with error log).
- **Acceptance criteria:**
  - [ ] Dispatcher service checks for posts where `scheduledAt <= now` and status is `SCHEDULED`.
  - [ ] Calls provider `publishPost()` for each target account.
  - [ ] Status updates to `PUBLISHED` with simulated or live post URL.
  - [ ] Manual "Publish Now" button for instant testing.
- **Verification:** Scheduled post automatically transitions to `PUBLISHED` upon trigger.
- **Files:** `src/services/publisher.service.ts`, `src/app/api/posts/dispatch/route.ts`
- **Scope:** M

### Checkpoint: Publishing Flow Complete
- [ ] End-to-end post creation, calendar scheduling, and automated publishing verified

---

## Phase 4: Social SEO Studio & Content Assistant

### Task 9: Real-Time Caption & Hook SEO Grader
- **Description:** Implement scoring algorithm evaluating caption hooks (curiosity gap, question triggers, power words), character density, and visual preview of mobile "See more" fold cutoff.
- **Acceptance criteria:**
  - [ ] Hook score calculator (0 to 100) with actionable tips ("Add an opening question", "Shorten first sentence").
  - [ ] Mobile preview showing exactly where text will be truncated on Instagram/X.
  - [ ] Standalone `/seo-studio` tool and integrated side-panel inside Composer.
- **Verification:** Unit test for `seo.service.ts` scoring logic.
- **Files:** `src/services/seo.service.ts`, `src/components/seo/*.tsx`, `src/app/(dashboard)/seo-studio/page.tsx`
- **Scope:** M

### Task 10: CamelCase Hashtag Optimizer & Image Alt-Text Generator
- **Description:** Tool that converts raw hashtags into accessible CamelCase, classifies tags by volume tier, and generates keyword-rich alt-text for image accessibility and search indexing.
- **Acceptance criteria:**
  - [ ] CamelCase formatter converts `#digitalmarketingstrategy` to `#DigitalMarketingStrategy`.
  - [ ] Hashtag category badge display (High Volume, Niche, Trending).
  - [ ] Image alt-text generator incorporating target keywords.
- **Verification:** User enters comma-separated hashtags and receives formatted, tagged recommendations.
- **Files:** `src/components/seo/HashtagOptimizer.tsx`, `src/components/seo/AltTextAssistant.tsx`
- **Scope:** S

### Checkpoint: SEO Studio Complete
- [ ] Live SEO feedback and formatting components functional

---

## Phase 5: Metricool-Style Analytics & Intelligence

### Task 11: Cross-Channel Performance Dashboard
- **Description:** Interactive dashboard displaying aggregated and per-network metrics: Impressions, Reach, Engagement Rate, and Follower Net Growth with time-range filtering.
- **Acceptance criteria:**
  - [ ] KPI cards for total impressions, engagements, clicks, followers.
  - [ ] Time-series line/bar charts for reach and follower growth.
  - [ ] Network filter (All, YouTube, Instagram, X).
- **Verification:** Changing network or date filter updates displayed analytics graphs.
- **Files:** `src/app/(dashboard)/analytics/page.tsx`, `src/components/analytics/*.tsx`, `src/services/analytics.service.ts`
- **Scope:** M

### Task 12: 24x7 "Best Time to Post" Heatmap & Competitor Benchmarking
- **Description:** Metricool-signature 24x7 heatmap highlighting optimal posting hours based on audience online activity, plus competitor profile tracker.
- **Acceptance criteria:**
  - [ ] Interactive 7-day x 24-hour heatmap matrix with color intensity corresponding to audience activity.
  - [ ] Clickable heatmap cell to directly schedule a post at that optimal time slot.
  - [ ] Competitor tracking widget comparing follower growth and post frequency.
- **Verification:** Heatmap renders 168 hourly cells correctly and clicking a cell opens composer pre-filled with that time.
- **Files:** `src/components/analytics/AudienceHeatmap.tsx`, `src/components/analytics/CompetitorTracker.tsx`
- **Scope:** M

### Task 13: Exportable Client Reports & Verification
- **Description:** Generate client-ready printable/PDF summary reports and perform end-to-end audit of all features.
- **Acceptance criteria:**
  - [ ] "Export Report" button generating a clean printable/PDF layout with brand logo and date range.
  - [ ] All tests passing, zero TypeScript/build errors.
- **Verification:** `npm run build` succeeds; full user journey verified without errors.
- **Files:** `src/components/analytics/ReportView.tsx`
- **Scope:** S

### Final Checkpoint: Project Complete & Verified
- [ ] End-to-end verification completed
