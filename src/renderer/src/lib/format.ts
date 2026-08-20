/**
 * Format duration in seconds to a human-readable string.
 * Examples: 0 → "0s", 45 → "45s", 90 → "1m 30s", 3725 → "1h 2m"
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`

  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.round(seconds % 60)

  if (hours > 0) {
    return minsPart(hours, minutes)
  }
  return `${minutes}m${secs > 0 ? ` ${secs}s` : ''}`
}

function minsPart(hours: number, minutes: number): string {
  return `${hours}h${minutes > 0 ? ` ${minutes}m` : ''}`
}

/**
 * Format a Date to local "YYYY-MM-DD" (no UTC shift).
 * Unlike toISOString().split('T')[0] which returns UTC date.
 */
export function formatLocalDate(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Format seconds to a short label for charts (e.g., "2h", "45m").
 */
export function formatShort(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  const hours = Math.floor(seconds / 3600)
  const mins = Math.round((seconds % 3600) / 60)
  return mins > 0 ? `${hours}h${mins}m` : `${hours}h`
}
