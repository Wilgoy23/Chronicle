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

contextBridge.exposeInMainWorld('data', {
  exportJson: () => ipcRenderer.invoke('data:exportJson'),
  exportCsv:  () => ipcRenderer.invoke('data:exportCsv'),
  importJson: () => ipcRenderer.invoke('data:importJson'),
  backup:     () => ipcRenderer.invoke('data:backup'),
  restore:    () => ipcRenderer.invoke('data:restore'),
})

contextBridge.exposeInMainWorld('api', {
  searchBooks:  (query) => ipcRenderer.invoke('api:searchBooks',  query),
  searchAnime:  (query) => ipcRenderer.invoke('api:searchAnime',  query),
  searchMovies: (query) => ipcRenderer.invoke('api:searchMovies', query),
  searchGames:  (query) => ipcRenderer.invoke('api:searchGames',  query),
})

contextBridge.exposeInMainWorld('releases', {
  get:       ()            => ipcRenderer.invoke('releases:get'),
  setStatus: (id, status)  => ipcRenderer.invoke('releases:setStatus', id, status),
  checkNow:  ()            => ipcRenderer.invoke('releases:checkNow'),
  onUpdated: (cb) => {
    const handler = () => cb()
    ipcRenderer.on('releases:updated', handler)
    return () => ipcRenderer.removeListener('releases:updated', handler)
  },
})
