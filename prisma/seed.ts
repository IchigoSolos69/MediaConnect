import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // Clean existing data
  await prisma.metricSnapshot.deleteMany();
  await prisma.postTarget.deleteMany();
  await prisma.post.deleteMany();
  await prisma.queueSlot.deleteMany();
  await prisma.competitor.deleteMany();
  await prisma.account.deleteMany();
  await prisma.user.deleteMany();
  await prisma.workspace.deleteMany();

  // 1. Create Workspace
  const workspace = await prisma.workspace.create({
    data: {
      name: "Acme Media",
      slug: "acme-media",
      avatarUrl: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150&auto=format&fit=crop&q=80",
    },
  });

  // 2. Create User
  await prisma.user.create({
    data: {
      email: "admin@mediaconnect.app",
      name: "Adi",
      role: "OWNER",
      workspaceId: workspace.id,
      avatarUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
    },
  });

  // 3. Create Connected Social Accounts (YouTube, Instagram, X)
  const ytAccount = await prisma.account.create({
    data: {
      workspaceId: workspace.id,
      platform: "YOUTUBE",
      platformAccountId: "yt_acme_studios_99",
      username: "@AcmeStudios",
      displayName: "Acme Studios",
      avatarUrl: "https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=150&auto=format&fit=crop&q=80",
      followersCount: 48200,
      followingCount: 142,
      postsCount: 128,
      status: "ACTIVE",
      isMock: true,
    },
  });

  const igAccount = await prisma.account.create({
    data: {
      workspaceId: workspace.id,
      platform: "INSTAGRAM",
      platformAccountId: "ig_acmemedia_01",
      username: "@acmemedia",
      displayName: "Acme Media Official",
      avatarUrl: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150&auto=format&fit=crop&q=80",
      followersCount: 124500,
      followingCount: 520,
      postsCount: 432,
      status: "ACTIVE",
      isMock: true,
    },
  });

  const xAccount = await prisma.account.create({
    data: {
      workspaceId: workspace.id,
      platform: "X",
      platformAccountId: "x_acmemediahq_77",
      username: "@AcmeMediaHQ",
      displayName: "Acme Media HQ",
      avatarUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80",
      followersCount: 89100,
      followingCount: 812,
      postsCount: 1940,
      status: "ACTIVE",
      isMock: true,
    },
  });

  // 4. Create Queue Slots (e.g. Mon-Fri at 09:00, 13:00, 18:00)
  for (let day = 1; day <= 5; day++) {
    for (const time of ["09:00", "13:00", "18:00"]) {
      await prisma.queueSlot.create({
        data: {
          workspaceId: workspace.id,
          dayOfWeek: day,
          time,
        },
      });
    }
  }

  // 5. Seed Historical Metrics (Past 14 days)
  const now = new Date();
  const accounts = [ytAccount, igAccount, xAccount];

  for (let i = 14; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    date.setHours(0, 0, 0, 0);

    for (const account of accounts) {
      const baseImpressions = account.platform === "INSTAGRAM" ? 8500 : account.platform === "X" ? 14200 : 6200;
      const variation = Math.floor(Math.random() * 2000) - 1000;
      const impressions = Math.max(1000, baseImpressions + variation);
      const reach = Math.floor(impressions * 0.78);
      const likes = Math.floor(impressions * 0.045);
      const comments = Math.floor(likes * 0.12);
      const shares = Math.floor(likes * 0.08);
      const clicks = Math.floor(impressions * 0.02);
      const engagements = likes + comments + shares + clicks;

      await prisma.metricSnapshot.create({
        data: {
          accountId: account.id,
          date,
          impressions,
          reach,
          engagements,
          likes,
          comments,
          shares,
          clicks,
          videoViews: account.platform === "YOUTUBE" ? Math.floor(impressions * 0.6) : 0,
          followers: account.followersCount - i * 45,
        },
      });
    }
  }

  // 6. Create Competitors (Metricool benchmarking)
  await prisma.competitor.createMany({
    data: [
      {
        workspaceId: workspace.id,
        platform: "X",
        username: "TechCrunch",
        displayName: "TechCrunch",
        avatarUrl: "https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=150&auto=format&fit=crop&q=80",
        followersCount: 10400000,
        postsCount: 154000,
        engagementRate: 1.8,
      },
      {
        workspaceId: workspace.id,
        platform: "INSTAGRAM",
        username: "wired",
        displayName: "WIRED",
        avatarUrl: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=150&auto=format&fit=crop&q=80",
        followersCount: 1900000,
        postsCount: 6200,
        engagementRate: 2.4,
      },
      {
        workspaceId: workspace.id,
        platform: "YOUTUBE",
        username: "Verge",
        displayName: "The Verge",
        avatarUrl: "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=150&auto=format&fit=crop&q=80",
        followersCount: 3450000,
        postsCount: 3800,
        engagementRate: 4.1,
      },
    ],
  });

  // 7. Create Sample Posts (Published & Upcoming Scheduled)
  // Past Published Post
  const pastDate = new Date(now);
  pastDate.setDate(pastDate.getDate() - 1);
  pastDate.setHours(14, 30, 0, 0);

  const pastPost = await prisma.post.create({
    data: {
      workspaceId: workspace.id,
      title: "🚀 Big Announcement: MediaConnect is Here!",
      content: "Stop wasting hours switching between 5 different social tools. MediaConnect unifies your visual calendar, deep Metricool analytics, and real-time caption SEO into one high-performance dashboard.\n\nWhich feature are you most excited to try? Let us know below! 👇 #SocialMediaMarketing #ContentStrategy #CreatorEconomy",
      status: "PUBLISHED",
      scheduledAt: pastDate,
      publishedAt: pastDate,
      seoScore: 92,
      hookScore: 94,
    },
  });

  await prisma.postTarget.createMany({
    data: [
      {
        postId: pastPost.id,
        accountId: xAccount.id,
        platform: "X",
        status: "PUBLISHED",
        liveUrl: "https://x.com/AcmeMediaHQ/status/mock_1849204192",
        platformPostId: "mock_x_1849204192",
        publishedAt: pastDate,
      },
      {
        postId: pastPost.id,
        accountId: igAccount.id,
        platform: "INSTAGRAM",
        status: "PUBLISHED",
        firstComment: "#MarketingAutomation #SocialMediaGrowth #CreatorTools",
        liveUrl: "https://instagram.com/p/mock_d892kL1",
        platformPostId: "mock_ig_d892kL1",
        publishedAt: pastDate,
      },
      {
        postId: pastPost.id,
        accountId: ytAccount.id,
        platform: "YOUTUBE",
        status: "PUBLISHED",
        videoTitle: "The Ultimate Social Media Automation Platform [Walkthrough]",
        videoTags: "social media, buffer, metricool, marketing automation",
        liveUrl: "https://youtube.com/watch?v=mock_vid_942",
        platformPostId: "mock_yt_vid_942",
        publishedAt: pastDate,
      },
    ],
  });

  // Upcoming Scheduled Post
  const futureDate = new Date(now);
  futureDate.setDate(futureDate.getDate() + 1);
  futureDate.setHours(10, 0, 0, 0);

  const futurePost = await prisma.post.create({
    data: {
      workspaceId: workspace.id,
      title: "3 Subtle SEO Mistakes Killing Your Social Reach",
      content: "Are your posts invisible in TikTok & Instagram search? Most creators overlook these 3 simple keyword placement rules:\n\n1. First 3 seconds spoken text\n2. CamelCase hashtag grouping\n3. Keyword-dense image alt-text\n\nFull guide drops tomorrow! Bookmark this post. 🔖 #SocialSEO #ContentCreator #GrowthHacking",
      status: "SCHEDULED",
      scheduledAt: futureDate,
      seoScore: 88,
      hookScore: 90,
    },
  });

  await prisma.postTarget.createMany({
    data: [
      {
        postId: futurePost.id,
        accountId: xAccount.id,
        platform: "X",
        status: "PENDING",
      },
      {
        postId: futurePost.id,
        accountId: igAccount.id,
        platform: "INSTAGRAM",
        status: "PENDING",
        firstComment: "#SocialMediaStrategy #AlgorithmHacks #SEOForCreators",
      },
    ],
  });

  console.log("✅ Seed completed successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
