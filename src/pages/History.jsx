import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useStore } from '../store/useStore'
import AddPlayer from '../components/AddPlayer'
import PlayerCard from '../components/PlayerCard'
import DashboardShell from '../components/DashboardShell'
import useAppDialog from '../hooks/useAppDialog'
import { toast } from 'react-toastify'
import { useNavigate } from 'react-router-dom'

function isoDate(d) {
  return d.toISOString().slice(0, 10)
}

export default function HistoryPage() {
  const [sessions, setSessions] = useState([])
  const [selected, setSelected] = useState(null)
  const [attendance, setAttendance] = useState([])
  const [loading, setLoading] = useState(false)
  const [bookings, setBookings] = useState([])
  const [bookingsLoading, setBookingsLoading] = useState(false)
  const [bookingFilter, setBookingFilter] = useState('all')
  const setSessionId = useStore((s) => s.setSessionId)
  const setActiveDate = useStore((s) => s.setActiveDate)
  const { askConfirm, askPrompt, DialogRenderer } = useAppDialog()
  const navigate = useNavigate()

  useEffect(() => {
    fetchSessions()
    fetchBookings()
  }, [])

  async function fetchSessions() {
    const { data, error } = await supabase.from('sessions').select('*').order('session_date', { ascending: false })
    if (error) console.error(error)
    setSessions(data || [])
  }

  async function fetchBookings() {
    setBookingsLoading(true)
    const { data, error } = await supabase
      .from('bookings')
      .select('id,player_name,booking_date,start_time,end_time,total_amount,payment_status,refund_status,refund_amount,created_at,notes')
      .order('booking_date', { ascending: false })
      .order('start_time', { ascending: false })

    if (error) console.error(error)
    setBookings(data || [])
    setBookingsLoading(false)
  }

  async function openSession(s) {
    setSelected(s)
    setActiveDate(s.session_date.toString())
    setSessionId(s.id)
    setLoading(true)
    const { data, error } = await supabase
      .from('attendance')
      .select('id,amount,payment_status,paid_at,created_at,player:players(id,full_name)')
      .eq('session_id', s.id)
      .order('created_at', { ascending: false })
    if (error) console.error(error)
    setAttendance(data || [])
    setLoading(false)
  }

  async function removeAttendance(id) {
    const ok = await askConfirm({ title: 'Remove attendance record?', message: 'This cannot be undone.', confirmText: 'Remove', tone: 'danger' })
    if (!ok) return
    const { error } = await supabase.from('attendance').delete().eq('id', id)
    if (error) return toast.error(error.message)
    // refresh
    if (selected) openSession(selected)
  }

  async function createSession(dateStr) {
    const d = dateStr || isoDate(new Date())
    const { data, error } = await supabase.rpc('ensure_session', { p_date: d })
    if (error) return toast.error(error.message)
    fetchSessions()
    // open new session
    const newId = data
    const s = { id: newId, session_date: d }
    openSession(s)
  }

  const filteredBookings = bookings.filter((booking) => {
    if (bookingFilter === 'all') return true
    return booking.payment_status === bookingFilter
  })

  const totalSales = attendance.reduce(
    (sum, item) => sum + (item.payment_status === 'paid' ? (Number(item.amount) || 0) : 0),
    0,
  )

  const bookingSummary = bookings.reduce(
    (summary, booking) => {
      summary.total += 1
      if (booking.payment_status === 'paid') summary.paid += 1
      if (booking.payment_status === 'unpaid') summary.unpaid += 1
      if (booking.payment_status === 'cancelled') summary.cancelled += 1
      summary.gross += Number(booking.total_amount) || 0
      summary.refunds += Number(booking.refund_amount) || 0
      return summary
    },
    { total: 0, paid: 0, unpaid: 0, cancelled: 0, gross: 0, refunds: 0 },
  )

  return (
    <DashboardShell
      title={{ label: 'History', heading: 'Transaction history' }}
      subtitle="Browse past sessions, reopen a day, and clean up attendance records."
    >
      <DialogRenderer />
      <main className="grid grid-cols-1 gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <section className="rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Sessions</h3>
              <button
                onClick={async () => {
                  const d = await askPrompt({
                    title: 'Create session',
                    message: 'Enter session date in YYYY-MM-DD format.',
                    placeholder: 'YYYY-MM-DD',
                    defaultValue: isoDate(new Date()),
                    confirmText: 'Create',
                  })
                  if (d) createSession(d)
                }}
                className="rounded-full bg-emerald-400 px-3 py-2 text-sm font-medium text-slate-950"
              >
                New
              </button>
            </div>

            <div className="space-y-2 max-h-[70vh] overflow-auto pr-1">
              {sessions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => openSession(s)}
                  className={`w-full rounded-2xl border px-4 py-3 text-left transition ${selected?.id === s.id ? 'border-emerald-300/30 bg-emerald-400/15' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}
                >
                  <div className="font-medium">Open Play — {new Date(s.session_date).toLocaleDateString()}</div>
                  <div className="text-sm text-white/45">Created {new Date(s.created_at).toLocaleString()}</div>
                </button>
              ))}
            </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
          <h3 className="mb-4 text-lg font-semibold">{selected ? `Session — ${new Date(selected.session_date).toLocaleDateString()}` : 'Select a session'}</h3>

            {selected ? (
              <>
                <div className="mb-4">
                  <div className="grid grid-cols-1 gap-3 mb-4 sm:grid-cols-3">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">Players: {attendance.length}</div>
                    <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-3">Unpaid: {attendance.filter(a => a.payment_status === 'unpaid').length}</div>
                    <div className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-3">Sales: ₱{totalSales}</div>
                  </div>

                  {loading ? (
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-white/60">Loading...</div>
                  ) : attendance.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-4 text-white/55">No players — add below</div>
                  ) : (
                    <div className="space-y-3">
                      {attendance.map((att) => (
                        <div key={att.id} className="flex items-center gap-3">
                          <div className="flex-1">
                            <PlayerCard attendance={{ ...att, player: att.player }} onUpdated={() => openSession(selected)} />
                          </div>
                          <div>
                            <button onClick={() => removeAttendance(att.id)} className="rounded-full border border-rose-300/20 bg-rose-500/15 px-4 py-2 text-sm text-rose-100">Remove</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <AddPlayer onAdded={() => openSession(selected)} />
              </>
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-4 text-white/55">Choose a session from the left to inspect attendance and payments.</div>
            )}
        </section>
      </main>

      <section className="mt-4 rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-emerald-300/75">Booking history</div>
            <h3 className="text-lg font-semibold">Past and overall bookings</h3>
            <p className="text-sm text-white/55">Monitor reservation activity, cancellations, and payment status across all dates.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { key: 'all', label: 'All' },
              { key: 'paid', label: 'Paid' },
              { key: 'unpaid', label: 'Unpaid' },
              { key: 'cancelled', label: 'Cancelled' },
            ].map((item) => (
              <button
                key={item.key}
                onClick={() => setBookingFilter(item.key)}
                className={`rounded-full border px-3 py-2 text-sm transition ${bookingFilter === item.key ? 'border-emerald-300/30 bg-emerald-400/15 text-emerald-100' : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'}`}
              >
                {item.label}
              </button>
            ))}
            <button onClick={() => navigate('/bookings')} className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/70 hover:bg-white/10">
              Open Booking Manager
            </button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
            <div className="text-xs uppercase tracking-[0.18em] text-white/45">Total</div>
            <div className="mt-1 text-2xl font-semibold">{bookingSummary.total}</div>
          </div>
          <div className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-3">
            <div className="text-xs uppercase tracking-[0.18em] text-emerald-100/70">Paid</div>
            <div className="mt-1 text-2xl font-semibold">{bookingSummary.paid}</div>
          </div>
          <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-3">
            <div className="text-xs uppercase tracking-[0.18em] text-amber-100/70">Unpaid</div>
            <div className="mt-1 text-2xl font-semibold">{bookingSummary.unpaid}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
            <div className="text-xs uppercase tracking-[0.18em] text-white/45">Cancelled</div>
            <div className="mt-1 text-2xl font-semibold">{bookingSummary.cancelled}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
            <div className="text-xs uppercase tracking-[0.18em] text-white/45">Gross</div>
            <div className="mt-1 text-2xl font-semibold">₱{bookingSummary.gross}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
            <div className="text-xs uppercase tracking-[0.18em] text-white/45">Refunds</div>
            <div className="mt-1 text-2xl font-semibold">₱{bookingSummary.refunds}</div>
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-3xl border border-white/10 bg-black/15">
          {bookingsLoading ? (
            <div className="p-4 text-white/60">Loading booking history...</div>
          ) : filteredBookings.length === 0 ? (
            <div className="p-4 text-white/55">No bookings found for this filter.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-white/10 text-left">
                <thead className="bg-white/[0.03] text-xs uppercase tracking-[0.22em] text-white/45">
                  <tr>
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Player</th>
                    <th className="px-4 py-3 font-medium">Time</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Amount</th>
                    <th className="px-4 py-3 font-medium">Refund</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {filteredBookings.map((booking) => (
                    <tr key={booking.id} className="bg-white/[0.02]">
                      <td className="px-4 py-3 text-sm text-white/70">{new Date(booking.booking_date).toLocaleDateString()}</td>
                      <td className="px-4 py-3 font-medium">{booking.player_name}</td>
                      <td className="px-4 py-3 text-sm text-white/70">{booking.start_time.slice(0, 5)} — {booking.end_time.slice(0, 5)}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${booking.payment_status === 'paid' ? 'bg-emerald-400/15 text-emerald-200' : booking.payment_status === 'unpaid' ? 'bg-amber-400/15 text-amber-100' : 'bg-white/10 text-white/70'}`}>
                          {booking.payment_status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-white/80">₱{booking.total_amount}</td>
                      <td className="px-4 py-3 text-sm text-white/70">₱{booking.refund_amount || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </DashboardShell>
  )
}
