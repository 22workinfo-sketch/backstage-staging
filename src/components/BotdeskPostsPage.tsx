"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { InlineUrlButton, ChannelPermissionResult } from "@/lib/post-service";

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

export interface PostItemDTO {
  id: string;
  botId: string;
  channelId: string;
  channelName?: string;
  channelChatId?: string;
  postType: "TEXT" | "IMAGE";
  content: string;
  mediaPath?: string | null;
  mediaOriginalName?: string | null;
  mediaMimeType?: string | null;
  mediaSizeBytes?: number | null;
  buttonsConfig?: InlineUrlButton[] | null;
  status: "DRAFT" | "SENDING" | "PUBLISHED" | "FAILED" | "UNKNOWN";
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
  const [postType, setPostType] = useState<"TEXT" | "IMAGE">("TEXT");
  const [content, setContent] = useState("");
  const [buttons, setButtons] = useState<InlineUrlButton[]>([]);

  // Media upload state
  const [mediaPath, setMediaPath] = useState<string | null>(null);
  const [mediaOriginalName, setMediaOriginalName] = useState<string | null>(null);
  const [mediaMimeType, setMediaMimeType] = useState<string | null>(null);
  const [mediaSizeBytes, setMediaSizeBytes] = useState<number | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

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

  // Publish Confirmation Modal
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [postToPublish, setPostToPublish] = useState<PostItemDTO | null>(null);

  // Reset composer to fresh new post
  const handleResetComposer = () => {
    setEditingPostId(null);
    setPostType("TEXT");
    setContent("");
    setButtons([]);
    setMediaPath(null);
    setMediaOriginalName(null);
    setMediaMimeType(null);
    setMediaSizeBytes(null);
    setUploadError(null);
    setStatusMessage(null);
  };

