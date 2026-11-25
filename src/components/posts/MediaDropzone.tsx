"use client";

import React from "react";
import { AnimatePresence, motion } from "motion/react";

export interface UploadQueueItem {
  id: string;
  name: string;
  ext: string;
  sizeBytes: number;
  progress: number;
  speedLabel?: string;
  status: "uploading" | "done" | "error";
  error?: string;
}

export interface UploadProgressResult<T> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
}

/**
 * Uploads FormData via XMLHttpRequest to emit real-time upload progress percentages
 * and throughput rates while preserving same-origin session cookies.
 */
export function uploadWithProgress<T = any>(
  url: string,
  formData: FormData,
  onProgress: (percent: number, speedLabel: string) => void
): Promise<UploadProgressResult<T>> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    const startTime = Date.now();

    xhr.open("POST", url, true);
    xhr.withCredentials = true;

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || event.total <= 0) return;
      const percent = Math.min(99, Math.max(1, Math.round((event.loaded / event.total) * 100)));
      const elapsedSec = Math.max(0.15, (Date.now() - startTime) / 1000);
      const bytesPerSec = event.loaded / elapsedSec;
      const speedLabel =
        bytesPerSec >= 1024 * 1024
          ? `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`
          : `${Math.max(1, Math.round(bytesPerSec / 1024))} KB/s`;
      onProgress(percent, speedLabel);
    };

    xhr.onload = () => {
      let parsed: any = undefined;
      try {
        parsed = xhr.responseText ? JSON.parse(xhr.responseText) : {};
      } catch {
        parsed = undefined;
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100, "Complete");
        resolve({ ok: true, status: xhr.status, data: parsed as T });
      } else {
        resolve({
          ok: false,
          status: xhr.status,
          data: parsed as T,
          error:
            (parsed && (parsed.error || parsed.message)) ||
            `Upload failed (${xhr.status})`,
        });
      }
    };

    xhr.onerror = () => {
      resolve({
        ok: false,
        status: 0,
        error: "Network connection error during file upload.",
      });
    };

    xhr.onabort = () => {
      resolve({
        ok: false,
        status: 0,
        error: "Upload was cancelled.",
      });
    };

    xhr.send(formData);
  });
}

