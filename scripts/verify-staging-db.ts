import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const tables = await prisma.$queryRaw<Array<{ count: number }>>`
    SELECT count(*)::int as count 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name != '_prisma_migrations'
  `;
  const adminCount = await prisma.adminUser.count();
  const botsCount = await prisma.bot.count();

  console.log("✓ Public application tables created:", tables[0]?.count ?? 0);
  console.log("✓ Active Super-Admin accounts:", adminCount);
  console.log("✓ Bot records in database:", botsCount);
}

main()
  .catch((e) => {
    console.error("[Verification Error]", e instanceof Error ? e.message : "Query failed");
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
