# Chronicle

A personal media collection tracker for books, anime, movies, and games — built as a Windows chronicle app.

## Features

- Track entries across customizable categories (books, anime, movies, games, etc.)
- Log status: completed, in progress, or planned
- Add ratings, notes, cover images, and series groupings
- Search across your collection
- Timeline view of your media history

## Tech Stack

- **Electron** — chronicle shell
- **React 18 + Vite** — frontend
- **SQLite (better-sqlite3)** — local database

## Getting Started

**Prerequisites:** Node.js 18+

```bash
npm install
npm run dev
```

## Build

Produces a Windows installer (`.exe`) in the `release/` folder:...

```bash
npm run build
```
