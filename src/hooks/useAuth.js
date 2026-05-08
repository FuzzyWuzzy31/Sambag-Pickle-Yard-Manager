import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';

export function useAuth() {
  const sessionKey = `sb-${new URL(import.meta.env.VITE_SUPABASE_URL).host.split('.')[0]}-auth-token`
  const storedSession = (() => {
    try {
      const raw = localStorage.getItem(sessionKey)
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  })()

  const [user, setUser] = useState(storedSession?.user ?? null);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  useEffect(() => {
    let subscription;

    const initAuth = async () => {
      try {
        if (storedSession?.user && mounted.current) {
          setUser(storedSession.user)
          setLoading(false)
        }

        const { data, error } = await supabase.auth.getSession();
        if (error) {
          console.error('Initial session error:', error.message);
        }

        if (mounted.current) {
          setUser(data?.session?.user ?? null);
          setLoading(false);
        }

        if (import.meta.env.VITE_DEV_MODE === 'true' && !data?.session?.user) {
          const result = await supabase.auth.signInWithPassword({
            email: import.meta.env.VITE_DEV_EMAIL,
            password: import.meta.env.VITE_DEV_PASSWORD,
          });
          if (result.error) {
            console.error('Auto-login error:', result.error.message);
          } else if (mounted.current) {
            setUser(result.data?.session?.user ?? null);
          }
        }
      } catch (err) {
        console.error('Auth init error:', err);
        if (mounted.current) {
          setLoading(false);
        }
      }

      const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange((event, session) => {
        if (mounted.current) {
          setUser(session?.user ?? null);
          setLoading(false);
        }
      });

      subscription = authSub;
    };

    initAuth();

    return () => {
      mounted.current = false;
      subscription?.unsubscribe();
    };
  }, []);

  return { user, loading };
}
