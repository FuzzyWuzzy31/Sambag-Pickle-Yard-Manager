import React, { useEffect, useState, useRef } from 'react'
import PullToRefresh from '../components/PullToRefresh'
import Skeleton from '../components/Skeleton'
import { useStore } from '../store/useStore'
import { supabase } from '../lib/supabaseClient'
import AddPlayer from '../components/AddPlayer'
import { useNavigate } from 'react-router-dom'
import DashboardShell from '../components/DashboardShell'
import { toast } from 'react-toastify'

function isoDate(d = new Date()) {
  return d.toISOString().slice(0, 10)
}

export default function TodayPage() {
  const [attendance, setAttendance] = useState([])
  const [loading, setLoading] = useState(true)
  const [sessionExists, setSessionExists] = useState(false)
  const [saving, setSaving] = useState(false)
  const navigate = useNavigate()
  const activeDate = useStore((s) => s.activeDate)
  const setActiveDate = useStore((s) => s.setActiveDate)
  const sessionId = useStore((s) => s.sessionId)
  const setSessionId = useStore((s) => s.setSessionId)

  async function loadSession(dateStr) {
    setLoading(true)
    setSessionExists(false)
    try {
      const d = dateStr || isoDate()
      setActiveDate(d)

      const { data: sessionRow, error: sessionError } = await supabase
        .from('sessions')
        .select('id, session_date')
        .eq('session_date', d)
        .maybeSingle()

      if (sessionError) {
        console.error('session lookup error:', sessionError)
        setAttendance([])
        setSessionId(null)
        return
      }

      if (!sessionRow) {
        setAttendance([])
        setSessionId(null)
        setSessionExists(false)
        return
      }

      setSessionExists(true)
      setSessionId(sessionRow.id)

      const { data, error } = await supabase
        .from('attendance')
        .select('id,amount,payment_status,paid_at,created_at,player:players(id,full_name)')
        .eq('session_id', sessionRow.id)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('attendance fetch error:', error)
      }

      setAttendance(data || [])
    } catch (err) {
      console.error('loadSession error:', err)
      setAttendance([])
      setSessionId(null)
      setSessionExists(false)
    } finally {
      setLoading(false)
    }
  }

  async function createSessionForDate(dateStr) {
    setSaving(true)
    try {
      const d = dateStr || activeDate || isoDate()
      const { error } = await supabase.rpc('ensure_session', { p_date: d })
      if (error) throw error
      await loadSession(d)
    } catch (err) {
      console.error('createSessionForDate error:', err)
      toast.error(err.message || 'Failed to create session')
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    loadSession(activeDate || isoDate())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const attendanceChannelRef = useRef(null)

  useEffect(() => {
    if (!sessionId) return

    // subscribe to attendance changes for this session and reload when anything changes
    const channel = supabase
      .channel(`attendance-session-${sessionId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance', filter: `session_id=eq.${sessionId}` }, () => {
        loadSession(activeDate)
      })
      .subscribe()

    attendanceChannelRef.current = channel

    return () => {
      try {
        supabase.removeChannel(channel)
      } catch (e) {
        console.warn('Failed to remove attendance channel', e)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  function refresh() {
    loadSession(activeDate || isoDate())
  }

  const sortedAttendance = [...attendance].sort((left, right) => {
    const leftName = (left.player?.full_name || 'Unknown').toLowerCase()
    const rightName = (right.player?.full_name || 'Unknown').toLowerCase()
    return leftName.localeCompare(rightName)
  })
  const totalSales = attendance.reduce(
    (sum, item) => sum + (item.payment_status === 'paid' ? (Number(item.amount) || 0) : 0),
    0,
  )

  async function markPaid(attendanceItem) {
    try {
      await supabase.rpc('mark_attendance_paid', {
        p_attendance_id: attendanceItem.id,
        p_amount: attendanceItem.amount,
        p_notes: null,
      })
      toast.success('Marked paid')
      refresh()
    } catch (error) {
      console.error(error)
      toast.error(error.message || 'Failed to mark paid')
    }
  }

  async function removeAttendance(attendanceItem) {
    if (!confirm('Remove attendance record?')) return

    const { error } = await supabase.from('attendance').delete().eq('id', attendanceItem.id)
    if (error) {
      toast.error(error.message)
      return
    }

    toast.success('Removed')
    refresh()
  }

  return (
    <DashboardShell
      title={{ label: 'Dashboard', heading: `Open Play — ${activeDate || 'Today'}` }}
      subtitle="Track attendance, jump between sections, and keep the day running from one place."
      actions={[
        <button key="history" onClick={() => navigate('/history')} className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/85 hover:bg-white/10">
          History
        </button>,
        <button key="debt" onClick={() => navigate('/debt')} className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/85 hover:bg-white/10">
          Debt
        </button>,
      ]}
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <PullToRefresh onRefresh={() => loadSession(activeDate || isoDate())} className="mt-0 min-w-0">
          <main>
            <section className="mb-4 overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl shadow-black/20 backdrop-blur-sm">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="max-w-xl space-y-2">
                  <p className="text-xs uppercase tracking-[0.28em] text-emerald-300/80">Session control center</p>
                  <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Track today, review history, manage debt, and inspect players from one place.</h2>
                  <p className="text-sm text-white/65">If today is not an open play day, leave it closed here and create the session only when needed.</p>
                </div>
                <div className="space-y-3 sm:min-w-[260px]">
                  <label className="block text-xs uppercase tracking-[0.22em] text-white/45">Session date</label>
                  <input
                    type="date"
                    value={activeDate || isoDate()}
                    onChange={(e) => setActiveDate(e.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-emerald-300/40"
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <button onClick={() => loadSession(activeDate || isoDate())} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left text-sm font-medium hover:bg-white/10">
                      Load
                      <div className="mt-1 text-xs text-white/55">Open existing session</div>
                    </button>
                    <button onClick={() => createSessionForDate(activeDate || isoDate())} disabled={saving} className="rounded-2xl border border-emerald-300/20 bg-emerald-400/15 px-4 py-3 text-left text-sm font-medium text-emerald-100 hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-50">
                      {saving ? 'Saving...' : 'Create'}
                      <div className="mt-1 text-xs text-emerald-100/70">Open play day</div>
                    </button>
                  </div>
                </div>
              </div>
            </section>

          <div className="grid grid-cols-1 gap-3 mb-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-white/45">Total players</div>
              <div className="mt-2 text-2xl font-semibold">{attendance.length}</div>
            </div>
            <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-amber-100/70">Unpaid</div>
              <div className="mt-2 text-2xl font-semibold">{attendance.filter(a => a.payment_status === 'unpaid').length}</div>
            </div>
            <div className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-emerald-100/70">Total sales</div>
              <div className="mt-2 text-2xl font-semibold">₱{totalSales}</div>
            </div>
          </div>

          <section className="mb-4 grid gap-3 sm:grid-cols-3">
            {[
              { title: 'Today', desc: 'Open play attendance board', to: '/' },
              { title: 'History', desc: 'Past sessions and edits', to: '/history' },
              { title: 'Debt', desc: 'Payment balancing and dues', to: '/debt' },
              { title: 'Players', desc: 'Search and player insights', to: '/players' },
              { title: 'Settings', desc: 'Fees, exports, and sessions', to: '/settings' },
            ].map((item) => (
              <button
                key={item.title}
                onClick={() => navigate(item.to)}
                className="rounded-2xl border border-white/10 bg-neutral-900/70 p-4 text-left shadow-lg shadow-black/15 transition hover:-translate-y-0.5 hover:bg-neutral-800/80"
              >
                <div className="text-sm font-semibold">{item.title}</div>
                <div className="mt-1 text-xs text-white/55">{item.desc}</div>
              </button>
            ))}
          </section>

          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          ) : !sessionExists ? (
            <div className="rounded-3xl border border-dashed border-white/10 bg-white/5 p-5 text-white/60">
              No session exists for this date yet. Use Create to open play, or leave it closed.
            </div>
          ) : attendance.length === 0 ? (
            <div className="p-4 rounded-xl bg-neutral-800">No players yet — add someone below</div>
          ) : (
            <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] shadow-2xl shadow-black/15">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-white/10">
                  <thead className="bg-white/[0.03] text-left text-xs uppercase tracking-[0.22em] text-white/45">
                    <tr>
                      <th className="px-4 py-3 font-medium">#</th>
                      <th className="px-4 py-3 font-medium">Player</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Amount</th>
                      <th className="px-4 py-3 font-medium">Added</th>
                      <th className="px-4 py-3 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {sortedAttendance.map((att, index) => (
                      <tr key={att.id} className="bg-white/[0.02] transition hover:bg-white/[0.05]">
                        <td className="px-4 py-4 text-sm text-white/55">{index + 1}</td>
                        <td className="px-4 py-4">
                          <div className="font-medium text-white">{att.player?.full_name || 'Unknown'}</div>
                        </td>
                        <td className="px-4 py-4">
                          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${att.payment_status === 'paid' ? 'bg-emerald-400/15 text-emerald-200' : 'bg-amber-400/15 text-amber-100'}`}>
                            {att.payment_status.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-sm text-white/80">₱{att.amount}</td>
                        <td className="px-4 py-4 text-sm text-white/55">{new Date(att.created_at).toLocaleTimeString()}</td>
                        <td className="px-4 py-4">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => markPaid(att)}
                              disabled={att.payment_status === 'paid'}
                              className="rounded-full bg-emerald-400 px-3 py-2 text-xs font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Mark paid
                            </button>
                            <button
                              onClick={() => removeAttendance(att)}
                              className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/80 transition hover:bg-white/10"
                            >
                              Remove
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          </main>
        </PullToRefresh>

        <aside className="self-start lg:sticky lg:top-6">
          <AddPlayer onAdded={refresh} />
        </aside>
      </div>
    </DashboardShell>
  )
}
