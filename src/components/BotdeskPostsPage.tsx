"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { InlineUrlButton, ChannelPermissionResult } from "@/lib/post-service";
import {
  COMMON_TIMEZONES,
  formatScheduledDisplay,
  validateAndParseZonedDateTime,
  validateFutureSchedule,
} from "@/lib/schedule-utils";
import { safeFetchJson } from "@/lib/api-client";

export interface BotOption {
  id: string;
  name: string;
  username: string;
}

export interface ChannelOption {
  id: string;
  botId: string;
  name: string;
  telegramChatId: string;
}

export interface AlbumItemDTO {
  id?: string;
  mediaType: "IMAGE" | "VIDEO";
  filePath: string;
  originalName?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  order: number;
  hasSpoiler?: boolean;
}

export interface TelegramMediaAssetDTO {
  id: string;
  botId: string;
  telegramFileId: string;
  telegramFileUniqueId?: string | null;
  sourceChatId?: string | null;
  sourceMessageId?: number | null;
  forwardFromChatTitle?: string | null;
  forwardSenderName?: string | null;
  fileType: string;
  mimeType?: string | null;
  fileName?: string | null;
  fileSizeBytes?: number | null;
  duration?: number | null;
  width?: number | null;
  height?: number | null;
  originalCaption?: string | null;
  senderTelegramId?: string | null;
  senderUsername?: string | null;
  createdAt: string;
}

export interface PostItemDTO {
  id: string;
  botId: string;
  channelId: string;
  channelName?: string;
  channelChatId?: string;
  postType: "TEXT" | "IMAGE" | "VIDEO" | "ALBUM" | "TELEGRAM_VIDEO";
  content: string;
  mediaPath?: string | null;
  mediaOriginalName?: string | null;
  mediaMimeType?: string | null;
  mediaSizeBytes?: number | null;
  albumItems?: AlbumItemDTO[] | null;
  albumMessageIds?: number[] | null;
  buttonMessageId?: number | null;
  buttonsConfig?: InlineUrlButton[] | null;
  disableNotification?: boolean;
  hasSpoiler?: boolean;
  sendAsDocument?: boolean;
  telegramAssetId?: string | null;
  telegramFileId?: string | null;
  telegramSourceChatId?: string | null;
  telegramSourceMessageId?: number | null;
  telegramReuseMethod?: "SEND_VIDEO" | "FORWARD_MESSAGE" | null;
  telegramDuration?: number | null;
  telegramVideoWidth?: number | null;
  telegramVideoHeight?: number | null;
  status:
    | "DRAFT"
    | "SCHEDULED"
    | "SENDING"
    | "PUBLISHED"
    | "FAILED"
    | "UNKNOWN"
    | "PARTIAL";
  scheduledAt?: string | null;
  scheduledTimezone?: string | null;
  scheduledByUserId?: string | null;
  telegramMessageId?: number | null;
  lastError?: string | null;
  sentAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface BotdeskPostsPageProps {
  bots: BotOption[];
  initialBotId: string;
  channelsByBot: Record<string, ChannelOption[]>;
  initialPosts: PostItemDTO[];
}

function getDateAndTimeInZone(date: Date, timeZone: string) {
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = formatter.formatToParts(date);
    const getVal = (t: string) => parts.find((p) => p.type === t)?.value || "";
    let hour = getVal("hour");
    if (hour === "24") hour = "00";
    return {
      date: `${getVal("year")}-${getVal("month")}-${getVal("day")}`,
      time: `${hour}:${getVal("minute")}`,
    };
  } catch {
    const iso = date.toISOString();
    return {
      date: iso.slice(0, 10),
      time: iso.slice(11, 16),
    };
  }
}

