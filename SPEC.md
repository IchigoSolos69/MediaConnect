# Spec: MediaConnect (Buffer + Metricool + Social SEO Hybrid)

## 1. Objective
MediaConnect is an all-in-one social media management, visual scheduling, analytics, and content SEO platform that unifies:
1. **Buffer-style frictionless publishing:** Drag-and-drop visual calendar, multi-account queue slots, per-platform customization, and approval workflows.
2. **Metricool-style deep intelligence:** Cross-channel metrics, best-time-to-post heatmaps, competitor benchmarking, and white-label client PDF/CSV reports.
3. **Social SEO & AI Suite:** Real-time caption scoring, hook strength grader, hashtag volume & CamelCase formatter, character cutoff previews ("See more"), and platform-native AI repurposer.
4. **Zero-Cost & Free-Tier First:** Fully functional local development and testing without paid API tiers (Twitter Basic $100/mo, etc.) via a robust Mock Adapter Layer that mirrors live API contracts for **YouTube**, **Instagram**, and **X (Twitter)**.

---

## 2. Tech Stack & Platform Constraints

| Component | Technology | Operational Reality & Free Tier Strategy |
| :--- | :--- | :--- |
| **Framework** | Next.js 15 (App Router, React 19, TypeScript) | Open Source (MIT) |
| **Styling & UI** | Tailwind CSS v4, Lucide React | Open Source |
| **Authentication** | Auth.js (NextAuth v5) + bcryptjs | Secure server-side session cookies, separate from social OAuth |
| **Token Vault** | AES-256-GCM + Key Versioning | Authenticated encryption with unique IV per record, zero plaintext exposure |
| **Database** | PostgreSQL + Prisma ORM | SQLite locally ($0) / Neon / Supabase free tier in production |
| **Queue & Scheduling** | Upstash QStash / BullMQ + Redis | Local interval runner ($0) / Upstash free tier (500 cron msgs/day) |
| **Storage** | Cloudflare R2 / S3 Presigned URLs | 10 GB free tier on Cloudflare R2 |
| **AI & SEO Engine** | Configurable LLM (Google Gemini / OpenAI) | Configurable model identifier (`GEMINI_MODEL`, e.g. `gemini-1.5-flash`) |
| **Social Adapters** | Dual Mode: Mock Sandbox Engine + Live OAuth | **YouTube:** 100 `videos.insert` calls/day under current quota rules.<br>**Instagram:** Evaluates both Instagram Login (no FB page required) and Facebook Login.<br>**X (Twitter):** Consumption-based pricing (~$0.015/post creation). Mock mode default; requires explicit billing authorization before paid calls. |

---

## 3. System Architecture & Social Provider Abstraction

```
 ┌─────────────────────────────────────────────────────────────┐
 │                      Next.js 15 App                         │
 │     (App Router, Server Actions, Route Handlers, UI)        │
 └──────────────┬──────────────────────────────┬───────────────┘
                │                              │
        ┌───────▼────────┐             ┌───────▼────────┐
        │ Prisma Service │             │ Social Adapter │
        │ (Postgres DB)  │             │   (Protocol)   │
        └────────────────┘             └───────┬────────┘
                                               │
                       ┌───────────────────────┴───────────────────────┐
                       │                                               │
             ┌─────────▼──────────┐                         ┌──────────▼─────────┐
             │ MockSandboxAdapter │                         │ RealSocialAdapter  │
             │ (Instant, Free,    │                         │ (YouTube Data API, │
             │  Offline Capable)  │                         │  Meta Graph API,   │
             │                    │                         │  X API v2)         │
             └────────────────────┘                         └────────────────────┘
```

### Social Provider Contract (`ISocialProvider`)
Every provider (YouTube, Instagram, X) implements a unified interface:
- `getAuthUrl(state: string): Promise<string>`
- `exchangeCode(code: string): Promise<TokenResult>`
- `refreshToken(refreshToken: string): Promise<TokenResult>`
- `publishPost(account: ConnectedAccount, post: ScheduledPost): Promise<PublishResult>`
- `fetchInsights(account: ConnectedAccount, timeRange: TimeRange): Promise<InsightsResult>`
- `fetchAudienceActivity(account: ConnectedAccount): Promise<HeatmapData>`

---

## 4. Key Functional Modules

### M1: Workspaces, Security & Authentication (`/workspace`)
- **Authentication:** Auth.js (NextAuth v5) with secure session validation. Application auth is strictly isolated from social-provider OAuth credentials.
- **Explicit Multi-Tenancy:** Users access resources solely through verified `WorkspaceMember` records. Client-provided workspace IDs are never trusted blindly.
- **Role-Based Access Control (RBAC):**
  | Action | OWNER | APPROVER | EDITOR |
  | :--- | :---: | :---: | :---: |
  | Manage Workspace & Members | ✅ | ❌ | ❌ |
  | Connect / Disconnect Social Accounts | ✅ | ❌ | ❌ |
  | Create Draft Posts | ✅ | ✅ | ✅ |
  | Edit Own Drafts | ✅ | ✅ | ✅ |
  | Edit All Posts | ✅ | ✅ | ❌ |
  | Submit Post for Approval | ✅ | ✅ | ✅ |
  | Approve / Reject Posts | ✅ | ✅ | ❌ |
  | Publish Post Immediately | ✅ | ✅ | ❌ |
  | View Analytics & Heatmaps | ✅ | ✅ | ✅ |
  | Export White-Label Client Reports | ✅ | ✅ | ❌ |
- **Token Vault:** AES-256-GCM encryption with unique 12-byte IV per token, 16-byte authenticated authTag, key versioning (`v1:<iv>:<ciphertext>:<tag>`), and automatic rotation support. Plaintext tokens are stripped from all API responses.

