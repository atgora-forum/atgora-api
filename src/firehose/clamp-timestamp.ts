const MAX_FUTURE_MS = 5 * 60 * 1000 // 5 minutes
const MAX_PAST_MS = 60 * 60 * 1000 // 1 hour

/**
 * Clamp a client-declared createdAt timestamp to prevent feed manipulation.
 *
 * AT Protocol createdAt is client-declared — a malicious client can set it to
 * any value. Clamping prevents future-dated records from permanently pinning to
 * the top of feeds, and extremely backdated records from being buried.
 *
 * - Future timestamps (> 5 min ahead of now) → clamped to now
 * - Very old timestamps (> 1 hour before now) → clamped to 1 hour ago
 * - Otherwise → client timestamp used as-is
 */
export function clampCreatedAt(clientCreatedAt: Date, now: Date = new Date()): Date {
  const maxFuture = new Date(now.getTime() + MAX_FUTURE_MS)
  const maxPast = new Date(now.getTime() - MAX_PAST_MS)

  if (clientCreatedAt > maxFuture) return now
  if (clientCreatedAt < maxPast) return maxPast
  return clientCreatedAt
}
