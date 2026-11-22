"use client";

// Web Audio API Synthesized Chime (No external audio files needed, works offline & across all browsers)
let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!sharedAudioCtx) {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioCtx) {
      sharedAudioCtx = new AudioCtx();
    }
  }
  if (sharedAudioCtx && sharedAudioCtx.state === "suspended") {
    sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
}

// Unlock audio on first user interaction so autoplay policy doesn't block notifications
if (typeof window !== "undefined") {
  const unlock = () => {
    const ctx = getAudioContext();
    if (ctx && ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    window.removeEventListener("click", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("click", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });
}

export function playNotificationChime() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // First Tone: F5 (698.46 Hz) gentle chime
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(698.46, now);
    gain1.gain.setValueAtTime(0.18, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.3);

    // Second Tone: A5 (880 Hz) pleasant bell resolve
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(880, now + 0.1);
    gain2.gain.setValueAtTime(0.22, now + 0.1);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.1);
    osc2.stop(now + 0.55);
  } catch {
    // Audio autoplay blocked or context unavailable
  }
}

export async function requestDesktopNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "denied";
  }
  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
}

export function getNotificationPermission(): NotificationPermission {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "denied";
  }
  return Notification.permission;
}

export function showDesktopNotification(options: {
  title: string;
  body: string;
  tag?: string;
  onClick?: () => void;
}) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  try {
    const notif = new Notification(options.title, {
      body: options.body,
      icon: "/favicon.ico",
      tag: options.tag || "botdesk-support",
    });

    notif.onclick = () => {
      window.focus();
      if (options.onClick) options.onClick();
      notif.close();
    };
  } catch {
    // Notifications not permitted in this context
  }
}

// Flashing document title for unread customer messages
let originalTitle = typeof document !== "undefined" ? document.title : "Botdesk";

export function setUnreadTitleAlert(count: number, senderName?: string) {
  if (typeof document === "undefined") return;
  if (!originalTitle || originalTitle.startsWith("(")) {
    originalTitle = "Support inbox - Botdesk";
  }
  if (count > 0) {
    document.title = `(${count}) 💬 ${senderName ? senderName + ":" : "New message"} | Support inbox`;
  } else {
    document.title = originalTitle;
  }
}

export function clearUnreadTitleAlert() {
  if (typeof document === "undefined") return;
  if (originalTitle && !originalTitle.startsWith("(")) {
    document.title = originalTitle;
  } else {
    document.title = "Support inbox - Botdesk";
  }
}
