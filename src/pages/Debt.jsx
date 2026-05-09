import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import DashboardShell from '../components/DashboardShell'
import { toast } from 'react-toastify'
import useAppDialog from '../hooks/useAppDialog'

export default function DebtPage() {
  const [debts, setDebts] = useState([])
  const [loading, setLoading] = useState(true)
  const { askConfirm, DialogRenderer } = useAppDialog()

  useEffect(() => {
    fetchDebts()
    // subscribe to attendance changes to refresh debts
    const ch = supabase.channel('debts').on('postgres_changes', { event: '*', schema: 'public', table: 'attendance' }, () => {
      fetchDebts()
    }).subscribe()

    return () => {
      try { supabase.removeChannel(ch) } catch (e) {}
    }
  }, [])

  async function fetchDebts() {
    setLoading(true)
    const { data, error } = await supabase.from('player_debts').select('*')
    if (error) console.error(error)
    // Filter out players with no debt
    const filteredDebts = (data || []).filter(d => d.total_debt > 0)
    setDebts(filteredDebts)
    setLoading(false)
  }

  async function payEntry(playerId, attendanceId, amount) {
    const ok = await askConfirm({ title: 'Mark this date as paid?', message: 'This will update debt totals immediately.', confirmText: 'Mark paid', tone: 'success' })
    if (!ok) return
    const { error } = await supabase.rpc('mark_attendance_paid', { p_attendance_id: attendanceId, p_amount: amount, p_notes: null })
    if (error) return toast.error(error.message)
    toast.success('Payment recorded')
    fetchDebts()
  }

  return (
    <DashboardShell
      title={{ label: 'Debt', heading: 'Debt tracker' }}
      subtitle="See who still owes for open play and settle balances per session date."
    >
      <DialogRenderer />
      <main className="rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Outstanding debts</h3>
          <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-white/60">{debts.length} players</div>
        </div>

          {loading ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-white/60">Loading...</div>
          ) : debts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-4 text-white/55">No outstanding debts</div>
          ) : (
            <div className="space-y-4">
              {debts.map((p) => (
                <div key={p.player_id} className="rounded-3xl border border-white/10 bg-neutral-950/30 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className="font-medium">{p.full_name}</div>
                      <div className="text-sm text-amber-200/80">Total Debt: ₱{p.total_debt}</div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {(p.unpaid_entries || []).map((e) => (
                      <div key={e.attendance_id} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-3">
                        <div>
                          <div className="font-medium">{new Date(e.session_date).toLocaleDateString()}</div>
                          <div className="text-sm text-white/55">₱{e.amount}</div>
                        </div>
                        <div>
                          <button onClick={() => payEntry(p.player_id, e.attendance_id, e.amount)} className="rounded-full bg-emerald-400 px-4 py-2 text-sm font-medium text-slate-950">Pay</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
      </main>
    </DashboardShell>
  )
}
