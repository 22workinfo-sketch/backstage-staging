import crypto from "crypto";
import { prisma } from "./prisma";

export interface CreateTelegramAssetInput {
  botId: string;
  telegramFileId: string;
  telegramFileUniqueId: string;
  sourceChatId: string;
  sourceMessageId: number;
  forwardFromChatId?: string;
  forwardFromMessageId?: number;
  forwardFromChatTitle?: string;
  forwardSenderName?: string;
  fileType?: string;
  mimeType?: string;
  fileName?: string;
  fileSizeBytes?: bigint | number;
  duration?: number;
  width?: number;
  height?: number;
  originalCaption?: string;
  senderTelegramId: bigint | number;
  senderUsername?: string;
  senderFirstName?: string;
  addedByUserId?: string;
}

/**
 * Checks if a Telegram user is linked to an active Backstage staff user
 * and is authorized to manage the specified bot.
 */
export async function isTelegramUserAuthorizedForBot(
  telegramUserId: bigint | number,
  botId: string
): Promise<{
  authorized: boolean;
  reason?: string;
  adminUser?: {
    id: string;
    email: string;
    role: string;
  };
}> {
  const telegramBigInt = BigInt(telegramUserId);

  const adminUser = await prisma.adminUser.findFirst({
    where: {
      telegramUserId: telegramBigInt,
      isActive: true,
    },
    include: {
      staffAssignments: {
        where: { botId },
      },
    },
  });

  if (!adminUser) {
    return {
      authorized: false,
      reason: "Telegram account is not linked to any active Backstage staff account.",
    };
  }

  if (adminUser.role === "SUPPORT_AGENT") {
    return { authorized: false, reason: "This staff role has support inbox access only." };
  }

  // SuperAdmins and Admins have global access to all bots
  if (adminUser.role === "SUPER_ADMIN" || adminUser.role === "ADMIN") {
    return {
      authorized: true,
      adminUser: {
        id: adminUser.id,
        email: adminUser.email,
        role: adminUser.role,
      },
    };
  }

  // Editors/Staff must have explicit assignment for this bot
  const assignment = adminUser.staffAssignments[0];
  if (!assignment) {
    return {
      authorized: false,
      reason: `Staff account (${adminUser.email}) is not assigned to manage this bot.`,
      adminUser: {
        id: adminUser.id,
        email: adminUser.email,
        role: adminUser.role,
      },
    };
  }

  return {
    authorized: true,
    adminUser: {
      id: adminUser.id,
      email: adminUser.email,
      role: adminUser.role,
    },
  };
}

/**
 * Generates a temporary 6-digit verification code for a staff user to link
 * their Telegram identity by sending "/link <code>" to any managed bot.
 */
export async function generateStaffTelegramLinkCode(adminUserId: string): Promise<string> {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

  await prisma.adminUser.update({
    where: { id: adminUserId },
    data: {
      telegramLinkCode: code,
      telegramLinkExpiresAt: expiresAt,
    },
  });

  return code;
}

/**
 * Verifies a link code sent by a Telegram user and associates their Telegram ID
 * with the corresponding AdminUser.
 */
export async function verifyAndLinkTelegramStaff(
  linkCode: string,
  telegramUserId: bigint | number,
  telegramUsername?: string
): Promise<{
  success: boolean;
  message: string;
  adminUser?: { id: string; email: string; role: string };
}> {
  const cleanCode = linkCode.trim();
  const telegramBigInt = BigInt(telegramUserId);

  const admin = await prisma.adminUser.findFirst({
    where: {
      telegramLinkCode: cleanCode,
      telegramLinkExpiresAt: { gt: new Date() },
      isActive: true,
    },
  });

  if (!admin) {
    return {
      success: false,
      message: "Invalid or expired verification code. Generate a fresh code in Botdesk Backstage.",
    };
  }

  // Ensure no other admin is linked to this Telegram ID
  const existingWithId = await prisma.adminUser.findFirst({
    where: {
      telegramUserId: telegramBigInt,
      id: { not: admin.id },
    },
  });

  if (existingWithId) {
    // Unlink old association
    await prisma.adminUser.update({
      where: { id: existingWithId.id },
      data: { telegramUserId: null, telegramUsername: null },
    });
  }

  const updated = await prisma.adminUser.update({
    where: { id: admin.id },
    data: {
      telegramUserId: telegramBigInt,
      telegramUsername: telegramUsername || null,
      telegramLinkCode: null,
      telegramLinkExpiresAt: null,
    },
    select: { id: true, email: true, role: true },
  });

  return {
    success: true,
    message: `Telegram account successfully linked to Backstage admin ${updated.email} (${updated.role}).`,
    adminUser: updated,
  };
}

/**
 * Directly links a Telegram user ID to an AdminUser (used by SuperAdmin in Backstage).
 */
