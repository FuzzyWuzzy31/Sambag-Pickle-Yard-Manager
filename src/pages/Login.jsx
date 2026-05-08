import React, { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useNavigate } from 'react-router-dom'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    setLoading(false)

    if (error) {
      console.error('Login failed:', error)
      setError(error.message)
      return
    }

    navigate('/')
  }

  return (
    <div className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(34,197,94,0.2),_transparent_30%),radial-gradient(circle_at_20%_30%,_rgba(14,165,233,0.12),_transparent_28%),linear-gradient(180deg,_#13081f_0%,_#090d18_48%,_#06070b_100%)] text-white">
      <div className="mx-auto flex min-h-screen max-w-[1400px] items-center px-4 py-8 sm:px-6 lg:px-10">
        <div className="grid w-full gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-8">
          <section className="flex flex-col justify-between rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/30 backdrop-blur-xl sm:p-8 lg:p-10">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-xs uppercase tracking-[0.3em] text-emerald-200">
                Pickleball Open Play
              </div>
              <h1 className="mt-6 max-w-xl text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
                Track sessions, debts, and players in one clean dashboard.
              </h1>
              <p className="mt-4 max-w-xl text-sm leading-6 text-white/60 sm:text-base">
                Sign in to manage open play attendance, balance payments, review history, and keep every session organized from a single control center.
              </p>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {[
                { label: 'Today', value: 'Live attendance' },
                { label: 'History', value: 'Past sessions' },
                { label: 'Debt', value: 'Balances due' },
              ].map((item) => (
                <div key={item.label} className="rounded-3xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs uppercase tracking-[0.22em] text-white/40">{item.label}</div>
                  <div className="mt-2 text-sm text-white/80">{item.value}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="flex items-center">
            <div className="w-full rounded-[2rem] border border-white/10 bg-white/[0.06] p-6 shadow-2xl shadow-black/35 backdrop-blur-xl sm:p-8 lg:p-10">
              <div className="mb-8">
                <p className="text-xs uppercase tracking-[0.3em] text-emerald-300/70">Secure access</p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight">Admin Login</h2>
                <p className="mt-2 text-sm text-white/55">Use your admin account to continue.</p>
              </div>

              <div className="space-y-4">
                <input
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-white/35 outline-none transition focus:border-emerald-300/40 focus:bg-white/8"
                  placeholder="Email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <input
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-white/35 outline-none transition focus:border-emerald-300/40 focus:bg-white/8"
                  placeholder="Password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />

                <button
                  type="button"
                  onClick={handleLogin}
                  className="flex w-full items-center justify-center rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-70"
                  disabled={loading}
                >
                  {loading ? 'Signing in...' : 'Sign in'}
                </button>

                {error ? (
                  <div className="rounded-2xl border border-rose-300/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                    {error}
                  </div>
                ) : null}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
