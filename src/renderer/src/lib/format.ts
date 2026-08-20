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
