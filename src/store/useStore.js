import { create } from 'zustand'

export const useStore = create((set) => {
  const persistedFee = (() => {
    try {
      const raw = localStorage.getItem('defaultFee')
      if (raw) return parseInt(raw, 10)
    } catch (e) {}
    return parseInt(import.meta.env.VITE_DEFAULT_FEE || '50', 10)
  })()

  return ({
    defaultFee: persistedFee,
    activeDate: null, // ISO date string YYYY-MM-DD
    sessionId: null,
    setDefaultFee: (fee) => {
      try { localStorage.setItem('defaultFee', String(fee)) } catch (e) {}
      set({ defaultFee: fee })
    },
    setActiveDate: (dateStr) => set({ activeDate: dateStr }),
    setSessionId: (id) => set({ sessionId: id })
  })
})
