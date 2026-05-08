import { supabase } from '../lib/supabaseClient'
import { useEffect } from 'react'
import { toast } from 'react-toastify'

const KEY = 'sb_offline_queue_v1'

function readQueue() {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : []
  } catch (e) {
    return []
  }
}

function writeQueue(q) {
  localStorage.setItem(KEY, JSON.stringify(q))
}

export default function useOfflineSync() {
  useEffect(() => {
    async function drain() {
      if (!navigator.onLine) return
      const q = readQueue()
      if (!q.length) return

      for (const op of q) {
        try {
          if (op.type === 'add_player') {
            // create player and attendance
            const { data, error } = await supabase.from('players').insert({ full_name: op.name }).select().single()
            if (error) throw error
            const playerId = data.id
            const { error: attErr } = await supabase.from('attendance').insert({ session_id: op.session_id, player_id: playerId, amount: op.amount, payment_status: 'unpaid' })
            if (attErr) throw attErr
            toast.success(`Synced player ${op.name}`)
          }

          if (op.type === 'add_attendance_with_player_id') {
            const { error: attErr } = await supabase.from('attendance').insert({ session_id: op.session_id, player_id: op.player_id, amount: op.amount, payment_status: 'unpaid' })
            if (attErr) throw attErr
            toast.success('Synced attendance')
          }

          if (op.type === 'mark_paid') {
            const { error } = await supabase.rpc('mark_attendance_paid', { p_attendance_id: op.attendance_id, p_amount: op.amount, p_notes: null })
            if (error) throw error
            toast.success('Synced payment')
          }

          if (op.type === 'remove_attendance') {
            const { error } = await supabase.from('attendance').delete().eq('id', op.attendance_id)
            if (error) throw error
            toast.success('Synced removal')
          }
        } catch (e) {
          console.error('Offline sync failed for op', op, e)
        }
      }

      // clear queue after attempting
      writeQueue([])
    }

    drain()

    function onOnline() {
      drain()
    }

    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [])

  function enqueue(op) {
    const q = readQueue()
    q.push(op)
    writeQueue(q)
  }

  return { enqueue }
}
