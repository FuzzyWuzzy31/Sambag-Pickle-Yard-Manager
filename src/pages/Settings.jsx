import React, { useEffect, useState } from 'react'
import { useStore } from '../store/useStore'
import { supabase } from '../lib/supabaseClient'
import { toCSV, downloadCSV } from '../lib/csv'
import DashboardShell from '../components/DashboardShell'

export default function SettingsPage() {
  const defaultFee = useStore((s) => s.defaultFee)
  const setDefaultFee = useStore((s) => s.setDefaultFee)
  const [feeInput, setFeeInput] = useState(defaultFee)
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(false)
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem('dark') === '1' } catch (e) { return true }
  })

  useEffect(() => {
    fetchSessions()
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

  function saveFee() {
    const v = parseInt(feeInput, 10) || 0
    setDefaultFee(v)
    alert('Default fee updated')
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
