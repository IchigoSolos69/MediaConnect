import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { TokenVault } from "../src/lib/crypto/vault";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding test database fixtures...");

  // Clean existing data for reproducible testing
  await prisma.rateLimitAttempt.deleteMany();
  await prisma.revokedSession.deleteMany();
  await prisma.metricSnapshot.deleteMany();
  await prisma.postTarget.deleteMany();
  await prisma.post.deleteMany();
  await prisma.queueSlot.deleteMany();
  await prisma.competitor.deleteMany();
  await prisma.account.deleteMany();
  await prisma.workspaceMember.deleteMany();
  await prisma.user.deleteMany();
  await prisma.workspace.deleteMany();

  // 1. Create Primary Workspace (Acme Media)
  const acmeWorkspace = await prisma.workspace.create({
    data: {
      name: "Acme Media",
      slug: "acme-media",
      avatarUrl: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150&auto=format&fit=crop&q=80",
    },
  });

  // 2. Create Secondary Workspace (Beta Agency - Tenant Isolation)
  const betaWorkspace = await prisma.workspace.create({
    data: {
      name: "Beta Agency",
      slug: "beta-agency",
    },
  });

  // 3. Seed Acme Media Social Accounts (with AES-256-GCM Vault encrypted tokens)
  const ytAccount = await prisma.account.create({
    data: {
      workspaceId: acmeWorkspace.id,
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
      tokenKeyVersion: "v1",
    },
  });
  // Encrypt with account.id as AAD
  await prisma.account.update({
    where: { id: ytAccount.id },
    data: {
      accessToken: TokenVault.encrypt("mock_youtube_oauth_token_secret_12345", ytAccount.id, "v1"),
    },
  });

  const igAccount = await prisma.account.create({
    data: {
      workspaceId: acmeWorkspace.id,
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
      tokenKeyVersion: "v1",
    },
  });
  await prisma.account.update({
    where: { id: igAccount.id },
    data: {
      accessToken: TokenVault.encrypt("mock_instagram_oauth_token_secret_67890", igAccount.id, "v1"),
    },
  });

  const xAccount = await prisma.account.create({
    data: {
      workspaceId: acmeWorkspace.id,
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
      tokenKeyVersion: "v1",
    },
  });
  await prisma.account.update({
    where: { id: xAccount.id },
    data: {
      accessToken: TokenVault.encrypt("mock_x_oauth_token_secret_abcdef", xAccount.id, "v1"),
    },
  });

  // Seed Beta Agency Social Account
  const betaAccount = await prisma.account.create({
    data: {
      workspaceId: betaWorkspace.id,
      platform: "X",
      platformAccountId: "beta_x_001",
      username: "@BetaAgencyHQ",
      displayName: "Beta Agency HQ",
      followersCount: 5200,
      status: "ACTIVE",
      isMock: true,
      tokenKeyVersion: "v1",
    },
  });
  await prisma.account.update({
    where: { id: betaAccount.id },
    data: {
      accessToken: TokenVault.encrypt("mock_beta_secret_token", betaAccount.id, "v1"),
    },
  });

  // 4. Seed Role Users (Alice Owner, Bob Approver, Charlie Editor, Dana Beta)
  const defaultPassword = "Password123!";
  const passwordHash = await bcrypt.hash(defaultPassword, 12);

  const testUsers = [
    {
      email: "owner@mediaconnect.app",
      name: "Alice Owner",
      role: "OWNER" as const,
      workspaceId: acmeWorkspace.id,
    },
    {
      email: "approver@mediaconnect.app",
      name: "Bob Approver",
      role: "APPROVER" as const,
      workspaceId: acmeWorkspace.id,
    },
    {
      email: "editor@mediaconnect.app",
      name: "Charlie Editor",
      role: "EDITOR" as const,
      workspaceId: acmeWorkspace.id,
    },
    {
      email: "beta_user@mediaconnect.app",
      name: "Dana Beta",
      role: "OWNER" as const,
      workspaceId: betaWorkspace.id,
    },
  ];

  for (const u of testUsers) {
    const user = await prisma.user.create({
      data: {
        email: u.email,
        name: u.name,
        passwordHash,
        workspaceId: u.workspaceId,
        role: u.role,
        tokenVersion: 1,
      },
    });

    await prisma.workspaceMember.create({
      data: {
        workspaceId: u.workspaceId,
        userId: user.id,
        role: u.role,
      },
    });
  }

  // 5. Create Queue Slots for Acme Media
  for (let day = 1; day <= 5; day++) {
    for (const time of ["09:00", "13:00", "18:00"]) {
      await prisma.queueSlot.create({
        data: {
          workspaceId: acmeWorkspace.id,
          dayOfWeek: day,
          time,
        },
      });
    }
  }

  // 6. Create Competitor Benchmarks
  await prisma.competitor.createMany({
    data: [
      {
        workspaceId: acmeWorkspace.id,
        platform: "INSTAGRAM",
        username: "@hootsuite",
        displayName: "Hootsuite",
        followersCount: 940000,
        postsCount: 3820,
        engagementRate: 1.84,
      },
      {
        workspaceId: acmeWorkspace.id,
        platform: "INSTAGRAM",
        username: "@sproutsocial",
        displayName: "Sprout Social",
        followersCount: 320000,
        postsCount: 2150,
        engagementRate: 2.12,
      },
    ],
  });

  console.log("✓ Fixtures seeded successfully: Acme Media (3 accounts), Beta Agency (1 account), 4 users with RBAC.");
}

main()
  .catch((e) => {
    console.error("Seeding failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
