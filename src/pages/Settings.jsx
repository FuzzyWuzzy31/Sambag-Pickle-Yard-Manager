import React, { useEffect, useState } from 'react'
import { useStore } from '../store/useStore'
import { supabase } from '../lib/supabaseClient'
import { toCSV, downloadCSV } from '../lib/csv'
import DashboardShell from '../components/DashboardShell'

export default function SettingsPage() {
  const defaultFee = useStore((s) => s.defaultFee)
  const setDefaultFee = useStore((s) => s.setDefaultFee)
  const [feeInput, setFeeInput] = useState(defaultFee)
  const [bookingSettings, setBookingSettings] = useState({
    day_rate: 200,
    night_rate: 250,
    opening_time: '06:00',
    closing_time: '23:00',
  })
  const [bookingSaving, setBookingSaving] = useState(false)
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(false)
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem('dark') === '1' } catch (e) { return true }
  })

  useEffect(() => {
    fetchSessions()
    fetchBookingSettings()
  }, [])

  useEffect(() => {
    try { localStorage.setItem('dark', dark ? '1' : '0') } catch (e) {}
    if (dark) document.documentElement.classList.add('dark')
    else document.documentElement.classList.remove('dark')
  }, [dark])

  async function fetchSessions() {
    setLoading(true)
    const { data, error } = await supabase.from('sessions').select('*').order('session_date', { ascending: false })
    if (error) console.error(error)
    setSessions(data || [])
    setLoading(false)
  }

  async function fetchBookingSettings() {
    const { data, error } = await supabase
      .from('booking_settings')
      .select('day_rate, night_rate, opening_time, closing_time')
      .eq('id', true)
      .maybeSingle()

    if (error) {
      console.error(error)
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

  function saveFee() {
    const v = parseInt(feeInput, 10) || 0
    setDefaultFee(v)
    alert('Default fee updated')
  }

  async function saveBookingSettings() {
    setBookingSaving(true)
    try {
      const payload = {
        id: true,
        day_rate: parseInt(bookingSettings.day_rate, 10) || 200,
        night_rate: parseInt(bookingSettings.night_rate, 10) || 250,
        opening_time: bookingSettings.opening_time || '06:00',
        closing_time: bookingSettings.closing_time || '23:00',
      }

      const { error } = await supabase
        .from('booking_settings')
        .upsert(payload, { onConflict: 'id' })

      if (error) throw error
      alert('Booking settings saved')
      fetchBookingSettings()
    } catch (error) {
      console.error(error)
      alert(error.message || 'Failed to save booking settings')
    } finally {
      setBookingSaving(false)
    }
  }

  async function createSession() {
    const d = prompt('Enter session date (YYYY-MM-DD)')
    if (!d) return
    const { data, error } = await supabase.rpc('ensure_session', { p_date: d })
    if (error) return alert(error.message)
    fetchSessions()
  }

  async function editSessionDate(s) {
    const d = prompt('New date (YYYY-MM-DD)', new Date(s.session_date).toISOString().slice(0,10))
    if (!d) return
    const { error } = await supabase.from('sessions').update({ session_date: d }).eq('id', s.id)
    if (error) return alert(error.message)
    fetchSessions()
  }

  async function deleteSession(s) {
    if (!confirm('Delete session and all attendance?')) return
    const { error } = await supabase.from('sessions').delete().eq('id', s.id)
    if (error) return alert(error.message)
    fetchSessions()
  }

  async function exportAllCSV() {
    setLoading(true)
    try {
      const { data: att } = await supabase.from('attendance').select('id,session_id,player_id,amount,payment_status,paid_at,created_at,player:players(full_name)').order('created_at', { ascending: true })
      const rows = (att || []).map((r) => ({
        id: r.id,
        session_id: r.session_id,
        player_id: r.player_id,
        player_name: r.player?.full_name || '',
        amount: r.amount,
        payment_status: r.payment_status,
        paid_at: r.paid_at,
        created_at: r.created_at
      }))
      const csv = toCSV(rows, ['id','session_id','player_id','player_name','amount','payment_status','paid_at','created_at'])
      downloadCSV('attendance_export.csv', csv)
    } catch (e) {
      console.error(e)
      alert('Export failed')
    } finally { setLoading(false) }
  }

  async function exportSessionCSV(s) {
    setLoading(true)
    try {
      const { data: att } = await supabase.from('attendance').select('id,session_id,player_id,amount,payment_status,paid_at,created_at,player:players(full_name)').eq('session_id', s.id).order('created_at', { ascending: true })
      const rows = (att || []).map((r) => ({
        id: r.id,
        player_id: r.player_id,
        player_name: r.player?.full_name || '',
        amount: r.amount,
        payment_status: r.payment_status,
        paid_at: r.paid_at,
        created_at: r.created_at
      }))
      const csv = toCSV(rows, ['id','player_id','player_name','amount','payment_status','paid_at','created_at'])
      downloadCSV(`session_${s.session_date}_export.csv`, csv)
    } catch (e) {
      console.error(e)
      alert('Export failed')
    } finally { setLoading(false) }
  }

  return (
    <DashboardShell
      title={{ label: 'Settings', heading: 'Workspace settings' }}
      subtitle="Tune fees, export data, and manage sessions from a single control panel."
    >
      <main className="grid grid-cols-1 gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
            <h3 className="mb-4 text-lg font-semibold">General</h3>
            <div className="mb-3">
              <label className="block text-sm text-neutral-400">Default Session Fee (₱)</label>
              <input className="w-full mt-1 p-2 rounded bg-neutral-700" value={feeInput} onChange={(e) => setFeeInput(e.target.value)} />
              <div className="flex gap-2 mt-2">
                <button onClick={saveFee} className="rounded-full bg-emerald-400 px-3 py-2 text-slate-950">Save</button>
                <button onClick={() => { setFeeInput(defaultFee) }} className="rounded-full border border-white/10 bg-white/5 px-3 py-2">Reset</button>
              </div>
            </div>

            <div className="mb-3">
              <label className="block text-sm text-neutral-400">Appearance</label>
              <div className="flex items-center gap-3 mt-2">
                <label className="text-sm">Dark mode</label>
                <input type="checkbox" checked={dark} onChange={(e) => setDark(e.target.checked)} />
              </div>
            </div>

            <div className="mt-4">
              <button onClick={exportAllCSV} className="w-full rounded-full border border-white/10 bg-white/5 px-3 py-2">Export All Attendance CSV</button>
            </div>

            <div className="mt-6 rounded-3xl border border-emerald-300/15 bg-emerald-400/5 p-4">
              <div className="mb-3">
                <div className="text-xs uppercase tracking-[0.22em] text-emerald-200/70">Booking Settings</div>
                <h4 className="mt-1 text-base font-semibold text-white">Court rates and operating hours</h4>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm text-white/70">
                  Day rate (₱/hour)
                  <input
                    type="number"
                    min="0"
                    value={bookingSettings.day_rate}
                    onChange={(e) => setBookingSettings((current) => ({ ...current, day_rate: e.target.value }))}
                    className="mt-1 w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-white outline-none"
                  />
                </label>
                <label className="block text-sm text-white/70">
                  Night rate (₱/hour)
                  <input
                    type="number"
                    min="0"
                    value={bookingSettings.night_rate}
                    onChange={(e) => setBookingSettings((current) => ({ ...current, night_rate: e.target.value }))}
                    className="mt-1 w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-white outline-none"
                  />
                </label>
                <label className="block text-sm text-white/70">
                  Opening time
                  <input
                    type="time"
                    value={bookingSettings.opening_time}
                    onChange={(e) => setBookingSettings((current) => ({ ...current, opening_time: e.target.value }))}
                    className="mt-1 w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-white outline-none"
                  />
                </label>
                <label className="block text-sm text-white/70">
                  Closing time
                  <input
                    type="time"
                    value={bookingSettings.closing_time}
                    onChange={(e) => setBookingSettings((current) => ({ ...current, closing_time: e.target.value }))}
                    className="mt-1 w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-white outline-none"
                  />
                </label>
              </div>

              <div className="mt-4 flex items-center justify-between gap-3">
                <div className="text-xs text-white/45">
                  Default: 6AM opening, 11PM closing, ₱200 day, ₱250 night
                </div>
                <button
                  onClick={saveBookingSettings}
                  disabled={bookingSaving}
                  className="rounded-full bg-emerald-400 px-4 py-2 text-sm font-medium text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {bookingSaving ? 'Saving...' : 'Save booking settings'}
                </button>
              </div>
            </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold">Sessions</h3>
              <div className="flex gap-2">
                <button onClick={createSession} className="rounded-full bg-emerald-400 px-2 py-1 text-slate-950">Create Session</button>
                <button onClick={fetchSessions} className="rounded-full border border-white/10 bg-white/5 px-2 py-1">Refresh</button>
              </div>
            </div>

            {loading ? <div>Loading...</div> : (
              <div className="space-y-2 max-h-[70vh] overflow-auto pr-1">
                {sessions.map((s) => (
                  <div key={s.id} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-3">
                    <div>
                      <div className="font-medium">Open Play — {new Date(s.session_date).toLocaleDateString()}</div>
                      <div className="text-sm text-white/45">Created {new Date(s.created_at).toLocaleString()}</div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => exportSessionCSV(s)} className="rounded-full border border-white/10 bg-white/5 px-2 py-1">Export</button>
                      <button onClick={() => editSessionDate(s)} className="rounded-full border border-white/10 bg-white/5 px-2 py-1">Edit</button>
                      <button onClick={() => deleteSession(s)} className="rounded-full border border-rose-300/20 bg-rose-500/15 px-2 py-1 text-rose-100">Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
        </section>
      </main>
    </DashboardShell>
  )
}
