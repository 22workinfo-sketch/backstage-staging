import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const adminEmail = (process.env.ADMIN_DEFAULT_EMAIL || "").toLowerCase().trim();
  const adminPassword = process.env.ADMIN_DEFAULT_PASSWORD || "";

  if (!adminEmail || !adminEmail.includes("@")) {
    console.error("[Error] A valid ADMIN_DEFAULT_EMAIL is required.");
    process.exit(1);
  }

  if (!adminPassword || adminPassword.length < 10) {
    console.error("[Error] ADMIN_DEFAULT_PASSWORD must be at least 10 characters long.");
    process.exit(1);
  }

  const salt = await bcrypt.genSalt(12);
  const passwordHash = await bcrypt.hash(adminPassword, salt);

  const admin = await prisma.adminUser.upsert({
    where: { email: adminEmail },
    create: {
      email: adminEmail,
      passwordHash,
      role: "SUPER_ADMIN",
      isActive: true,
    },
    update: {
      passwordHash,
      isActive: true,
      updatedAt: new Date(),
    },
  });

  console.log(`[Success] Staging Super-Admin account verified: ${admin.email}`);
  console.log("[Info] No placeholder bots or dummy configurations were created.");
}

main()
  .catch((e) => {
    console.error("[Admin Setup Error]", e instanceof Error ? e.message : "Creation failed");
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
