import React from 'react'

export default function Modal({ open, title, children, onClose }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[75] flex items-end justify-center p-4 sm:items-center">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-md" onClick={onClose} />
      <div className="relative z-50 w-full sm:max-w-md rounded-3xl border border-white/15 bg-[linear-gradient(160deg,rgba(17,24,39,0.96),rgba(15,23,42,0.92))] p-5 shadow-2xl shadow-black/40">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button onClick={onClose} className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-sm text-white/75">Close</button>
        </div>
        <div>{children}</div>
      </div>
    </div>
  )
}
