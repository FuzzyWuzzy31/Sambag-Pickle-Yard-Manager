import React from 'react'
import { supabase } from '../lib/supabaseClient'
import { NavLink, useNavigate } from 'react-router-dom'

export default function TopNav({ title = 'Open Play' }) {
  const navigate = useNavigate()

  const navItems = [
    { to: '/', label: 'Today' },
    { to: '/history', label: 'History' },
    { to: '/debt', label: 'Debt' },
    { to: '/players', label: 'Players' },
    { to: '/settings', label: 'Settings' },
  ]

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <div className="space-y-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-emerald-400/80">Pickleball Hub</p>
          <h1 className="text-lg font-semibold">{title}</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/settings')}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/90 backdrop-blur-sm"
          >
            Settings
          </button>
          <button onClick={handleLogout} className="rounded-full bg-rose-500 px-3 py-2 text-sm font-medium text-white">
            Logout
          </button>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              [
                'whitespace-nowrap rounded-full px-4 py-2 text-sm transition',
                isActive
                  ? 'bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/20'
                  : 'border border-white/10 bg-white/5 text-white/80 hover:bg-white/10',
              ].join(' ')
            }
          >
            {item.label}
          </NavLink>
        ))}
      </div>
    </div>
  )
}