### M2: Visual Planner & Calendar (`/planner`)
- Monthly, weekly, and daily calendar views.
- Queue management: configure specific time slots per day/platform (e.g. 9:00 AM, 1:15 PM, 6:00 PM).
- Multi-network composer:
  - Base post editor with media attachments.
  - Platform tabs to override copy/hashtags specifically for YouTube (video title, description, tags), Instagram (feed/reel, first comment), and X (thread support, 280-char counter).
- Draft, Scheduled, Publishing, and Published statuses with error retry.

### M3: Social SEO & Content Optimizer (`/seo-studio`)
- **Hook Analyzer:** Scores opening lines based on curiosity gap, urgency, and direct addressing.
- **Platform Character & Truncation Preview:** Real-time preview showing exactly where "See more" or fold cuts off on mobile screens.
- **Hashtag Optimizer:** Automatically converts tags to accessible CamelCase (`#SocialMediaTips`), categorizes tags by reach tier (Broad, Niche, Community), and flags banned/spam tags.
- **Alt-Text Keyword Generator:** Generates descriptive image alt-text embedding target search keywords for Google and in-app search engines.
- **AI Repurposer:** Converts a single topic into 3 platform-tailored variations (YouTube script/description, Instagram carousel/caption, X thread).

### M4: Analytics & Metricool-Style Intelligence (`/analytics`)
- Cross-platform metrics summary: Impressions, Engagements, Clicks, Followers growth.
- **Audience Activity Heatmap:** 24x7 matrix highlighting the exact hours with highest follower activity to optimize post times.
- Top performing posts matrix sorted by engagement rate.
- Competitor profile tracker: compare follower growth and posting frequency against up to 5 competitors.

---

## 5. Commands
- **Dev Server:** `npm run dev`
- **Build:** `npm run build`
- **Lint:** `npm run lint`
- **Database Studio:** `npx prisma studio`
- **Database Migration:** `npx prisma db push` / `npx prisma migrate dev`
- **Run Tests:** `npm test`

---

## 6. Project Structure

```
MediaConnect/
├── prisma/
│   └── schema.prisma            # Models: User, Workspace, Account, Post, PostTarget, Metric, Competitor
├── src/
│   ├── app/                     # Next.js 15 App Router
│   │   ├── (auth)/              # Login, register, onboarding
│   │   ├── (dashboard)/         # Protected application layout
│   │   │   ├── page.tsx         # Dashboard overview
│   │   │   ├── planner/         # Calendar & visual queue
│   │   │   ├── analytics/       # Cross-channel metrics & heatmaps
│   │   │   ├── seo-studio/      # Caption optimizer & hashtag tools
│   │   │   └── settings/        # Workspace & connected channels
│   │   └── api/                 # REST endpoints & webhooks
│   │       ├── auth/            # Auth & OAuth callbacks
│   │       ├── posts/           # CRUD, scheduling, queue trigger
│   │       ├── analytics/       # Sync & aggregation queries
│   │       └── seo/             # Scoring & AI assistant endpoints
│   ├── components/              # Shared UI components
│   │   ├── ui/                  # Radix/Tailwind core atoms (buttons, dialogs, inputs)
│   │   ├── planner/             # Calendar grid, composer modal, timeline queue
│   │   ├── analytics/           # Metric cards, charts, activity heatmaps
│   │   └── seo/                 # Live SEO score card, hook meter, hashtag picker
│   ├── lib/                     # Utilities, database client, auth config
│   │   ├── db.ts                # Prisma singleton instance
│   │   └── utils.ts             # Formatting, date helpers
│   ├── providers/               # Social Provider implementations
│   │   ├── types.ts             # ISocialProvider interface
│   │   ├── mock/                # Mock adapters (YouTube, Instagram, X)
│   │   └── live/                # Real API adapters (YouTube, Instagram, X)
│   ├── services/                # Domain business logic
│   │   ├── publisher.service.ts # Scheduling queue & dispatch logic
│   │   ├── seo.service.ts       # Algorithmic SEO & hook evaluator
│   │   └── analytics.service.ts # Aggregation & heatmap computation
│   └── types/                   # Shared TypeScript definitions
├── public/                      # Static assets & platform logos
├── tasks/                       # Task breakdown & plan files
└── SPEC.md                      # Canonical Project Specification
```

---

## 7. Code Style & Engineering Guidelines
- **Strict TypeScript:** No `any`. All schemas validated via Zod.
- **Server/Client Boundary:** Default to Server Components; use `'use client'` only for interactive controls (calendar drag/drop, live composer inputs, chart interactions).
- **Safe Decomposition:** Files adhere to $\le$ 400 lines of code; domain logic isolated in `src/services/` and `src/providers/`, not bloated inside API routes or UI components.
- **Fail Gracefully:** Mock fallback enabled when live credentials are absent or fail.

---

## 8. Boundaries
- **Always:** Use typed social provider interfaces; ensure posts have transactional status tracking (`DRAFT` $\rightarrow$ `SCHEDULED` $\rightarrow$ `PUBLISHING` $\rightarrow$ `PUBLISHED` / `FAILED`).
- **Ask First:** Introducing external paid services, changing database schema primitives, or modifying multi-tenant workspace isolation.
- **Never:** Commit secret API keys or OAuth secrets to git; hardcode platform limits in UI components (use `src/lib/constants/platforms.ts`).

---

## 9. Success Criteria
1. User can switch between mock and live modes seamlessly.
2. User can compose a post, see real-time Social SEO score, live preview for YouTube/Instagram/X, and schedule it on the visual calendar.
3. Queue worker accurately transitions scheduled posts to published state.
4. Analytics page renders real-time engagement charts and the 24x7 "Best Time to Post" heatmap.
5. 100% runnable locally for free without external paid API subscriptions.
