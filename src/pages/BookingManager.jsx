import React, { useEffect, useMemo, useRef, useState } from 'react'
import DashboardShell from '../components/DashboardShell'
import { supabase } from '../lib/supabaseClient'
import { toast } from 'react-toastify'
import { motion } from 'framer-motion'
import { useSwipeable } from 'react-swipeable'

function isoDate(d = new Date()) {
  return d.toISOString().slice(0, 10)
}

export default function BookingManagerPage() {
  const [date, setDate] = useState(isoDate())
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [bookingSettings, setBookingSettings] = useState({
    day_rate: 200,
    night_rate: 250,
    opening_time: '06:00',
    closing_time: '23:00',
  })
  const [bookingForm, setBookingForm] = useState({
    playerName: '',
    startTime: '',
    endTime: '',
    notes: '',
  })
  const timelineRef = useRef(null)

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

  async function loadBookingSettings() {
    const { data, error } = await supabase
      .from('booking_settings')
      .select('day_rate, night_rate, opening_time, closing_time')
      .eq('id', true)
      .maybeSingle()

    if (error) {
      console.error('booking settings error', error)
      return
    }

    if (data) {
      setBookingSettings({
        day_rate: data.day_rate ?? 200,
        night_rate: data.night_rate ?? 250,
        opening_time: (data.opening_time || '06:00:00').slice(0, 5),
        closing_time: (data.closing_time || '23:00:00').slice(0, 5),
      })
    }
  }

  const hourlyTimeline = useMemo(() => {
    const openingHour = 6
    const closingHour = 23
    const hours = []

    for (let hour = openingHour; hour < closingHour; hour += 1) {
      const nextHour = hour + 1
      const activeBookings = bookings.filter((booking) => {
        const bookingStart = timeToMinutes(booking.start_time)
        const bookingEnd = timeToMinutes(booking.end_time)
        const slotStart = hour * 60
        const slotEnd = nextHour * 60
        return bookingStart < slotEnd && bookingEnd > slotStart
      })

      hours.push({
        hour,
        label: formatHour(hour),
        bookingCount: activeBookings.length,
        available: activeBookings.length === 0,
        bookings: activeBookings,
      })
    }

    return hours
  }, [bookings])

  const timelineSwipeHandlers = useSwipeable({
    onSwipedLeft: () => shiftTimeline(320),
    onSwipedRight: () => shiftTimeline(-320),
    preventScrollOnSwipe: true,
    trackMouse: true,
    delta: 15,
  })

  function shiftTimeline(deltaX) {
    const node = timelineRef.current
    if (!node) return
    node.scrollBy({ left: deltaX, behavior: 'smooth' })
  }

  useEffect(() => {
    loadBookings(date)
    loadBookingSettings()
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
    const player_name = bookingForm.playerName.trim()
    const start_time = bookingForm.startTime
    const end_time = bookingForm.endTime
    const notes = bookingForm.notes
    if (!player_name || !start_time || !end_time) return toast.error('Fill required fields')
    setSaving(true)
    try {
      const { error } = await supabase.rpc('create_booking', { p_player_name: player_name, p_booking_date: date, p_start_time: start_time, p_end_time: end_time, p_notes: notes })
      if (error) throw error
      toast.success('Booking created')
      setShowAdd(false)
      setBookingForm({ playerName: '', startTime: '', endTime: '', notes: '' })
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

  const estimatedBooking = useMemo(() => {
    const start = bookingForm.startTime ? timeToMinutes(bookingForm.startTime) : null
    const end = bookingForm.endTime ? timeToMinutes(bookingForm.endTime) : null
    if (start === null || end === null || end <= start) {
      return { hours: 0, total: 0, dayHours: 0, nightHours: 0, rateLabel: 'Set a valid time range' }
    }

    const opening = timeToMinutes(bookingSettings.opening_time)
    const close = timeToMinutes(bookingSettings.closing_time)
    const dayCutoff = timeToMinutes('18:00')
    const clampedStart = Math.max(start, opening)
    const clampedEnd = Math.min(end, close)

    if (clampedEnd <= clampedStart) {
      return { hours: 0, total: 0, dayHours: 0, nightHours: 0, rateLabel: 'Outside operating hours' }
    }

    const dayStart = Math.min(clampedEnd, dayCutoff)
    const dayMinutes = Math.max(0, dayStart - clampedStart)
    const nightStart = Math.max(clampedStart, dayCutoff)
    const nightMinutes = Math.max(0, clampedEnd - nightStart)
    const dayHours = dayMinutes / 60
    const nightHours = nightMinutes / 60
    const totalHours = (clampedEnd - clampedStart) / 60
    const total = Math.round(dayHours * bookingSettings.day_rate + nightHours * bookingSettings.night_rate)

    return {
      hours: totalHours,
      total,
      dayHours,
      nightHours,
      rateLabel: nightHours > 0 && dayHours > 0 ? 'Mixed day/night pricing' : nightHours > 0 ? `Night rate ₱${bookingSettings.night_rate}/hr` : `Day rate ₱${bookingSettings.day_rate}/hr`,
    }
  }, [bookingForm.endTime, bookingForm.startTime, bookingSettings.day_rate, bookingSettings.closing_time, bookingSettings.night_rate, bookingSettings.opening_time])

  return (
    <DashboardShell title={{ label: 'Bookings', heading: `Booking Manager — ${date}` }} subtitle="Manage court reservations, payments, and cancellations">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none" />
          <button onClick={() => setShowAdd(true)} className="rounded-2xl bg-emerald-400 px-4 py-2 text-sm font-medium text-slate-900">+ Add Booking</button>
        </div>
        <div className="text-xs text-white/45">Swipe the timeline left or right to browse the day</div>
      </div>

      <section className="mb-5 rounded-3xl border border-white/10 bg-white/5 p-4 shadow-lg shadow-black/10 backdrop-blur-sm">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.26em] text-emerald-300/75">Timeline</div>
            <h3 className="text-lg font-semibold">Court occupancy</h3>
          </div>
          <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-white/65">
            {bookings.length} booking{bookings.length === 1 ? '' : 's'}
          </div>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-white/60">Loading timeline...</div>
        ) : (
          <div {...timelineSwipeHandlers} ref={timelineRef} className="booking-scrollbar overflow-x-auto pb-2">
            <div className="min-w-max space-y-3 pr-2">
              <div className="grid grid-cols-[repeat(17,4.5rem)] gap-2 sm:grid-cols-[repeat(17,5.25rem)]">
                {hourlyTimeline.map((slot) => (
                  <div
                    key={slot.hour}
                    className={`rounded-2xl border px-2 py-3 text-center transition ${slot.available ? 'border-emerald-400/10 bg-emerald-400/5' : 'border-white/10 bg-white/7'}`}
                  >
                    <div className="text-[11px] uppercase tracking-[0.24em] text-white/45">{slot.label}</div>
                    <div className={`mt-2 text-sm font-semibold ${slot.available ? 'text-emerald-200' : 'text-white'}`}>
                      {slot.available ? 'Available' : `${slot.bookingCount} booked`}
                    </div>
                  </div>
                ))}
              </div>

              <div className="relative rounded-3xl border border-white/10 bg-[#0b1020]/70 p-3">
                <div className="absolute inset-x-3 top-0 flex justify-between border-b border-white/5 px-1 pb-2 text-[10px] uppercase tracking-[0.24em] text-white/30">
                  <span>6AM</span>
                  <span>11PM</span>
                </div>

                <div className="mt-8 grid grid-cols-[repeat(17,4.5rem)] gap-2 sm:grid-cols-[repeat(17,5.25rem)]">
                  {hourlyTimeline.map((slot) => (
                    <div key={`track-${slot.hour}`} className="h-20 rounded-2xl border border-white/5 bg-white/[0.03]" />
                  ))}

                  {bookings.map((booking, index) => {
                    const start = timeToMinutes(booking.start_time)
                    const end = timeToMinutes(booking.end_time)
                    const totalSlots = (23 - 6) * 60
                    const left = ((start - 6 * 60) / totalSlots) * 100
                    const width = ((end - start) / totalSlots) * 100
                    return (
                      <motion.div
                        key={booking.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.03 }}
                        className="pointer-events-none absolute left-3 right-3 top-[3.75rem]"
                        style={{ width: 'calc(100% - 1.5rem)' }}
                      >
                        <div
                          className={`absolute top-0 h-20 rounded-2xl border px-3 py-2 shadow-lg ${booking.payment_status === 'paid' ? 'border-emerald-300/30 bg-emerald-400/20' : booking.payment_status === 'cancelled' ? 'border-white/10 bg-white/10' : 'border-rose-300/30 bg-rose-400/20'}`}
                          style={{ left: `${left}%`, width: `${Math.max(width, 5)}%` }}
                        >
                          <div className="flex h-full flex-col justify-between">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="truncate text-sm font-semibold">{booking.player_name}</div>
                                <div className="text-[11px] text-white/70">{booking.start_time.slice(0, 5)}–{booking.end_time.slice(0, 5)}</div>
                              </div>
                              <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${booking.payment_status === 'paid' ? 'bg-emerald-300 text-slate-950' : booking.payment_status === 'cancelled' ? 'bg-white/20 text-white' : 'bg-rose-300 text-slate-950'}`}>
                                {booking.payment_status}
                              </span>
                            </div>
                            <div className="text-xs font-medium text-white/85">₱{booking.total_amount}</div>
                          </div>
                        </div>
                      </motion.div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

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
                      {b.notes ? <div className="mt-1 text-xs text-white/45">{b.notes}</div> : null}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <div className={`rounded-full px-3 py-1 text-xs ${b.payment_status === 'paid' ? 'bg-emerald-400 text-slate-900' : b.payment_status === 'cancelled' ? 'bg-gray-500 text-white' : 'bg-rose-500 text-white'}`}>{b.payment_status.toUpperCase()}</div>
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
              <input value={bookingForm.playerName} onChange={(e) => setBookingForm((current) => ({ ...current, playerName: e.target.value }))} placeholder="Player name" className="w-full rounded-lg bg-white/3 px-3 py-2" />
              <div className="flex gap-2">
                <input value={bookingForm.startTime} onChange={(e) => setBookingForm((current) => ({ ...current, startTime: e.target.value }))} type="time" className="w-1/2 rounded-lg bg-white/3 px-3 py-2" />
                <input value={bookingForm.endTime} onChange={(e) => setBookingForm((current) => ({ ...current, endTime: e.target.value }))} type="time" className="w-1/2 rounded-lg bg-white/3 px-3 py-2" />
              </div>
              <textarea value={bookingForm.notes} onChange={(e) => setBookingForm((current) => ({ ...current, notes: e.target.value }))} placeholder="Notes (optional)" className="w-full rounded-lg bg-white/3 px-3 py-2" />
              <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                <div className="text-[11px] uppercase tracking-[0.22em] text-white/40">Rate preview</div>
                <div className="mt-1 text-sm text-white/70">
                  {bookingSettings.opening_time}–18:00: ₱{bookingSettings.day_rate}/hr
                </div>
                <div className="text-sm text-white/70">
                  18:00–{bookingSettings.closing_time}: ₱{bookingSettings.night_rate}/hr
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.22em] text-white/45">Estimated total</div>
                    <div className="text-lg font-semibold text-white">₱{estimatedBooking.total}</div>
                  </div>
                  <div className="text-right text-xs text-white/55">
                    {estimatedBooking.hours > 0 ? `${estimatedBooking.hours.toFixed(2)} hrs` : estimatedBooking.rateLabel}
                  </div>
                </div>
              </div>
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

function formatHour(hour) {
  const suffix = hour >= 12 ? 'PM' : 'AM'
  const normalized = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour
  return `${normalized}${suffix}`
}

function timeToMinutes(timeValue) {
  if (!timeValue) return 0
  const [hours, minutes] = timeValue.split(':').map(Number)
  return hours * 60 + minutes
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