function formatBytesCompact(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function extractFileExt(filename: string, mime?: string): string {
  const parts = filename.split(".");
  if (parts.length > 1) {
    const ext = parts[parts.length - 1].trim().toUpperCase();
    if (ext && ext.length <= 5) return ext;
  }
  if (mime) {
    if (mime.includes("mp4")) return "MP4";
    if (mime.includes("quicktime")) return "MOV";
    if (mime.includes("webm")) return "WEBM";
    if (mime.includes("png")) return "PNG";
    if (mime.includes("webp")) return "WEBP";
    if (mime.includes("jpeg") || mime.includes("jpg")) return "JPG";
  }
  return "FILE";
}

interface MediaDropzoneProps {
  title: string;
  subtitle: string;
  accept: string;
  multiple?: boolean;
  disabled?: boolean;
  isDragOver: boolean;
  canUseClipboardRead: boolean;
  browseLabel: string;
  clipboardTitle?: string;
  onDragOverChange: (dragging: boolean) => void;
  onDropFiles: (files: File[]) => void;
  onFileInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClipboardClick: () => void;
}

export function MediaDropzone({
  title,
  subtitle,
  accept,
  multiple = false,
  disabled = false,
  isDragOver,
  canUseClipboardRead,
  browseLabel,
  clipboardTitle = "Read media from system clipboard",
  onDragOverChange,
  onDropFiles,
  onFileInputChange,
  onClipboardClick,
}: MediaDropzoneProps) {
  return (
    <motion.div
      animate={{
        scale: isDragOver ? 1.012 : 1,
      }}
      transition={{ type: "spring", stiffness: 420, damping: 30 }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) onDragOverChange(true);
      }}
      onDragLeave={() => onDragOverChange(false)}
      onDrop={(e) => {
        e.preventDefault();
        onDragOverChange(false);
        if (disabled) return;
        const files = Array.from(e.dataTransfer.files || []);
        if (files.length > 0) onDropFiles(files);
      }}
      className={`group relative overflow-hidden rounded-2xl border-2 border-dashed p-6 sm:p-7 text-center transition-colors duration-200 ${
        isDragOver
          ? "border-[#38bdf8] bg-sky-500/[0.09] shadow-[0_0_32px_-6px_rgba(56,189,248,0.35)]"
          : "border-white/[0.09] bg-[#0a0f1a] hover:border-sky-400/40 hover:bg-[#0c1322]"
      }`}
    >
      {/* Subtle top radial Sky Cyan glow */}
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 h-28 bg-[radial-gradient(60%_100%_at_50%_0%,rgba(56,189,248,0.16),transparent)] transition-opacity duration-300 ${
          isDragOver ? "opacity-100" : "opacity-50 group-hover:opacity-90"
        }`}
        aria-hidden="true"
      />

      <div className="relative z-10 flex flex-col items-center justify-center gap-2">
        {/* Glowing Sky Cyan Upload Orb */}
        <motion.div
          animate={
            isDragOver
              ? { y: -4, scale: 1.08 }
              : { y: 0, scale: 1 }
          }
          transition={{ type: "spring", stiffness: 380, damping: 24 }}
          className="w-12 h-12 rounded-full bg-gradient-to-b from-[#38bdf8] to-[#0284c7] text-slate-950 flex items-center justify-center shadow-[0_0_24px_rgba(56,189,248,0.45),inset_0_1px_1px_rgba(255,255,255,0.5)] mb-1 group-hover:scale-105 transition-transform"
          aria-hidden="true"
        >
          <svg
            className="w-5 h-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 17V4" />
            <path d="m7 9 5-5 5 5" />
            <path d="M4 20h16" />
          </svg>
        </motion.div>

        <p className="text-xs sm:text-sm font-semibold text-white tracking-tight">
          {title}
        </p>
        <p className="text-[11px] text-slate-400">{subtitle}</p>
      </div>

      <div className="relative z-10 flex items-center justify-center gap-2.5 pt-4 flex-wrap">
        {canUseClipboardRead && (
          <motion.button
            whileHover={disabled ? undefined : { y: -1 }}
            whileTap={disabled ? undefined : { scale: 0.96 }}
            type="button"
            disabled={disabled}
            onClick={onClipboardClick}
            className="text-xs py-1.5 px-3.5 rounded-xl bg-[#131d2e] hover:bg-[#1a2840] text-[#38bdf8] border border-sky-400/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] flex items-center gap-1.5 font-medium disabled:opacity-45 transition-colors cursor-pointer"
            title={clipboardTitle}
          >
            <span>📋 Paste from Clipboard</span>
          </motion.button>
        )}

        <label
          className={`text-xs py-1.5 px-3.5 rounded-xl bg-[#131d2e] hover:bg-[#1a2840] text-slate-200 border border-white/[0.1] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] flex items-center gap-1.5 font-medium transition-all ${
            disabled ? "opacity-45 cursor-not-allowed" : "cursor-pointer hover:-translate-y-[1px] active:scale-[0.97]"
          }`}
        >
          <span>📁 {browseLabel}</span>
          <input
            type="file"
            multiple={multiple}
            accept={accept}
            onChange={onFileInputChange}
            disabled={disabled}
            className="hidden"
          />
        </label>
      </div>
    </motion.div>
  );
}

export function UploadQueueList({
  items,
  onDismiss,
}: {
  items: UploadQueueItem[];
  onDismiss?: (id: string) => void;
}) {
  if (items.length === 0) return null;

  return (
    <div className="space-y-2 pt-1">
      <div className="flex items-center justify-between px-0.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-slate-400">
          Uploads ({items.length})
        </span>
      </div>

      <div className="space-y-2">
        <AnimatePresence initial={false}>
          {items.map((item) => {
            const isError = item.status === "error";
            const isDone = item.status === "done";
            return (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, y: 6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.98 }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                className={`rounded-xl border px-3.5 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] ${
                  isError
                    ? "bg-rose-950/30 border-rose-500/35"
                    : isDone
                    ? "bg-[#0e1926] border-emerald-500/30"
                    : "bg-[#0d1422] border-white/[0.08]"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <span
                      className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded-md border flex-shrink-0 ${
                        isError
                          ? "bg-rose-500/15 text-rose-300 border-rose-500/30"
                          : isDone
                          ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                          : "bg-sky-500/15 text-[#38bdf8] border-sky-400/30"
                      }`}
                    >
                      {item.ext}
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-white truncate">
                        {item.name}
                      </p>
                      <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono tabular-nums mt-0.5">
                        <span>{formatBytesCompact(item.sizeBytes)}</span>
                        {item.speedLabel && (
                          <>
                            <span>•</span>
                            <span
                              className={
                                isError
                                  ? "text-rose-300"
                                  : isDone
                                  ? "text-emerald-400"
                                  : "text-sky-300"
                              }
                            >
                              {item.error || item.speedLabel}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span
                      className={`font-mono text-xs font-bold tabular-nums ${
                        isError
                          ? "text-rose-400"
                          : isDone
                          ? "text-emerald-400"
                          : "text-[#38bdf8]"
                      }`}
                    >
                      {isError ? "ERR" : `${item.progress}%`}
                    </span>

                    {onDismiss && (isDone || isError) && (
                      <button
                        type="button"
                        onClick={() => onDismiss(item.id)}
                        className="text-slate-500 hover:text-slate-200 text-xs px-1 cursor-pointer transition-colors"
                        aria-label="Dismiss upload item"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                {/* Animated Progress Track */}
                <div className="mt-2 h-1.5 w-full rounded-full bg-slate-950/90 border border-white/[0.05] overflow-hidden">
                  <motion.div
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: Math.max(0.03, item.progress / 100) }}
                    transition={{ type: "spring", stiffness: 260, damping: 28 }}
                    style={{ transformOrigin: "left center" }}
                    className={`h-full w-full rounded-full ${
                      isError
                        ? "bg-rose-500"
                        : isDone
                        ? "bg-gradient-to-r from-emerald-500 to-teal-300 shadow-[0_0_10px_rgba(52,211,153,0.5)]"
                        : "bg-gradient-to-r from-sky-500 via-[#38bdf8] to-cyan-300 shadow-[0_0_12px_rgba(56,189,248,0.65)]"
                    }`}
                  />
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
