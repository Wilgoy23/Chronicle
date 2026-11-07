const { ipcMain } = require('electron')
const {
  getEntries, addEntry, updateEntry, deleteEntry,
  getLogs, getLogsByCategory, addLog, deleteLog,
  getSeries, addSeries, deleteSeries, renameSeries,
} = require('./db')
const { searchBooks, searchAnime, searchManga, searchMovies, searchTv, searchGames } = require('./api')
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
  ipcMain.handle('db:deleteEntry',   (_e, id)       => touching(deleteEntry)(id))
  ipcMain.handle('db:getLogs',          (_e, entryId)  => getLogs(entryId))
  ipcMain.handle('db:getLogsByCategory', (_e, category) => getLogsByCategory(category))
  ipcMain.handle('db:addLog',           (_e, log)      => addLog(log))
  ipcMain.handle('db:deleteLog',        (_e, id)       => deleteLog(id))
  ipcMain.handle('db:getSeries',     (_e, category) => getSeries(category))
  ipcMain.handle('db:addSeries',     (_e, category, name) => addSeries(category, name))
  ipcMain.handle('db:deleteSeries',  (_e, id)       => touching(deleteSeries)(id))
  ipcMain.handle('db:renameSeries',  (_e, id, name) => touching(renameSeries)(id, name))

  ipcMain.handle('api:searchBooks',  async (_e, query) => {
    const { hardcoverToken } = readSettings()
    return searchBooks(query, hardcoverToken)
  })
  ipcMain.handle('api:searchAnime',  (_e, query) => searchAnime(query))
  ipcMain.handle('api:searchManga',  (_e, query) => searchManga(query))
  ipcMain.handle('api:searchMovies', async (_e, query) => {
    const { tmdbKey } = readSettings()
    return searchMovies(query, tmdbKey)
  })
  ipcMain.handle('api:searchTv',     async (_e, query) => {
    const { tmdbKey } = readSettings()
    return searchTv(query, tmdbKey)
  })
  ipcMain.handle('api:searchGames',  async (_e, query) => {
    const { rawgKey } = readSettings()
    return searchGames(query, rawgKey)
  })
}

module.exports = { registerHandlers }
