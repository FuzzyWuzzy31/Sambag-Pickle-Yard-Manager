import React, { useRef, useState } from 'react'

export default function PullToRefresh({ onRefresh, children, className = '' }) {
  const startY = useRef(null)
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  async function triggerRefresh() {
    if (refreshing) return
    setRefreshing(true)
    try {
      await onRefresh?.()
    } finally {
      setPull(0)
      setRefreshing(false)
    }
  }

  function onTouchStart(e) {
    if (window.scrollY > 0) return
    startY.current = e.touches[0].clientY
  }

  function onTouchMove(e) {
    if (startY.current == null) return
    const currentY = e.touches[0].clientY
    const delta = currentY - startY.current
    if (delta > 0 && window.scrollY === 0) {
      setPull(Math.min(delta, 90))
    }
  }

  function onTouchEnd() {
    if (pull > 70) {
      triggerRefresh()
    } else {
      setPull(0)
    }
    startY.current = null
  }

  return (
    <div
      className={className}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <div
        className="transition-transform duration-200"
        style={{ transform: `translateY(${Math.min(pull, 80)}px)` }}
      >
        <div className="flex justify-center text-xs text-neutral-400 h-6">
          {refreshing ? 'Refreshing…' : pull > 30 ? 'Release to refresh' : pull > 0 ? 'Pull to refresh' : ''}
        </div>
        {children}
      </div>
    </div>
  )
}
