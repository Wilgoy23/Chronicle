const { ipcMain } = require('electron')
const {
  getEntries, addEntry, updateEntry, deleteEntry,
  getSeries, addSeries, deleteSeries, renameSeries,
} = require('./db')
const { searchBooks, searchAnime, searchMovies, searchGames } = require('./api')

function registerHandlers(readSettings) {
  ipcMain.handle('db:getEntries',    (_e, category) => getEntries(category))
  ipcMain.handle('db:addEntry',      (_e, entry)    => addEntry(entry))
  ipcMain.handle('db:updateEntry',   (_e, entry)    => updateEntry(entry))
  ipcMain.handle('db:deleteEntry',   (_e, id)       => deleteEntry(id))
  ipcMain.handle('db:getSeries',     (_e, category) => getSeries(category))
  ipcMain.handle('db:addSeries',     (_e, category, name) => addSeries(category, name))
  ipcMain.handle('db:deleteSeries',  (_e, id)       => deleteSeries(id))
  ipcMain.handle('db:renameSeries',  (_e, id, name) => renameSeries(id, name))

  ipcMain.handle('api:searchBooks',  async (_e, query) => {
    const { hardcoverToken } = readSettings()
    return searchBooks(query, hardcoverToken)
  })
  ipcMain.handle('api:searchAnime',  (_e, query) => searchAnime(query))
  ipcMain.handle('api:searchMovies', async (_e, query) => {
    const { tmdbKey } = readSettings()
    return searchMovies(query, tmdbKey)
  })
  ipcMain.handle('api:searchGames',  async (_e, query) => {
    const { rawgKey } = readSettings()
    return searchGames(query, rawgKey)
  })
}

module.exports = { registerHandlers }
