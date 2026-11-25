export default function AppLoadingSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading workspace content">
      {/* Header skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-2.5">
          <div className="botdesk-skeleton h-7 w-48 rounded-lg" />
          <div className="botdesk-skeleton h-4 w-72 rounded-md opacity-70" />
        </div>
        <div className="botdesk-skeleton h-10 w-36 rounded-xl" />
      </div>

      {/* Summary metric cards skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[0, 1, 2].map((idx) => (
          <div
            key={idx}
            className="rounded-xl border border-white/[0.06] bg-[#121620]/80 p-5 space-y-3"
          >
            <div className="botdesk-skeleton h-3.5 w-24 rounded" />
            <div className="botdesk-skeleton h-8 w-20 rounded-lg" />
            <div className="botdesk-skeleton h-3 w-32 rounded opacity-60" />
          </div>
        ))}
      </div>

      {/* Main panel skeleton */}
      <div className="rounded-xl border border-white/[0.06] bg-[#121620]/80 p-6 space-y-4">
        <div className="flex items-center justify-between gap-4 pb-3 border-b border-white/[0.06]">
          <div className="botdesk-skeleton h-5 w-40 rounded" />
          <div className="botdesk-skeleton h-8 w-56 rounded-full" />
        </div>
        <div className="space-y-3 pt-1">
          {[0, 1, 2, 3].map((row) => (
            <div
              key={row}
              className="flex items-center justify-between gap-4 py-2.5 px-3 rounded-lg bg-white/[0.02]"
            >
              <div className="flex items-center gap-3">
                <div className="botdesk-skeleton h-9 w-9 rounded-lg" />
                <div className="space-y-1.5">
                  <div className="botdesk-skeleton h-4 w-36 rounded" />
                  <div className="botdesk-skeleton h-3 w-24 rounded opacity-60" />
                </div>
              </div>
              <div className="botdesk-skeleton h-6 w-20 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
