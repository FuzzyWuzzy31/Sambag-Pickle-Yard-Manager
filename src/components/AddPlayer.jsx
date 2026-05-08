import React, { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useStore } from '../store/useStore'
import useOfflineSync from '../hooks/useOfflineSync'
import { toast } from 'react-toastify'

export default function AddPlayer({ onAdded }) {
  const [q, setQ] = useState('')
  const [suggests, setSuggests] = useState([])
  const [loading, setLoading] = useState(false)
  const defaultFee = useStore((s) => s.defaultFee)
  const sessionId = useStore((s) => s.sessionId)
  const { enqueue } = useOfflineSync()

  async function search(name) {
    setQ(name)
    if (!name) {
      setSuggests([])
      return
    }

    const { data } = await supabase
      .from('players')
      .select('*')
      .ilike('full_name', `%${name}%`)
      .limit(5)

    setSuggests(data || [])
  }

  async function addPlayerByName(name, existingId = null) {
    setLoading(true)

    try {
      let playerId = existingId

      if (!navigator.onLine) {
        if (existingId) {
          enqueue({ type: 'add_attendance_with_player_id', session_id: sessionId, player_id: existingId, amount: defaultFee })
        } else {
          enqueue({ type: 'add_player', name, session_id: sessionId, amount: defaultFee })
        }
        toast.info('Offline — action queued')
        setQ('')
        setSuggests([])
        onAdded && onAdded()
        return
      }

      if (!playerId) {
        const { data, error } = await supabase.from('players').insert({ full_name: name }).select().single()
        if (error) throw error
        playerId = data.id
      }

      const { error: attError } = await supabase.from('attendance').insert({
        session_id: sessionId,
        player_id: playerId,
        amount: defaultFee,
        payment_status: 'unpaid',
      })
      if (attError) throw attError

      setQ('')
      setSuggests([])
      onAdded && onAdded()
    } catch (e) {
      console.error(e)
      toast.error(e.message || 'Failed to add player')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-3 shadow-2xl shadow-black/30 backdrop-blur-xl">
      <div className="mb-2 text-[10px] uppercase tracking-[0.28em] text-white/40">Quick add player</div>
      <div className="flex gap-2">
        <input
          value={q}
          onChange={(e) => search(e.target.value)}
          placeholder="Add or search player"
          className="flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/35 outline-none transition focus:border-emerald-300/40 focus:bg-white/8"
        />
        <button
          onClick={() => addPlayerByName(q)}
          disabled={!q || loading}
          className="rounded-2xl bg-emerald-400 px-4 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-70"
        >
          Add
        </button>
      </div>
      {suggests.length > 0 && (
        <div className="mt-2 max-h-[18rem] overflow-auto rounded-3xl border border-white/10 bg-[#0b1020]/95 p-2 shadow-2xl shadow-black/30 backdrop-blur-xl">
          {suggests.map((s) => (
            <button
              key={s.id}
              onClick={() => addPlayerByName(s.full_name, s.id)}
              className="w-full rounded-2xl px-3 py-2 text-left text-sm text-white/85 transition hover:bg-white/10"
            >
              {s.full_name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
