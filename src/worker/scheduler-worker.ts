import crypto from "crypto";
import fs from "fs";
import dotenv from "dotenv";

if (fs.existsSync(".env.local")) {
  dotenv.config({ path: ".env.local" });
}
dotenv.config();

import {
  recoverStalledScheduledPosts,
  claimDueScheduledPosts,
  executeClaimedScheduledPost,
} from "../lib/post-service";
import { deliverInboxReplies } from "../lib/inbox/delivery";
import { redactTokens } from "../lib/token-encryption";

export interface SchedulerWorkerOptions {
  workerId?: string;
  pollIntervalMs?: number;
  maxPollIntervalMs?: number;
  inboxPollIntervalMs?: number;
  inboxMaxPollIntervalMs?: number;
  batchSize?: number;
  leaseDurationMs?: number;
  maxRetries?: number;
  recoverStalled?: boolean;
  customApi?: any;
}

/**
 * Executes a single complete cycle of the post scheduler:
 * 1. Recovers stalled SENDING leases (crash resilience).
 * 2. Atomically claims due posts.
 * 3. Dispatches claimed posts to Telegram channels.
 */
export async function runSchedulerCycle(options?: SchedulerWorkerOptions): Promise<{
  recoveredCount: number;
  claimedCount: number;
  dispatchedSuccess: number;
  dispatchedFailed: number;
}> {
  const workerId =
    options?.workerId ||
    `worker-${process.pid}-${crypto.randomBytes(4).toString("hex")}`;
  const batchSize = options?.batchSize || 10;
  const leaseDurationMs = options?.leaseDurationMs || 120000;
  const maxRetries = options?.maxRetries || 3;

  // 1. Recover stalled leases from crashed workers (can be throttled by background worker loop)
  let recoveredCount = 0;
  if (options?.recoverStalled !== false) {
    const recovered = await recoverStalledScheduledPosts({
      maxRetries,
    });
    recoveredCount = recovered.recoveredCount;

    if (recoveredCount > 0) {
      console.log(
        `[Scheduler Worker] Reclaimed ${recoveredCount} stalled post lease(s).`
      );
    }
  }

  // 2. Atomically claim due posts
  const claimedPostIds = await claimDueScheduledPosts({
    workerId,
    batchSize,
    leaseDurationMs,
  });

  let dispatchedSuccess = 0;
  let dispatchedFailed = 0;

  // 3. Process claimed posts
  for (const postId of claimedPostIds) {
    try {
      console.log(
        `[Scheduler Worker] Dispatching scheduled post "${postId}" (Worker: ${workerId})...`
      );
      const result = await executeClaimedScheduledPost(
        postId,
        workerId,
        options?.customApi
      );

      if (result.success) {
        dispatchedSuccess++;
        console.log(
          `[Scheduler Worker] Successfully published post "${postId}" (Telegram Msg #${result.messageId}).`
        );
      } else {
        dispatchedFailed++;
        console.warn(
          `[Scheduler Worker] Post "${postId}" dispatch ended in ${result.status}: ${redactTokens(result.error || "Unknown error")}`
        );
      }
    } catch (err: any) {
      dispatchedFailed++;
      console.error(
        `[Scheduler Worker] Unexpected error dispatching post "${postId}":`,
        redactTokens(err?.message || String(err))
      );
    }
  }

  return {
    recoveredCount,
    claimedCount: claimedPostIds.length,
    dispatchedSuccess,
    dispatchedFailed,
  };
}

/**
 * Starts a continuous scheduler background worker process with adaptive idle backoff
 * so Postgres compute can scale to zero / minimize egress when queues are empty.
 */
