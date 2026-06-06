const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('db', {
  getEntries:   (category)       => ipcRenderer.invoke('db:getEntries',   category),
  addEntry:     (entry)          => ipcRenderer.invoke('db:addEntry',     entry),
  updateEntry:  (entry)          => ipcRenderer.invoke('db:updateEntry',  entry),
  deleteEntry:  (id)             => ipcRenderer.invoke('db:deleteEntry',  id),
  getSeries:    (category)       => ipcRenderer.invoke('db:getSeries',    category),
  addSeries:    (category, name) => ipcRenderer.invoke('db:addSeries',    category, name),
  deleteSeries: (id)             => ipcRenderer.invoke('db:deleteSeries', id),
  renameSeries: (id, name)       => ipcRenderer.invoke('db:renameSeries', id, name),
})

contextBridge.exposeInMainWorld('settings', {
  get: ()      => ipcRenderer.invoke('settings:get'),
  set: (patch) => ipcRenderer.invoke('settings:set', patch),
})

contextBridge.exposeInMainWorld('api', {
  searchBooks:  (query) => ipcRenderer.invoke('api:searchBooks',  query),
  searchAnime:  (query) => ipcRenderer.invoke('api:searchAnime',  query),
  searchMovies: (query) => ipcRenderer.invoke('api:searchMovies', query),
  searchGames:  (query) => ipcRenderer.invoke('api:searchGames',  query),
})
