import { describe, it, expect } from 'vitest'
import { mapMal, malDate, normalizeStatus } from '../../electron/importers/mal.js'

function animeXml(inner) {
  return `<?xml version="1.0" encoding="UTF-8" ?>
<myanimelist>
  <myinfo><user_export_type>1</user_export_type></myinfo>
  <anime>${inner}</anime>
</myanimelist>`
}

describe('malDate', () => {
  it('passes through a real date', () => {
    expect(malDate('2023-05-12')).toBe('2023-05-12')
  })
  it('treats MAL\'s unset-date sentinel as null', () => {
    expect(malDate('0000-00-00')).toBeNull()
  })
  it('treats blank as null', () => {
    expect(malDate('')).toBeNull()
  })
})

describe('normalizeStatus', () => {
  it('maps every known MAL status regardless of spacing/hyphenation/case', () => {
    expect(normalizeStatus('Watching')).toBe('in_progress')
    expect(normalizeStatus('Reading')).toBe('in_progress')
    expect(normalizeStatus('On-Hold')).toBe('in_progress')
    expect(normalizeStatus('On Hold')).toBe('in_progress')
    expect(normalizeStatus('on_hold')).toBe('in_progress')
    expect(normalizeStatus('Completed')).toBe('completed')
    expect(normalizeStatus('Dropped')).toBe('completed')
    expect(normalizeStatus('Plan to Watch')).toBe('planned')
    expect(normalizeStatus('Plan to Read')).toBe('planned')
  })
  it('falls back to planned for an unrecognized/blank status', () => {
    expect(normalizeStatus('')).toBe('planned')
    expect(normalizeStatus('Something Else')).toBe('planned')
  })
})

describe('mapMal', () => {
  it('maps a completed anime entry, unwrapping CDATA title/comments', () => {
    const xml = animeXml(`
      <series_animedb_id>1</series_animedb_id>
      <series_title><![CDATA[Cowboy Bebop]]></series_title>
      <series_episodes>26</series_episodes>
      <my_watched_episodes>26</my_watched_episodes>
      <my_start_date>2023-01-01</my_start_date>
      <my_finish_date>2023-01-20</my_finish_date>
      <my_score>9</my_score>
      <my_status>Completed</my_status>
      <my_comments><![CDATA[Great show]]></my_comments>
    `)
    expect(mapMal(xml).entries).toEqual([{
      category: 'anime',
      title: 'Cowboy Bebop',
      status: 'completed',
      rating: 9,
      notes: 'Great show',
      date_read: '2023-01-20',
      progress: 26,
      progress_total: 26,
    }])
  })

  it('treats a 0 score as unrated (null), not 0', () => {
    const xml = animeXml(`
      <series_title>Naruto</series_title>
      <my_watched_episodes>10</my_watched_episodes>
      <my_score>0</my_score>
      <my_status>Watching</my_status>
    `)
    expect(mapMal(xml).entries[0].rating).toBeNull()
  })

  it('only carries date_read through for completed entries', () => {
    const xml = animeXml(`
      <series_title>One Piece</series_title>
      <my_watched_episodes>100</my_watched_episodes>
      <my_finish_date>2023-01-20</my_finish_date>
      <my_status>Watching</my_status>
    `)
    expect(mapMal(xml).entries[0].date_read).toBeNull()
  })

  it('leaves progress_total null when the series total is unknown (0/ongoing)', () => {
    const xml = animeXml(`
      <series_title>Ongoing Show</series_title>
      <series_episodes>0</series_episodes>
      <my_watched_episodes>5</my_watched_episodes>
      <my_status>Watching</my_status>
    `)
    expect(mapMal(xml).entries[0].progress_total).toBeNull()
  })

  it('skips a block with no title', () => {
    const xml = animeXml(`<my_status>Completed</my_status>`)
    expect(mapMal(xml).entries).toHaveLength(0)
  })

  it('maps manga blocks to category "manga" using the chapters fields', () => {
    const xml = `<myanimelist>
      <myinfo><user_export_type>2</user_export_type></myinfo>
      <manga>
        <series_mangadb_id>2</series_mangadb_id>
        <series_title>Berserk</series_title>
        <series_chapters>0</series_chapters>
        <my_read_chapters>364</my_read_chapters>
        <my_score>10</my_score>
        <my_status>Reading</my_status>
      </manga>
    </myanimelist>`
    expect(mapMal(xml).entries).toEqual([{
      category: 'manga',
      title: 'Berserk',
      status: 'in_progress',
      rating: 10,
      notes: '',
      date_read: null,
      progress: 364,
      progress_total: null,
    }])
  })

  it('parses multiple sibling entries independently', () => {
    const xml = `<myanimelist>
      <anime><series_title>A</series_title><my_status>Completed</my_status><my_score>7</my_score></anime>
      <anime><series_title>B</series_title><my_status>Dropped</my_status><my_score>3</my_score></anime>
    </myanimelist>`
    const entries = mapMal(xml).entries
    expect(entries.map(e => e.title)).toEqual(['A', 'B'])
    expect(entries.map(e => e.status)).toEqual(['completed', 'completed']) // Dropped -> completed
  })
})