export async function startSchedulerWorker(options?: SchedulerWorkerOptions): Promise<{
  stop: () => Promise<void>;
}> {
  const basePostPollMs =
    options?.pollIntervalMs || Number(process.env.SCHEDULER_POLL_INTERVAL_MS) || 15000;
  const maxPostPollMs = Math.max(
    basePostPollMs,
    options?.maxPollIntervalMs || Number(process.env.SCHEDULER_POLL_MAX_INTERVAL_MS) || 60000
  );
  const baseInboxPollMs =
    options?.inboxPollIntervalMs || Number(process.env.INBOX_POLL_INTERVAL_MS) || 1500;
  const maxInboxPollMs = Math.max(
    baseInboxPollMs,
    options?.inboxMaxPollIntervalMs || Number(process.env.INBOX_POLL_MAX_INTERVAL_MS) || 15000
  );

  const workerId =
    options?.workerId ||
    `worker-${process.pid}-${crypto.randomBytes(4).toString("hex")}`;

  let isRunning = true;
  let isCycleActive = false;
  let inboxBusy = false;
  let postIdleStreak = 0;
  let inboxIdleStreak = 0;
  let lastPostRecoveryAt = 0;
  let lastInboxRecoveryAt = 0;
  let postTimer: NodeJS.Timeout | null = null;
  let inboxTimer: NodeJS.Timeout | null = null;

  console.log(
    `[Scheduler Worker] Initializing worker "${workerId}" (Posts: ${basePostPollMs}..${maxPostPollMs}ms, Inbox: ${baseInboxPollMs}..${maxInboxPollMs}ms)...`
  );

  const nextPostDelayMs = () => {
    if (postIdleStreak <= 0) return Math.min(basePostPollMs, 5000);
    return Math.min(maxPostPollMs, basePostPollMs * Math.pow(2, Math.min(postIdleStreak - 1, 3)));
  };

  const nextInboxDelayMs = () => {
    if (inboxIdleStreak <= 0) return baseInboxPollMs;
    if (inboxIdleStreak === 1) return Math.min(maxInboxPollMs, baseInboxPollMs * 2);
    if (inboxIdleStreak === 2) return Math.min(maxInboxPollMs, baseInboxPollMs * 4);
    if (inboxIdleStreak === 3) return Math.min(maxInboxPollMs, baseInboxPollMs * 7);
    return maxInboxPollMs;
  };

  const tickPosts = async () => {
    if (!isRunning || isCycleActive) return;
    isCycleActive = true;
    try {
      const now = Date.now();
      const shouldRecover = now - lastPostRecoveryAt >= 60000;
      if (shouldRecover) lastPostRecoveryAt = now;

      const res = await runSchedulerCycle({
        ...options,
        workerId,
        recoverStalled: shouldRecover,
      });
      if (res.claimedCount > 0 || res.recoveredCount > 0) {
        postIdleStreak = 0;
      } else {
        postIdleStreak += 1;
      }
    } catch (err) {
      postIdleStreak += 1;
      console.error(
        "[Scheduler Worker] Uncaught cycle error:",
        redactTokens(err instanceof Error ? err.message : String(err))
      );
    } finally {
      isCycleActive = false;
      if (isRunning) {
        postTimer = setTimeout(() => void tickPosts(), nextPostDelayMs());
      }
    }
  };

  const tickInbox = async () => {
    if (!isRunning || inboxBusy) return;
    inboxBusy = true;
    try {
      const now = Date.now();
      const shouldRecover = now - lastInboxRecoveryAt >= 60000;
      if (shouldRecover) lastInboxRecoveryAt = now;

      const res = await deliverInboxReplies(undefined, 10, {
        skipRecoveryCheck: !shouldRecover,
      });
      if (res.processed > 0 || res.recovered > 0) {
        inboxIdleStreak = 0;
      } else {
        inboxIdleStreak += 1;
      }
    } catch {
      inboxIdleStreak += 1;
      console.error("[Inbox] Delivery cycle interrupted. Retrying on next tick.");
    } finally {
      inboxBusy = false;
      if (isRunning) {
        inboxTimer = setTimeout(() => void tickInbox(), nextInboxDelayMs());
      }
    }
  };

  void tickPosts();
  void tickInbox();

  const stop = async () => {
    console.log(`[Scheduler Worker] Stopping worker "${workerId}"...`);
    isRunning = false;
    if (postTimer) {
      clearTimeout(postTimer);
      postTimer = null;
    }
    if (inboxTimer) {
      clearTimeout(inboxTimer);
      inboxTimer = null;
    }
    let waitCount = 0;
    while ((isCycleActive || inboxBusy) && waitCount < 150) {
      await new Promise((r) => setTimeout(r, 200));
      waitCount++;
    }
    console.log(`[Scheduler Worker] Worker "${workerId}" stopped gracefully.`);
  };

  return { stop };
}

// Standalone execution when run directly via CLI (e.g. `npm run scheduler`)
if (require.main === module) {
  startSchedulerWorker().then(({ stop }) => {
    const handleExit = async () => {
      await stop();
      process.exit(0);
    };

    process.on("SIGINT", handleExit);
    process.on("SIGTERM", handleExit);
  });
}
