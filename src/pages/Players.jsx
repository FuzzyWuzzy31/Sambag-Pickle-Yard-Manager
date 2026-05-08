import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import SearchBar from '../components/SearchBar'
import PlayerProfile from '../components/PlayerProfile'
import DashboardShell from '../components/DashboardShell'

export default function PlayersPage() {
  const [query, setQuery] = useState('')
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    fetchPlayers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function fetchPlayers(q = '') {
    setLoading(true)
    const builder = supabase.from('players').select('id,full_name,created_at').order('full_name')
    if (q) builder.ilike('full_name', `%${q}%`).limit(50)
    const { data, error } = await builder
    if (error) console.error(error)
    setPlayers(data || [])
    setLoading(false)
  }

  async function onSearch(q) {
    setQuery(q)
    fetchPlayers(q)
  }

  return (
    <DashboardShell
      title={{ label: 'Players', heading: 'Player search and analytics' }}
      subtitle="Search the roster, review player profiles, and keep attendance history close by."
    >
      <main className="grid grid-cols-1 gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
            <SearchBar value={query} onChange={onSearch} placeholder="Search players" />

            <div className="mt-3 space-y-2 max-h-[70vh] overflow-auto pr-1">
              {loading ? (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-white/60">Loading...</div>
              ) : players.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-4 text-white/55">No players found</div>
              ) : (
                players.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setSelected(p)}
                    className="w-full rounded-2xl border border-white/10 bg-white/5 p-3 text-left transition hover:bg-white/10"
                  >
                    <div className="font-medium">{p.full_name}</div>
                    <div className="text-sm text-white/45">Joined {new Date(p.created_at).toLocaleDateString()}</div>
                  </button>
                ))
              )}
            </div>
        </section>

        <section className="min-h-[60vh] rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
            {selected ? (
              <PlayerProfile player={selected} onClose={() => setSelected(null)} />
            ) : (
              <div className="text-white/55">Select a player to view analytics and payment history.</div>
            )}
        </section>
      </main>
    </DashboardShell>
  )
}