function formatFileSize(bytes?: number | null): string {
  if (!bytes) return "";
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function BotdeskPostsPage({
  bots,
  initialBotId,
  channelsByBot,
  initialPosts,
}: BotdeskPostsPageProps) {
  const router = useRouter();

  // Selection state
  const [selectedBotId, setSelectedBotId] = useState<string>(initialBotId);
  const channels = channelsByBot[selectedBotId] || [];
  const [selectedChannelId, setSelectedChannelId] = useState<string>(
    channels[0]?.id || ""
  );

  // When bot changes, reset selected channel
  useEffect(() => {
    const available = channelsByBot[selectedBotId] || [];
    if (available.length > 0) {
      if (!available.some((c) => c.id === selectedChannelId)) {
        setSelectedChannelId(available[0].id);
      }
    } else {
      setSelectedChannelId("");
    }
  }, [selectedBotId, channelsByBot]);

  const activeBot = bots.find((b) => b.id === selectedBotId) || bots[0];
  const activeChannel = channels.find((c) => c.id === selectedChannelId);

  // Channel Permission check state
  const [permissionCheck, setPermissionCheck] = useState<
    ChannelPermissionResult | null
  >(null);
  const [checkingPermission, setCheckingPermission] = useState(false);

  useEffect(() => {
    if (!selectedBotId || !selectedChannelId) {
      setPermissionCheck(null);
      return;
    }

    let isMounted = true;
    setCheckingPermission(true);

    fetch(
      `/api/bots/${selectedBotId}/channels/${selectedChannelId}/permissions`
    )
      .then((res) => res.json())
      .then((data) => {
        if (isMounted) {
          if (data.success && data.permission) {
            setPermissionCheck(data.permission);
          } else {
            setPermissionCheck({
              status: "UNKNOWN",
              message: data.error || "Permission status unknown.",
              canPost: false,
            });
          }
        }
      })
      .catch((err) => {
        if (isMounted) {
          setPermissionCheck({
            status: "UNKNOWN",
            message: err.message || "Failed to check permission.",
            canPost: false,
          });
        }
      })
      .finally(() => {
        if (isMounted) setCheckingPermission(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedBotId, selectedChannelId]);

  // Composer Form state
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [postType, setPostType] = useState<"TEXT" | "IMAGE" | "VIDEO" | "ALBUM" | "TELEGRAM_VIDEO">("TEXT");
  const [content, setContent] = useState("");
  const [buttons, setButtons] = useState<InlineUrlButton[]>([]);
  const [disableNotification, setDisableNotification] = useState(false);
  const [hasSpoiler, setHasSpoiler] = useState(false);
  const [sendAsDocument, setSendAsDocument] = useState(false);

  // Telegram Video Reuse state
  const [selectedTelegramAssetId, setSelectedTelegramAssetId] = useState<string | null>(null);
  const [telegramReuseMethod, setTelegramReuseMethod] = useState<"SEND_VIDEO" | "FORWARD_MESSAGE">("SEND_VIDEO");
  const [telegramAssets, setTelegramAssets] = useState<TelegramMediaAssetDTO[]>([]);
  const [loadingTelegramAssets, setLoadingTelegramAssets] = useState(false);
  const [staffLinkModalOpen, setStaffLinkModalOpen] = useState(false);
  const [staffLinkCode, setStaffLinkCode] = useState<string | null>(null);
  const [staffLinkExpires, setStaffLinkExpires] = useState<string | null>(null);
  const [generatingLinkCode, setGeneratingLinkCode] = useState(false);

  const selectedTelegramAsset = telegramAssets.find((a) => a.id === selectedTelegramAssetId);

  // Fetch Telegram media assets for the selected bot
  useEffect(() => {
    if (!selectedBotId) {
      setTelegramAssets([]);
      return;
    }
    let isMounted = true;
    setLoadingTelegramAssets(true);
    fetch(`/api/bots/${selectedBotId}/telegram-media`)
      .then((res) => res.json())
      .then((data) => {
        if (isMounted) {
          if (data.success && Array.isArray(data.assets)) {
            setTelegramAssets(data.assets);
            // If currently selected asset is not in list, auto-select first or keep if editing
            if (!editingPostId && data.assets.length > 0) {
              setSelectedTelegramAssetId((prev) => prev || data.assets[0].id);
            }
          } else {
            setTelegramAssets([]);
          }
        }
      })
      .catch(() => {
        if (isMounted) setTelegramAssets([]);
      })
      .finally(() => {
        if (isMounted) setLoadingTelegramAssets(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedBotId, editingPostId]);

  const handleGetStaffLinkCode = async () => {
    setGeneratingLinkCode(true);
    try {
      const res = await fetch("/api/staff/telegram-link", { method: "POST" });
      const data = await res.json();
      if (data.success && data.code) {
        setStaffLinkCode(data.code);
        setStaffLinkExpires(data.expiresInMinutes ? `${data.expiresInMinutes} minutes` : "15 minutes");
        setStaffLinkModalOpen(true);
      } else {
        alert(data.error || "Failed to generate Telegram link code.");
      }
    } catch (err: any) {
      alert(err.message || "Network error while requesting link code.");
    } finally {
      setGeneratingLinkCode(false);
    }
  };

  const handleRefreshTelegramAssets = () => {
    if (!selectedBotId) return;
    setLoadingTelegramAssets(true);
    fetch(`/api/bots/${selectedBotId}/telegram-media`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.assets)) {
          setTelegramAssets(data.assets);
        }
      })
      .catch(() => {})
      .finally(() => {
        setLoadingTelegramAssets(false);
      });
  };

  // Album items state (for ALBUM postType: 2 to 10 items)
  const [albumItems, setAlbumItems] = useState<AlbumItemDTO[]>([]);
  const [uploadingAlbum, setUploadingAlbum] = useState(false);
  const [albumUploadError, setAlbumUploadError] = useState<string | null>(null);
  const [retryingButtonsPostId, setRetryingButtonsPostId] = useState<string | null>(null);

  // Load sendAsDocument preference from localStorage on mount
  useEffect(() => {
    try {
      const savedPref = localStorage.getItem("botdesk_pref_send_as_document");
      if (savedPref === "true") {
        setSendAsDocument(true);
      }
    } catch {
      // Ignore localStorage access issues
    }
  }, []);

  const handleToggleSendAsDocument = (val: boolean) => {
    setSendAsDocument(val);
    if (val) {
      // Telegram does not support media spoiler animations when sending files as documents
      setHasSpoiler(false);
    }
    try {
      localStorage.setItem("botdesk_pref_send_as_document", val ? "true" : "false");
    } catch {
      // Ignore localStorage access issues
    }
  };

  // Media upload state
  const [mediaPath, setMediaPath] = useState<string | null>(null);
  const [mediaOriginalName, setMediaOriginalName] = useState<string | null>(null);
  const [mediaMimeType, setMediaMimeType] = useState<string | null>(null);
  const [mediaSizeBytes, setMediaSizeBytes] = useState<number | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Clipboard & Drag-Drop states
  const [canUseClipboardRead, setCanUseClipboardRead] = useState(false);
  const [pastingMedia, setPastingMedia] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [pendingReplace, setPendingReplace] = useState<{
    file: File;
    mediaType: "IMAGE" | "VIDEO";
  } | null>(null);

  // Synchronized refs so global listeners always see latest values
  const postTypeRef = useRef(postType);
  postTypeRef.current = postType;
  const mediaPathRef = useRef(mediaPath);
  mediaPathRef.current = mediaPath;
  const albumItemsRef = useRef(albumItems);
  albumItemsRef.current = albumItems;

  // Detect navigator.clipboard.read support on client mount
  useEffect(() => {
    if (
      typeof navigator !== "undefined" &&
      navigator.clipboard &&
      typeof navigator.clipboard.read === "function"
    ) {
      setCanUseClipboardRead(true);
    }
  }, []);

  // Inline Button Form Modal state
  const [showButtonModal, setShowButtonModal] = useState(false);
  const [btnLabel, setBtnLabel] = useState("");
  const [btnUrl, setBtnUrl] = useState("");
  const [btnError, setBtnError] = useState<string | null>(null);

  // Status & Posts List
  const [posts, setPosts] = useState<PostItemDTO[]>(initialPosts);
  const [savingDraft, setSavingDraft] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error" | "warning";
    text: string;
  } | null>(null);

  // Scheduling state
  const [publishMode, setPublishMode] = useState<"NOW" | "SCHEDULE">("NOW");
  const [scheduledDate, setScheduledDate] = useState<string>("");
  const [scheduledTime, setScheduledTime] = useState<string>("");
  const [scheduledTimezone, setScheduledTimezone] = useState<string>(() => {
    try {
      const userTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (userTz) return userTz;
    } catch {}
    return "Asia/Bangkok";
  });
  const [cancellingPostId, setCancellingPostId] = useState<string | null>(null);
  const [postFilter, setPostFilter] = useState<"ALL" | "SCHEDULED" | "DRAFT" | "PUBLISHED">("ALL");

  // Publish Confirmation Modal
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [postToPublish, setPostToPublish] = useState<PostItemDTO | null>(null);

  // Reset composer to fresh new post
  const handleResetComposer = () => {
    setEditingPostId(null);
    setPostType("TEXT");
    setContent("");
    setButtons([]);
    setDisableNotification(false);
    setHasSpoiler(false);
    try {
      setSendAsDocument(localStorage.getItem("botdesk_pref_send_as_document") === "true");
    } catch {
      setSendAsDocument(false);
    }
    setMediaPath(null);
    setMediaOriginalName(null);
    setMediaMimeType(null);
    setMediaSizeBytes(null);
    setAlbumItems([]);
    setSelectedTelegramAssetId(null);
    setTelegramReuseMethod("SEND_VIDEO");
    setUploadError(null);
    setAlbumUploadError(null);
    setPendingReplace(null);
    setIsDragOver(false);
    setPastingMedia(false);
    setPublishMode("NOW");
    setScheduledDate("");
    setScheduledTime("");
    setStatusMessage(null);
  };

  // Load existing draft into composer for editing
  const handleEditDraft = (post: PostItemDTO) => {
    setEditingPostId(post.id);
    setPostType(post.postType);
    setContent(post.content || "");
    setButtons(post.buttonsConfig || []);
    setDisableNotification(Boolean(post.disableNotification));
    setHasSpoiler(Boolean(post.hasSpoiler));
    setSendAsDocument(Boolean(post.sendAsDocument));
    setMediaPath(post.mediaPath || null);
    setMediaOriginalName(post.mediaOriginalName || null);
    setMediaMimeType(post.mediaMimeType || null);
    setMediaSizeBytes(post.mediaSizeBytes || null);
    setAlbumItems(post.albumItems ? [...post.albumItems].sort((a, b) => a.order - b.order) : []);
    setSelectedTelegramAssetId(post.telegramAssetId || null);
    setTelegramReuseMethod(post.telegramReuseMethod || "SEND_VIDEO");
    setUploadError(null);
    setAlbumUploadError(null);
    setPendingReplace(null);
    setIsDragOver(false);
    setPastingMedia(false);
    setSelectedBotId(post.botId);
    setSelectedChannelId(post.channelId);

    if (post.status === "SCHEDULED" && post.scheduledAt) {
      setPublishMode("SCHEDULE");
      const tz = post.scheduledTimezone || scheduledTimezone || "Asia/Bangkok";
      setScheduledTimezone(tz);
      const parts = getDateAndTimeInZone(new Date(post.scheduledAt), tz);
      setScheduledDate(parts.date);
      setScheduledTime(parts.time);
    } else {
      setPublishMode("NOW");
      setScheduledDate("");
      setScheduledTime("");
    }

    setStatusMessage({
      type: "warning",
      text:
        post.status === "SCHEDULED"
          ? `Editing scheduled post (${post.id.slice(0, 8)}). Reschedule or save changes when done.`
          : `Editing draft post (${post.id.slice(0, 8)}). Save changes when done.`,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Cancel a scheduled post and return it to draft
  const handleCancelSchedule = async (postId: string) => {
    if (
      !confirm(
        "Are you sure you want to cancel this scheduled post? It will revert back to Draft status."
      )
    ) {
      return;
    }

    setCancellingPostId(postId);
    try {
      const res = await fetch(`/api/posts/${postId}/cancel-schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to cancel scheduled post.");
      }

      setStatusMessage({
        type: "success",
        text: "✓ Scheduled post has been cancelled and returned to Draft status.",
      });

      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? {
                ...p,
                status: "DRAFT",
                scheduledAt: null,
                scheduledTimezone: null,
                lastError: null,
              }
            : p
        )
      );

      if (editingPostId === postId) {
        setPublishMode("NOW");
        setScheduledDate("");
        setScheduledTime("");
      }

      router.refresh();
    } catch (err: any) {
      setStatusMessage({
        type: "error",
        text: err.message || "Failed to cancel schedule.",
      });
    } finally {
      setCancellingPostId(null);
    }
  };

  // Helper: Upload a single Photo or Video file to server
  const uploadSingleMedia = async (
    file: File,
    explicitType?: "IMAGE" | "VIDEO"
  ): Promise<boolean> => {
    setUploadError(null);
    const targetType =
      explicitType ||
      (file.type.startsWith("video/") || postTypeRef.current === "VIDEO"
        ? "VIDEO"
        : "IMAGE");
    const isVideo = targetType === "VIDEO";
    const allowedImageMimes = ["image/jpeg", "image/png", "image/webp"];
    const allowedVideoMimes = ["video/mp4", "video/webm", "video/quicktime"];

    if (isVideo) {
      if (!allowedVideoMimes.includes(file.type.toLowerCase())) {
        setUploadError("Only MP4, WebM, and QuickTime (MOV) videos are supported.");
        return false;
      }
      if (file.size > 25 * 1024 * 1024) {
        setUploadError("Video size exceeds maximum limit of 25 MB.");
        return false;
      }
    } else {
      if (!allowedImageMimes.includes(file.type.toLowerCase())) {
        setUploadError("Only JPEG, PNG, and WebP images are supported.");
        return false;
      }
      if (file.size > 10 * 1024 * 1024) {
        setUploadError("Image size exceeds maximum limit of 10 MB.");
        return false;
      }
    }

    setUploadingImage(true);
    const formData = new FormData();
    formData.append("file", file);
    if (selectedBotId) formData.append("botId", selectedBotId);

    try {
      const { ok, data, error } = await safeFetchJson<{
        filename: string;
        originalName?: string | null;
        mimeType?: string | null;
        sizeBytes?: number | null;
      }>("/api/posts/upload", {
        method: "POST",
        body: formData,
      });

      if (!ok || !data) {
        throw new Error(error || "File upload failed");
      }

      setMediaPath(data.filename);
      setMediaOriginalName(data.originalName || null);
      setMediaMimeType(data.mimeType || null);
      setMediaSizeBytes(data.sizeBytes || null);

      // Auto-switch postType if currently in TEXT mode
      if (isVideo && postTypeRef.current !== "VIDEO") {
        setPostType("VIDEO");
      } else if (!isVideo && postTypeRef.current !== "IMAGE" && postTypeRef.current !== "ALBUM") {
        setPostType("IMAGE");
      }

      setStatusMessage({
        type: "success",
        text: `✓ ${isVideo ? "Video" : "Photo"} loaded (${data.originalName}). Telegram preview updated.`,
      });
      return true;
    } catch (err: any) {
      setUploadError(err.message || "Failed to upload file.");
      return false;
    } finally {
      setUploadingImage(false);
    }
  };

  // Helper: Upload media items to append to album
  const uploadAlbumMedia = async (files: File[]): Promise<boolean> => {
    setAlbumUploadError(null);
    if (files.length === 0) return false;

    const currentCount = albumItemsRef.current.length;
    if (currentCount >= 10) {
      setAlbumUploadError(
        "Album already contains the maximum of 10 items. Remove an item before adding more."
      );
      return false;
    }

    if (currentCount + files.length > 10) {
      setAlbumUploadError(
        `Cannot add ${files.length} item(s): album would exceed maximum of 10 items (currently has ${currentCount}).`
      );
      return false;
    }

    const allowedImageMimes = ["image/jpeg", "image/png", "image/webp"];
    const allowedVideoMimes = ["video/mp4", "video/webm", "video/quicktime"];

    for (const f of files) {
      const type = f.type.toLowerCase();
      const isImg = allowedImageMimes.includes(type);
      const isVid = allowedVideoMimes.includes(type);

      if (!isImg && !isVid) {
        setAlbumUploadError(
          `Unsupported file type for "${f.name}". Supported formats: JPEG, PNG, WebP, MP4, WebM, QuickTime MOV.`
        );
        return false;
      }

      if (isImg && f.size > 10 * 1024 * 1024) {
        setAlbumUploadError(`Photo "${f.name}" exceeds maximum limit of 10 MB.`);
        return false;
      }

      if (isVid && f.size > 25 * 1024 * 1024) {
        setAlbumUploadError(`Video "${f.name}" exceeds maximum limit of 25 MB.`);
        return false;
      }
    }

    setUploadingAlbum(true);
    const formData = new FormData();
    files.forEach((f) => formData.append("files", f));
    if (selectedBotId) formData.append("botId", selectedBotId);

    try {
      const { ok, data, error } = await safeFetchJson<{
        items?: any[];
      }>("/api/posts/upload", {
        method: "POST",
        body: formData,
      });

      if (!ok || !data) {
        throw new Error(error || "Album files upload failed.");
      }

      const uploadedList: AlbumItemDTO[] = (data.items || []).map(
        (it: any, idx: number) => ({
          mediaType: it.mediaType as "IMAGE" | "VIDEO",
          filePath: it.filename || it.filePath,
          originalName: it.originalName,
          mimeType: it.mimeType,
          sizeBytes: it.sizeBytes,
          order: currentCount + idx,
          hasSpoiler: false,
        })
      );

      setAlbumItems((prev) => [...prev, ...uploadedList]);
      setStatusMessage({
        type: "success",
        text: `✓ Added ${uploadedList.length} item(s) to album. Total slides: ${currentCount + uploadedList.length}.`,
      });
      return true;
    } catch (err: any) {
      setAlbumUploadError(err.message || "Failed to upload album files.");
      return false;
    } finally {
      setUploadingAlbum(false);
    }
  };

  // Central processor for pasted or dropped media files
  const handlePastedMediaFiles = async (rawFiles: File[]) => {
    if (rawFiles.length === 0) return;

    // Normalize filenames with timestamps and appropriate extensions
    const normalizedFiles = rawFiles.map((file, idx) => {
      let name = file.name || "";
      const hasExt = name.includes(".") && name.lastIndexOf(".") > 0;
      if (!name || name === "blob" || name === "image" || name === "media.bin" || !hasExt) {
        const mime = (file.type || "").toLowerCase();
        const ext =
          mime === "image/jpeg" ? ".jpg"
          : mime === "image/webp" ? ".webp"
          : mime === "video/mp4" ? ".mp4"
          : mime === "video/webm" ? ".webm"
          : mime === "video/quicktime" ? ".mov"
          : ".png";
        const dateStr = new Date().toISOString().replace(/[-:T.]/g, "").slice(0, 14);
        name = `pasted_media_${dateStr}_${idx + 1}${ext}`;
      }
      return new File([file], name, { type: file.type });
    });

    const currentType = postTypeRef.current;

    // Album mode: append files (one at a time or in batch)
    if (currentType === "ALBUM") {
      await uploadAlbumMedia(normalizedFiles);
      return;
    }

    // Single media mode (IMAGE, VIDEO, or TEXT)
    const firstFile = normalizedFiles[0];
    const isVideo = firstFile.type.startsWith("video/");
    const targetMode = isVideo ? "VIDEO" : "IMAGE";

    if (currentType === "TEXT") {
      // Auto-switch to IMAGE or VIDEO and retain caption
      await uploadSingleMedia(firstFile, targetMode);
    } else if (currentType === "IMAGE") {
      if (isVideo) {
        setStatusMessage({
          type: "warning",
          text: "You pasted a video while in Photo mode. Switch to Video or Album mode to attach it.",
        });
        return;
      }
      if (mediaPathRef.current) {
        // Safe replacement prompt: do not overwrite silently!
        setPendingReplace({ file: firstFile, mediaType: "IMAGE" });
      } else {
        await uploadSingleMedia(firstFile, "IMAGE");
      }
    } else if (currentType === "VIDEO") {
      if (!isVideo) {
        setStatusMessage({
          type: "warning",
          text: "You pasted a photo while in Video mode. Switch to Photo or Album mode to attach it.",
        });
        return;
      }
      if (mediaPathRef.current) {
        // Safe replacement prompt: do not overwrite silently!
        setPendingReplace({ file: firstFile, mediaType: "VIDEO" });
      } else {
        await uploadSingleMedia(firstFile, "VIDEO");
      }
    }
  };

  // Confirm replacement of existing media from modal
  const handleConfirmReplace = async () => {
    if (!pendingReplace) return;
    const { file, mediaType } = pendingReplace;
    setPendingReplace(null);
    await uploadSingleMedia(file, mediaType);
  };

  // Explicit Clipboard Read button click
  const handleClipboardButtonClick = async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      setStatusMessage({
        type: "warning",
        text: "Clipboard API is not available in this browser. You can still paste directly using Ctrl+V or use the file picker.",
      });
      return;
    }

    try {
      setPastingMedia(true);
      setStatusMessage(null);

      if (typeof navigator.clipboard.read === "function") {
        const items = await navigator.clipboard.read();
        const extracted: File[] = [];

        for (const item of items) {
          // Check for image types
          for (const type of ["image/png", "image/jpeg", "image/webp"]) {
            if (item.types.includes(type)) {
              const blob = await item.getType(type);
              const ext =
                type === "image/jpeg" ? ".jpg"
                : type === "image/webp" ? ".webp"
                : ".png";
              const dateStr = new Date().toISOString().replace(/[-:T.]/g, "").slice(0, 14);
              extracted.push(
                new File([blob], `pasted_clipboard_${dateStr}${ext}`, { type })
              );
              break;
            }
          }
          // Check for video types if supplied
          for (const type of ["video/mp4", "video/webm", "video/quicktime"]) {
            if (item.types.includes(type)) {
              const blob = await item.getType(type);
              const ext =
                type === "video/webm" ? ".webm"
                : type === "video/quicktime" ? ".mov"
                : ".mp4";
              const dateStr = new Date().toISOString().replace(/[-:T.]/g, "").slice(0, 14);
              extracted.push(
                new File([blob], `pasted_video_${dateStr}${ext}`, { type })
              );
              break;
            }
          }
        }

        if (extracted.length > 0) {
          await handlePastedMediaFiles(extracted);
          return;
        }
      }

      // Check readText fallback
      if (typeof navigator.clipboard.readText === "function") {
        const text = await navigator.clipboard.readText().catch(() => "");
        if (text) {
          const isPath =
            text.includes(":\\") ||
            text.includes(":/") ||
            (text.startsWith("/") && !text.startsWith("//")) ||
            /\.(jpg|jpeg|png|webp|mp4|webm|mov)$/i.test(text);
          const isUrl = /^https?:\/\//i.test(text);

          if (isPath || isUrl) {
            setStatusMessage({
              type: "warning",
              text: `⚠️ Clipboard contains a ${isUrl ? "URL" : "file path"} ("${text.slice(0, 60)}..."), not actual file bytes. Web browsers cannot access local files from paths. Please use the file picker or drag & drop the actual file.`,
            });
            return;
          }
        }
      }

      setStatusMessage({
        type: "warning",
        text: "ℹ️ No image or video found in your clipboard. Take a screenshot (Win+Shift+S on Windows) or copy an image file first, then click paste.",
      });
    } catch (err: any) {
      if (err.name === "NotAllowedError" || err.message?.includes("denied")) {
        setStatusMessage({
          type: "warning",
          text: "⚠️ Clipboard permission was denied by your browser. You can still paste directly using Ctrl+V or use the file picker.",
        });
      } else {
        setStatusMessage({
          type: "error",
          text: err.message || "Failed to read clipboard.",
        });
      }
    } finally {
      setPastingMedia(false);
    }
  };

  // Global paste event listener
  useEffect(() => {
    const onGlobalPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;

      // 1. Do not intercept if user is in any text input or contentEditable
      if (
        target instanceof HTMLInputElement ||
        target?.closest('input[type="text"], input[type="url"], input[type="password"], input[type="email"]') ||
        target?.isContentEditable
      ) {
        return;
      }

      // 2. If user is in textarea, allow normal text paste if text is present
      if (target instanceof HTMLTextAreaElement) {
        const plainText = e.clipboardData?.getData("text/plain");
        if (plainText && plainText.length > 0) {
          return;
        }
      }

      // 3. Extract media files from clipboard
      const files: File[] = [];
      if (e.clipboardData?.files && e.clipboardData.files.length > 0) {
        files.push(...Array.from(e.clipboardData.files));
      } else if (e.clipboardData?.items) {
        for (let i = 0; i < e.clipboardData.items.length; i++) {
          const item = e.clipboardData.items[i];
          if (item.kind === "file") {
            const file = item.getAsFile();
            if (file) files.push(file);
          }
        }
      }

      if (files.length > 0) {
        e.preventDefault();
        handlePastedMediaFiles(files);
        return;
      }

      // 4. If no files, check for path or URL fallback when not in textarea
      if (!(target instanceof HTMLTextAreaElement)) {
        const plainText = e.clipboardData?.getData("text/plain")?.trim();
        if (plainText) {
          const isPath =
            plainText.includes(":\\") ||
            plainText.includes(":/") ||
            (plainText.startsWith("/") && !plainText.startsWith("//")) ||
            /\.(jpg|jpeg|png|webp|mp4|webm|mov)$/i.test(plainText);
          const isUrl = /^https?:\/\//i.test(plainText);

          if (isPath || isUrl) {
            e.preventDefault();
            setStatusMessage({
              type: "warning",
              text: `⚠️ Clipboard contains a ${isUrl ? "URL" : "file path"} ("${plainText.slice(0, 60)}..."), not the media file itself. Web browsers cannot access local files from paths. Please use the file picker or drag & drop the actual file.`,
            });
          }
        }
      }
    };

    window.addEventListener("paste", onGlobalPaste);
    return () => {
      window.removeEventListener("paste", onGlobalPaste);
    };
  }, []);

  // Handle single media file selection via file picker
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (mediaPathRef.current) {
      setPendingReplace({
        file,
        mediaType: postTypeRef.current === "VIDEO" ? "VIDEO" : "IMAGE",
      });
    } else {
      await uploadSingleMedia(file);
    }
    e.target.value = "";
  };

  // Handle multi-file album selection via file picker
  const handleAlbumFilesChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length === 0) return;
    await uploadAlbumMedia(files);
    e.target.value = "";
  };

  const handleRemoveAlbumItem = (index: number) => {
    setAlbumItems((prev) =>
      prev
        .filter((_, i) => i !== index)
        .map((item, i) => ({ ...item, order: i }))
    );
  };

  const handleMoveAlbumItem = (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= albumItems.length) return;

    setAlbumItems((prev) => {
      const copy = [...prev];
      const temp = copy[index];
      copy[index] = copy[targetIndex];
      copy[targetIndex] = temp;
      return copy.map((item, i) => ({ ...item, order: i }));
    });
  };

  const handleToggleAlbumItemSpoiler = (index: number) => {
    setAlbumItems((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, hasSpoiler: !item.hasSpoiler } : item
      )
    );
  };

  const handleRetryButtons = async (postId: string) => {
    setRetryingButtonsPostId(postId);
    setStatusMessage(null);
    try {
      const res = await fetch(`/api/posts/${postId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "RETRY_BUTTONS" }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to deliver follow-up buttons.");
      }
      setStatusMessage({
        type: "success",
        text: `🎉 Follow-up inline buttons successfully delivered! Button Message ID: #${data.buttonMessageId}`,
      });
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? {
                ...p,
                status: "PUBLISHED",
                buttonMessageId: data.buttonMessageId,
                lastError: null,
              }
            : p
        )
      );
      router.refresh();
    } catch (err: any) {
      setStatusMessage({
        type: "error",
        text: err.message || "Failed to deliver buttons.",
      });
    } finally {
      setRetryingButtonsPostId(null);
    }
  };

  // Handle adding inline button
  const handleAddButton = (e: React.FormEvent) => {
    e.preventDefault();
    setBtnError(null);

    const label = btnLabel.trim();
    if (!label) {
      setBtnError("Button label is required.");
      return;
    }
    if (label.length > 64) {
      setBtnError("Button label cannot exceed 64 characters.");
      return;
    }

    const url = btnUrl.trim();
    if (!url) {
      setBtnError("Destination URL is required.");
      return;
    }

    const lower = url.toLowerCase();
    const isAllowedScheme =
      lower.startsWith("https://") ||
      lower.startsWith("http://127.0.0.1") ||
      lower.startsWith("http://localhost") ||
      lower.startsWith("tg://");

    if (!isAllowedScheme) {
      setBtnError("URL must be a secure HTTPS link or Telegram link (tg://).");
      return;
    }

    if (buttons.length >= 10) {
      setBtnError("Maximum limit of 10 inline buttons reached.");
      return;
    }

    setButtons([
      ...buttons,
      { label, url, order: buttons.length },
    ]);
    setBtnLabel("");
    setBtnUrl("");
    setShowButtonModal(false);
  };

  const handleRemoveButton = (index: number) => {
    setButtons(buttons.filter((_, i) => i !== index).map((b, i) => ({ ...b, order: i })));
  };

  // Save Draft (Create or Update)
  const handleSaveDraft = async () => {
    if (!selectedBotId || !selectedChannelId) {
      setStatusMessage({
        type: "error",
        text: "Please select both a Bot and a Target Channel.",
      });
      return;
    }

    if (postType === "TEXT" && !content.trim()) {
      setStatusMessage({
        type: "error",
        text: "Text post requires non-empty message content.",
      });
      return;
    }

    if (postType === "IMAGE" && !mediaPath) {
      setStatusMessage({
        type: "error",
        text: "Image post requires an uploaded photo.",
      });
      return;
    }

    if (postType === "VIDEO" && !mediaPath) {
      setStatusMessage({
        type: "error",
        text: "Video post requires an uploaded video file.",
      });
      return;
    }

    if (postType === "TELEGRAM_VIDEO" && !selectedTelegramAssetId && !editingPostId) {
      setStatusMessage({
        type: "error",
        text: "Please select an eligible Telegram video asset from the list below.",
      });
      return;
    }

    if (postType === "ALBUM") {
      if (albumItems.length < 2) {
        setStatusMessage({
          type: "error",
          text: "Media album requires at least 2 photos or videos (maximum 10).",
        });
        return;
      }
      if (albumItems.length > 10) {
        setStatusMessage({
          type: "error",
          text: "Media album cannot exceed 10 photos or videos.",
        });
        return;
      }
    }

    if (hasSpoiler && sendAsDocument) {
      setStatusMessage({
        type: "error",
        text: "Telegram does not support media spoiler when sending files as documents.",
      });
      return;
    }

    setSavingDraft(true);
    setStatusMessage(null);

    try {
      const payload = {
        botId: selectedBotId,
        channelId: selectedChannelId,
        postType,
        content: postType === "TELEGRAM_VIDEO" && telegramReuseMethod === "FORWARD_MESSAGE" ? "" : content,
        mediaPath,
        mediaOriginalName,
        mediaMimeType,
        mediaSizeBytes,
        albumItems: postType === "ALBUM" ? albumItems : undefined,
        buttons: postType === "TELEGRAM_VIDEO" && telegramReuseMethod === "FORWARD_MESSAGE" ? [] : buttons,
        disableNotification,
        hasSpoiler,
        sendAsDocument,
        telegramAssetId: postType === "TELEGRAM_VIDEO" ? selectedTelegramAssetId : null,
        telegramReuseMethod: postType === "TELEGRAM_VIDEO" ? telegramReuseMethod : null,
      };

      const url = editingPostId
        ? `/api/posts/${editingPostId}`
        : `/api/bots/${selectedBotId}/channels/${selectedChannelId}/posts`;
      const method = editingPostId ? "PUT" : "POST";

      const { ok, data, error } = await safeFetchJson<{ post: any }>(url, {
        method,
        body: payload,
      });

      if (!ok || !data) {
        throw new Error(error || "Failed to save draft post.");
      }

      setStatusMessage({
        type: "success",
        text: editingPostId
          ? "Draft post updated successfully in PostgreSQL!"
          : "Draft post created and saved to PostgreSQL!",
      });

      // Refresh post list
      if (editingPostId) {
        setPosts((prev) =>
          prev.map((p) => (p.id === editingPostId ? { ...p, ...data.post } : p))
        );
      } else {
        setPosts((prev) => [data.post, ...prev]);
        setEditingPostId(data.post.id);
      }

      router.refresh();
    } catch (err: any) {
      setStatusMessage({
        type: "error",
        text: err.message || "Failed to save draft.",
      });
    } finally {
      setSavingDraft(false);
    }
  };

  // Open Publish / Schedule Confirmation Modal
  const handleOpenPublish = (post?: PostItemDTO) => {
    if (post) {
      setPostToPublish(post);
    } else {
      // Create temporary representation from composer
      if (postType === "TEXT" && !content.trim()) {
        setStatusMessage({
          type: "error",
          text: "Please enter text content before publishing.",
        });
        return;
      }
      if (postType === "IMAGE" && !mediaPath) {
        setStatusMessage({
          type: "error",
          text: "Please upload an image before publishing.",
        });
        return;
      }
      if (postType === "VIDEO" && !mediaPath) {
        setStatusMessage({
          type: "error",
          text: "Please upload a video before publishing.",
        });
        return;
      }
      if (postType === "TELEGRAM_VIDEO" && !selectedTelegramAssetId && !editingPostId) {
        setStatusMessage({
          type: "error",
          text: "Please select an eligible Telegram video asset before publishing.",
        });
        return;
      }
      if (postType === "ALBUM" && (albumItems.length < 2 || albumItems.length > 10)) {
        setStatusMessage({
          type: "error",
          text: "Please upload between 2 and 10 photos or videos before publishing an album.",
        });
        return;
      }

      let parsedUtcIso: string | null = null;
      if (publishMode === "SCHEDULE") {
        if (!scheduledDate || !scheduledTime || !scheduledTimezone) {
          setStatusMessage({
            type: "error",
            text: "Please provide a scheduled date, time, and timezone before scheduling.",
          });
          return;
        }
        try {
          const parsed = validateAndParseZonedDateTime(
            scheduledDate,
            scheduledTime,
            scheduledTimezone
          );
          validateFutureSchedule(parsed.utcDate);
          parsedUtcIso = parsed.utcDate.toISOString();
        } catch (err: any) {
          setStatusMessage({
            type: "error",
            text: err.message || "Invalid schedule date or time.",
          });
          return;
        }
      }

      setPostToPublish({
        id: editingPostId || "new",
        botId: selectedBotId,
        channelId: selectedChannelId,
        channelName: activeChannel?.name,
        channelChatId: activeChannel?.telegramChatId,
        postType,
        content: postType === "TELEGRAM_VIDEO" && telegramReuseMethod === "FORWARD_MESSAGE" ? "" : content,
        mediaPath,
        mediaOriginalName,
        mediaMimeType,
        mediaSizeBytes,
        albumItems: postType === "ALBUM" ? albumItems : undefined,
        buttonsConfig: postType === "TELEGRAM_VIDEO" && telegramReuseMethod === "FORWARD_MESSAGE" ? [] : buttons,
        disableNotification,
        hasSpoiler,
        sendAsDocument,
        telegramAssetId: postType === "TELEGRAM_VIDEO" ? selectedTelegramAssetId : null,
        telegramReuseMethod: postType === "TELEGRAM_VIDEO" ? telegramReuseMethod : null,
        status: publishMode === "SCHEDULE" ? "SCHEDULED" : "DRAFT",
        scheduledAt: parsedUtcIso,
        scheduledTimezone: publishMode === "SCHEDULE" ? scheduledTimezone : null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
    setShowConfirmModal(true);
  };

  // Execute Publish or Schedule to Telegram
  const handleConfirmPublish = async () => {
    if (!postToPublish) return;

    setPublishing(true);
    setStatusMessage(null);

    try {
      let targetPostId = postToPublish.id;

      // Check if we are scheduling from the composer
      if (publishMode === "SCHEDULE" && postToPublish.status === "SCHEDULED") {
        const schedulePayload = {
          botId: selectedBotId,
          channelId: selectedChannelId,
          postType,
          content: postType === "TELEGRAM_VIDEO" && telegramReuseMethod === "FORWARD_MESSAGE" ? "" : content,
          mediaPath,
          mediaOriginalName,
          mediaMimeType,
          mediaSizeBytes,
          albumItems: postType === "ALBUM" ? albumItems : undefined,
          buttons: postType === "TELEGRAM_VIDEO" && telegramReuseMethod === "FORWARD_MESSAGE" ? [] : buttons,
          disableNotification,
          hasSpoiler,
          sendAsDocument,
          telegramAssetId: postType === "TELEGRAM_VIDEO" ? selectedTelegramAssetId : null,
          telegramReuseMethod: postType === "TELEGRAM_VIDEO" ? telegramReuseMethod : null,
          status: "SCHEDULED",
          scheduledDate,
          scheduledTime,
          scheduledTimezone,
        };

        const schedUrl = targetPostId === "new"
          ? `/api/bots/${selectedBotId}/channels/${selectedChannelId}/posts`
          : `/api/posts/${targetPostId}`;
        const schedMethod = targetPostId === "new" ? "POST" : "PUT";

        const { ok, data, error } = await safeFetchJson<{ post: any }>(schedUrl, {
          method: schedMethod,
          body: schedulePayload,
        });

        if (!ok || !data) {
          throw new Error(error || "Failed to schedule post.");
        }

        setStatusMessage({
          type: "success",
          text: `🎉 Post successfully scheduled for ${formatScheduledDisplay(
            data.post.scheduledAt,
            data.post.scheduledTimezone
          )}! The BackStage scheduler worker will broadcast it automatically.`,
        });

        if (targetPostId === "new") {
          setPosts((prev) => [data.post, ...prev]);
        } else {
          setPosts((prev) =>
            prev.map((p) => (p.id === targetPostId ? { ...p, ...data.post } : p))
          );
        }

        handleResetComposer();
        setShowConfirmModal(false);
        router.refresh();
        return;
      }

      // If publishing immediately from composer without saving first, save draft first
      if (targetPostId === "new") {
        const { ok: createOk, data: createData, error: createError } = await safeFetchJson<{ post: any }>(
          `/api/bots/${selectedBotId}/channels/${selectedChannelId}/posts`,
          {
            method: "POST",
            body: {
              postType,
              content: postType === "TELEGRAM_VIDEO" && telegramReuseMethod === "FORWARD_MESSAGE" ? "" : content,
              mediaPath,
              mediaOriginalName,
              mediaMimeType,
              mediaSizeBytes,
              albumItems: postType === "ALBUM" ? albumItems : undefined,
              buttons: postType === "TELEGRAM_VIDEO" && telegramReuseMethod === "FORWARD_MESSAGE" ? [] : buttons,
              disableNotification,
              hasSpoiler,
              sendAsDocument,
              telegramAssetId: postType === "TELEGRAM_VIDEO" ? selectedTelegramAssetId : null,
              telegramReuseMethod: postType === "TELEGRAM_VIDEO" ? telegramReuseMethod : null,
            },
          }
        );
        if (!createOk || !createData) {
          throw new Error(createError || "Failed to initialize post draft before sending.");
        }
        targetPostId = createData.post.id;
        setPosts((prev) => [createData.post, ...prev]);
        setEditingPostId(targetPostId);
      }

      // Call publish API endpoint
      const { ok, data, error } = await safeFetchJson<{
        status?: string;
        error?: string;
        messageId?: number;
        albumMessageIds?: number[];
        buttonMessageId?: number;
      }>(`/api/posts/${targetPostId}/publish`, {
        method: "POST",
      });

      if (!ok) {
        // Handle UNKNOWN vs PARTIAL vs definitive FAILED
        if (data?.status === "UNKNOWN") {
          setStatusMessage({
            type: "warning",
            text: `⚠️ Network Timeout: ${error || data?.error}. Do not re-publish blindly. Please check your Telegram channel to see if it arrived.`,
          });
          setPosts((prev) =>
            prev.map((p) =>
              p.id === targetPostId
                ? { ...p, status: "UNKNOWN", lastError: error || data?.error }
                : p
            )
          );
        } else if (data?.status === "PARTIAL") {
          setStatusMessage({
            type: "warning",
            text: `⚠️ Album media published successfully (Telegram Message IDs: [${data?.albumMessageIds?.join(", ")}]), but follow-up inline buttons failed: ${error || data?.error}. You can click "Retry Buttons" in Post History to deliver them without re-sending the album.`,
          });
          setPosts((prev) =>
            prev.map((p) =>
              p.id === targetPostId
                ? {
                    ...p,
                    status: "PARTIAL",
                    telegramMessageId: data?.messageId,
                    albumMessageIds: data?.albumMessageIds || null,
                    lastError: error || data?.error,
                  }
                : p
            )
          );
          handleResetComposer();
        } else {
          throw new Error(error || data?.error || "Failed to publish post to channel.");
        }
      } else {
        const isAlbum = postToPublish.postType === "ALBUM";
        const buttonInfo = data?.buttonMessageId
          ? ` with Follow-up Buttons (#${data?.buttonMessageId})`
          : "";
        const msgInfo =
          isAlbum && data?.albumMessageIds?.length
            ? `Album Message IDs: [${data.albumMessageIds.join(", ")}]${buttonInfo}`
            : `Telegram Message ID: ${data?.messageId}`;

        setStatusMessage({
          type: "success",
          text: `🎉 Successfully published to ${activeChannel?.name || "channel"}! ${msgInfo}`,
        });

        setPosts((prev) =>
          prev.map((p) =>
            p.id === targetPostId
              ? {
                  ...p,
                  status: "PUBLISHED",
                  telegramMessageId: data?.messageId,
                  albumMessageIds: data?.albumMessageIds || null,
                  buttonMessageId: data?.buttonMessageId || null,
                  sentAt: new Date().toISOString(),
                  lastError: null,
                }
              : p
          )
        );

        handleResetComposer();
      }

      setShowConfirmModal(false);
      router.refresh();
    } catch (err: any) {
      setStatusMessage({
        type: "error",
        text: err.message || "Failed to publish post.",
      });
      setShowConfirmModal(false);
    } finally {
      setPublishing(false);
    }
  };

  // Delete post handler
  const handleDeletePost = async (id: string) => {
    if (!confirm("Are you sure you want to delete this draft?")) return;

    try {
      const { ok, error } = await safeFetchJson(`/api/posts/${id}`, { method: "DELETE" });
      if (!ok) {
        throw new Error(error || "Failed to delete post");
      }

      setPosts((prev) => prev.filter((p) => p.id !== id));
      if (editingPostId === id) {
        handleResetComposer();
      }
      setStatusMessage({
        type: "success",
        text: "Post deleted successfully.",
      });
    } catch (err: any) {
      setStatusMessage({
        type: "error",
        text: err.message || "Error deleting post.",
      });
    }
  };

  const currentChars = content.length;
  const maxChars = postType === "TEXT" ? 4096 : 1024;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-sky-500/10 text-[#38bdf8] border border-sky-500/25 mb-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#38bdf8] animate-pulse" /> Channel Publishing & Broadcast
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
            Channel Posts & Broadcast
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Prepare, preview, schedule, and broadcast rich announcements to Telegram channels.
          </p>
        </div>
      </div>

      {/* Target Selector & Bot Permission Bar */}
      <div className="p-5 sm:p-6 rounded-2xl border border-slate-800/80 bg-[#0f1420] shadow-xl space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <span>🤖 Publishing Bot</span>
            </label>
            <select
              value={selectedBotId}
              onChange={(e) => setSelectedBotId(e.target.value)}
              className="text-xs min-h-[42px] w-full py-2 px-3.5 rounded-xl bg-[#0d121c] border border-slate-800 text-white font-medium focus:outline-none focus:border-[#38bdf8] focus:ring-1 focus:ring-sky-500/40 transition cursor-pointer"
            >
              {bots.map((b) => (
                <option key={b.id} value={b.id} className="bg-[#0f1420] text-white">
                  {b.name} (@{b.username})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <span>📢 Target Channel</span>
            </label>
            <select
              value={selectedChannelId}
              onChange={(e) => setSelectedChannelId(e.target.value)}
              className="text-xs min-h-[42px] w-full py-2 px-3.5 rounded-xl bg-[#0d121c] border border-slate-800 text-white font-medium focus:outline-none focus:border-[#38bdf8] focus:ring-1 focus:ring-sky-500/40 transition cursor-pointer disabled:opacity-50"
              disabled={channels.length === 0}
            >
              {channels.length === 0 ? (
                <option value="" className="bg-[#0f1420] text-white">No channels configured for this bot</option>
              ) : (
                channels.map((c) => (
                  <option key={c.id} value={c.id} className="bg-[#0f1420] text-white">
                    {c.name} ({c.telegramChatId})
                  </option>
                ))
              )}
            </select>
          </div>
        </div>

        {/* Known Connection / Permission State */}
        <div className="p-3.5 rounded-xl bg-[#0b0f19] border border-slate-800/80 flex items-center justify-between flex-wrap gap-2 text-xs">
          <div className="flex items-center gap-2.5">
            <span className="text-slate-400 font-medium">Channel Permission:</span>
            {checkingPermission ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-sky-500/10 text-sky-400 border border-sky-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" /> Verifying Telegram API...
              </span>
            ) : permissionCheck ? (
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
                  permissionCheck.status === "CAN_POST"
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                    : permissionCheck.status === "CANNOT_POST"
                    ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                    : permissionCheck.status === "NOT_ADMIN"
                    ? "bg-rose-500/10 text-rose-400 border-rose-500/30"
                    : "bg-slate-800/60 text-slate-300 border-slate-700"
                }`}
              >
                {permissionCheck.status === "CAN_POST" ? (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Can Post Messages
                  </>
                ) : permissionCheck.status === "CANNOT_POST" ? (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> Missing Post Permission
                  </>
                ) : permissionCheck.status === "NOT_ADMIN" ? (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-400" /> Not Channel Admin
                  </>
                ) : (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400" /> Permission Unknown
                  </>
                )}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-slate-800/60 text-slate-400 border border-slate-700/80">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-500" /> Select a channel
              </span>
            )}
          </div>

          {permissionCheck && (
            <span className="text-[11px] text-slate-400 italic">
              {permissionCheck.message}
            </span>
          )}
        </div>
      </div>

      {/* Status Banner */}
      {statusMessage && (
        <div
          className={`p-4 rounded-xl text-xs border flex items-center justify-between gap-3 shadow-md ${
            statusMessage.type === "success"
              ? "bg-emerald-950/40 border-emerald-800/60 text-emerald-200"
              : statusMessage.type === "warning"
              ? "bg-amber-950/40 border-amber-800/60 text-amber-200"
              : "bg-rose-950/40 border-rose-800/60 text-rose-200"
          }`}
        >
          <div className="flex items-center gap-2">
            <span>{statusMessage.type === "success" ? "✅" : statusMessage.type === "warning" ? "⚠️" : "✕"}</span>
            <span className="font-medium">{statusMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusMessage(null)}
            className="text-xs opacity-70 hover:opacity-100 p-1 cursor-pointer transition"
          >
            ✕
          </button>
        </div>
      )}

      {/* Two-Column Layout: Composer (Left) & Telegram Preview (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Compose Area */}
        <div className="lg:col-span-7 space-y-4">
          <div className="p-5 sm:p-6 rounded-2xl border border-slate-800/80 bg-[#0f1420] shadow-xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <span>✍️</span>
                  <span>{editingPostId ? "Edit Post Draft" : "Compose Channel Post"}</span>
                </h2>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {postType === "TEXT"
                    ? "Compose text message with optional inline buttons"
                    : postType === "IMAGE"
                    ? "Upload one photo with caption and optional inline buttons"
                    : postType === "VIDEO"
                    ? "Upload one video with caption, delivery options, and optional inline buttons"
                    : "Upload multi-item photo and video album (2–10 slides)"}
                </p>
              </div>

              {editingPostId && (
                <button
                  type="button"
                  onClick={handleResetComposer}
                  className="text-xs py-1.5 px-3 rounded-lg bg-[#162032] hover:bg-[#1e2c44] text-[#38bdf8] border border-sky-500/30 transition cursor-pointer font-medium"
                >
                  ＋ New Post
                </button>
              )}
            </div>

            {/* Post Type Selector (Segmented Pill) */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Post Type
                </label>
                <span className="text-[11px] text-slate-400">
                  {postType === "TEXT" && "Simple text broadcast"}
                  {postType === "IMAGE" && "Single photo + caption"}
                  {postType === "VIDEO" && "Single video + caption"}
                  {postType === "ALBUM" && "Multi-media album (2–10)"}
                  {postType === "TELEGRAM_VIDEO" && "Telegram video reuse (up to 2 GB)"}
                </span>
              </div>
              <div className="flex p-1 bg-[#090d16] border border-slate-800 rounded-xl gap-1 overflow-x-auto">
                <button
                  type="button"
                  onClick={() => setPostType("TEXT")}
                  className={`flex-1 min-w-[95px] text-center py-2 px-3 rounded-lg text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
                    postType === "TEXT"
                      ? "bg-[#0284c7] text-white shadow-md shadow-sky-500/25 border border-sky-400/40"
                      : "text-slate-400 hover:text-white hover:bg-slate-800/40 border border-transparent"
                  }`}
                >
                  📝 Text-Only
                </button>
                <button
                  type="button"
                  onClick={() => setPostType("IMAGE")}
                  className={`flex-1 min-w-[95px] text-center py-2 px-3 rounded-lg text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
                    postType === "IMAGE"
                      ? "bg-[#0284c7] text-white shadow-md shadow-sky-500/25 border border-sky-400/40"
                      : "text-slate-400 hover:text-white hover:bg-slate-800/40 border border-transparent"
                  }`}
                >
                  🖼️ Photo
                </button>
                <button
                  type="button"
                  onClick={() => setPostType("VIDEO")}
                  className={`flex-1 min-w-[95px] text-center py-2 px-3 rounded-lg text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
                    postType === "VIDEO"
                      ? "bg-[#0284c7] text-white shadow-md shadow-sky-500/25 border border-sky-400/40"
                      : "text-slate-400 hover:text-white hover:bg-slate-800/40 border border-transparent"
                  }`}
                >
                  🎥 Video
                </button>
                <button
                  type="button"
                  onClick={() => setPostType("ALBUM")}
                  className={`flex-1 min-w-[110px] text-center py-2 px-3 rounded-lg text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
                    postType === "ALBUM"
                      ? "bg-[#0284c7] text-white shadow-md shadow-sky-500/25 border border-sky-400/40"
                      : "text-slate-400 hover:text-white hover:bg-slate-800/40 border border-transparent"
                  }`}
                >
                  📸 Album (2–10)
                </button>
                <button
                  type="button"
                  onClick={() => setPostType("TELEGRAM_VIDEO")}
                  className={`flex-1 min-w-[125px] text-center py-2 px-3 rounded-lg text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
                    postType === "TELEGRAM_VIDEO"
                      ? "bg-[#0284c7] text-white shadow-md shadow-sky-500/25 border border-sky-400/40"
                      : "text-slate-400 hover:text-white hover:bg-slate-800/40 border border-transparent"
                  }`}
                >
                  📥 From Telegram
                </button>
              </div>
            </div>

            {/* Image Upload Area (If postType === IMAGE) */}
            {postType === "IMAGE" && (
              <div className="p-4 sm:p-5 rounded-xl border border-slate-800/80 bg-[#0b0f19] space-y-3.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-white flex items-center gap-1.5">
                    <span>🖼️ Upload or Paste Photo</span>
                  </label>
                  <span className="text-[11px] text-slate-400">
                    JPEG, PNG, WebP (Max 10 MB)
                  </span>
                </div>

                {/* Drop & Paste Zone if no image attached */}
                {!mediaPath ? (
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragOver(true);
                    }}
                    onDragLeave={() => setIsDragOver(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragOver(false);
                      const files = Array.from(e.dataTransfer.files || []);
                      if (files.length > 0) handlePastedMediaFiles(files);
                    }}
                    className={`border-2 border-dashed rounded-xl p-6 text-center transition-all ${
                      isDragOver
                        ? "border-[#38bdf8] bg-sky-500/10 shadow-lg shadow-sky-500/10 scale-[1.01]"
                        : "border-slate-800 bg-[#0d121c] hover:border-slate-700"
                    }`}
                  >
                    <div className="flex flex-col items-center justify-center gap-1">
                      <span className="text-3xl mb-1">📋</span>
                      <p className="text-xs font-semibold text-white">
                        Paste screenshot (Ctrl+V) or drag & drop photo here
                      </p>
                      <p className="text-[11px] text-slate-400">
                        Supports clipboard screenshots (Win+Shift+S) & files
                      </p>
                    </div>

                    <div className="flex items-center justify-center gap-2 pt-3 flex-wrap">
                      {canUseClipboardRead && (
                        <button
                          type="button"
                          disabled={pastingMedia || uploadingImage}
                          onClick={handleClipboardButtonClick}
                          className="text-xs py-1.5 px-3 rounded-lg bg-[#162032] hover:bg-[#1e2c44] text-[#38bdf8] border border-sky-500/30 flex items-center gap-1.5 font-medium transition cursor-pointer"
                          title="Read image from system clipboard"
                        >
                          <span>📋 Paste from Clipboard</span>
                        </button>
                      )}

                      <label className="text-xs py-1.5 px-3 rounded-lg bg-[#162032] hover:bg-[#1e2c44] text-slate-200 border border-slate-700/80 cursor-pointer flex items-center gap-1.5 font-medium transition">
                        <span>📁 Choose File</span>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={handleFileChange}
                          disabled={uploadingImage || pastingMedia}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between text-xs text-slate-300 bg-[#0d121c] p-3 rounded-xl border border-slate-800 gap-3 flex-wrap shadow-sm">
                    <div className="flex items-center gap-3 truncate min-w-0">
                      <div className="w-12 h-12 rounded-lg bg-[#090d16] border border-slate-800 flex items-center justify-center flex-shrink-0 overflow-hidden shadow-inner">
                        <img
                          src={`/api/media/posts/${mediaPath}`}
                          alt="Preview"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="min-w-0 truncate">
                        <p className="truncate font-semibold text-white">
                          {mediaOriginalName || mediaPath}
                        </p>
                        <span className="text-[11px] text-slate-400">
                          {mediaSizeBytes
                            ? formatFileSize(mediaSizeBytes)
                            : "Uploaded"}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {canUseClipboardRead && (
                        <button
                          type="button"
                          disabled={pastingMedia || uploadingImage}
                          onClick={handleClipboardButtonClick}
                          className="text-[11px] py-1 px-2.5 rounded-lg bg-[#162032] hover:bg-[#1e2c44] text-[#38bdf8] border border-sky-500/30 cursor-pointer transition"
                          title="Paste new image from clipboard to replace"
                        >
                          📋 Paste New
                        </button>
                      )}
                      <label className="text-[11px] py-1 px-2.5 rounded-lg bg-[#162032] hover:bg-[#1e2c44] text-slate-200 border border-slate-700/80 cursor-pointer transition">
                        <span>📁 Replace</span>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={handleFileChange}
                          disabled={uploadingImage || pastingMedia}
                          className="hidden"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setMediaPath(null);
                          setMediaOriginalName(null);
                          setMediaMimeType(null);
                          setMediaSizeBytes(null);
                        }}
                        className="text-rose-400 hover:text-rose-300 hover:underline text-xs font-medium ml-1 cursor-pointer transition"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                )}

                {(uploadingImage || pastingMedia) && (
                  <p className="text-[11px] text-[#38bdf8] italic flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#38bdf8] animate-pulse" /> Processing and uploading image to local storage...
                  </p>
                )}

                {uploadError && (
                  <p className="text-[11px] text-rose-400">{uploadError}</p>
                )}
              </div>
            )}

            {/* Video Upload Area (If postType === VIDEO) */}
            {postType === "VIDEO" && (
              <div className="p-4 sm:p-5 rounded-xl border border-slate-800/80 bg-[#0b0f19] space-y-3.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-white flex items-center gap-1.5">
                    <span>🎥 Upload or Paste Video</span>
                  </label>
                  <span className="text-[11px] text-slate-400">
                    MP4, WebM, QuickTime MOV (Max 25 MB)
                  </span>
                </div>

                {/* Drop & Paste Zone if no video attached */}
                {!mediaPath ? (
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragOver(true);
                    }}
                    onDragLeave={() => setIsDragOver(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragOver(false);
                      const files = Array.from(e.dataTransfer.files || []);
                      if (files.length > 0) handlePastedMediaFiles(files);
                    }}
                    className={`border-2 border-dashed rounded-xl p-6 text-center transition-all ${
                      isDragOver
                        ? "border-[#38bdf8] bg-sky-500/10 shadow-lg shadow-sky-500/10 scale-[1.01]"
                        : "border-slate-800 bg-[#0d121c] hover:border-slate-700"
                    }`}
                  >
                    <div className="flex flex-col items-center justify-center gap-1">
                      <span className="text-3xl mb-1">🎥</span>
                      <p className="text-xs font-semibold text-white">
                        Paste video (Ctrl+V) or drag & drop video file here
                      </p>
                      <p className="text-[11px] text-slate-400">
                        MP4, WebM, MOV up to 25 MB
                      </p>
                    </div>

                    <div className="flex items-center justify-center gap-2 pt-3 flex-wrap">
                      {canUseClipboardRead && (
                        <button
                          type="button"
                          disabled={pastingMedia || uploadingImage}
                          onClick={handleClipboardButtonClick}
                          className="text-xs py-1.5 px-3 rounded-lg bg-[#162032] hover:bg-[#1e2c44] text-[#38bdf8] border border-sky-500/30 flex items-center gap-1.5 font-medium transition cursor-pointer"
                          title="Read video from clipboard if available"
                        >
                          <span>📋 Paste from Clipboard</span>
                        </button>
                      )}

                      <label className="text-xs py-1.5 px-3 rounded-lg bg-[#162032] hover:bg-[#1e2c44] text-slate-200 border border-slate-700/80 cursor-pointer flex items-center gap-1.5 font-medium transition">
                        <span>📁 Choose Video File</span>
                        <input
                          type="file"
                          accept="video/mp4,video/webm,video/quicktime"
                          onChange={handleFileChange}
                          disabled={uploadingImage || pastingMedia}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between text-xs text-slate-300 bg-[#0d121c] p-3 rounded-xl border border-slate-800 gap-3 flex-wrap shadow-sm">
                    <div className="flex items-center gap-3 truncate min-w-0">
                      <div className="w-12 h-12 rounded-lg bg-[#0c2538] border border-sky-500/40 text-sky-400 flex items-center justify-center text-xl flex-shrink-0 shadow-inner">
                        🎥
                      </div>
                      <div className="min-w-0 truncate">
                        <p className="truncate font-semibold text-white">
                          {mediaOriginalName || mediaPath}
                        </p>
                        <span className="text-[11px] text-slate-400">
                          {mediaSizeBytes
                            ? formatFileSize(mediaSizeBytes)
                            : "Uploaded"}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {canUseClipboardRead && (
                        <button
                          type="button"
                          disabled={pastingMedia || uploadingImage}
                          onClick={handleClipboardButtonClick}
                          className="text-[11px] py-1 px-2.5 rounded-lg bg-[#162032] hover:bg-[#1e2c44] text-[#38bdf8] border border-sky-500/30 cursor-pointer transition"
                          title="Paste new video from clipboard to replace"
                        >
                          📋 Paste New
                        </button>
                      )}
                      <label className="text-[11px] py-1 px-2.5 rounded-lg bg-[#162032] hover:bg-[#1e2c44] text-slate-200 border border-slate-700/80 cursor-pointer transition">
                        <span>📁 Replace</span>
                        <input
                          type="file"
                          accept="video/mp4,video/webm,video/quicktime"
                          onChange={handleFileChange}
                          disabled={uploadingImage || pastingMedia}
                          className="hidden"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setMediaPath(null);
                          setMediaOriginalName(null);
                          setMediaMimeType(null);
                          setMediaSizeBytes(null);
                        }}
                        className="text-rose-400 hover:text-rose-300 hover:underline text-xs font-medium ml-1 cursor-pointer transition"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                )}

                {(uploadingImage || pastingMedia) && (
                  <p className="text-[11px] text-[#38bdf8] italic flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#38bdf8] animate-pulse" /> Processing and uploading video to local storage...
                  </p>
                )}

                {uploadError && (
                  <p className="text-[11px] text-rose-400">{uploadError}</p>
                )}

                {/* Send as Document / Normal Video Toggle (Segmented Pill) */}
                <div className="pt-3 border-t border-slate-800 space-y-2">
                  <label className="block text-xs font-semibold text-white">
                    Telegram Video Dispatch Method
                  </label>
                  <div className="flex p-1 bg-[#090d16] border border-slate-800 rounded-xl gap-1">
                    <button
                      type="button"
                      onClick={() => handleToggleSendAsDocument(false)}
                      className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition cursor-pointer ${
                        !sendAsDocument
                          ? "bg-[#0284c7] text-white shadow-md shadow-sky-500/25 border border-sky-400/40"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      🎬 Regular Video (sendVideo)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleSendAsDocument(true)}
                      className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition cursor-pointer ${
                        sendAsDocument
                          ? "bg-[#0284c7] text-white shadow-md shadow-sky-500/25 border border-sky-400/40"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      📄 Document File (sendDocument)
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    {sendAsDocument
                      ? "Preserves original uncompressed file. Note: Telegram does not support spoiler blur when sending files as documents."
                      : "Sends as playable video with streaming and optional spoiler blur."}
                  </p>
                  <p className="text-[10px] text-[#38bdf8] italic">
                    ✓ Preference remembered locally in your browser for future video drafts.
                  </p>
                </div>
              </div>
            )}

            {/* Album Upload & Management Area (If postType === ALBUM) */}
            {postType === "ALBUM" && (
              <div className="p-4 sm:p-5 rounded-xl border border-slate-800/80 bg-[#0b0f19] space-y-3.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-white flex items-center gap-1.5">
                    <span>📸 Upload or Paste Album Media (2–10 Photos & Videos)</span>
                  </label>
                  <span className="text-[11px] text-slate-400">
                    Photos (Max 10 MB) • Videos (Max 25 MB)
                  </span>
                </div>

                {/* Drop & Paste Zone for Album */}
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragOver(true);
                  }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragOver(false);
                    const files = Array.from(e.dataTransfer.files || []);
                    if (files.length > 0) handlePastedMediaFiles(files);
                  }}
                  className={`border-2 border-dashed rounded-xl p-6 text-center transition-all ${
                    isDragOver
                      ? "border-[#38bdf8] bg-sky-500/10 shadow-lg shadow-sky-500/10 scale-[1.01]"
                      : "border-slate-800 bg-[#0d121c] hover:border-slate-700"
                  }`}
                >
                  <div className="flex flex-col items-center justify-center gap-1">
                    <span className="text-3xl mb-1">📸</span>
                    <p className="text-xs font-semibold text-white">
                      Paste screenshots or media (Ctrl+V) to append to album
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Paste photos one-by-one or in batches • Current slides: {albumItems.length} / 10
                    </p>
                  </div>

                  <div className="flex items-center justify-center gap-2 pt-3 flex-wrap">
                    {canUseClipboardRead && (
                      <button
                        type="button"
                        disabled={uploadingAlbum || pastingMedia || albumItems.length >= 10}
                        onClick={handleClipboardButtonClick}
                        className="text-xs py-1.5 px-3 rounded-lg bg-[#162032] hover:bg-[#1e2c44] text-[#38bdf8] border border-sky-500/30 flex items-center gap-1.5 font-medium disabled:opacity-50 transition cursor-pointer"
                        title="Read image from clipboard and append to album"
                      >
                        <span>📋 Paste from Clipboard</span>
                      </button>
                    )}

                    <label className="text-xs py-1.5 px-3 rounded-lg bg-[#162032] hover:bg-[#1e2c44] text-slate-200 border border-slate-700/80 cursor-pointer flex items-center gap-1.5 font-medium transition">
                      <span>📁 Browse Files (Multi-select)</span>
                      <input
                        type="file"
                        multiple
                        accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
                        onChange={handleAlbumFilesChange}
                        disabled={uploadingAlbum || pastingMedia || albumItems.length >= 10}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>

                {(uploadingAlbum || pastingMedia) && (
                  <p className="text-[11px] text-[#38bdf8] italic flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#38bdf8] animate-pulse" /> Uploading media items to local non-public storage...
                  </p>
                )}

                {albumUploadError && (
                  <p className="text-[11px] text-rose-400">{albumUploadError}</p>
                )}

                {/* Album Items List with Reordering & Per-Slide Spoiler */}
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>
                      Current Slides: <strong className="text-white">{albumItems.length} / 10</strong>
                      {albumItems.length < 2 && (
                        <span className="text-rose-400 font-semibold ml-1">
                          (Need at least 2)
                        </span>
                      )}
                    </span>
                    <span className="text-[#38bdf8] italic">
                      #1 Slide carries the caption in Telegram
                    </span>
                  </div>

                  {albumItems.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl bg-[#090d16]/40">
                      No files selected yet. Choose 2–10 photos and videos above.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {albumItems.map((item, idx) => (
                        <div
                          key={item.filePath || idx}
                          className={`flex items-center justify-between p-3 rounded-xl border text-xs gap-3 transition-all ${
                            idx === 0
                              ? "bg-[#0e1726] border-sky-500/50 shadow-md ring-1 ring-sky-500/30"
                              : "bg-[#0d121c] border-slate-800"
                          }`}
                        >
                          {/* Slide thumbnail / badge & name */}
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                idx === 0
                                  ? "bg-[#0c2538] text-[#38bdf8] border border-sky-500/40"
                                  : "bg-[#090d16] text-slate-400 border border-slate-800"
                              }`}
                            >
                              #{idx + 1}
                              {idx === 0 ? " (Caption)" : ""}
                            </span>

                            <div className="w-11 h-11 rounded-lg bg-[#090d16] border border-slate-800 flex items-center justify-center flex-shrink-0 overflow-hidden shadow-inner">
                              {item.mediaType === "IMAGE" ? (
                                <img
                                  src={`/api/media/posts/${item.filePath}`}
                                  alt=""
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <span className="text-base">🎥</span>
                              )}
                            </div>

                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-white truncate text-xs">
                                {item.originalName || item.filePath}
                              </p>
                              <div className="flex items-center gap-2 text-[10px] text-slate-400">
                                <span className="uppercase font-medium">{item.mediaType}</span>
                                <span>•</span>
                                <span>
                                  {item.sizeBytes
                                    ? (item.sizeBytes / (1024 * 1024)).toFixed(2) + " MB"
                                    : "Uploaded"}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Per-slide spoiler checkbox */}
                          <label className="flex items-center gap-1.5 cursor-pointer text-xs text-slate-300 flex-shrink-0 bg-[#090d16] px-2.5 py-1.5 rounded-lg border border-slate-800 hover:border-slate-700 transition">
                            <input
                              type="checkbox"
                              checked={Boolean(item.hasSpoiler)}
                              onChange={() => handleToggleAlbumItemSpoiler(idx)}
                              className="rounded border-slate-700 text-[#38bdf8] focus:ring-0"
                            />
                            <span>🙈 Spoiler</span>
                          </label>

                          {/* Order buttons and remove */}
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={() => handleMoveAlbumItem(idx, "up")}
                              className="text-xs py-1 px-2.5 disabled:opacity-30 rounded-lg bg-[#162032] hover:bg-[#1e2c44] text-slate-200 border border-slate-700/80 transition cursor-pointer"
                              title="Move slide up"
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              disabled={idx === albumItems.length - 1}
                              onClick={() => handleMoveAlbumItem(idx, "down")}
                              className="text-xs py-1 px-2.5 disabled:opacity-30 rounded-lg bg-[#162032] hover:bg-[#1e2c44] text-slate-200 border border-slate-700/80 transition cursor-pointer"
                              title="Move slide down"
                            >
                              ↓
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveAlbumItem(idx)}
                              className="text-xs py-1 px-2.5 rounded-lg bg-rose-950/40 hover:bg-rose-900/50 text-rose-300 border border-rose-800/60 transition cursor-pointer"
                              title="Remove this item"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Telegram Video Selection & Reuse Method (If postType === TELEGRAM_VIDEO) */}
            {postType === "TELEGRAM_VIDEO" && (
              <div className="p-4 sm:p-5 rounded-xl border border-slate-800/80 bg-[#0b0f19] space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <label className="text-xs font-semibold text-white flex items-center gap-1.5">
                      <span>📥 Reusable Telegram Video Assets</span>
                    </label>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Videos forwarded or sent to @{activeBot?.username || "bot"} on Telegram (supports up to 2 GB)
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleRefreshTelegramAssets}
                      disabled={loadingTelegramAssets}
                      className="text-xs py-1.5 px-3 rounded-lg bg-[#162032] hover:bg-[#1e2c44] text-slate-200 border border-slate-700/80 transition cursor-pointer flex items-center gap-1 font-medium disabled:opacity-50"
                      title="Check for new videos received by bot"
                    >
                      <span className={loadingTelegramAssets ? "animate-spin" : ""}>🔄</span>
                      <span>Refresh</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleGetStaffLinkCode}
                      disabled={generatingLinkCode}
                      className="text-xs py-1.5 px-3 rounded-lg bg-sky-950/40 hover:bg-sky-900/50 text-[#38bdf8] border border-sky-500/30 transition cursor-pointer flex items-center gap-1.5 font-semibold disabled:opacity-50"
                      title="Link your Telegram account to send media"
                    >
                      <span>🔑</span>
                      <span>Link Staff Account</span>
                    </button>
                  </div>
                </div>

                {/* Architecture Note: file_id vs forwardMessage */}
                <div className="p-3.5 rounded-xl border border-sky-500/30 bg-[#0c2538]/40 text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[#38bdf8] flex items-center gap-1.5 text-xs">
                      <span>⚡</span>
                      <span>Telegram Media Reuse Architecture</span>
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-500/20 text-sky-300">
                      Zero Local Re-Upload
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    By reusing videos directly on Telegram servers, you bypass local browser upload bandwidth and file limits (up to 2 GB). Media file IDs are cryptographically scoped to @{activeBot?.username || "bot"}.
                  </p>
                </div>

                {/* Dispatch Method Segmented Toggle */}
                <div className="space-y-2 pt-1">
                  <label className="block text-xs font-semibold text-white">
                    Delivery Method
                  </label>
                  <div className="flex p-1 bg-[#090d16] border border-slate-800 rounded-xl gap-1">
                    <button
                      type="button"
                      onClick={() => setTelegramReuseMethod("SEND_VIDEO")}
                      className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition cursor-pointer ${
                        telegramReuseMethod === "SEND_VIDEO"
                          ? "bg-[#0284c7] text-white shadow-md shadow-sky-500/25 border border-sky-400/40"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      ⚡ Direct Video (sendVideo)
                    </button>
                    <button
                      type="button"
                      onClick={() => setTelegramReuseMethod("FORWARD_MESSAGE")}
                      className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition cursor-pointer ${
                        telegramReuseMethod === "FORWARD_MESSAGE"
                          ? "bg-[#0284c7] text-white shadow-md shadow-sky-500/25 border border-sky-400/40"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      ↪️ Forward Original (forwardMessage)
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    {telegramReuseMethod === "SEND_VIDEO"
                      ? "Direct Video: Dispatches directly using Telegram file_id. Custom caption, spoiler blur, and inline URL buttons are fully supported. Clean post with no 'Forwarded from' header."
                      : "Forward Message: Forwards the original message. Preserves sender/channel attribution. Note: Telegram restricts custom captions and inline buttons when forwarding."}
                  </p>
                </div>

                {/* Loading state */}
                {loadingTelegramAssets && (
                  <div className="p-6 text-center text-xs text-[#38bdf8] italic flex items-center justify-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#38bdf8] animate-ping" />
                    <span>Loading Telegram video assets for @{activeBot?.username || "bot"}...</span>
                  </div>
                )}

                {/* Empty State: No Assets */}
                {!loadingTelegramAssets && telegramAssets.length === 0 && (
                  <div className="p-5 rounded-xl border border-slate-800 bg-[#0d121c] text-center space-y-3">
                    <div className="w-12 h-12 rounded-full bg-sky-500/10 text-[#38bdf8] text-2xl flex items-center justify-center mx-auto">
                      📥
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold text-white">
                        No Telegram videos received for @{activeBot?.username || "bot"} yet
                      </h4>
                      <p className="text-[11px] text-slate-400 mt-1 max-w-md mx-auto">
                        To publish long videos without downloading and re-uploading:
                      </p>
                    </div>
                    <ol className="text-[11px] text-slate-300 space-y-1.5 text-left max-w-sm mx-auto list-decimal pl-5">
                      <li>Open Telegram and start chat with <strong>@{activeBot?.username || "bot"}</strong>.</li>
                      <li>Link your staff account with <code>/link &lt;code&gt;</code> (click button below).</li>
                      <li>Forward or send any video (up to 2 GB) to the bot.</li>
                      <li>Click &quot;Refresh&quot; to select and publish it here.</li>
                    </ol>
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={handleGetStaffLinkCode}
                        className="text-xs py-2 px-4 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white font-semibold transition cursor-pointer shadow-md shadow-sky-500/20"
                      >
                        🔑 Get Staff Link Code
                      </button>
                    </div>
                  </div>
                )}

                {/* Video Asset List / Selector */}
                {!loadingTelegramAssets && telegramAssets.length > 0 && (
                  <div className="space-y-2 pt-1">
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span>Available Videos ({telegramAssets.length})</span>
                      <span className="text-[#38bdf8]">Click an item to select</span>
                    </div>
                    <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                      {telegramAssets.map((asset) => {
                        const isSelected = selectedTelegramAssetId === asset.id;
                        const durationMins = asset.duration ? Math.floor(asset.duration / 60) : 0;
                        const durationSecs = asset.duration ? (asset.duration % 60).toString().padStart(2, "0") : "00";
                        const sizeMb = asset.fileSizeBytes ? (asset.fileSizeBytes / (1024 * 1024)).toFixed(1) : null;

                        return (
                          <div
                            key={asset.id}
                            onClick={() => setSelectedTelegramAssetId(asset.id)}
                            className={`p-3 rounded-xl border transition cursor-pointer flex items-start gap-3 ${
                              isSelected
                                ? "border-[#38bdf8] bg-sky-500/10 shadow-md shadow-sky-500/10"
                                : "border-slate-800 bg-[#0d121c] hover:border-slate-700 hover:bg-[#0f1522]"
                            }`}
                          >
                            <input
                              type="radio"
                              name="selectedTelegramAsset"
                              checked={isSelected}
                              onChange={() => setSelectedTelegramAssetId(asset.id)}
                              className="mt-1 text-[#38bdf8] focus:ring-0"
                            />
                            <div className="w-10 h-10 rounded-lg bg-sky-500/20 border border-sky-400/40 flex items-center justify-center text-lg flex-shrink-0">
                              🎥
                            </div>
                            <div className="flex-1 min-w-0 space-y-1">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-xs font-semibold text-white truncate">
                                  {asset.fileName || "telegram_video.mp4"}
                                </p>
                                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                                  {durationMins}:{durationSecs}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 text-[10px] text-slate-400 flex-wrap">
                                {sizeMb && <span>💾 {sizeMb} MB</span>}
                                {asset.forwardFromChatTitle && (
                                  <span className="truncate max-w-[180px]">
                                    ↪️ From: {asset.forwardFromChatTitle}
                                  </span>
                                )}
                                {asset.senderUsername && (
                                  <span>👤 @{asset.senderUsername}</span>
                                )}
                              </div>
                              {asset.originalCaption && (
                                <p className="text-[10px] text-slate-400 truncate italic">
                                  Caption: &quot;{asset.originalCaption}&quot;
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Content / Caption Input */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <span>💬</span>
                  <span>{postType === "TEXT" ? "Message Text" : "Caption (Optional)"}</span>
                </label>
                {postType !== "TELEGRAM_VIDEO" || telegramReuseMethod !== "FORWARD_MESSAGE" ? (
                  <span
                    className={`text-[10px] font-mono px-2.5 py-0.5 rounded-full border ${
                      currentChars > maxChars
                        ? "bg-rose-500/10 border-rose-500/30 text-rose-400 font-bold"
                        : "bg-[#090d16] border-slate-800 text-slate-400"
                    }`}
                  >
                    {currentChars} / {maxChars}
                  </span>
                ) : (
                  <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-400">
                    Forward Mode (Caption Preserved)
                  </span>
                )}
              </div>
              {currentChars > maxChars && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2">
                  <span>⚠️</span>
                  <span>
                    Telegram limits media captions to {maxChars} characters. Current: {currentChars}. Please shorten caption to save or publish.
                  </span>
                </div>
              )}
              {postType === "TELEGRAM_VIDEO" && telegramReuseMethod === "FORWARD_MESSAGE" ? (
                <div className="p-3.5 rounded-xl border border-slate-800 bg-[#0d121c] text-xs space-y-1">
                  <div className="flex items-center gap-1.5 font-semibold text-slate-300 text-[11px]">
                    <span>ℹ️ Caption Preserved by Telegram</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Telegram does not allow modifying captions when using <code>forwardMessage</code>. The original message caption and media attribution will be forwarded exactly as received from Telegram.
                  </p>
                </div>
              ) : (
                <textarea
                  rows={postType === "TEXT" ? 6 : 4}
                  maxLength={maxChars}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder={
                    postType === "TEXT"
                      ? "Write your channel announcement or news..."
                      : "Add an optional caption for this media..."
                  }
                  className="w-full text-xs rounded-xl p-3.5 bg-[#0b0f19] border border-slate-800 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-[#38bdf8] focus:ring-1 focus:ring-sky-500/30 transition resize-y"
                />
              )}
              {postType === "TEXT" && (
                <p className="text-[11px] text-slate-400 italic mt-1.5 flex items-center gap-1.5">
                  <span className="text-[#38bdf8]">💡 Tip:</span>
                  <span>You can paste a screenshot or photo directly (Ctrl+V) to automatically attach it and switch to Photo mode.</span>
                </p>
              )}
            </div>

            {/* Telegram Delivery Options */}
            <div className="p-4 sm:p-5 rounded-xl border border-slate-800/80 bg-[#0b0f19] space-y-3">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                Telegram Delivery Options
              </label>
              <div className="space-y-2">
                {/* Silent notification */}
                <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-800 bg-[#0d121c] cursor-pointer hover:border-slate-700 hover:bg-[#0f1522] transition">
                  <input
                    type="checkbox"
                    checked={disableNotification}
                    onChange={(e) => setDisableNotification(e.target.checked)}
                    className="mt-0.5 rounded border-slate-700 text-[#38bdf8] focus:ring-0"
                  />
                  <div>
                    <span className="font-semibold text-xs text-white flex items-center gap-1.5">
                      <span>🔕</span>
                      <span>Send Silently (disable_notification)</span>
                    </span>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Subscribers receive the post without notification sound or vibration.
                    </p>
                  </div>
                </label>

                {/* Media spoiler */}
                <label
                  className={`flex items-start gap-3 p-3 rounded-xl border border-slate-800 bg-[#0d121c] transition ${
                    postType === "TEXT" || postType === "ALBUM" || sendAsDocument || (postType === "TELEGRAM_VIDEO" && telegramReuseMethod === "FORWARD_MESSAGE")
                      ? "opacity-50 cursor-not-allowed"
                      : "cursor-pointer hover:border-slate-700 hover:bg-[#0f1522]"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={hasSpoiler}
                    disabled={postType === "TEXT" || postType === "ALBUM" || sendAsDocument || (postType === "TELEGRAM_VIDEO" && telegramReuseMethod === "FORWARD_MESSAGE")}
                    onChange={(e) => setHasSpoiler(e.target.checked)}
                    className="mt-0.5 rounded border-slate-700 text-[#38bdf8] focus:ring-0"
                  />
                  <div>
                    <span className="font-semibold text-xs text-white flex items-center gap-1.5">
                      <span>🙈</span>
                      <span>Hide Media with Spoiler (has_spoiler)</span>
                    </span>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {postType === "TEXT"
                        ? "Telegram does not support spoiler animation on text-only messages."
                        : postType === "ALBUM"
                        ? "For albums, spoiler blur is configured per slide in the album list above."
                        : postType === "TELEGRAM_VIDEO" && telegramReuseMethod === "FORWARD_MESSAGE"
                        ? "Telegram does not support spoiler blur when forwarding existing messages."
                        : sendAsDocument
                        ? "Telegram does not support spoiler animation when sending files as documents."
                        : "Blurs photo/video until channel subscribers tap to reveal."}
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {/* Inline URL Buttons Builder */}
            <div className="p-4 sm:p-5 rounded-xl border border-slate-800/80 bg-[#0b0f19] space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-semibold text-white flex items-center gap-1.5">
                    <span>🔗</span>
                    <span>Inline URL Buttons ({buttons.length} / 10)</span>
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {postType === "ALBUM"
                      ? "Delivered as an anchored follow-up reply message (Telegram restriction)"
                      : postType === "TELEGRAM_VIDEO" && telegramReuseMethod === "FORWARD_MESSAGE"
                      ? "Disabled: Telegram does not support inline buttons when forwarding messages"
                      : "Buttons appear directly under the message in Telegram"}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={buttons.length >= 10 || (postType === "TELEGRAM_VIDEO" && telegramReuseMethod === "FORWARD_MESSAGE")}
                  onClick={() => {
                    setBtnLabel("");
                    setBtnUrl("");
                    setBtnError(null);
                    setShowButtonModal(true);
                  }}
                  className="text-xs py-1.5 px-3.5 rounded-xl bg-[#162032] hover:bg-[#1e2c44] text-[#38bdf8] border border-sky-500/30 transition cursor-pointer font-semibold disabled:opacity-50"
                >
                  ＋ Add Button
                </button>
              </div>

              {postType === "TELEGRAM_VIDEO" && telegramReuseMethod === "FORWARD_MESSAGE" && (
                <div className="p-3.5 rounded-xl border border-slate-800 bg-[#0d121c] text-xs space-y-1">
                  <div className="flex items-center gap-1.5 font-semibold text-slate-300 text-[11px]">
                    <span>ℹ️ Buttons Disabled for Forward Mode</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Telegram does not allow attaching inline buttons to forwarded messages. To attach interactive buttons, select <strong>⚡ Direct Video (sendVideo)</strong> above.
                  </p>
                </div>
              )}

              {postType === "ALBUM" && buttons.length > 0 && (
                <div className="p-3 rounded-xl border border-sky-500/30 bg-[#0c2538]/40 text-xs space-y-1">
                  <div className="flex items-center gap-1.5 font-semibold text-[#38bdf8] text-[11px]">
                    <span>ℹ️ Telegram Album Protocol Note</span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    Telegram does not allow inline buttons attached directly to media albums. BackStage will automatically publish these buttons in an anchored reply message immediately after the album.
                  </p>
                </div>
              )}

              {buttons.length === 0 ? (
                <div className="py-4 text-center text-[11px] text-slate-500 border border-dashed border-slate-800 rounded-xl bg-[#090d16]/40">
                  No inline buttons added. (Optional)
                </div>
              ) : (
                <div className="space-y-2">
                  {buttons.map((btn, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-3 rounded-xl bg-[#0d121c] border border-slate-800 text-xs shadow-sm"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className="font-semibold text-white">
                          {btn.label}
                        </span>
                        <span className="text-[11px] text-slate-400 truncate font-mono">
                          ({btn.url})
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveButton(idx)}
                        className="text-rose-400 hover:text-rose-300 hover:underline ml-2 text-xs font-medium flex-shrink-0 cursor-pointer transition"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Publishing Timing / Schedule Choice */}
            <div className="p-4 sm:p-5 rounded-xl border border-slate-800/80 bg-[#0b0f19] space-y-3.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Publishing Timing
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Choose whether to dispatch this post immediately or schedule for a future date & time.
                  </p>
                </div>
                <div className="flex p-1 bg-[#090d16] border border-slate-800 rounded-xl gap-1 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => setPublishMode("NOW")}
                    className={`py-1.5 px-3.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                      publishMode === "NOW"
                        ? "bg-[#0284c7] text-white shadow-md shadow-sky-500/25 border border-sky-400/40"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    ⚡ Send Now
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPublishMode("SCHEDULE");
                      if (!scheduledDate || !scheduledTime) {
                        const inOneHour = new Date(Date.now() + 60 * 60 * 1000);
                        const parts = getDateAndTimeInZone(inOneHour, scheduledTimezone);
                        setScheduledDate(parts.date);
                        setScheduledTime(parts.time);
                      }
                    }}
                    className={`py-1.5 px-3.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                      publishMode === "SCHEDULE"
                        ? "bg-purple-600 text-white shadow-md shadow-purple-600/25 border border-purple-400/40"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    🕒 Schedule Post
                  </button>
                </div>
              </div>

              {publishMode === "SCHEDULE" && (
                <div className="space-y-3 pt-3 border-t border-slate-800">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Date Picker */}
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">
                        Scheduled Date
                      </label>
                      <input
                        type="date"
                        required
                        min={new Date().toISOString().split("T")[0]}
                        value={scheduledDate}
                        onChange={(e) => setScheduledDate(e.target.value)}
                        className="text-xs min-h-[40px] w-full py-2 px-3 rounded-xl bg-[#0d121c] border border-slate-800 text-white font-medium focus:outline-none focus:border-[#38bdf8] focus:ring-1 focus:ring-sky-500/40 transition cursor-pointer"
                      />
                    </div>

                    {/* Time Picker */}
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">
                        Scheduled Time (24h)
                      </label>
                      <input
                        type="time"
                        required
                        value={scheduledTime}
                        onChange={(e) => setScheduledTime(e.target.value)}
                        className="text-xs min-h-[40px] w-full py-2 px-3 rounded-xl bg-[#0d121c] border border-slate-800 text-white font-medium focus:outline-none focus:border-[#38bdf8] focus:ring-1 focus:ring-sky-500/40 transition cursor-pointer"
                      />
                    </div>
                  </div>

                  {/* Timezone Selector */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[11px] font-semibold text-slate-400 uppercase">
                        Timezone (IANA)
                      </label>
                      <span className="text-[10px] text-purple-400 font-medium">
                        Asia/Bangkok & Asia/Yangon Supported
                      </span>
                    </div>
                    <select
                      value={scheduledTimezone}
                      onChange={(e) => setScheduledTimezone(e.target.value)}
                      className="text-xs min-h-[40px] w-full py-2 px-3 rounded-xl bg-[#0d121c] border border-slate-800 text-white font-medium focus:outline-none focus:border-[#38bdf8] focus:ring-1 focus:ring-sky-500/40 transition cursor-pointer"
                    >
                      {COMMON_TIMEZONES.map((tz) => (
                        <option key={tz.value} value={tz.value} className="bg-[#0f1420] text-white">
                          {tz.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Schedule Summary Box */}
                  <div className="p-4 rounded-xl border border-purple-500/30 bg-purple-950/20 text-xs space-y-2">
                    <div className="flex items-center justify-between text-purple-300 font-semibold text-[11px]">
                      <span className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
                        <span>Schedule Summary</span>
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider bg-purple-950/40 text-purple-300 border border-purple-500/40">
                        Auto Dispatched by Worker
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-[11px] pt-1">
                      <div>
                        <span className="text-slate-400">Bot: </span>
                        <span className="font-medium text-white">
                          {activeBot.name} (@{activeBot.username})
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400">Target Channel: </span>
                        <span className="font-medium text-white">
                          {activeChannel?.name || "Selected Channel"}
                        </span>
                      </div>
                      <div className="col-span-1 sm:col-span-2">
                        <span className="text-slate-400">Broadcast Time: </span>
                        <span className="font-bold text-purple-300">
                          {scheduledDate && scheduledTime
                            ? `${scheduledDate} ${scheduledTime} (${scheduledTimezone})`
                            : "(Please select date and time above)"}
                        </span>
                      </div>
                    </div>

                    {scheduledDate && scheduledTime && (
                      <p className="text-[10px] text-slate-400 pt-2 border-t border-purple-500/20 italic">
                        The BackStage background scheduler worker will claim and send this post at the exact scheduled instant without manual intervention.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Action Buttons: Save Draft & Publish */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-800">
              <button
                type="button"
                onClick={handleResetComposer}
                className="text-xs py-2.5 px-4 rounded-xl bg-[#162032] hover:bg-[#1e2c44] text-slate-300 border border-slate-700/80 transition cursor-pointer font-medium"
              >
                Clear
              </button>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  disabled={savingDraft || publishing}
                  onClick={handleSaveDraft}
                  className="text-xs py-2.5 px-4 rounded-xl bg-[#162032] hover:bg-[#1e2c44] text-[#38bdf8] border border-sky-500/30 hover:border-sky-500/60 transition shadow-sm cursor-pointer inline-flex items-center gap-1.5 font-semibold"
                >
                  {savingDraft ? (
                    <>
                      <svg className="animate-spin h-3.5 w-3.5 text-[#38bdf8]" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span>Saving Draft...</span>
                    </>
                  ) : (
                    "💾 Save Draft"
                  )}
                </button>

                {publishMode === "SCHEDULE" ? (
                  <button
                    type="button"
                    disabled={
                      savingDraft ||
                      publishing ||
                      channels.length === 0 ||
                      !scheduledDate ||
                      !scheduledTime ||
                      (postType === "TEXT" && !content.trim()) ||
                      ((postType === "IMAGE" || postType === "VIDEO") && !mediaPath) ||
                      (postType === "ALBUM" && (albumItems.length < 2 || albumItems.length > 10)) ||
                      (postType === "TELEGRAM_VIDEO" && !selectedTelegramAssetId)
                    }
                    onClick={() => handleOpenPublish()}
                    className="text-xs py-2.5 px-5 rounded-xl font-bold bg-purple-600 hover:bg-purple-500 active:scale-[0.98] text-white transition shadow-md shadow-purple-600/20 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
                  >
                    {publishing ? (
                      <>
                        <svg className="animate-spin h-3.5 w-3.5 text-white" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span>Scheduling...</span>
                      </>
                    ) : (
                      "🕒 Schedule Post"
                    )}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={
                      savingDraft ||
                      publishing ||
                      channels.length === 0 ||
                      (postType === "TEXT" && !content.trim()) ||
                      ((postType === "IMAGE" || postType === "VIDEO") && !mediaPath) ||
                      (postType === "ALBUM" && (albumItems.length < 2 || albumItems.length > 10)) ||
                      (postType === "TELEGRAM_VIDEO" && !selectedTelegramAssetId)
                    }
                    onClick={() => handleOpenPublish()}
                    className="text-xs py-2.5 px-5 rounded-xl font-bold bg-[#38bdf8] hover:bg-[#20b3f7] active:scale-[0.98] text-slate-950 transition shadow-md shadow-sky-500/25 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
                  >
                    {publishing ? (
                      <>
                        <svg className="animate-spin h-3.5 w-3.5 text-slate-950" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span>Publishing...</span>
                      </>
                    ) : (
                      "🚀 Publish Now"
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Telegram Live Preview Simulator */}
        <div className="lg:col-span-5 space-y-4">
          <div className="p-5 sm:p-6 rounded-2xl border border-slate-800/80 bg-[#0f1420] shadow-xl space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2 pb-1 border-b border-slate-800/60">
              <span className="text-xs font-bold uppercase tracking-wider text-[#38bdf8] flex items-center gap-1.5">
                <span>📱 Telegram Live Preview</span>
              </span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {disableNotification && (
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                    🔕 Silent
                  </span>
                )}
                {postType === "ALBUM" && (
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-semibold bg-[#0c2538] text-[#38bdf8] border border-sky-500/30">
                    📸 Album ({albumItems.length})
                  </span>
                )}
                {hasSpoiler && !sendAsDocument && postType !== "TEXT" && postType !== "ALBUM" && (
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-semibold bg-rose-950/40 text-rose-300 border border-rose-800/50">
                    🙈 Spoiler
                  </span>
                )}
                {postType === "VIDEO" && sendAsDocument && (
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-semibold bg-[#0c2538] text-[#38bdf8] border border-sky-500/30">
                    📄 Document
                  </span>
                )}
                {postType === "TELEGRAM_VIDEO" && (
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-semibold bg-[#0c2538] text-[#38bdf8] border border-sky-500/30">
                    📥 TG {telegramReuseMethod === "FORWARD_MESSAGE" ? "Forward" : "Direct Video"}
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-sky-500/10 text-[#38bdf8] border border-sky-500/25">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#38bdf8] animate-pulse" /> SIMULATED
                </span>
              </div>
            </div>

            {/* Telegram Channel Message Bubble Simulation */}
            <div className="bg-[#17212b] border border-[#232e3c] rounded-2xl p-4 shadow-xl text-slate-100 space-y-3">
              {/* Channel Header */}
              <div className="flex items-center gap-2.5 border-b border-white/10 pb-2.5">
                <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-[#0284c7] to-[#38bdf8] text-slate-950 font-bold flex items-center justify-center text-sm shadow-md flex-shrink-0">
                  📢
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white leading-tight flex items-center gap-1">
                    <span>{activeChannel?.name || "Official Channel"}</span>
                    <span className="text-[#38bdf8] text-[11px]" title="Verified Channel">✓</span>
                  </h4>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {activeChannel?.telegramChatId || "@channel"}
                  </span>
                </div>
              </div>

              {/* Forwarded Header (If TELEGRAM_VIDEO && FORWARD_MESSAGE) */}
              {postType === "TELEGRAM_VIDEO" && telegramReuseMethod === "FORWARD_MESSAGE" && (
                <div className="text-[11px] text-[#38bdf8] flex items-center gap-1.5 pb-2 border-b border-white/10 font-medium">
                  <span>↪️ Forwarded from</span>
                  <strong className="text-white">
                    {selectedTelegramAsset?.forwardFromChatTitle ||
                      selectedTelegramAsset?.forwardSenderName ||
                      (selectedTelegramAsset?.senderUsername ? `@${selectedTelegramAsset?.senderUsername}` : "Telegram User")}
                  </strong>
                </div>
              )}

              {/* Uploaded Image Preview in Bubble */}
              {postType === "IMAGE" && (
                <div className="relative rounded-xl overflow-hidden border border-white/10 bg-black/40 flex items-center justify-center min-h-[140px] max-h-[260px]">
                  {mediaPath ? (
                    <img
                      src={`/api/media/posts/${mediaPath}`}
                      alt="Preview"
                      className={`w-full h-auto object-cover max-h-[260px] ${
                        hasSpoiler
                          ? "filter blur-md hover:filter-none transition-all duration-300 cursor-pointer"
                          : ""
                      }`}
                    />
                  ) : (
                    <div className="p-6 text-center text-xs text-slate-400 italic">
                      [Photo Placeholder] Upload an image above to preview
                    </div>
                  )}
                  {hasSpoiler && mediaPath && (
                    <div className="absolute top-2 right-2 pointer-events-none">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-950/80 text-rose-300 border border-rose-700/60 shadow-md">
                        🙈 Spoiler Blur (Hover to Peek)
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Uploaded Video Preview in Bubble */}
              {postType === "VIDEO" && (
                <>
                  {sendAsDocument ? (
                    /* Video sent as Document Card */
                    <div className="rounded-xl border border-white/10 bg-black/30 p-3 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-sky-500/20 border border-sky-400/40 flex items-center justify-center text-xl flex-shrink-0">
                        📄
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-white truncate">
                          {mediaOriginalName || mediaPath || "sample_video.mp4"}
                        </p>
                        <div className="flex items-center gap-2 text-[10px] text-slate-400">
                          <span>
                            {mediaSizeBytes
                              ? formatFileSize(mediaSizeBytes)
                              : "Video Document"}
                          </span>
                          <span className="px-1.5 py-0.2 rounded bg-sky-500/10 text-sky-400 text-[9px]">Raw Attachment</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Regular Video Player */
                    <div className="relative rounded-xl overflow-hidden border border-white/10 bg-black/40 flex items-center justify-center min-h-[140px] max-h-[260px]">
                      {mediaPath ? (
                        <video
                          controls
                          src={`/api/media/posts/${mediaPath}`}
                          className={`w-full max-h-[260px] object-contain ${
                            hasSpoiler
                              ? "filter blur-md hover:filter-none transition-all duration-300"
                              : ""
                          }`}
                        />
                      ) : (
                        <div className="p-6 text-center text-xs text-slate-400 italic">
                          [Video Placeholder] Upload a video above to preview
                        </div>
                      )}
                      {hasSpoiler && mediaPath && (
                        <div className="absolute top-2 right-2 pointer-events-none">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-950/80 text-rose-300 border border-rose-700/60 shadow-md">
                            🙈 Spoiler Blur (Hover/Tap to Peek)
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* Uploaded Media Album Preview in Bubble */}
              {postType === "ALBUM" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-slate-300">
                    <span className="font-semibold text-white">
                      📸 Media Album ({albumItems.length} items)
                    </span>
                    <span className="text-[10px] text-[#38bdf8] italic">
                      #1 Slide holds caption
                    </span>
                  </div>

                  {albumItems.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-400 italic border border-white/10 rounded-xl bg-black/30">
                      [Album Placeholder] Add 2–10 photos and videos above to preview layout
                    </div>
                  ) : (
                    <div
                      className={`grid gap-1.5 rounded-xl overflow-hidden border border-white/10 bg-black/40 p-1 ${
                        albumItems.length === 2
                          ? "grid-cols-2"
                          : albumItems.length === 3
                          ? "grid-cols-3"
                          : "grid-cols-2 sm:grid-cols-3"
                      }`}
                    >
                      {albumItems.map((item, idx) => (
                        <div
                          key={item.filePath || idx}
                          className="relative aspect-square rounded-lg overflow-hidden bg-black/50 flex items-center justify-center group"
                        >
                          {item.mediaType === "IMAGE" ? (
                            <img
                              src={`/api/media/posts/${item.filePath}`}
                              alt=""
                              className={`w-full h-full object-cover transition-all duration-300 ${
                                item.hasSpoiler ? "filter blur-md group-hover:filter-none" : ""
                              }`}
                            />
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-900 text-white relative">
                              <video
                                src={`/api/media/posts/${item.filePath}`}
                                className={`w-full h-full object-cover ${
                                  item.hasSpoiler ? "filter blur-md group-hover:filter-none" : ""
                                }`}
                              />
                              <span className="absolute text-lg">▶️</span>
                            </div>
                          )}

                          {/* Index badge */}
                          <div className="absolute top-1 left-1 bg-black/75 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md pointer-events-none">
                            #{idx + 1}
                            {idx === 0 ? " (Caption)" : ""}
                          </div>

                          {/* Spoiler indicator badge */}
                          {item.hasSpoiler && (
                            <div className="absolute bottom-1 right-1 bg-black/85 text-rose-300 text-[9px] font-bold px-1.5 py-0.5 rounded-md pointer-events-none">
                              🙈 Spoiler
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Telegram Reused Video Preview in Bubble */}
              {postType === "TELEGRAM_VIDEO" && (
                <div className="relative rounded-xl overflow-hidden border border-white/10 bg-black/40 p-4 flex flex-col items-center justify-center min-h-[140px] text-center space-y-2">
                  <div className="w-14 h-14 rounded-full bg-sky-500/20 border border-sky-400/40 flex items-center justify-center text-2xl text-sky-400 shadow-inner">
                    ▶
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-xs font-bold text-white truncate max-w-[280px]">
                      {selectedTelegramAsset?.fileName || "telegram_video.mp4"}
                    </p>
                    <div className="flex items-center justify-center gap-2 text-[10px] text-slate-400">
                      {selectedTelegramAsset?.duration && (
                        <span className="font-mono bg-black/50 px-1.5 py-0.5 rounded border border-white/10">
                          ⏱ {Math.floor(selectedTelegramAsset.duration / 60)}:{(selectedTelegramAsset.duration % 60).toString().padStart(2, "0")}
                        </span>
                      )}
                      {selectedTelegramAsset?.fileSizeBytes && (
                        <span>💾 {(selectedTelegramAsset.fileSizeBytes / (1024 * 1024)).toFixed(1)} MB</span>
                      )}
                      <span className="px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 font-mono text-[9px]">
                        TG Video Reuse
                      </span>
                    </div>
                  </div>
                  {hasSpoiler && telegramReuseMethod === "SEND_VIDEO" && (
                    <div className="absolute top-2 right-2 pointer-events-none">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-950/80 text-rose-300 border border-rose-700/60 shadow-md">
                        🙈 Spoiler Blur
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Message Content or Caption */}
              <div className="text-xs text-slate-100 whitespace-pre-wrap leading-relaxed select-text">
                {postType === "TELEGRAM_VIDEO" && telegramReuseMethod === "FORWARD_MESSAGE" ? (
                  selectedTelegramAsset?.originalCaption ? (
                    selectedTelegramAsset.originalCaption
                  ) : (
                    <span className="text-slate-400 italic">No original caption attached to message</span>
                  )
                ) : content.trim() ? (
                  content
                ) : (
                  <span className="text-slate-400 italic">
                    {postType === "TEXT"
                      ? "Message text will appear here..."
                      : "Optional caption will appear here..."}
                  </span>
                )}
              </div>

              {postType === "TELEGRAM_VIDEO" && telegramReuseMethod === "FORWARD_MESSAGE" && (
                <div className="text-[10px] text-slate-400 italic pt-1 border-t border-white/5">
                  ℹ️ Forwarded without modifications. Buttons & custom caption omitted.
                </div>
              )}

              {/* Inline URL Buttons in Telegram style (for single-item posts) */}
              {postType !== "ALBUM" && (postType !== "TELEGRAM_VIDEO" || telegramReuseMethod !== "FORWARD_MESSAGE") && buttons.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  {buttons.map((btn, idx) => (
                    <a
                      key={idx}
                      href={btn.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-[#2b527a]/40 hover:bg-[#2b527a]/70 border border-[#4883ba]/40 text-[#64b5f6] font-medium py-2.5 px-4 rounded-xl text-xs text-center transition block shadow-sm"
                    >
                      {btn.label} ↗
                    </a>
                  ))}
                </div>
              )}

              <div className="text-right text-[10px] text-slate-400 pt-1 flex items-center justify-end gap-1 font-mono">
                <span>
                  {new Date().toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <span className="text-[#38bdf8] text-[11px] font-sans font-bold">✓✓</span>
              </div>
            </div>

            {/* If ALBUM and buttons exist: show follow-up reply bubble simulation */}
            {postType === "ALBUM" && buttons.length > 0 && (
              <div className="bg-[#17212b] border border-[#232e3c] rounded-2xl p-4 shadow-xl text-slate-100 space-y-2.5">
                <div className="flex items-center justify-between text-[10px] text-[#38bdf8] font-semibold border-b border-white/10 pb-1.5">
                  <span className="flex items-center gap-1.5">
                    <span>↩️ Anchored Reply (Buttons Follow-up)</span>
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-semibold bg-[#0c2538] text-[#38bdf8] border border-sky-500/30">
                    Auto Reply to Album
                  </span>
                </div>
                <div className="text-[10px] text-slate-400 border-l-2 border-[#38bdf8] pl-2 italic">
                  Replying to Album #{albumItems.length > 0 ? "1" : "..."}
                </div>
                <div className="space-y-1.5 pt-1">
                  {buttons.map((btn, idx) => (
                    <a
                      key={idx}
                      href={btn.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-[#2b527a]/40 hover:bg-[#2b527a]/70 border border-[#4883ba]/40 text-[#64b5f6] font-medium py-2.5 px-4 rounded-xl text-xs text-center transition block shadow-sm"
                    >
                      {btn.label} ↗
                    </a>
                  ))}
                </div>
                <div className="text-right text-[10px] text-slate-400 flex items-center justify-end gap-1 font-mono">
                  <span>
                    {new Date().toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <span className="text-[#38bdf8] text-[11px] font-sans font-bold">✓✓</span>
                </div>
              </div>
            )}

            <p className="text-[11px] text-slate-400 italic border-t border-slate-800/80 pt-3 leading-relaxed">
              ℹ️ Simulated Preview: Browser approximation of channel view. Clicking &quot;Publish Now&quot; dispatches this post to your live Telegram channel via Bot API.
            </p>
          </div>
        </div>
      </div>

      {/* History & Drafts Section */}
      <div className="p-5 sm:p-6 rounded-2xl border border-slate-800/80 bg-[#0f1420] shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <span>📋</span>
              <span>Post History & Drafts ({posts.length})</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Drafts, scheduled broadcasts, published posts, and delivery attempts
            </p>
          </div>

          <div className="flex p-1 bg-[#090d16] border border-slate-800 rounded-xl gap-1 overflow-x-auto self-start sm:self-auto max-w-full">
            <button
              type="button"
              onClick={() => setPostFilter("ALL")}
              className={`py-1.5 px-3 rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
                postFilter === "ALL"
                  ? "bg-[#0284c7] text-white shadow-md shadow-sky-500/25 border border-sky-400/40"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              All ({posts.length})
            </button>
            <button
              type="button"
              onClick={() => setPostFilter("SCHEDULED")}
              className={`py-1.5 px-3 rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
                postFilter === "SCHEDULED"
                  ? "bg-purple-600 text-white shadow-md shadow-purple-600/25 border border-purple-400/40"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              🕒 Scheduled ({posts.filter((p) => p.status === "SCHEDULED").length})
            </button>
            <button
              type="button"
              onClick={() => setPostFilter("DRAFT")}
              className={`py-1.5 px-3 rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
                postFilter === "DRAFT"
                  ? "bg-[#0c2538] text-[#38bdf8] border border-sky-500/40 shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Drafts ({posts.filter((p) => p.status === "DRAFT").length})
            </button>
            <button
              type="button"
              onClick={() => setPostFilter("PUBLISHED")}
              className={`py-1.5 px-3 rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
                postFilter === "PUBLISHED"
                  ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/25 border border-emerald-400/40"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Published ({posts.filter((p) => p.status === "PUBLISHED").length})
            </button>
          </div>
        </div>

        {posts.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400 border border-dashed border-slate-800 rounded-2xl bg-[#0b0f19]/40 space-y-2">
            <div className="text-2xl">📋</div>
            <p>No posts recorded yet.</p>
            <p className="text-[11px] text-slate-500">Compose a message above and click &quot;Save Draft&quot; or &quot;Schedule Post&quot; to begin.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-800/80 bg-[#0b0f19]">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-[#090d16] text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                  <th className="py-3.5 px-3.5">Status</th>
                  <th className="py-3.5 px-3.5">Type</th>
                  <th className="py-3.5 px-3.5">Options</th>
                  <th className="py-3.5 px-3.5">Target Channel</th>
                  <th className="py-3.5 px-3.5">Content Snippet</th>
                  <th className="py-3.5 px-3.5">Buttons</th>
                  <th className="py-3.5 px-3.5">Msg ID</th>
                  <th className="py-3.5 px-3.5">Broadcast / Date</th>
                  <th className="py-3.5 px-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {posts
                  .filter((post) => {
                    if (postFilter === "SCHEDULED") return post.status === "SCHEDULED";
                    if (postFilter === "DRAFT") return post.status === "DRAFT";
                    if (postFilter === "PUBLISHED") return post.status === "PUBLISHED";
                    return true;
                  })
                  .map((post) => (
                    <tr
                      key={post.id}
                      className="hover:bg-[#131926] transition"
                    >
                      <td className="py-3 px-3.5 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold border ${
                            post.status === "PUBLISHED"
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                              : post.status === "SCHEDULED"
                              ? "bg-purple-500/10 text-purple-300 border-purple-500/30"
                              : post.status === "SENDING"
                              ? "bg-sky-500/10 text-sky-400 border-sky-500/30"
                              : post.status === "PARTIAL"
                              ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                              : post.status === "FAILED"
                              ? "bg-rose-500/10 text-rose-400 border-rose-500/30"
                              : "bg-sky-500/10 text-[#38bdf8] border-sky-500/30"
                          }`}
                        >
                          {post.status === "PUBLISHED" ? (
                            <>
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> PUBLISHED
                            </>
                          ) : post.status === "SCHEDULED" ? (
                            <>
                              <span className="w-1.5 h-1.5 rounded-full bg-purple-400" /> SCHEDULED
                            </>
                          ) : post.status === "SENDING" ? (
                            <>
                              <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" /> SENDING
                            </>
                          ) : post.status === "PARTIAL" ? (
                            <>
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> PARTIAL
                            </>
                          ) : post.status === "FAILED" ? (
                            <>
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-400" /> FAILED
                            </>
                          ) : (
                            <>
                              <span className="w-1.5 h-1.5 rounded-full bg-sky-400" /> {post.status}
                            </>
                          )}
                        </span>
                      </td>
                      <td className="py-3 px-3.5 whitespace-nowrap font-medium text-white">
                        {post.postType === "ALBUM" ? (
                          <span className="flex items-center gap-1.5">
                            <span>📸 Album</span>
                            <span className="px-1.5 py-0.2 rounded bg-sky-500/10 text-sky-400 text-[9px] border border-sky-500/20 font-mono">
                              {post.albumItems?.length || (post.albumMessageIds ? post.albumMessageIds.length : 0)} items
                            </span>
                          </span>
                        ) : post.postType === "TELEGRAM_VIDEO" ? (
                          <span className="flex items-center gap-1.5">
                            <span>📥 TG Video</span>
                            <span className="px-1.5 py-0.2 rounded bg-sky-500/10 text-sky-400 text-[9px] border border-sky-500/20 font-mono">
                              {post.telegramReuseMethod === "FORWARD_MESSAGE" ? "FORWARD" : "DIRECT"}
                            </span>
                          </span>
                        ) : post.postType === "VIDEO" ? (
                          <span className="flex items-center gap-1.5">
                            <span>🎥 Video</span>
                            {post.sendAsDocument && (
                              <span className="px-1.5 py-0.2 rounded bg-sky-500/10 text-sky-400 text-[9px] border border-sky-500/20 font-mono">Doc</span>
                            )}
                          </span>
                        ) : post.postType === "IMAGE" ? (
                          "🖼️ Photo"
                        ) : (
                          "📝 Text"
                        )}
                      </td>
                      <td className="py-3 px-3.5 whitespace-nowrap text-[11px] text-slate-400">
                        <div className="flex items-center gap-1.5">
                          {post.disableNotification && (
                            <span title="Silent notification (no sound)" className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px]">
                              🔕
                            </span>
                          )}
                          {post.hasSpoiler && (
                            <span title="Media spoiler enabled" className="px-1.5 py-0.5 rounded bg-rose-950/40 text-rose-300 border border-rose-800/40 text-[10px]">
                              🙈
                            </span>
                          )}
                          {!post.disableNotification && !post.hasSpoiler && (
                            <span className="text-slate-500">Standard</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3.5 whitespace-nowrap text-slate-400">
                        {post.channelName || post.channelChatId || post.channelId}
                      </td>
                      <td className="py-3 px-3.5 max-w-xs truncate text-slate-200">
                        {post.content || "(No caption/text)"}
                      </td>
                      <td className="py-3 px-3.5 whitespace-nowrap text-slate-400 font-mono text-[11px]">
                        {post.buttonsConfig && Array.isArray(post.buttonsConfig)
                          ? `${post.buttonsConfig.length} btn`
                          : "None"}
                      </td>
                      <td className="py-3 px-3.5 whitespace-nowrap font-mono text-slate-400 text-[11px]">
                        {post.albumMessageIds && post.albumMessageIds.length > 0 ? (
                          <span title={`Album Message IDs: #${post.albumMessageIds.join(", #")}`}>
                            #{post.albumMessageIds[0]}..+{post.albumMessageIds.length - 1}
                            {post.buttonMessageId && (
                              <span className="text-[#38bdf8] font-semibold ml-1">
                                (+Btn #{post.buttonMessageId})
                              </span>
                            )}
                          </span>
                        ) : post.telegramMessageId ? (
                          `#${post.telegramMessageId}`
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="py-3 px-3.5 whitespace-nowrap text-slate-400">
                        {post.status === "SCHEDULED" ? (
                          <div className="space-y-0.5">
                            <span
                              className="text-purple-300 font-semibold block text-[11px]"
                              title={post.scheduledAt || ""}
                            >
                              🕒 {formatScheduledDisplay(post.scheduledAt, post.scheduledTimezone)}
                            </span>
                            <span className="text-[10px] text-slate-500 block font-mono">
                              Created: {new Date(post.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                        ) : post.status === "PUBLISHED" ? (
                          <div className="space-y-0.5">
                            <span className="text-emerald-400 font-medium block text-[11px]">
                              ✅ {post.sentAt ? new Date(post.sentAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" }) : "Sent"}
                            </span>
                            <span className="text-[10px] text-slate-500 block font-mono">
                              Created: {new Date(post.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                        ) : (
                          <div className="text-[11px]">
                            {new Date(post.createdAt).toLocaleDateString()}{" "}
                            {new Date(post.createdAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3.5 whitespace-nowrap text-right space-x-1.5">
                        {post.status === "PARTIAL" && (
                          <button
                            type="button"
                            disabled={retryingButtonsPostId === post.id}
                            onClick={() => handleRetryButtons(post.id)}
                            className="text-[11px] py-1 px-2.5 rounded-lg bg-amber-950/30 hover:bg-amber-900/40 text-amber-300 border border-amber-500/40 transition cursor-pointer font-medium"
                            title="Deliver follow-up inline buttons without re-sending the album"
                          >
                            {retryingButtonsPostId === post.id ? "Retrying..." : "Retry Buttons"}
                          </button>
                        )}
                        {post.status === "SCHEDULED" ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleEditDraft(post)}
                              className="text-[11px] py-1 px-2.5 rounded-lg bg-[#162032] hover:bg-[#1e2c44] text-purple-300 border border-purple-500/30 transition cursor-pointer font-medium"
                              title="Edit draft content or reschedule broadcast timing"
                            >
                              Reschedule
                            </button>
                            <button
                              type="button"
                              disabled={cancellingPostId === post.id}
                              onClick={() => handleCancelSchedule(post.id)}
                              className="text-[11px] py-1 px-2.5 rounded-lg bg-amber-950/30 hover:bg-amber-900/40 text-amber-300 border border-amber-500/40 transition cursor-pointer font-medium"
                              title="Cancel schedule and return to Draft status"
                            >
                              {cancellingPostId === post.id ? "Cancelling..." : "Cancel"}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenPublish(post)}
                              className="text-[11px] py-1 px-2.5 rounded-lg font-bold bg-[#38bdf8] hover:bg-[#20b3f7] active:scale-[0.98] text-slate-950 transition shadow-sm cursor-pointer"
                              title="Publish immediately to Telegram channel now"
                            >
                              Publish Now
                            </button>
                          </>
                        ) : post.status !== "PUBLISHED" && post.status !== "SENDING" && post.status !== "PARTIAL" ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleEditDraft(post)}
                              className="text-[11px] py-1 px-2.5 rounded-lg bg-[#162032] hover:bg-[#1e2c44] text-[#38bdf8] border border-sky-500/30 transition cursor-pointer font-medium"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenPublish(post)}
                              className="text-[11px] py-1 px-2.5 rounded-lg font-bold bg-[#38bdf8] hover:bg-[#20b3f7] active:scale-[0.98] text-slate-950 transition shadow-sm cursor-pointer"
                            >
                              Publish
                            </button>
                          </>
                        ) : null}
                        {post.status !== "SENDING" && (
                          <button
                            type="button"
                            onClick={() => handleDeletePost(post.id)}
                            className="text-[11px] py-1 px-2.5 rounded-lg bg-rose-950/40 hover:bg-rose-900/50 text-rose-300 border border-rose-800/60 transition cursor-pointer font-medium"
                          >
                            Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Inline Button Modal */}
      {showButtonModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
          <div className="w-full max-w-md rounded-2xl bg-[#0f1420] border border-slate-800 p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <span>🔗</span>
              <span>Add Inline URL Button</span>
            </h3>

            {btnError && (
              <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/60 text-xs text-rose-300">
                {btnError}
              </div>
            )}

            <form onSubmit={handleAddButton} className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="block font-semibold uppercase tracking-wider text-slate-400">
                  Button Label (Max 64 chars)
                </label>
                <input
                  type="text"
                  required
                  maxLength={64}
                  value={btnLabel}
                  onChange={(e) => setBtnLabel(e.target.value)}
                  placeholder="e.g. 🌐 Read Full Article"
                  className="text-xs min-h-[40px] w-full py-2 px-3.5 rounded-xl bg-[#0d121c] border border-slate-800 text-white font-medium focus:outline-none focus:border-[#38bdf8] focus:ring-1 focus:ring-sky-500/40 transition"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block font-semibold uppercase tracking-wider text-slate-400">
                  Destination URL (HTTPS or tg://)
                </label>
                <input
                  type="url"
                  required
                  value={btnUrl}
                  onChange={(e) => setBtnUrl(e.target.value)}
                  placeholder="https://example.com/announcement"
                  className="text-xs min-h-[40px] w-full py-2 px-3.5 rounded-xl bg-[#0d121c] border border-slate-800 text-white font-medium focus:outline-none focus:border-[#38bdf8] focus:ring-1 focus:ring-sky-500/40 transition"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowButtonModal(false)}
                  className="text-xs py-2 px-4 rounded-xl bg-[#162032] hover:bg-[#1e2c44] text-slate-300 border border-slate-700/80 transition cursor-pointer font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="text-xs py-2 px-4 rounded-xl font-bold bg-[#38bdf8] hover:bg-[#20b3f7] active:scale-[0.98] text-slate-950 transition shadow-md shadow-sky-500/20 cursor-pointer"
                >
                  Add Button
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Publish or Schedule Confirmation Modal */}
      {showConfirmModal && postToPublish && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
          <div className="w-full max-w-md rounded-2xl bg-[#0f1420] border border-slate-800 p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2.5 text-[#38bdf8]">
              <span className="text-2xl">
                {postToPublish.status === "SCHEDULED" && publishMode === "SCHEDULE" ? "🕒" : "⚠️"}
              </span>
              <h3 className="text-base font-bold text-white">
                {postToPublish.status === "SCHEDULED" && publishMode === "SCHEDULE"
                  ? "Confirm Post Schedule"
                  : "Confirm Channel Publish"}
              </h3>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              {postToPublish.status === "SCHEDULED" && publishMode === "SCHEDULE"
                ? "You are scheduling this post for automatic broadcast. At the specified time, the BackStage scheduler worker will claim and dispatch it to your channel via Telegram Bot API."
                : "You are about to dispatch this post to your real Telegram channel. Once published, subscribers will see it immediately."}
            </p>

            <div className="p-4 rounded-xl border border-slate-800 bg-[#0b0f19] text-xs space-y-2.5">
              <div className="flex justify-between">
                <span className="text-slate-400">Publishing Bot:</span>
                <span className="font-semibold text-white">
                  {activeBot.name} (@{activeBot.username})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Target Channel:</span>
                <span className="font-semibold text-white">
                  {activeChannel?.name || "Selected Channel"} ({activeChannel?.telegramChatId})
                </span>
              </div>
              {postToPublish.status === "SCHEDULED" && postToPublish.scheduledAt && (
                <div className="flex justify-between border-y border-purple-500/20 py-1.5 bg-purple-950/20 px-2 rounded-lg">
                  <span className="text-purple-300 font-semibold">Scheduled Broadcast:</span>
                  <span className="font-bold text-purple-300">
                    {formatScheduledDisplay(
                      postToPublish.scheduledAt,
                      postToPublish.scheduledTimezone || scheduledTimezone
                    )}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-400">Post Type:</span>
                <span className="font-semibold text-white">
                  {postToPublish.postType === "ALBUM"
                    ? `Media Album (${postToPublish.albumItems?.length || 0} items: ${
                        postToPublish.albumItems?.filter((i) => i.mediaType === "IMAGE").length || 0
                      } photo(s), ${
                        postToPublish.albumItems?.filter((i) => i.mediaType === "VIDEO").length || 0
                      } video(s))`
                    : postToPublish.postType === "TELEGRAM_VIDEO"
                    ? postToPublish.telegramReuseMethod === "FORWARD_MESSAGE"
                      ? "Telegram Video (Forward Original Message)"
                      : "Telegram Video (Direct Video Reuse with file_id)"
                    : postToPublish.postType === "VIDEO"
                    ? postToPublish.sendAsDocument
                      ? "Video with Caption (Document Attachment)"
                      : "Video with Caption (Regular Video)"
                    : postToPublish.postType === "IMAGE"
                    ? "Photo with Caption"
                    : "Text Message"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Silent Notification:</span>
                <span className="font-semibold text-white">
                  {postToPublish.disableNotification ? "🔕 Yes (No Sound)" : "🔔 Normal (With Sound)"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Media Spoiler Blur:</span>
                <span className="font-semibold text-white">
                  {postToPublish.postType === "ALBUM"
                    ? `${
                        postToPublish.albumItems?.filter((i) => i.hasSpoiler).length || 0
                      } of ${postToPublish.albumItems?.length || 0} items blurred`
                    : postToPublish.hasSpoiler
                    ? "🙈 Yes (Blurred)"
                    : "No"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Buttons:</span>
                <span className="font-semibold text-white">
                  {postToPublish.buttonsConfig?.length || 0} inline button(s)
                  {postToPublish.postType === "ALBUM" && (postToPublish.buttonsConfig?.length || 0) > 0
                    ? " (Dispatched in follow-up reply)"
                    : ""}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
              <button
                type="button"
                disabled={publishing}
                onClick={() => setShowConfirmModal(false)}
                className="text-xs py-2 px-4 rounded-xl bg-[#162032] hover:bg-[#1e2c44] text-slate-300 border border-slate-700/80 transition cursor-pointer font-medium"
              >
                Cancel
              </button>
              {postToPublish.status === "SCHEDULED" && publishMode === "SCHEDULE" ? (
                <button
                  type="button"
                  disabled={publishing}
                  onClick={handleConfirmPublish}
                  className="text-xs py-2 px-4 rounded-xl font-bold bg-purple-600 hover:bg-purple-500 active:scale-[0.98] text-white transition shadow-md shadow-purple-600/20 inline-flex items-center gap-1.5 cursor-pointer"
                >
                  {publishing ? (
                    <>
                      <svg className="animate-spin h-3.5 w-3.5 text-white" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span>Scheduling...</span>
                    </>
                  ) : (
                    "Yes, Schedule Post"
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={publishing}
                  onClick={handleConfirmPublish}
                  className="text-xs py-2 px-4 rounded-xl font-bold bg-[#38bdf8] hover:bg-[#20b3f7] active:scale-[0.98] text-slate-950 transition shadow-md shadow-sky-500/20 inline-flex items-center gap-1.5 cursor-pointer"
                >
                  {publishing ? (
                    <>
                      <svg className="animate-spin h-3.5 w-3.5 text-slate-950" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span>Publishing to Telegram...</span>
                    </>
                  ) : (
                    "Yes, Publish to Channel"
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Staff Telegram Identity Link Modal */}
      {staffLinkModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
          <div className="w-full max-w-md rounded-2xl bg-[#0f1420] border border-slate-800 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5 text-[#38bdf8]">
                <span className="text-2xl">🔑</span>
                <h3 className="text-base font-bold text-white">
                  Link Staff Telegram Account
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setStaffLinkModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              To send or forward videos from Telegram to <strong>@{activeBot?.username || "bot"}</strong>, verify your staff identity using this one-time code:
            </p>

            <div className="p-4 rounded-xl border border-sky-500/30 bg-[#0c2538]/60 text-center space-y-2">
              <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                Your 6-Digit Link Code
              </span>
              <div className="text-3xl font-mono font-extrabold tracking-widest text-[#38bdf8] select-all">
                {staffLinkCode}
              </div>
              <p className="text-[10px] text-slate-400">
                Expires in {staffLinkExpires || "15 minutes"}
              </p>
            </div>

            <div className="space-y-2 text-xs text-slate-300 bg-[#0b0f19] p-3.5 rounded-xl border border-slate-800">
              <h4 className="font-semibold text-white text-[11px]">Instructions:</h4>
              <ol className="list-decimal pl-4 space-y-1 text-[11px] text-slate-400">
                <li>Open Telegram and start a chat with <strong>@{activeBot?.username || "bot"}</strong>.</li>
                <li>Send command: <code className="text-[#38bdf8] bg-black/40 px-1 py-0.5 rounded">/link {staffLinkCode}</code></li>
                <li>The bot will reply verifying your staff authorization.</li>
                <li>You can now forward long videos to the bot for publishing here.</li>
              </ol>
            </div>

            <div className="flex items-center justify-end pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setStaffLinkModalOpen(false)}
                className="text-xs py-2 px-5 rounded-xl font-bold bg-[#0284c7] hover:bg-[#0369a1] text-white transition shadow-md shadow-sky-500/20 cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Media Replacement Confirmation Modal */}
      {pendingReplace && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
          <div className="w-full max-w-md rounded-2xl bg-[#0f1420] border border-slate-800 p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2.5 text-amber-400">
              <span className="text-2xl">⚠️</span>
              <h3 className="text-base font-bold text-white">
                Replace Attached Media?
              </h3>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              A {pendingReplace.mediaType === "IMAGE" ? "photo" : "video"} is already attached to this draft:
            </p>

            <div className="p-4 rounded-xl border border-slate-800 bg-[#0b0f19] text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-400">Current Media:</span>
                <span
                  className="font-semibold text-white truncate max-w-[200px]"
                  title={mediaOriginalName || mediaPath || ""}
                >
                  {mediaOriginalName || mediaPath}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">New Pasted Media:</span>
                <span
                  className="font-semibold text-[#38bdf8] truncate max-w-[200px]"
                  title={pendingReplace.file.name}
                >
                  {pendingReplace.file.name}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setPendingReplace(null)}
                className="text-xs py-2 px-4 rounded-xl bg-[#162032] hover:bg-[#1e2c44] text-slate-300 border border-slate-700/80 transition cursor-pointer font-medium"
              >
                Keep Current Media
              </button>
              <button
                type="button"
                onClick={handleConfirmReplace}
                className="text-xs py-2 px-4 rounded-xl font-bold bg-[#38bdf8] hover:bg-[#20b3f7] active:scale-[0.98] text-slate-950 transition shadow-md shadow-sky-500/20 cursor-pointer"
              >
                Yes, Replace Media
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
