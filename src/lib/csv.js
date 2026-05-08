export function toCSV(rows, headers) {
  const esc = (v) => {
    if (v === null || v === undefined) return ''
    const s = String(v)
    if (s.includes(',') || s.includes('\n') || s.includes('\r') || s.includes('"')) {
      return '"' + s.replace(/"/g, '""') + '"'
    }
    return s
  }

  const headerLine = headers.join(',')
  const body = rows.map((r) => headers.map((h) => esc(r[h])).join(',')).join('\n')
  return headerLine + '\n' + body
}

export function downloadCSV(filename, content) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
