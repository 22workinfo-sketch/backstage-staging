"use client";

import React, { memo } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { FlowNodeData, FlowNodeType } from "@/lib/flow/types";

const NODE_STYLES: Record<
  FlowNodeType,
  { bg: string; border: string; badge: string; icon: string; label: string }
> = {
  START: {
    bg: "bg-[#0b2118]/90",
    border: "border-emerald-500/60",
    badge: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    icon: "🚀",
    label: "Start",
  },
  TEXT: {
    bg: "bg-[#0b1b2d]/90",
    border: "border-sky-500/60",
    badge: "bg-sky-500/15 text-sky-300 border-sky-500/30",
    icon: "💬",
    label: "Text Message",
  },
  IMAGE: {
    bg: "bg-[#181229]/90",
    border: "border-purple-500/60",
    badge: "bg-purple-500/15 text-purple-300 border-purple-500/30",
    icon: "🖼️",
    label: "Photo Message",
  },
  VIDEO: {
    bg: "bg-[#13152d]/90",
    border: "border-indigo-500/60",
    badge: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
    icon: "🎥",
    label: "Video Message",
  },
  BUTTON_MENU: {
    bg: "bg-[#221a10]/90",
    border: "border-amber-500/60",
    badge: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    icon: "📋",
    label: "Menu & Buttons",
  },
  REQUEST_PHONE: {
    bg: "bg-[#0c2538]/90",
    border: "border-sky-400/60",
    badge: "bg-sky-500/15 text-[#38bdf8] border-sky-500/30",
    icon: "📱",
    label: "Phone Request",
  },
  CONDITION: {
    bg: "bg-[#1d1126]/90",
    border: "border-violet-500/60",
    badge: "bg-violet-500/15 text-violet-300 border-violet-500/30",
    icon: "🔀",
    label: "Channel Check",
  },
  USER_INPUT: {
    bg: "bg-[#0b2121]/90",
    border: "border-teal-500/60",
    badge: "bg-teal-500/15 text-teal-300 border-teal-500/30",
    icon: "⌨️",
    label: "User Input",
  },
  END: {
    bg: "bg-[#261116]/90",
    border: "border-rose-500/60",
    badge: "bg-rose-500/15 text-rose-300 border-rose-500/30",
    icon: "🏁",
    label: "End Flow",
  },
};

