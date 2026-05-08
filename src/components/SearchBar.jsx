import React from 'react'

export default function SearchBar({ value, onChange, placeholder = 'Search' }) {
  return (
    <div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full p-3 rounded bg-neutral-700"
      />
    </div>
  )
}
