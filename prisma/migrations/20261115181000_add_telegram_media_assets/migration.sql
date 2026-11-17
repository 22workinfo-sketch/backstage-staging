-- AlterTable
ALTER TABLE "admin_users" ADD COLUMN "telegramUserId" BIGINT,
ADD COLUMN "telegramUsername" TEXT,
ADD COLUMN "telegramLinkCode" TEXT,
ADD COLUMN "telegramLinkExpiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_telegramUserId_key" ON "admin_users"("telegramUserId");

-- CreateTable
CREATE TABLE "telegram_media_assets" (
    "id" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "telegramFileId" TEXT NOT NULL,
    "telegramFileUniqueId" TEXT NOT NULL,
    "sourceChatId" TEXT NOT NULL,
    "sourceMessageId" INTEGER NOT NULL,
    "forwardFromChatId" TEXT,
    "forwardFromMessageId" INTEGER,
    "forwardFromChatTitle" TEXT,
    "forwardSenderName" TEXT,
    "fileType" TEXT NOT NULL DEFAULT 'VIDEO',
    "mimeType" TEXT NOT NULL DEFAULT 'video/mp4',
    "fileName" TEXT,
    "fileSizeBytes" BIGINT,
    "duration" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "originalCaption" TEXT,
    "senderTelegramId" BIGINT NOT NULL,
    "senderUsername" TEXT,
    "senderFirstName" TEXT,
    "addedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "telegram_media_assets_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "channel_posts" ADD COLUMN "telegramAssetId" TEXT,
ADD COLUMN "telegramFileId" TEXT,
ADD COLUMN "telegramSourceChatId" TEXT,
ADD COLUMN "telegramSourceMessageId" INTEGER,
ADD COLUMN "telegramReuseMethod" TEXT DEFAULT 'SEND_VIDEO',
ADD COLUMN "telegramDuration" INTEGER,
ADD COLUMN "telegramVideoWidth" INTEGER,
ADD COLUMN "telegramVideoHeight" INTEGER;

-- CreateIndex
CREATE INDEX "telegram_media_assets_botId_idx" ON "telegram_media_assets"("botId");

-- CreateIndex
CREATE INDEX "telegram_media_assets_botId_telegramFileUniqueId_idx" ON "telegram_media_assets"("botId", "telegramFileUniqueId");

-- CreateIndex
CREATE INDEX "telegram_media_assets_senderTelegramId_idx" ON "telegram_media_assets"("senderTelegramId");

-- AddForeignKey
ALTER TABLE "telegram_media_assets" ADD CONSTRAINT "telegram_media_assets_botId_fkey" FOREIGN KEY ("botId") REFERENCES "bots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telegram_media_assets" ADD CONSTRAINT "telegram_media_assets_addedByUserId_fkey" FOREIGN KEY ("addedByUserId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_posts" ADD CONSTRAINT "channel_posts_telegramAssetId_fkey" FOREIGN KEY ("telegramAssetId") REFERENCES "telegram_media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