export const FlowCanvasNode = memo(({ data, selected }: NodeProps<FlowNodeData>) => {
  const type = data.nodeType || "TEXT";
  const style = NODE_STYLES[type] || NODE_STYLES.TEXT;
  const isStart = type === "START";
  const isEnd = type === "END";
  const isCondition = type === "CONDITION";
  const hasButtons = (data.buttons || []).length > 0;

  return (
    <div
      className={`min-w-[240px] max-w-[280px] rounded-2xl border-2 backdrop-blur-md shadow-xl transition-all duration-150 ${
        style.bg
      } ${
        selected
          ? "border-[#38bdf8] ring-4 ring-sky-500/40 shadow-[0_0_26px_rgba(56,189,248,0.35)] scale-[1.01]"
          : `${style.border} hover:shadow-2xl hover:border-opacity-100`
      } ${data.disabled ? "opacity-50" : "opacity-100"}`}
    >
      {/* Target handle on top (except START node) */}
      {!isStart && (
        <Handle
          type="target"
          position={Position.Top}
          className="!w-3.5 !h-3.5 !bg-slate-300 !border-2 !border-slate-950 hover:!bg-[#38bdf8] hover:!scale-125 !transition-all !shadow-sm"
        />
      )}

      {/* Header */}
      <div className="px-3.5 py-2.5 border-b border-white/10 flex items-center justify-between gap-2 bg-black/20 rounded-t-2xl">
        <div className="flex items-center gap-2.5 overflow-hidden">
          <span className="w-6 h-6 rounded-lg bg-black/40 border border-white/10 flex items-center justify-center text-xs select-none flex-shrink-0 shadow-inner">
            {style.icon}
          </span>
          <span className="font-semibold text-xs tracking-wide text-white truncate">
            {data.title || style.label}
          </span>
        </div>
        <span
          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border shadow-xs ${style.badge}`}
        >
          {style.label}
        </span>
      </div>

      {/* Body Content */}
      <div className="p-3 text-xs text-slate-300 space-y-2">
        {/* Text Snippet */}
        {data.text && (
          <p className="line-clamp-2 text-slate-300 italic bg-black/20 p-2 rounded-lg border border-white/5">
            "{data.text}"
          </p>
        )}

        {/* Media Preview */}
        {(type === "IMAGE" || type === "VIDEO") && (
          <div className="bg-black/30 rounded-lg p-2 border border-white/5 text-[11px] text-slate-400">
            {data.mediaUrl ? (
              <span className="truncate block">📎 {data.mediaUrl}</span>
            ) : data.mediaStorageKey ? (
              <span className="truncate block">💾 Key: {data.mediaStorageKey}</span>
            ) : (
              <span className="text-amber-400">⚠️ No media configured</span>
            )}
            {data.caption && (
              <p className="line-clamp-1 mt-1 text-slate-300">
                Caption: {data.caption}
              </p>
            )}
          </div>
        )}

        {/* Input Variable Pill */}
        {type === "USER_INPUT" && (
          <div className="flex items-center gap-1.5 bg-black/30 px-2.5 py-1 rounded-lg text-[11px] text-teal-300 border border-teal-500/20">
            <span>Variable:</span>
            <code className="font-mono bg-teal-950/60 px-1.5 py-0.5 rounded text-teal-200">
              ${data.variableName || "input"}
            </code>
          </div>
        )}

        {/* Condition details */}
        {isCondition && (
          <div className="bg-black/30 p-2 rounded-lg border border-white/5 space-y-1">
            <div className="text-[11px] text-slate-400">
              Channel:{" "}
              <span className="text-violet-300 font-medium">
                {data.channelId ? "Associated Channel" : "None selected"}
              </span>
            </div>
          </div>
        )}

        {/* Auto delete badge */}
        {data.autoDeleteReply && (
          <div className="text-[10px] text-amber-300 flex items-center gap-1">
            <span>⏱️ Auto-deletes after {data.deleteAfterSeconds || 30}s</span>
          </div>
        )}

        {/* Buttons List Preview */}
        {hasButtons && (
          <div className="space-y-1 pt-1">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
              Buttons:
            </span>
            <div className="space-y-1.5">
              {data.buttons?.map((btn) => (
                <div
                  key={btn.id}
                  className="relative flex items-center justify-between bg-black/40 hover:bg-black/70 px-2.5 py-1.5 rounded-lg border border-white/10 text-[11px] text-slate-100 transition-colors shadow-xs"
                >
                  <span className="truncate pr-4 font-medium">
                    {btn.label || "Untitled Button"}
                  </span>
                  {/* Distinct source handle for each button */}
                  <Handle
                    type="source"
                    id={btn.id}
                    position={Position.Right}
                    className="!w-3 !h-3 !bg-amber-400 !border-2 !border-slate-950 hover:!bg-amber-300 hover:!scale-125 !transition-all"
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Condition Outcomes Handles */}
      {isCondition && (
        <div className="border-t border-white/10 p-2 space-y-1.5 bg-black/20 rounded-b-2xl">
          <div className="relative flex items-center justify-between text-[11px] text-emerald-400 font-medium px-1">
            <span>✅ Joined</span>
            <Handle
              type="source"
              id="joined"
              position={Position.Right}
              className="!w-3 !h-3 !bg-emerald-400 !border-2 !border-slate-950 hover:!scale-125 !transition-all"
            />
          </div>
          <div className="relative flex items-center justify-between text-[11px] text-rose-400 font-medium px-1">
            <span>❌ Not Joined</span>
            <Handle
              type="source"
              id="not_joined"
              position={Position.Right}
              className="!w-3 !h-3 !bg-rose-400 !border-2 !border-slate-950 hover:!scale-125 !transition-all"
            />
          </div>
          <div className="relative flex items-center justify-between text-[11px] text-amber-400 font-medium px-1">
            <span>⚠️ Error</span>
            <Handle
              type="source"
              id="verification_error"
              position={Position.Right}
              className="!w-3 !h-3 !bg-amber-400 !border-2 !border-slate-950 hover:!scale-125 !transition-all"
            />
          </div>
        </div>
      )}

      {/* Default bottom source handle (for non-condition, non-end nodes, or fallback) */}
      {!isEnd && !isCondition && !hasButtons && (
        <Handle
          type="source"
          id="default"
          position={Position.Bottom}
          className="!w-3.5 !h-3.5 !bg-[#38bdf8] !border-2 !border-slate-950 hover:!bg-white hover:!scale-125 !transition-all !shadow-sm"
        />
      )}
    </div>
  );
});

FlowCanvasNode.displayName = "FlowCanvasNode";
