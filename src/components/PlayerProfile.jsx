import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { toast } from 'react-toastify'
import useAppDialog from '../hooks/useAppDialog'

export default function PlayerProfile({ player, onClose }) {
  const [attendance, setAttendance] = useState([])
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const { askConfirm, DialogRenderer } = useAppDialog()

  useEffect(() => {
    if (!player) return
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player])

  async function fetchData() {
    setLoading(true)
    const { data: att, error: attErr } = await supabase
      .from('attendance')
      .select('id,amount,payment_status,paid_at,created_at,session: sessions(id,session_date)')
      .eq('player_id', player.id)
      .order('created_at', { ascending: false })

    if (attErr) console.error(attErr)
    setAttendance(att || [])

    const attIds = (att || []).map((a) => a.id)
    if (attIds.length > 0) {
      const { data: ph, error: phErr } = await supabase.from('payment_history').select('*').in('attendance_id', attIds)
      if (phErr) console.error(phErr)
      setPayments(ph || [])
    } else {
      setPayments([])
    }

    setLoading(false)
  }

  const totalSessions = attendance.length
  const totalPaid = attendance.reduce((s, a) => s + (a.payment_status === 'paid' ? a.amount : 0), 0)
  const totalUnpaid = attendance.reduce((s, a) => s + (a.payment_status === 'unpaid' ? a.amount : 0), 0)

  async function markPaid(attId, amount) {
    const ok = await askConfirm({ title: 'Mark session as paid?', message: 'This will update payment history for this player.', confirmText: 'Mark paid', tone: 'success' })
    if (!ok) return
    const { error } = await supabase.rpc('mark_attendance_paid', { p_attendance_id: attId, p_amount: amount, p_notes: null })
    if (error) return toast.error(error.message)
    toast.success('Session marked paid')
    fetchData()
  }

  return (
    <div>
      <DialogRenderer />
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-xl font-semibold">{player.full_name}</div>
          <div className="text-sm text-neutral-400">Sessions: {totalSessions} • Paid: ₱{totalPaid} • Unpaid: ₱{totalUnpaid}</div>
        </div>
        <div>
          <button onClick={onClose} className="px-3 py-2 bg-neutral-700 rounded">Close</button>
        </div>
      </div>

      {loading ? (
        <div>Loading...</div>
      ) : (
        <div className="space-y-4">
          <div>
            <h4 className="font-semibold mb-2">Recent Sessions</h4>
            <div className="space-y-2">
              {attendance.slice(0, 10).map((a) => (
                <div key={a.id} className="flex items-center justify-between p-2 bg-neutral-800 rounded">
                  <div>
                    <div className="font-medium">{new Date(a.session.session_date).toLocaleDateString()}</div>
                    <div className="text-sm text-neutral-400">₱{a.amount} • {a.payment_status.toUpperCase()}</div>
                  </div>
                  <div>
                    {a.payment_status === 'unpaid' ? (
                      <button onClick={() => markPaid(a.id, a.amount)} className="px-3 py-1 rounded bg-paid text-black">Mark Paid</button>
                    ) : (
                      <div className="text-sm text-neutral-400">Paid {new Date(a.paid_at).toLocaleDateString()}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h4 className="font-semibold mb-2">Payment History</h4>
            {payments.length === 0 ? (
              <div className="text-neutral-400">No recorded payments</div>
            ) : (
              <div className="space-y-2">
                {payments.map((p) => (
                  <div key={p.id} className="p-2 bg-neutral-800 rounded">
                    <div className="font-medium">₱{p.amount_paid} — {new Date(p.payment_date).toLocaleDateString()}</div>
                    {p.notes && <div className="text-sm text-neutral-400">{p.notes}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
