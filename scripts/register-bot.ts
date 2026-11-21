import { prisma } from "../src/lib/prisma";
import { encryptBotToken, maskBotToken, validateTelegramTokenFormat, verifyTelegramToken } from "../src/lib/token-encryption";

async function main() {
  const args = process.argv.slice(2);
  let name = "";
  let token = "";
  let username = "";
  let supportInbox = true;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--name" && args[i + 1]) name = args[++i];
    else if (args[i] === "--token" && args[i + 1]) token = args[++i];
    else if (args[i] === "--username" && args[i + 1]) username = args[++i];
  }

  if (!name || !token) {
    console.error("Usage: npx tsx scripts/register-bot.ts --name \"Myan Service\" --token \"<BotFather-Token>\" [--username \"<BotUsername>\"]");
    process.exit(1);
  }

  const formatCheck = validateTelegramTokenFormat(token);
  if (!formatCheck.isValid) {
    console.error("Invalid token format:", formatCheck.error);
    process.exit(1);
  }

  console.log(`[Register Bot] Validating token for "${name}"...`);

  let botIdStr = "";
  let botUsername = username;

  // 1. Try Telegram getMe API
  const verifyRes = await verifyTelegramToken(token);
  if (verifyRes.ok && verifyRes.botId && verifyRes.username) {
    botIdStr = verifyRes.botId;
    botUsername = verifyRes.username;
    console.log(`[Register Bot] Successfully verified with Telegram: @${botUsername} (ID: ${botIdStr})`);
  } else {
    console.warn(`[Register Bot] Warning: Direct Telegram verification failed (${verifyRes.error}).`);
    // Extract bot ID from token prefix: "<botId>:<hash>"
    const extractedId = token.split(":")[0];
    if (/^\d{8,14}$/.test(extractedId)) {
      botIdStr = extractedId;
      if (!botUsername) {
        console.error("Telegram API is currently unreachable from this network (e.g. ISP block without VPN).");
        console.error("Please provide the bot username using: --username \"<BotUsername>\"");
        process.exit(1);
      }
      console.log(`[Register Bot] Using extracted Telegram Bot ID: ${botIdStr}, username: @${botUsername}`);
    } else {
      console.error("Could not determine bot ID from token.");
      process.exit(1);
    }
  }

  const telegramBotId = BigInt(botIdStr);

  // 2. Check if already exists
  const existing = await prisma.bot.findUnique({
    where: { telegramBotId },
  });

  const encryptedToken = encryptBotToken(token);
  const tokenLast4 = maskBotToken(token);

  if (existing) {
    console.log(`[Register Bot] Bot with ID ${botIdStr} already exists as "${existing.name}". Updating token & settings...`);
    const updated = await prisma.bot.update({
      where: { id: existing.id },
      data: {
        name,
        username: botUsername.replace(/^@/, ""),
        encryptedToken,
        tokenLast4,
        isActive: true,
        supportInboxEnabled: supportInbox,
        connectionStatus: "CONNECTED",
        lastCheckedAt: new Date(),
        lastError: null,
      },
    });
    console.log(`✅ Bot "${updated.name}" (@${updated.username}) updated successfully!`);
  } else {
    const created = await prisma.bot.create({
      data: {
        name,
        username: botUsername.replace(/^@/, ""),
        telegramBotId,
        encryptedToken,
        tokenLast4,
        isActive: true,
        supportInboxEnabled: supportInbox,
        connectionStatus: "CONNECTED",
        lastCheckedAt: new Date(),
      },
    });
    await prisma.botConfig.create({
      data: {
        botId: created.id,
        welcomeMessage: `Welcome to ${name}! Support team is available here.`,
      },
    });
    console.log(`✅ Bot "${created.name}" (@${created.username}) registered successfully with ID: ${created.id}`);
  }

  await prisma.$disconnect();
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
