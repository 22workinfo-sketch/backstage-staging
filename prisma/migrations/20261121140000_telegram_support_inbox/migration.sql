-- AlterTable
ALTER TABLE "bots" ADD COLUMN     "supportInboxEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "support_conversations" (
    "id" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "username" TEXT,
    "ownerId" TEXT,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_messages" (
    "id" BIGSERIAL NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "telegramMessageId" INTEGER,
    "updateId" BIGINT,
    "attachmentId" TEXT,
    "attachmentName" TEXT,
    "clientKey" TEXT,
    "parts" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sentParts" INTEGER NOT NULL DEFAULT 0,
    "lastSentMessageId" INTEGER,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimId" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "support_conversations_botId_lastActivityAt_id_idx" ON "support_conversations"("botId", "lastActivityAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "support_conversations_botId_chatId_key" ON "support_conversations"("botId", "chatId");

-- CreateIndex
CREATE INDEX "support_messages_conversationId_id_idx" ON "support_messages"("conversationId", "id");

-- CreateIndex
CREATE INDEX "support_messages_status_availableAt_id_idx" ON "support_messages"("status", "availableAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "support_messages_conversationId_telegramMessageId_key" ON "support_messages"("conversationId", "telegramMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "support_messages_conversationId_clientKey_key" ON "support_messages"("conversationId", "clientKey");

-- AddForeignKey
ALTER TABLE "support_conversations" ADD CONSTRAINT "support_conversations_botId_fkey" FOREIGN KEY ("botId") REFERENCES "bots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_conversations" ADD CONSTRAINT "support_conversations_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "support_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
