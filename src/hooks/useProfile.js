import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from './useAuth'

export function useProfile() {
  const { user } = useAuth()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) {
      setProfile(null)
      setLoading(false)
      return
    }

    let mounted = true

    async function fetchProfile() {
      setLoading(true)
      const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (!mounted) return
      if (error) {
        console.error('Profile fetch error', error)
        setProfile(null)
        setLoading(false)
        return
      }
      setProfile(data)
      setLoading(false)
    }

    fetchProfile()

    const subscription = supabase
      .channel('public:profiles')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        fetchProfile()
      })
      .subscribe()

    return () => {
      mounted = false
      try {
        supabase.removeChannel(subscription)
      } catch (e) {}
    }
  }, [user])

  return { profile, loading }
}
