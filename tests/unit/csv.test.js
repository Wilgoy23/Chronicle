import { describe, it, expect } from 'vitest'
import { toCsv, csvCell, CSV_COLUMNS } from '../../electron/csv.js'

describe('csvCell', () => {
  it('renders null/undefined as empty', () => {
    expect(csvCell(null)).toBe('')
    expect(csvCell(undefined)).toBe('')
  })
  it('leaves plain values unquoted', () => {
    expect(csvCell('Dune')).toBe('Dune')
    expect(csvCell(9)).toBe('9')
    expect(csvCell(0)).toBe('0')
  })
  it('quotes and escapes commas, quotes, and newlines', () => {
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('she said "hi"')).toBe('"she said ""hi"""')
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"')
  })
})

describe('toCsv', () => {
  it('emits a header row of all columns', () => {
    const csv = toCsv([])
    expect(csv).toBe(CSV_COLUMNS.join(','))
  })

  it('serializes entries in column order with CRLF line endings', () => {
    const entries = [
      { id: 1, category: 'book', title: 'Dune', series: 'Dune', status: 'completed', rating: 9,
        progress: 0, progress_total: null, date_read: '2024-01-01', notes: 'great',
        description: null, cover_url: null, source: null, source_id: null, created_at: '2024-01-01 10:00:00' },
    ]
    const lines = toCsv(entries).split('\r\n')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toBe(CSV_COLUMNS.join(','))
    expect(lines[1]).toBe('1,book,Dune,Dune,completed,9,0,,2024-01-01,great,,,,,2024-01-01 10:00:00')
  })

  it('escapes a title containing a comma', () => {
    const csv = toCsv([{ title: 'Fire, and Blood' }])
    expect(csv.split('\r\n')[1]).toContain('"Fire, and Blood"')
  })
})
