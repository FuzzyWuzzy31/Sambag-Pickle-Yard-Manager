import React, { useState } from 'react'
import Modal from './Modal'
import { supabase } from '../lib/supabaseClient'
import { motion } from 'framer-motion'
import { useSwipeable } from 'react-swipeable'
import { toast } from 'react-toastify'
import useOfflineSync from '../hooks/useOfflineSync'

export default function PlayerCard({ attendance, onUpdated }) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const { id, amount, payment_status, paid_at, created_at, player } = attendance
  const { enqueue } = useOfflineSync()

  const handlers = useSwipeable({
    onSwipedRight: () => handleSwipePay(),
    onSwipedLeft: () => handleSwipeRemove(),
    delta: 50
  })

  async function markPaid() {
    try {
      if (!navigator.onLine) {
        enqueue({ type: 'mark_paid', attendance_id: id, amount })
        toast.info('Offline — payment queued')
        onUpdated && onUpdated()
        setConfirmOpen(false)
        return
      }

      await supabase.rpc('mark_attendance_paid', { p_attendance_id: id, p_amount: amount, p_notes: null })
      toast.success('Marked paid')
      onUpdated && onUpdated()
      setConfirmOpen(false)
    } catch (e) {
      console.error(e)
      toast.error(e.message || 'Failed to mark paid')
    }
  }

  function handleSwipePay() {
    if (payment_status === 'paid') return
    setConfirmOpen(true)
  }

  function handleSwipeRemove() {
    if (!confirm('Remove attendance record?')) return
    if (!navigator.onLine) {
      enqueue({ type: 'remove_attendance', attendance_id: id })
      toast.info('Offline — remove queued')
      onUpdated && onUpdated()
      return
    }
    supabase.from('attendance').delete().eq('id', id).then(({ error }) => {
      if (error) return toast.error(error.message)
      toast.success('Removed')
      onUpdated && onUpdated()
    })
  }

  return (
    <motion.div {...handlers} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="p-3 bg-neutral-800 rounded-lg flex items-center justify-between">
      <div>
        <div className="font-medium">{player?.full_name || 'Unknown'}</div>
        <div className="text-sm text-neutral-400">Added {new Date(created_at).toLocaleTimeString()}</div>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={() => setConfirmOpen(true)}
          className={`px-3 py-1 rounded-full text-sm ${payment_status === 'paid' ? 'bg-paid text-black' : 'bg-unpaid text-white'}`}
        >
          {payment_status === 'paid' ? 'PAID' : 'UNPAID'}
        </button>
      </div>

      <Modal open={confirmOpen} title={`Mark ${player?.full_name} as PAID?`} onClose={() => setConfirmOpen(false)}>
        <div className="space-x-2">
          <button onClick={markPaid} className="bg-green-500 px-4 py-2 rounded">Yes</button>
          <button onClick={() => setConfirmOpen(false)} className="bg-neutral-700 px-4 py-2 rounded">Cancel</button>
        </div>
      </Modal>
    </motion.div>
  )
}
