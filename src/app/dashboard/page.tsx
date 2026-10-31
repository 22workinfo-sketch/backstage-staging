import { redirect } from "next/navigation";
import Link from "next/link";
import { getAdminSession } from "@/lib/auth";
import { getAllBots } from "@/lib/bot-service";
import { Navbar } from "@/components/Navbar";

export default async function DashboardPage() {
  const session = await getAdminSession();
  if (!session) {
    redirect("/login");
  }

  const bots = await getAllBots();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <Navbar userEmail={session.email} role={session.role} />

      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Bot Management Dashboard
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Overview of your connected Telegram bots and user analytics.
          </p>
        </div>

        {/* Status Metrics */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3 mb-8">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Connected Bots
            </div>
            <div className="mt-2 text-3xl font-bold text-white">
              {bots.length}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              1 Active in Local MVP
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Total Recorded Users
            </div>
            <div className="mt-2 text-3xl font-bold text-blue-400">
              {bots.reduce((acc, bot) => acc + bot._count.users, 0)}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              Across all bot instances
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Database Isolation
            </div>
            <div className="mt-2 flex items-center space-x-2">
              <span className="inline-flex h-3 w-3 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50"></span>
              <span className="text-lg font-semibold text-white">
                Enforced (bot_id)
              </span>
            </div>
            <div className="mt-1 text-xs text-slate-500">
              Ready for multi-bot expansion
            </div>
          </div>
        </div>

        {/* Bot Cards List */}
        <div className="rounded-xl border border-slate-800 bg-slate-900 shadow-sm overflow-hidden">
          <div className="border-b border-slate-800 px-6 py-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-white">
              Your Registered Bots
            </h2>
            <span className="text-xs text-slate-400">
              Showing {bots.length} of {bots.length} bots
            </span>
          </div>

          <div className="divide-y divide-slate-800">
            {bots.map((bot) => (
              <div
                key={bot.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-6 hover:bg-slate-800/40 transition"
              >
                <div className="space-y-1">
                  <div className="flex items-center space-x-3">
                    <span className="text-lg font-bold text-white">
                      {bot.name}
                    </span>
                    <span className="rounded-full bg-blue-950/70 border border-blue-800/50 px-2.5 py-0.5 text-xs font-medium text-blue-400">
                      @{bot.username}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium border ${
                        bot.isActive
                          ? "bg-emerald-950/70 border-emerald-800/50 text-emerald-400"
                          : "bg-slate-800 border-slate-700 text-slate-400"
                      }`}
                    >
                      {bot.isActive ? "ACTIVE" : "INACTIVE"}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 font-mono">
                    ID: {bot.id}
                  </div>
                  <div className="text-xs text-slate-400">
                    Token Source:{" "}
                    <code className="bg-slate-800 border border-slate-700 px-1.5 py-0.5 rounded text-slate-300">
                      {bot.tokenEnvVar}
                    </code>
                  </div>
                </div>

                <div className="mt-4 sm:mt-0 flex items-center space-x-6">
                  <div className="text-right">
                    <div className="text-xl font-bold text-white">
                      {bot._count.users}
                    </div>
                    <div className="text-xs text-slate-400">Registered Users</div>
                  </div>

                  <Link
                    href={`/bots/${bot.id}`}
                    className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-blue-600/20 hover:bg-blue-500 transition"
                  >
                    Manage Bot →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
