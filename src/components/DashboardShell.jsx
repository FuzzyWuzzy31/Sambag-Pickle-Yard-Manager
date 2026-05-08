import React from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

const navItems = [
  { to: '/', label: 'Dashboard', hint: 'Today session' },
  { to: '/history', label: 'History', hint: 'Past sessions' },
  { to: '/debt', label: 'Debt', hint: 'Unpaid balances' },
  { to: '/players', label: 'Players', hint: 'Search and analytics' },
  { to: '/settings', label: 'Settings', hint: 'Fees and exports' },
]

export default function DashboardShell({ title, subtitle, children, actions }) {
  const navigate = useNavigate()

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(34,197,94,0.18),_transparent_30%),radial-gradient(circle_at_20%_20%,_rgba(14,165,233,0.12),_transparent_24%),linear-gradient(180deg,_#12081f_0%,_#0b1020_46%,_#070b13_100%)] text-white">
      <div className="mx-auto flex min-h-screen max-w-[1600px] gap-0 md:gap-6">
        <aside className="hidden w-72 shrink-0 border-r border-white/10 bg-white/[0.03] px-4 py-5 backdrop-blur-xl md:flex md:flex-col">
          <div className="mb-8">
            <div className="text-xs uppercase tracking-[0.35em] text-white/40">PeoplePro</div>
            <div className="mt-2 text-2xl font-semibold tracking-tight">Open Play</div>
            <div className="mt-1 text-sm text-white/55">Pickleball session manager</div>
          </div>

          <nav className="space-y-2">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  [
                    'group flex items-center justify-between rounded-2xl border px-4 py-3 transition',
                    isActive
                      ? 'border-emerald-300/30 bg-gradient-to-r from-emerald-400/30 via-emerald-300/20 to-cyan-300/20 shadow-lg shadow-emerald-500/10'
                      : 'border-transparent bg-transparent text-white/65 hover:border-white/10 hover:bg-white/5 hover:text-white',
                  ].join(' ')
                }
              >
                <span>
                  <div className="text-sm font-medium">{item.label}</div>
                  <div className="text-xs text-white/45 group-hover:text-white/55">{item.hint}</div>
                </span>
                <span className="text-white/40 group-hover:text-white/80">↗</span>
              </NavLink>
            ))}
          </nav>

          <div className="mt-auto space-y-3 pt-6">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs uppercase tracking-[0.24em] text-white/40">Quick actions</div>
              <button
                onClick={() => navigate('/')}
                className="mt-3 w-full rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-medium text-slate-950 shadow-lg shadow-emerald-500/20"
              >
                Back to dashboard
              </button>
            </div>
            <button
              onClick={handleLogout}
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white/85 hover:bg-white/10"
            >
              Logout
            </button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="sticky top-0 z-30 border-b border-white/10 bg-[#0b1020]/80 px-4 py-3 backdrop-blur-xl md:hidden">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.28em] text-white/40">PeoplePro</div>
                <div className="text-sm font-semibold">Open Play</div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => navigate('/')}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/80"
                >
                  Dashboard
                </button>
                <button
                  onClick={handleLogout}
                  className="rounded-full bg-rose-500 px-3 py-2 text-xs font-medium text-white"
                >
                  Logout
                </button>
              </div>
            </div>
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    [
                      'whitespace-nowrap rounded-full px-3 py-2 text-xs transition',
                      isActive ? 'bg-emerald-400 text-slate-950' : 'bg-white/5 text-white/70',
                    ].join(' ')
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
          </div>

          <main className="flex-1 px-4 py-5 md:px-6 md:py-6">
            <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="text-xs uppercase tracking-[0.28em] text-emerald-300/75">{title?.label || 'Dashboard'}</div>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">{title?.heading || 'Welcome back'}</h1>
                {subtitle ? <p className="mt-2 max-w-2xl text-sm text-white/60">{subtitle}</p> : null}
              </div>
              {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
            </div>

            {children}
          </main>
        </div>
      </div>
    </div>
  )
}
