const { ipcMain } = require('electron')
const {
  getEntries, addEntry, updateEntry, deleteEntry,
  getLogs, getLogsByCategory, addLog, deleteLog,
  getSeries, addSeries, deleteSeries, renameSeries, addEntriesBatch,
  getActivity, cacheGet, cacheSet,
  getLists, createList, updateList, deleteList,
  getListItems, addToList, removeFromList, reorderList, setListItemNote, getEntryListIds,
} = require('./db')
const { getEpisodes } = require('./episodes')
const catalog = require('./catalog')
const { effectiveKeys } = require('./keys')
const { getSeriesMembers } = require('./seriesLookup')
const { markLibraryDirty } = require('./ai/aiService')

// Text-affecting mutations schedule an incremental AI re-index (debounced).
function touching(fn) {
  return (...args) => {
    const result = fn(...args)
    markLibraryDirty()
    return result
  }
}

function registerHandlers(readSettings) {
  ipcMain.handle('db:getEntries',    (_e, category) => getEntries(category))
  ipcMain.handle('db:addEntry',      (_e, entry)    => touching(addEntry)(entry))
  ipcMain.handle('db:updateEntry',   (_e, entry)    => touching(updateEntry)(entry))
  ipcMain.handle('db:addEntriesBatch', (_e, payload) => touching(addEntriesBatch)(payload))
  ipcMain.handle('db:deleteEntry',   (_e, id)       => touching(deleteEntry)(id))
  ipcMain.handle('db:getLogs',          (_e, entryId)  => getLogs(entryId))
  ipcMain.handle('db:getLogsByCategory', (_e, category) => getLogsByCategory(category))
  ipcMain.handle('db:addLog',           (_e, log)      => addLog(log))
  ipcMain.handle('db:deleteLog',        (_e, id)       => deleteLog(id))
  ipcMain.handle('db:getActivity',      (_e, entryId)  => getActivity(entryId))
  ipcMain.handle('db:getSeries',     (_e, category) => getSeries(category))
  ipcMain.handle('db:addSeries',     (_e, category, name) => addSeries(category, name))
  ipcMain.handle('db:deleteSeries',  (_e, id)       => touching(deleteSeries)(id))
  ipcMain.handle('db:renameSeries',  (_e, id, name) => touching(renameSeries)(id, name))

  // Custom lists (8.1). Membership isn't embedded text, so no AI re-index.
  ipcMain.handle('lists:getAll',      ()                         => getLists())
  ipcMain.handle('lists:create',      (_e, payload)              => createList(payload ?? {}))
  ipcMain.handle('lists:update',      (_e, payload)              => updateList(payload ?? {}))
  ipcMain.handle('lists:delete',      (_e, id)                   => deleteList(id))
  ipcMain.handle('lists:getItems',    (_e, listId)               => getListItems(listId))
  ipcMain.handle('lists:addItems',    (_e, listId, entryIds)     => addToList(listId, entryIds ?? []))
  ipcMain.handle('lists:removeItem',  (_e, listId, entryId)      => removeFromList(listId, entryId))
  ipcMain.handle('lists:reorder',     (_e, listId, entryIds)     => reorderList(listId, entryIds ?? []))
  ipcMain.handle('lists:setNote',     (_e, listId, entryId, note) => setListItemNote(listId, entryId, note))
  ipcMain.handle('lists:forEntry',    (_e, entryId)              => getEntryListIds(entryId))

  // One channel per category (kept for the renderer + e2e stubs); each routes
  // through the catalog, which picks the keyed source or its keyless fallback.
  const searchChannels = {
    'api:searchBooks': 'book', 'api:searchAnime': 'anime', 'api:searchManga': 'manga',
    'api:searchMovies': 'movie', 'api:searchTv': 'tv', 'api:searchGames': 'game',
  }
  for (const [channel, category] of Object.entries(searchChannels)) {
    ipcMain.handle(channel, (_e, query) => catalog.search(category, query, readSettings()))
  }
  ipcMain.handle('api:sources', () => catalog.sourcesSummary(readSettings()))
  // Only the identity fields cross IPC — the renderer passes whole entries.
  ipcMain.handle('api:getEpisodes', (_e, entry, opts) => getEpisodes(
    { category: entry?.category, source: entry?.source, source_id: entry?.source_id },
    readSettings(),
    { get: cacheGet, set: cacheSet },
    opts ?? {},
  ))
  ipcMain.handle('api:getSeriesMembers', (_e, category, sourceId, source) => {
    return getSeriesMembers(category, sourceId, effectiveKeys(readSettings()), source ?? null)
  })
}

module.exports = { registerHandlers }
