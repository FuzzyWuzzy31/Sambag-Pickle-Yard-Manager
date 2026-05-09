import React, { useEffect, useState, useRef } from 'react'
import DashboardShell from '../components/DashboardShell'
import { supabase } from '../lib/supabaseClient'
import { toast } from 'react-toastify'

function isoDate(d = new Date()) {
  return d.toISOString().slice(0, 10)
}

export default function BookingManagerPage() {
  const [date, setDate] = useState(isoDate())
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const nameRef = useRef()
  const startRef = useRef()
  const endRef = useRef()
  const notesRef = useRef()

  async function loadBookings(d = date) {
    setLoading(true)
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('booking_date', d)
      .order('start_time', { ascending: true })

    if (error) {
      console.error('bookings fetch error', error)
      toast.error('Failed to load bookings')
      setBookings([])
    } else {
      setBookings(data || [])
    }
    setLoading(false)
  }

  useEffect(() => {
    loadBookings(date)
    // subscribe to bookings changes and reload when anything changes
    const ch = supabase
      .channel('realtime-bookings')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => loadBookings(date))
      .subscribe()

    return () => {
      try { supabase.removeChannel(ch) } catch (e) {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date])

  async function handleCreate(e) {
    e.preventDefault()
    const player_name = nameRef.current.value.trim()
    const start_time = startRef.current.value
    const end_time = endRef.current.value
    const notes = notesRef.current.value
    if (!player_name || !start_time || !end_time) return toast.error('Fill required fields')
    setSaving(true)
    try {
      const { error } = await supabase.rpc('create_booking', { p_player_name: player_name, p_booking_date: date, p_start_time: start_time, p_end_time: end_time, p_notes: notes })
      if (error) throw error
      toast.success('Booking created')
      setShowAdd(false)
      loadBookings(date)
    } catch (err) {
      console.error(err)
      toast.error(err.message || 'Failed to create booking')
    } finally {
      setSaving(false)
    }
  }

  async function markPaid(b) {
    if (!confirm('Mark booking as PAID?')) return
    const { error } = await supabase.rpc('mark_booking_paid', { p_booking_id: b.id, p_amount: b.total_amount })
    if (error) return toast.error(error.message)
    toast.success('Marked paid')
    loadBookings(date)
  }

  async function handleCancel(b) {
    const paid = b.payment_status === 'paid'
    if (!confirm(`Cancel booking ${b.player_name}?`)) return
    if (!paid) {
      const { error } = await supabase.rpc('cancel_booking', { p_booking_id: b.id, p_cancel_type: 'unpaid_cancelled' })
      if (error) return toast.error(error.message)
      toast.success('Booking cancelled')
      loadBookings(date)
      return
    }
    // paid: ask for partial or full
    const choice = prompt('Paid booking — enter "partial" for 50% refund or "full" for full refund (leave blank to cancel without refund)')
    let t = null
    if (choice === 'partial') t = 'partial_refund'
    else if (choice === 'full') t = 'full_refund'
    else t = 'unpaid_cancelled'
    const { error } = await supabase.rpc('cancel_booking', { p_booking_id: b.id, p_cancel_type: t })
    if (error) return toast.error(error.message)
    toast.success('Booking cancelled')
    loadBookings(date)
  }

  return (
    <DashboardShell title={{ label: 'Bookings', heading: `Booking Manager — ${date}` }} subtitle="Manage court reservations, payments, and cancellations">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm" />
          <button onClick={() => setShowAdd(true)} className="rounded-2xl bg-emerald-400 px-4 py-2 text-sm font-medium text-slate-900">+ Add Booking</button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="md:col-span-2">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <h3 className="font-semibold">Daily schedule</h3>
            {loading ? <div className="mt-3 text-white/60">Loading...</div> : bookings.length === 0 ? <div className="mt-3 text-white/55">No bookings for this date</div> : (
              <ul className="mt-3 space-y-2">
                {bookings.map((b) => (
                  <li key={b.id} className={`flex items-center justify-between rounded-xl p-3 ${b.payment_status === 'paid' ? 'bg-emerald-800/20' : b.payment_status === 'cancelled' ? 'bg-stone-700/20' : 'bg-white/5'}`}>
                    <div>
                      <div className="font-medium">{b.player_name}</div>
                      <div className="text-sm text-white/55">{b.start_time.slice(0,5)} — {b.end_time.slice(0,5)} • ₱{b.total_amount}</div>
                      {b.notes ? <div className="text-xs text-white/45 mt-1">{b.notes}</div> : null}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <div className={`px-3 py-1 rounded-full text-xs ${b.payment_status === 'paid' ? 'bg-emerald-400 text-slate-900' : b.payment_status === 'cancelled' ? 'bg-gray-500 text-white' : 'bg-rose-500 text-white'}`}>{b.payment_status.toUpperCase()}</div>
                      <div className="flex gap-2">
                        {b.payment_status !== 'paid' && b.payment_status !== 'cancelled' ? <button onClick={() => markPaid(b)} className="text-xs underline">Mark paid</button> : null}
                        {b.payment_status !== 'cancelled' ? <button onClick={() => handleCancel(b)} className="text-xs underline">Cancel</button> : null}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <aside className="sticky top-24 space-y-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="text-xs uppercase text-white/50">Daily Booking Sales</div>
            <BookingSalesSummary date={date} />
          </div>
        </aside>
      </div>

      {showAdd ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form onSubmit={handleCreate} className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-6">
            <h3 className="mb-3 text-lg font-semibold">Add Booking</h3>
            <div className="space-y-3">
              <input ref={nameRef} placeholder="Player name" className="w-full rounded-lg bg-white/3 px-3 py-2" />
              <div className="flex gap-2">
                <input ref={startRef} type="time" className="w-1/2 rounded-lg bg-white/3 px-3 py-2" />
                <input ref={endRef} type="time" className="w-1/2 rounded-lg bg-white/3 px-3 py-2" />
              </div>
              <textarea ref={notesRef} placeholder="Notes (optional)" className="w-full rounded-lg bg-white/3 px-3 py-2" />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowAdd(false)} className="rounded-lg px-4 py-2">Cancel</button>
                <button type="submit" disabled={saving} className="rounded-lg bg-emerald-400 px-4 py-2 text-slate-900">{saving ? 'Saving...' : 'Create'}</button>
              </div>
            </div>
          </form>
        </div>
      ) : null}
    </DashboardShell>
  )
}

function BookingSalesSummary({ date }) {
  const [summary, setSummary] = useState(null)

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase.from('booking_daily_sales').select('*').eq('booking_date', date).maybeSingle()
      if (error) return console.error(error)
      setSummary(data || { gross_payments: 0, refunds: 0, net_sales: 0 })
    }
    load()
  }, [date])

  if (!summary) return <div className="mt-3 text-white/60">Loading...</div>
  return (
    <div className="mt-3">
      <div className="text-sm">Gross: ₱{summary.gross_payments}</div>
      <div className="text-sm">Refunds: ₱{summary.refunds}</div>
      <div className="mt-2 text-lg font-semibold">Net: ₱{summary.net_sales}</div>
    </div>
  )
}
