/**
 * Compact duration string ("3h 12m", "45s", "2d 4h"). Always returns the two
 * largest non-zero units; smaller units are dropped so the readout stays
 * short. Zero collapses to "0s".
 */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0s'
  const totalSec = Math.floor(ms / 1000)
  const days = Math.floor(totalSec / 86400)
  const hrs = Math.floor((totalSec % 86400) / 3600)
  const min = Math.floor((totalSec % 3600) / 60)
  const sec = totalSec % 60
  if (days > 0) return hrs > 0 ? `${days}d ${hrs}h` : `${days}d`
  if (hrs > 0) return min > 0 ? `${hrs}h ${min}m` : `${hrs}h`
  if (min > 0) return sec > 0 ? `${min}m ${sec}s` : `${min}m`
  return `${sec}s`
}

// Human-readable relative time ("3 days ago", "just now"). Shared across
// the roster, leveling dialog, and anywhere else we surface timestamps.
export function formatRelative(ms: number, now: number = Date.now()): string {
  const diff = Math.max(0, now - ms)
  const sec = Math.floor(diff / 1000)
  if (sec < 45) return 'just now'
  const min = Math.floor(sec / 60)
  if (min < 2) return 'a minute ago'
  if (min < 60) return `${min} minutes ago`
  const hrs = Math.floor(min / 60)
  if (hrs < 2) return 'an hour ago'
  if (hrs < 24) return `${hrs} hours ago`
  const days = Math.floor(hrs / 24)
  if (days < 2) return 'yesterday'
  if (days < 14) return `${days} days ago`
  const weeks = Math.floor(days / 7)
  if (weeks < 8) return `${weeks} weeks ago`
  const months = Math.floor(days / 30)
  if (months < 24) return `${months} months ago`
  const years = Math.floor(days / 365)
  return `${years} years ago`
}
