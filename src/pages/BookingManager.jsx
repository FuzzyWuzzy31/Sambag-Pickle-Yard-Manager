import React, { useEffect, useMemo, useRef, useState } from 'react'
import DashboardShell from '../components/DashboardShell'
import { supabase } from '../lib/supabaseClient'
import { toast } from 'react-toastify'
import { motion } from 'framer-motion'
import { useSwipeable } from 'react-swipeable'
import useAppDialog from '../hooks/useAppDialog'

function isoDate(d = new Date()) {
  return d.toISOString().slice(0, 10)
}

function getMonthBounds(targetDate) {
  const [year, month] = targetDate.split('-').map(Number)
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
  const monthEndDay = new Date(year, month, 0).getDate()
  const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(monthEndDay).padStart(2, '0')}`
  return { monthStart, monthEnd }
}

export default function BookingManagerPage() {
  const [date, setDate] = useState(isoDate())
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [monthBookedDates, setMonthBookedDates] = useState([])
  const [monthSales, setMonthSales] = useState({ gross: 0, refunds: 0, net: 0, days: 0 })
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
  const { askConfirm, askChoice, DialogRenderer } = useAppDialog()

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

  async function loadMonthBookedDates(targetDate = date) {
    const { monthStart, monthEnd } = getMonthBounds(targetDate)

    const { data, error } = await supabase
      .from('bookings')
      .select('booking_date,payment_status')
      .gte('booking_date', monthStart)
      .lte('booking_date', monthEnd)
      .order('booking_date', { ascending: true })

    if (error) {
      console.error('monthly bookings error', error)
      setMonthBookedDates([])
      return
    }

    const grouped = {}
    ;(data || []).forEach((row) => {
      if (row.payment_status === 'cancelled') return
      if (!grouped[row.booking_date]) {
        grouped[row.booking_date] = { booking_date: row.booking_date, count: 0, paidCount: 0, unpaidCount: 0 }
      }
      grouped[row.booking_date].count += 1
      if (row.payment_status === 'paid') grouped[row.booking_date].paidCount += 1
      if (row.payment_status === 'unpaid') grouped[row.booking_date].unpaidCount += 1
    })

    setMonthBookedDates(Object.values(grouped))
  }

  async function loadMonthSales(targetDate = date) {
    const { monthStart, monthEnd } = getMonthBounds(targetDate)

    const { data, error } = await supabase
      .from('booking_daily_sales')
      .select('booking_date,gross_payments,refunds,net_sales')
      .gte('booking_date', monthStart)
      .lte('booking_date', monthEnd)

    if (error) {
      console.error('monthly sales error', error)
      setMonthSales({ gross: 0, refunds: 0, net: 0, days: 0 })
      return
    }

    const summary = (data || []).reduce(
      (acc, row) => {
        acc.gross += Number(row.gross_payments) || 0
        acc.refunds += Number(row.refunds) || 0
        acc.net += Number(row.net_sales) || 0
        acc.days += 1
        return acc
      },
      { gross: 0, refunds: 0, net: 0, days: 0 },
    )

    setMonthSales(summary)
  }

  const hourlyTimeline = useMemo(() => {
    const openingHour = parseInt((bookingSettings.opening_time || '06:00').slice(0, 2), 10)
    const closingHour = parseInt((bookingSettings.closing_time || '23:00').slice(0, 2), 10)
    const hours = []

    for (let hour = openingHour; hour < closingHour; hour += 1) {
      const nextHour = hour + 1
      const activeBookings = bookings.filter((booking) => {
        if (booking.payment_status === 'cancelled') return false
        const bookingStart = timeToMinutes(booking.start_time)
        const bookingEnd = timeToMinutes(booking.end_time)
        const slotStart = hour * 60
        const slotEnd = nextHour * 60
        return bookingStart < slotEnd && bookingEnd > slotStart
      })

      hours.push({
        hour,
        label: `${formatHour(hour)}-${formatHour(nextHour)}`,
        bookingCount: activeBookings.length,
        available: activeBookings.length === 0,
        bookings: activeBookings,
      })
    }

    return hours
  }, [bookings, bookingSettings.closing_time, bookingSettings.opening_time])

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
    loadMonthBookedDates(date)
    loadMonthSales(date)
    // subscribe to bookings changes and reload when anything changes
    const ch = supabase
      .channel('realtime-bookings')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => {
        loadBookings(date)
        loadMonthBookedDates(date)
        loadMonthSales(date)
      })
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
    const ok = await askConfirm({ title: 'Mark booking as paid?', message: `${b.player_name} • ${b.start_time.slice(0, 5)}-${b.end_time.slice(0, 5)}`, confirmText: 'Mark paid', tone: 'success' })
    if (!ok) return
    const { error } = await supabase.rpc('mark_booking_paid', { p_booking_id: b.id, p_amount: b.total_amount })
    if (error) return toast.error(error.message)
    toast.success('Marked paid')
    loadBookings(date)
    loadMonthSales(date)
  }

  async function handleCancel(b) {
    const paid = b.payment_status === 'paid'
    const ok = await askConfirm({ title: `Cancel booking for ${b.player_name}?`, message: 'This will free the reserved court time.', confirmText: 'Continue', tone: 'danger' })
    if (!ok) return
    if (!paid) {
      const { error } = await supabase.rpc('cancel_booking', { p_booking_id: b.id, p_cancel_type: 'unpaid_cancelled' })
      if (error) return toast.error(error.message)
      toast.success('Booking cancelled')
      loadBookings(date)
      return
    }
    const choice = await askChoice({
      title: 'Paid booking cancellation',
      message: 'Select refund handling for this paid reservation.',
      options: [
        { value: 'partial_refund', label: 'Partial refund (50%)', description: 'Refund half of booking total' },
        { value: 'full_refund', label: 'Full refund', description: 'Refund the full booking amount' },
        { value: 'unpaid_cancelled', label: 'Cancel without refund', description: 'Mark cancelled with no refund' },
      ],
    })
    if (!choice) return
    const { error } = await supabase.rpc('cancel_booking', { p_booking_id: b.id, p_cancel_type: choice })
    if (error) return toast.error(error.message)
    toast.success('Booking cancelled')
    loadBookings(date)
    loadMonthBookedDates(date)
    loadMonthSales(date)
  }

  async function removeBooking(b) {
    const ok = await askConfirm({
      title: `Remove booking for ${b.player_name}?`,
      message: 'This permanently deletes the booking and removes it from sales records.',
      confirmText: 'Remove booking',
      tone: 'danger',
    })
    if (!ok) return

    const { error } = await supabase.from('bookings').delete().eq('id', b.id)
    if (error) return toast.error(error.message)

    toast.success('Booking removed')
    loadBookings(date)
    loadMonthBookedDates(date)
    loadMonthSales(date)
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
      <DialogRenderer />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none" />
          <button onClick={() => setShowAdd(true)} className="rounded-2xl bg-emerald-400 px-4 py-2 text-sm font-medium text-slate-900">+ Add Booking</button>
        </div>
        <div className="text-xs text-white/45">Swipe the timeline left or right to browse the day</div>
      </div>

      <section className="mb-4 rounded-3xl border border-white/10 bg-white/5 p-4 shadow-lg shadow-black/10 backdrop-blur-sm">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-emerald-300/75">Booked dates</div>
            <h3 className="text-lg font-semibold">{new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h3>
          </div>
          <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-white/65">{monthBookedDates.length} active dates</div>
        </div>

        {monthBookedDates.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-black/15 p-3 text-sm text-white/55">No bookings for this month yet.</div>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {monthBookedDates.map((item) => (
              <button
                key={item.booking_date}
                onClick={() => setDate(item.booking_date)}
                className={`min-w-[10rem] rounded-2xl border px-3 py-2 text-left transition ${date === item.booking_date ? 'border-emerald-300/40 bg-emerald-400/20' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}
              >
                <div className="text-sm font-semibold">{new Date(`${item.booking_date}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</div>
                <div className="mt-1 text-xs text-white/60">{item.count} booking{item.count === 1 ? '' : 's'} • {item.unpaidCount} unpaid</div>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="mb-4 rounded-3xl border border-white/10 bg-white/5 p-4 shadow-lg shadow-black/10 backdrop-blur-sm">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-emerald-300/75">Monthly sales</div>
            <h3 className="text-lg font-semibold">{new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h3>
          </div>
          <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-white/65">{monthSales.days} sales day{monthSales.days === 1 ? '' : 's'}</div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
            <div className="text-xs uppercase tracking-[0.18em] text-white/45">Gross</div>
            <div className="mt-1 text-2xl font-semibold">₱{monthSales.gross}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
            <div className="text-xs uppercase tracking-[0.18em] text-white/45">Refunds</div>
            <div className="mt-1 text-2xl font-semibold">₱{monthSales.refunds}</div>
          </div>
          <div className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-3">
            <div className="text-xs uppercase tracking-[0.18em] text-emerald-100/70">Net sales</div>
            <div className="mt-1 text-2xl font-semibold">₱{monthSales.net}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
            <div className="text-xs uppercase tracking-[0.18em] text-white/45">Average per sales day</div>
            <div className="mt-1 text-2xl font-semibold">₱{monthSales.days > 0 ? Math.round(monthSales.net / monthSales.days) : 0}</div>
          </div>
        </div>
      </section>

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
              <div className="grid grid-cols-[repeat(17,5rem)] gap-2 sm:grid-cols-[repeat(17,5.75rem)]">
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

              <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#0b1020]/70 p-3">
                <div className="absolute inset-x-3 top-0 flex justify-between border-b border-white/5 px-1 pb-2 text-[10px] uppercase tracking-[0.24em] text-white/30">
                  <span>{formatHourFromTime(bookingSettings.opening_time)}</span>
                  <span>{formatHourFromTime(bookingSettings.closing_time)}</span>
                </div>

                <div className="mt-10 min-h-[7rem] rounded-2xl border border-white/5 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.03),_transparent_55%)] p-2">
                  <div className="relative min-h-[6rem]">
                    {bookings.map((booking, index) => {
                      const start = timeToMinutes(booking.start_time)
                      const end = timeToMinutes(booking.end_time)
                      const opening = timeToMinutes(bookingSettings.opening_time)
                      const closing = timeToMinutes(bookingSettings.closing_time)
                      const totalSlots = closing - opening
                      const left = ((start - opening) / totalSlots) * 100
                      const width = ((end - start) / totalSlots) * 100
                      const safeLeft = Math.max(0, left)
                      const safeWidth = Math.min(100 - safeLeft, Math.max(width, 14))
                      return (
                        <motion.div
                          key={booking.id}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.03 }}
                          className="absolute left-0 top-2 h-20"
                          style={{ left: `${safeLeft}%`, width: `${safeWidth}%` }}
                        >
                          <div
                            className={`h-full rounded-2xl border px-3 py-2 shadow-lg ${booking.payment_status === 'paid' ? 'border-emerald-300/30 bg-emerald-400/20' : booking.payment_status === 'cancelled' ? 'border-white/10 bg-white/10' : 'border-rose-300/30 bg-rose-400/20'}`}
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
                        <button onClick={() => removeBooking(b)} className="text-xs underline text-rose-200">Remove</button>
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
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
          <form onSubmit={handleCreate} className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-3xl border border-white/15 bg-[linear-gradient(160deg,rgba(17,24,39,0.96),rgba(15,23,42,0.92))] p-6 shadow-2xl shadow-black/45">
            <h3 className="mb-1 text-3xl font-semibold tracking-tight">Add Booking</h3>
            <p className="mb-4 text-sm text-white/60">Create a reservation using your configured operating hours and rates.</p>
            <div className="space-y-3">
              <input value={bookingForm.playerName} onChange={(e) => setBookingForm((current) => ({ ...current, playerName: e.target.value }))} placeholder="Player name" className="w-full rounded-2xl border border-white/15 bg-black/25 px-4 py-3 text-white placeholder:text-white/40 outline-none focus:border-emerald-300/40" />
              <div className="flex gap-2">
                <input value={bookingForm.startTime} onChange={(e) => setBookingForm((current) => ({ ...current, startTime: e.target.value }))} type="time" min={bookingSettings.opening_time} max={bookingSettings.closing_time} step={1800} style={{ colorScheme: 'dark' }} className="w-1/2 rounded-2xl border border-white/15 bg-black/25 px-4 py-3 text-white outline-none focus:border-emerald-300/40" />
                <input value={bookingForm.endTime} onChange={(e) => setBookingForm((current) => ({ ...current, endTime: e.target.value }))} type="time" min={bookingSettings.opening_time} max={bookingSettings.closing_time} step={1800} style={{ colorScheme: 'dark' }} className="w-1/2 rounded-2xl border border-white/15 bg-black/25 px-4 py-3 text-white outline-none focus:border-emerald-300/40" />
              </div>
              <textarea value={bookingForm.notes} onChange={(e) => setBookingForm((current) => ({ ...current, notes: e.target.value }))} placeholder="Notes (optional)" className="w-full rounded-2xl border border-white/15 bg-black/25 px-4 py-3 text-white placeholder:text-white/40 outline-none focus:border-emerald-300/40" />
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
                <div className="mt-3 text-xs text-white/45">
                  Operating hours only: {bookingSettings.opening_time} to {bookingSettings.closing_time}
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowAdd(false)} className="rounded-2xl border border-white/15 bg-white/5 px-4 py-2 text-white/80">Cancel</button>
                <button type="submit" disabled={saving} className="rounded-2xl bg-emerald-400 px-4 py-2 font-semibold text-slate-900">{saving ? 'Saving...' : 'Create'}</button>
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

function formatHourFromTime(timeString = '06:00') {
  const hour = parseInt(timeString.slice(0, 2), 10)
  return formatHour(hour)
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