export async function linkStaffTelegramDirectly(
  adminUserId: string,
  telegramUserId: bigint | number,
  telegramUsername?: string
) {
  const telegramBigInt = BigInt(telegramUserId);

  // Clear existing if any
  await prisma.adminUser.updateMany({
    where: {
      telegramUserId: telegramBigInt,
      id: { not: adminUserId },
    },
    data: { telegramUserId: null, telegramUsername: null },
  });

  return prisma.adminUser.update({
    where: { id: adminUserId },
    data: {
      telegramUserId: telegramBigInt,
      telegramUsername: telegramUsername || null,
      telegramLinkCode: null,
      telegramLinkExpiresAt: null,
    },
    select: { id: true, email: true, role: true, telegramUserId: true, telegramUsername: true },
  });
}

/**
 * Stores a received Telegram video asset metadata reference for reuse.
 * Enforces strict bot scoping (asset belongs ONLY to the receiving bot).
 */
export async function storeTelegramVideoAsset(input: CreateTelegramAssetInput) {
  // Check if this exact file_unique_id already exists for this bot
  const existing = await prisma.telegramMediaAsset.findFirst({
    where: {
      botId: input.botId,
      telegramFileUniqueId: input.telegramFileUniqueId,
    },
  });

  const fileSizeBytes = input.fileSizeBytes !== undefined && input.fileSizeBytes !== null
    ? BigInt(input.fileSizeBytes)
    : null;

  if (existing) {
    // Update reference with latest message ID and file_id
    return prisma.telegramMediaAsset.update({
      where: { id: existing.id },
      data: {
        telegramFileId: input.telegramFileId,
        sourceChatId: input.sourceChatId,
        sourceMessageId: input.sourceMessageId,
        originalCaption: input.originalCaption || existing.originalCaption,
        senderTelegramId: BigInt(input.senderTelegramId),
        senderUsername: input.senderUsername || existing.senderUsername,
        senderFirstName: input.senderFirstName || existing.senderFirstName,
        addedByUserId: input.addedByUserId || existing.addedByUserId,
        updatedAt: new Date(),
      },
    });
  }

  return prisma.telegramMediaAsset.create({
    data: {
      botId: input.botId,
      telegramFileId: input.telegramFileId,
      telegramFileUniqueId: input.telegramFileUniqueId,
      sourceChatId: input.sourceChatId,
      sourceMessageId: input.sourceMessageId,
      forwardFromChatId: input.forwardFromChatId,
      forwardFromMessageId: input.forwardFromMessageId,
      forwardFromChatTitle: input.forwardFromChatTitle,
      forwardSenderName: input.forwardSenderName,
      fileType: input.fileType || "VIDEO",
      mimeType: input.mimeType || "video/mp4",
      fileName: input.fileName,
      fileSizeBytes,
      duration: input.duration,
      width: input.width,
      height: input.height,
      originalCaption: input.originalCaption,
      senderTelegramId: BigInt(input.senderTelegramId),
      senderUsername: input.senderUsername,
      senderFirstName: input.senderFirstName,
      addedByUserId: input.addedByUserId,
    },
  });
}

/**
 * Retrieves all Telegram media assets scoped to a specific bot.
 * Only returns assets that belong to the specified botId.
 */
export async function getTelegramMediaAssets(botId: string) {
  const assets = await prisma.telegramMediaAsset.findMany({
    where: { botId },
    orderBy: { createdAt: "desc" },
    include: {
      bot: {
        select: {
          id: true,
          name: true,
          username: true,
        },
      },
      addedByUser: {
        select: {
          id: true,
          email: true,
          role: true,
        },
      },
    },
  });

  // Convert BigInt to number/string for JSON serialization
  return assets.map((a) => ({
    ...a,
    fileSizeBytes: a.fileSizeBytes ? Number(a.fileSizeBytes) : null,
    senderTelegramId: a.senderTelegramId.toString(),
  }));
}

/**
 * Retrieves a single Telegram media asset by ID scoped to botId.
 */
export async function getTelegramMediaAssetById(assetId: string, botId: string) {
  const asset = await prisma.telegramMediaAsset.findFirst({
    where: {
      id: assetId,
      botId,
    },
  });

  if (!asset) return null;

  return {
    ...asset,
    fileSizeBytes: asset.fileSizeBytes ? Number(asset.fileSizeBytes) : null,
    senderTelegramId: asset.senderTelegramId.toString(),
  };
}

/**
 * Deletes a Telegram media asset reference.
 */
export async function deleteTelegramMediaAsset(assetId: string, botId: string) {
  const asset = await prisma.telegramMediaAsset.findFirst({
    where: { id: assetId, botId },
  });

  if (!asset) {
    throw new Error(`Telegram media asset with ID "${assetId}" was not found.`);
  }

  await prisma.telegramMediaAsset.delete({
    where: { id: assetId },
  });

  return { success: true };
}
