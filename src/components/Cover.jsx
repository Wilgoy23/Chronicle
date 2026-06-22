import { useState } from 'react'

// Generic "No Cover" failsafe — shown when there's no image URL,
// or when a provided URL fails to load (404, dead link, etc.).
const FALLBACK_ICON = (
  <svg className="cover-fallback-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <path d="M21 15l-5-5L5 21" />
  </svg>
)

export default function Cover({ src, alt = '', className = '', compact = false }) {
  const [failedSrc, setFailedSrc] = useState(null)
  const showImage = src && failedSrc !== src

  if (showImage) {
    return (
      <img
        className={className}
        src={src}
        alt={alt}
        loading="lazy"
        onError={() => setFailedSrc(src)}
      />
    )
  }

  return (
    <div className={`cover-fallback ${className}`.trim()} role="img" aria-label="No cover available">
      {FALLBACK_ICON}
      {!compact && <span className="cover-fallback-text">No Cover</span>}
    </div>
  )
}
