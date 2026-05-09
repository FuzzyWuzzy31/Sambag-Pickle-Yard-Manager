import React, { useMemo, useRef, useState } from 'react'

export default function useAppDialog() {
  const [dialog, setDialog] = useState(null)
  const [promptValue, setPromptValue] = useState('')
  const resolverRef = useRef(null)

  const close = (result = null) => {
    if (resolverRef.current) {
      resolverRef.current(result)
      resolverRef.current = null
    }
    setDialog(null)
    setPromptValue('')
  }

  const askConfirm = ({
    title = 'Confirm action',
    message = 'Are you sure?',
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    tone = 'default',
  } = {}) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve
      setDialog({ type: 'confirm', title, message, confirmText, cancelText, tone })
    })
  }

  const askPrompt = ({
    title = 'Enter value',
    message = '',
    defaultValue = '',
    placeholder = '',
    confirmText = 'Save',
    cancelText = 'Cancel',
  } = {}) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve
      setPromptValue(defaultValue)
      setDialog({
        type: 'prompt',
        title,
        message,
        confirmText,
        cancelText,
        placeholder,
      })
    })
  }

  const askChoice = ({
    title = 'Choose option',
    message = '',
    options = [],
    cancelText = 'Cancel',
  } = {}) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve
      setDialog({ type: 'choice', title, message, options, cancelText })
    })
  }

  const DialogRenderer = useMemo(() => {
    return function RenderDialog() {
      if (!dialog) return null

      const toneClasses =
        dialog.tone === 'danger'
          ? 'border-rose-300/30 bg-rose-500/15 text-rose-100'
          : dialog.tone === 'success'
          ? 'border-emerald-300/30 bg-emerald-500/15 text-emerald-100'
          : 'border-white/15 bg-white/10 text-white/85'

      return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/75 backdrop-blur-md" onClick={() => close(null)} />
          <div className="relative w-full max-w-md rounded-3xl border border-white/15 bg-[linear-gradient(160deg,rgba(17,24,39,0.95),rgba(15,23,42,0.92))] p-5 shadow-2xl shadow-black/40">
            <div className="mb-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-emerald-300/75">Action Required</p>
              <h3 className="mt-2 text-xl font-semibold">{dialog.title}</h3>
              {dialog.message ? <p className="mt-2 text-sm text-white/65">{dialog.message}</p> : null}
            </div>

            {dialog.type === 'prompt' ? (
              <input
                autoFocus
                value={promptValue}
                onChange={(e) => setPromptValue(e.target.value)}
                placeholder={dialog.placeholder}
                className="mb-4 w-full rounded-2xl border border-white/15 bg-black/30 px-4 py-3 text-white outline-none focus:border-emerald-300/40"
              />
            ) : null}

            {dialog.type === 'choice' ? (
              <div className="mb-4 space-y-2">
                {dialog.options.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => close(opt.value)}
                    className={`w-full rounded-2xl border px-4 py-3 text-left text-sm transition hover:bg-white/15 ${toneClasses}`}
                  >
                    <div className="font-semibold">{opt.label}</div>
                    {opt.description ? <div className="mt-1 text-xs opacity-80">{opt.description}</div> : null}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => close(null)}
                className="rounded-2xl border border-white/15 bg-white/5 px-4 py-2 text-sm text-white/80 hover:bg-white/10"
              >
                {dialog.cancelText || 'Cancel'}
              </button>

              {dialog.type === 'confirm' ? (
                <button
                  type="button"
                  onClick={() => close(true)}
                  className={`rounded-2xl border px-4 py-2 text-sm font-semibold ${toneClasses}`}
                >
                  {dialog.confirmText || 'Confirm'}
                </button>
              ) : null}

              {dialog.type === 'prompt' ? (
                <button
                  type="button"
                  onClick={() => close(promptValue.trim() ? promptValue.trim() : null)}
                  className="rounded-2xl border border-emerald-300/30 bg-emerald-500/20 px-4 py-2 text-sm font-semibold text-emerald-100"
                >
                  {dialog.confirmText || 'Save'}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      )
    }
  }, [dialog, promptValue])

  return { askConfirm, askPrompt, askChoice, DialogRenderer }
}
