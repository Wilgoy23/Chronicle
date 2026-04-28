import { useState } from 'react'

export default function HardcoverKeyPrompt({ color, onSaved }) {
  const [token, setToken] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave(e) {
    e.preventDefault()
    if (!token.trim()) return
    setSaving(true)
    await window.settings.set({ hardcoverToken: token.trim() })
    setSaving(false)
    onSaved()
  }

  return (
    <div className="key-prompt" style={{ '--accent': color }}>
      <div className="key-prompt-icon">🔑</div>
      <h3>Hardcover API Key</h3>
      <p>
        To search books, add your Hardcover API token.
        Get it at{' '}
        <strong>hardcover.app → Settings → API</strong>.
      </p>
      <form onSubmit={handleSave}>
        <input
          type="password"
          placeholder="Paste your token here"
          value={token}
          onChange={e => setToken(e.target.value)}
          autoFocus
          required
        />
        <button type="submit" className="submit-btn" disabled={saving}>
          {saving ? 'Saving…' : 'Save & Search'}
        </button>
      </form>
    </div>
  )
}
