const { ipcMain } = require('electron')
const { getEntries, addEntry, getSeries, updateEntry, deleteEntry } = require('./db')
const { searchBooks, searchAnime } = require('./api')

function registerHandlers(readSettings) {
  ipcMain.handle('db:getEntries',  (_e, category) => getEntries(category))
  ipcMain.handle('db:addEntry',    (_e, entry)    => addEntry(entry))
  ipcMain.handle('db:getSeries',   (_e, category) => getSeries(category))
  ipcMain.handle('db:updateEntry', (_e, entry)    => updateEntry(entry))
  ipcMain.handle('db:deleteEntry', (_e, id)       => deleteEntry(id))

  ipcMain.handle('api:searchBooks', async (_e, query) => {
    const { hardcoverToken } = readSettings()
    return searchBooks(query, hardcoverToken)
  })
  ipcMain.handle('api:searchAnime', (_e, query) => searchAnime(query))
}

module.exports = { registerHandlers }
