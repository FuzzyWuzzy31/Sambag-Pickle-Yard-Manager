import React from 'react'

export default function Skeleton({ className = 'h-6 w-full', rounded = true }) {
  return <div className={`animate-pulse bg-neutral-700 ${rounded ? 'rounded' : ''} ${className}`} />
}
