const TTL_MS = 1000 * 3600

export function shouldExpire(createdAt: number) {
  return Date.now() - createdAt > TTL_MS
}