  // Load existing draft into composer for editing
  const handleEditDraft = (post: PostItemDTO) => {
    setEditingPostId(post.id);
    setPostType(post.postType);
    setContent(post.content || "");
    setButtons(post.buttonsConfig || []);
    setMediaPath(post.mediaPath || null);
    setMediaOriginalName(post.mediaOriginalName || null);
    setMediaMimeType(post.mediaMimeType || null);
    setMediaSizeBytes(post.mediaSizeBytes || null);
    setSelectedBotId(post.botId);
    setSelectedChannelId(post.channelId);
    setStatusMessage({
      type: "warning",
      text: `Editing draft post (${post.id.slice(0, 8)}). Save changes when done.`,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Handle image file selection and upload
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    // Client-side quick check
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type.toLowerCase())) {
      setUploadError("Only JPEG, PNG, and WebP images are supported.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadError("Image size exceeds maximum limit of 5 MB.");
      return;
    }

    setUploadingImage(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/posts/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Image upload failed");
      }

      setMediaPath(data.filename);
      setMediaOriginalName(data.originalName);
      setMediaMimeType(data.mimeType);
      setMediaSizeBytes(data.sizeBytes);
    } catch (err: any) {
      setUploadError(err.message || "Failed to upload image.");
    } finally {
      setUploadingImage(false);
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

    setSavingDraft(true);
    setStatusMessage(null);

    try {
      let res: Response;
      if (editingPostId) {
        // Update existing post
        res = await fetch(`/api/posts/${editingPostId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            botId: selectedBotId,
            channelId: selectedChannelId,
            postType,
            content,
            mediaPath,
            mediaOriginalName,
            mediaMimeType,
            mediaSizeBytes,
            buttons,
          }),
        });
      } else {
        // Create new draft
        res = await fetch(
          `/api/bots/${selectedBotId}/channels/${selectedChannelId}/posts`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              postType,
              content,
              mediaPath,
              mediaOriginalName,
              mediaMimeType,
              mediaSizeBytes,
              buttons,
            }),
          }
        );
      }

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to save draft post.");
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

  // Open Publish Confirmation Modal
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

      setPostToPublish({
        id: editingPostId || "new",
        botId: selectedBotId,
        channelId: selectedChannelId,
        channelName: activeChannel?.name,
        channelChatId: activeChannel?.telegramChatId,
        postType,
        content,
        mediaPath,
        mediaOriginalName,
        buttonsConfig: buttons,
        status: "DRAFT",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
    setShowConfirmModal(true);
  };

  // Execute Publish to Telegram
  const handleConfirmPublish = async () => {
    if (!postToPublish) return;

    setPublishing(true);
    setStatusMessage(null);

    try {
      let targetPostId = postToPublish.id;

      // If publishing from composer without saving first, save draft first
      if (targetPostId === "new") {
        const createRes = await fetch(
          `/api/bots/${selectedBotId}/channels/${selectedChannelId}/posts`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              postType,
              content,
              mediaPath,
              mediaOriginalName,
              mediaMimeType,
              mediaSizeBytes,
              buttons,
            }),
          }
        );
        const createData = await createRes.json();
        if (!createRes.ok) {
          throw new Error(createData.error || "Failed to initialize post draft before sending.");
        }
        targetPostId = createData.post.id;
        setPosts((prev) => [createData.post, ...prev]);
        setEditingPostId(targetPostId);
      }

      // Call publish API endpoint
      const res = await fetch(`/api/posts/${targetPostId}/publish`, {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok) {
        // Handle UNKNOWN vs definitive FAILED
        if (data.status === "UNKNOWN") {
          setStatusMessage({
            type: "warning",
            text: `⚠️ Network Timeout: ${data.error}. Do not re-publish blindly. Please check your Telegram channel to see if it arrived.`,
          });
          setPosts((prev) =>
            prev.map((p) =>
              p.id === targetPostId
                ? { ...p, status: "UNKNOWN", lastError: data.error }
                : p
            )
          );
        } else {
          throw new Error(data.error || "Failed to publish post to channel.");
        }
      } else {
        setStatusMessage({
          type: "success",
          text: `🎉 Successfully published to ${activeChannel?.name || "channel"}! Telegram Message ID: ${data.messageId}`,
        });

        setPosts((prev) =>
          prev.map((p) =>
            p.id === targetPostId
              ? {
                  ...p,
                  status: "PUBLISHED",
                  telegramMessageId: data.messageId,
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
      const res = await fetch(`/api/posts/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete post");
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
      <div>
        <span className="botdesk-badge blue text-[10px] tracking-wider uppercase mb-1 inline-block">
          Channel Publishing
        </span>
        <h1 className="text-xl font-bold text-[var(--text)]">
          Channel Posts & Broadcast
        </h1>
        <p className="text-xs text-[var(--muted)] mt-1">
          Prepare, preview, draft, and publish posts to Telegram channels managed by your bots.
        </p>
      </div>

      {/* Target Selector & Bot Permission Bar */}
      <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--panel)] shadow-sm space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--muted)] mb-1">
              Select Publishing Bot
            </label>
            <select
              value={selectedBotId}
              onChange={(e) => setSelectedBotId(e.target.value)}
              className="botdesk-select text-xs w-full"
            >
              {bots.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} (@{b.username})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--muted)] mb-1">
              Select Target Channel
            </label>
            <select
              value={selectedChannelId}
              onChange={(e) => setSelectedChannelId(e.target.value)}
              className="botdesk-select text-xs w-full"
              disabled={channels.length === 0}
            >
              {channels.length === 0 ? (
                <option value="">No channels configured for this bot</option>
              ) : (
                channels.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.telegramChatId})
                  </option>
                ))
              )}
            </select>
          </div>
        </div>

        {/* Known Connection / Permission State */}
        <div className="flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-[var(--border)] text-xs">
          <div className="flex items-center gap-2">
            <span className="text-[var(--muted)]">Bot Channel Permission:</span>
            {checkingPermission ? (
              <span className="botdesk-badge text-[11px] paused">
                Verifying Telegram API...
              </span>
            ) : permissionCheck ? (
              <span
                className={`botdesk-badge text-[11px] ${
                  permissionCheck.status === "CAN_POST"
                    ? "enabled"
                    : permissionCheck.status === "CANNOT_POST"
                    ? "paused"
                    : permissionCheck.status === "NOT_ADMIN"
                    ? "red"
                    : "paused"
                }`}
              >
                {permissionCheck.status === "CAN_POST"
                  ? "✓ Can Post Messages"
                  : permissionCheck.status === "CANNOT_POST"
                  ? "⚠️ Missing Post Permission"
                  : permissionCheck.status === "NOT_ADMIN"
                  ? "✕ Not Channel Admin"
                  : "? Permission Unknown"}
              </span>
            ) : (
              <span className="botdesk-badge text-[11px] paused">
                Select a channel
              </span>
            )}
          </div>

          {permissionCheck && (
            <span className="text-[11px] text-[var(--muted)] italic">
              {permissionCheck.message}
            </span>
          )}
        </div>
      </div>

      {/* Status Banner */}
      {statusMessage && (
        <div
          className={`p-3 rounded-lg text-xs border ${
            statusMessage.type === "success"
              ? "bg-[var(--greenbg)] border-[var(--green)] text-[var(--green)]"
              : statusMessage.type === "warning"
              ? "bg-[var(--surface)] border-[var(--accent)] text-[var(--accent)]"
              : "bg-[var(--redbg)] border-[var(--red)] text-[var(--red)]"
          }`}
        >
          {statusMessage.text}
        </div>
      )}

      {/* Two-Column Layout: Composer (Left) & Telegram Preview (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Compose Area */}
        <div className="lg:col-span-7 space-y-4">
          <div className="p-5 rounded-xl border border-[var(--border)] bg-[var(--panel)] shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <div>
                <h2 className="text-sm font-bold text-[var(--text)]">
                  {editingPostId ? "Edit Post Draft" : "Compose Channel Post"}
                </h2>
                <p className="text-[11px] text-[var(--muted)]">
                  {postType === "TEXT"
                    ? "Compose text message with optional inline buttons"
                    : "Upload one photo with caption and optional inline buttons"}
                </p>
              </div>

              {editingPostId && (
                <button
                  type="button"
                  onClick={handleResetComposer}
                  className="botdesk-btn text-xs py-1 px-2.5"
                >
                  ＋ New Post
                </button>
              )}
            </div>

            {/* Post Type Selector */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--muted)] mb-1">
                Post Type
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setPostType("TEXT")}
                  className={`botdesk-btn text-xs py-2 ${
                    postType === "TEXT"
                      ? "bg-[var(--bluebg)] border-[var(--accent)] text-[var(--accent)] font-semibold"
                      : ""
                  }`}
                >
                  📝 Text-Only Message
                </button>
                <button
                  type="button"
                  onClick={() => setPostType("IMAGE")}
                  className={`botdesk-btn text-xs py-2 ${
                    postType === "IMAGE"
                      ? "bg-[var(--bluebg)] border-[var(--accent)] text-[var(--accent)] font-semibold"
                      : ""
                  }`}
                >
                  🖼️ Photo with Caption
                </button>
              </div>
            </div>

            {/* Image Upload Area (If postType === IMAGE) */}
            {postType === "IMAGE" && (
              <div className="p-3.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-[var(--text)]">
                    Upload Local Image
                  </label>
                  <span className="text-[11px] text-[var(--muted)]">
                    JPEG, PNG, WebP (Max 5 MB)
                  </span>
                </div>

                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleFileChange}
                  disabled={uploadingImage}
                  className="block w-full text-xs text-[var(--text)] file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-[var(--surface)] file:text-[var(--text)] hover:file:bg-[var(--bluebg)] cursor-pointer"
                />

                {uploadingImage && (
                  <p className="text-[11px] text-[var(--accent)] italic">
                    Uploading image to local non-public storage...
                  </p>
                )}

                {uploadError && (
                  <p className="text-[11px] text-[var(--red)]">{uploadError}</p>
                )}

                {mediaPath && (
                  <div className="flex items-center justify-between text-[11px] text-[var(--muted)] bg-[var(--surface)] p-2 rounded border border-[var(--border)]">
                    <span>
                      📷 {mediaOriginalName || mediaPath} (
                      {mediaSizeBytes
                        ? `${(mediaSizeBytes / 1024).toFixed(1)} KB`
                        : "Uploaded"}
                      )
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setMediaPath(null);
                        setMediaOriginalName(null);
                      }}
                      className="text-[var(--red)] hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Content / Caption Input */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                  {postType === "TEXT" ? "Message Text" : "Caption (Optional)"}
                </label>
                <span
                  className={`text-[11px] ${
                    currentChars > maxChars
                      ? "text-[var(--red)] font-semibold"
                      : "text-[var(--muted)]"
                  }`}
                >
                  {currentChars} / {maxChars}
                </span>
              </div>
              <textarea
                rows={postType === "TEXT" ? 6 : 4}
                maxLength={maxChars}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={
                  postType === "TEXT"
                    ? "Write your channel announcement or news..."
                    : "Add an optional caption for this image..."
                }
                className="botdesk-textarea text-xs"
              />
            </div>

            {/* Inline URL Buttons Builder */}
            <div className="space-y-2 pt-2 border-t border-[var(--border)]">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-semibold text-[var(--text)]">
                    Inline URL Buttons ({buttons.length} / 10)
                  </h3>
                  <p className="text-[11px] text-[var(--muted)]">
                    Buttons appear directly under the message in Telegram
                  </p>
                </div>
                <button
                  type="button"
                  disabled={buttons.length >= 10}
                  onClick={() => {
                    setBtnLabel("");
                    setBtnUrl("");
                    setBtnError(null);
                    setShowButtonModal(true);
                  }}
                  className="botdesk-btn text-xs py-1 px-2.5"
                >
                  ＋ Add Button
                </button>
              </div>

              {buttons.length === 0 ? (
                <div className="py-4 text-center text-[11px] text-[var(--muted)] border border-dashed border-[var(--border)] rounded-lg">
                  No inline buttons added. (Optional)
                </div>
              ) : (
                <div className="space-y-1.5">
                  {buttons.map((btn, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2 rounded bg-[var(--bg)] border border-[var(--border)] text-xs"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className="font-semibold text-[var(--text)]">
                          {btn.label}
                        </span>
                        <span className="text-[11px] text-[var(--muted)] truncate">
                          ({btn.url})
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveButton(idx)}
                        className="text-[var(--red)] hover:underline ml-2 text-xs flex-shrink-0"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Action Buttons: Save Draft & Publish */}
            <div className="flex items-center justify-between pt-4 border-t border-[var(--border)]">
              <button
                type="button"
                onClick={handleResetComposer}
                className="botdesk-btn text-xs py-2 px-3"
              >
                Clear
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={savingDraft || publishing}
                  onClick={handleSaveDraft}
                  className="botdesk-btn text-xs py-2 px-4"
                >
                  {savingDraft ? "Saving..." : "💾 Save Draft"}
                </button>

                <button
                  type="button"
                  disabled={
                    savingDraft ||
                    publishing ||
                    channels.length === 0 ||
                    (postType === "TEXT" && !content.trim()) ||
                    (postType === "IMAGE" && !mediaPath)
                  }
                  onClick={() => handleOpenPublish()}
                  className="botdesk-btn primary text-xs py-2 px-4 font-semibold"
                >
                  🚀 Publish Now
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Telegram Live Preview Simulator */}
        <div className="lg:col-span-5 space-y-4">
          <div className="p-5 rounded-xl border border-[var(--border)] bg-[var(--panel)] shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                Telegram Post Preview
              </span>
              <span className="botdesk-badge blue text-[10px]">Simulation</span>
            </div>

            {/* Telegram Channel Message Bubble Simulation */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3.5 space-y-3 shadow-inner">
              {/* Channel Header */}
              <div className="flex items-center gap-2 border-b border-[var(--border)] pb-2">
                <div className="w-7 h-7 rounded-full bg-[var(--bluebg)] border border-[var(--accent)] flex items-center justify-center text-xs font-bold text-[var(--accent)]">
                  📢
                </div>
                <div>
                  <h4 className="text-xs font-bold text-[var(--text)] leading-tight">
                    {activeChannel?.name || "Official Channel"}
                  </h4>
                  <span className="text-[10px] text-[var(--muted)]">
                    {activeChannel?.telegramChatId || "@channel"}
                  </span>
                </div>
              </div>

              {/* Uploaded Image Preview in Bubble */}
              {postType === "IMAGE" && (
                <div className="rounded-lg overflow-hidden border border-[var(--border)] bg-[var(--bg)] flex items-center justify-center min-h-[140px] max-h-[260px]">
                  {mediaPath ? (
                    <img
                      src={`/api/media/posts/${mediaPath}`}
                      alt="Preview"
                      className="w-full h-auto object-cover max-h-[260px]"
                    />
                  ) : (
                    <div className="p-6 text-center text-xs text-[var(--muted)] italic">
                      [Photo Placeholder] Upload an image above to preview
                    </div>
                  )}
                </div>
              )}

              {/* Message Content or Caption */}
              <div className="text-xs text-[var(--text)] whitespace-pre-wrap leading-relaxed">
                {content.trim() ? (
                  content
                ) : (
                  <span className="text-[var(--muted)] italic">
                    {postType === "TEXT"
                      ? "Message text will appear here..."
                      : "Optional caption will appear here..."}
                  </span>
                )}
              </div>

              {/* Inline URL Buttons in Telegram style */}
              {buttons.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  {buttons.map((btn, idx) => (
                    <a
                      key={idx}
                      href={btn.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block w-full text-center py-1.5 px-3 rounded-lg bg-[var(--panel)] border border-[var(--border)] text-xs font-medium text-[var(--accent)] hover:bg-[var(--bluebg)] transition truncate"
                    >
                      {btn.label} ↗
                    </a>
                  ))}
                </div>
              )}

              <div className="text-right text-[10px] text-[var(--muted)] pt-1">
                {new Date().toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
            </div>

            <p className="text-[11px] text-[var(--muted)] italic border-t border-[var(--border)] pt-2 leading-relaxed">
              ℹ️ Preview note: This is a browser approximation. Clicking "Publish Now" requires confirmation and dispatches the post to your real Telegram channel via Bot API.
            </p>
          </div>
        </div>
      </div>

      {/* History & Drafts Section */}
      <div className="p-5 rounded-xl border border-[var(--border)] bg-[var(--panel)] shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-[var(--text)]">
              Post History & Drafts ({posts.length})
            </h3>
            <p className="text-xs text-[var(--muted)]">
              Drafts, published posts, and past delivery attempts for this bot
            </p>
          </div>
        </div>

        {posts.length === 0 ? (
          <div className="py-8 text-center text-xs text-[var(--muted)] border border-dashed border-[var(--border)] rounded-lg">
            No posts recorded yet. Compose a message and click "Save Draft" to begin.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[var(--border)] text-[var(--muted)] font-semibold uppercase tracking-wider text-[10px]">
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">Target Channel</th>
                  <th className="py-2.5 px-3">Content Snippet</th>
                  <th className="py-2.5 px-3">Buttons</th>
                  <th className="py-2.5 px-3">Msg ID</th>
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {posts.map((post) => (
                  <tr
                    key={post.id}
                    className="hover:bg-[var(--surface)] transition"
                  >
                    <td className="py-3 px-3 whitespace-nowrap">
                      <span
                        className={`botdesk-badge text-[10px] ${
                          post.status === "PUBLISHED"
                            ? "enabled"
                            : post.status === "SENDING"
                            ? "paused"
                            : post.status === "FAILED"
                            ? "red"
                            : post.status === "UNKNOWN"
                            ? "paused"
                            : "blue"
                        }`}
                      >
                        {post.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap font-medium text-[var(--text)]">
                      {post.postType === "IMAGE" ? "🖼️ Image" : "📝 Text"}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap text-[var(--muted)]">
                      {post.channelName || post.channelChatId || post.channelId}
                    </td>
                    <td className="py-3 px-3 max-w-xs truncate text-[var(--text)]">
                      {post.content || "(No text)"}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap text-[var(--muted)]">
                      {post.buttonsConfig && Array.isArray(post.buttonsConfig)
                        ? `${post.buttonsConfig.length} btn`
                        : "None"}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap font-mono text-[var(--muted)]">
                      {post.telegramMessageId ? `#${post.telegramMessageId}` : "-"}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap text-[var(--muted)]">
                      {new Date(post.createdAt).toLocaleDateString()}{" "}
                      {new Date(post.createdAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap text-right space-x-1.5">
                      {post.status !== "PUBLISHED" && post.status !== "SENDING" && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleEditDraft(post)}
                            className="botdesk-btn text-[11px] py-1 px-2"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenPublish(post)}
                            className="botdesk-btn primary text-[11px] py-1 px-2"
                          >
                            Publish
                          </button>
                        </>
                      )}
                      {post.status !== "SENDING" && (
                        <button
                          type="button"
                          onClick={() => handleDeletePost(post.id)}
                          className="botdesk-btn danger text-[11px] py-1 px-2"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-xl bg-[var(--panel)] border border-[var(--border)] p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-[var(--text)]">
              Add Inline URL Button
            </h3>

            {btnError && (
              <div className="p-2 rounded bg-[var(--redbg)] border border-[var(--red)] text-xs text-[var(--red)]">
                {btnError}
              </div>
            )}

            <form onSubmit={handleAddButton} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold uppercase text-[var(--muted)] mb-1">
                  Button Label (Max 64 chars)
                </label>
                <input
                  type="text"
                  required
                  maxLength={64}
                  value={btnLabel}
                  onChange={(e) => setBtnLabel(e.target.value)}
                  placeholder="e.g. 🌐 Read Full Article"
                  className="botdesk-input text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold uppercase text-[var(--muted)] mb-1">
                  Destination URL (HTTPS or tg://)
                </label>
                <input
                  type="url"
                  required
                  value={btnUrl}
                  onChange={(e) => setBtnUrl(e.target.value)}
                  placeholder="https://example.com/announcement"
                  className="botdesk-input text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => setShowButtonModal(false)}
                  className="botdesk-btn text-xs py-1.5 px-3"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="botdesk-btn primary text-xs py-1.5 px-4 font-semibold"
                >
                  Add Button
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Publish Confirmation Modal */}
      {showConfirmModal && postToPublish && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-xl bg-[var(--panel)] border border-[var(--border)] p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2.5 text-[var(--accent)]">
              <span className="text-xl">⚠️</span>
              <h3 className="text-base font-bold text-[var(--text)]">
                Confirm Channel Publish
              </h3>
            </div>

            <p className="text-xs text-[var(--text)] leading-relaxed">
              You are about to dispatch this post to your real Telegram channel. Once published, subscribers will see it immediately.
            </p>

            <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-[var(--muted)]">Publishing Bot:</span>
                <span className="font-semibold text-[var(--text)]">
                  {activeBot.name} (@{activeBot.username})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--muted)]">Target Channel:</span>
                <span className="font-semibold text-[var(--text)]">
                  {activeChannel?.name || "Selected Channel"} ({activeChannel?.telegramChatId})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--muted)]">Post Type:</span>
                <span className="font-semibold text-[var(--text)]">
                  {postToPublish.postType === "IMAGE" ? "Photo with Caption" : "Text Message"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--muted)]">Buttons:</span>
                <span className="font-semibold text-[var(--text)]">
                  {postToPublish.buttonsConfig?.length || 0} inline button(s)
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border)]">
              <button
                type="button"
                disabled={publishing}
                onClick={() => setShowConfirmModal(false)}
                className="botdesk-btn text-xs py-2 px-3"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={publishing}
                onClick={handleConfirmPublish}
                className="botdesk-btn primary text-xs py-2 px-4 font-semibold"
              >
                {publishing ? "Publishing to Telegram..." : "Yes, Publish to Channel"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
