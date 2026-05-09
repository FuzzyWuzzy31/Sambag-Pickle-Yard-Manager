import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let subscription;
    const loadingTimeout = window.setTimeout(() => {
      if (!cancelled) {
        console.warn('Auth session check timed out, continuing without a user session.')
        setLoading(false)
      }
    }, 4000)

    const initAuth = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          console.error('Initial session error:', error.message);
        }

        if (!cancelled) {
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
          } else if (!cancelled) {
            setUser(result.data?.session?.user ?? null);
          }
        }
      } catch (err) {
        console.error('Auth init error:', err);
        if (!cancelled) {
          setLoading(false);
        }
      }

      const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange((event, session) => {
        if (!cancelled) {
          setUser(session?.user ?? null);
          setLoading(false);
        }
      });

      subscription = authSub;
    };

    initAuth();

    return () => {
      cancelled = true;
      window.clearTimeout(loadingTimeout);
      subscription?.unsubscribe();
    };
  }, []);

  return { user, loading };
}
