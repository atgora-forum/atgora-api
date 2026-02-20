/**
 * Extract the rkey (record key) from an AT URI.
 * Format: at://did:plc:xxx/collection/rkey
 *
 * @throws Error if the rkey is missing or empty
 */
export function extractRkey(uri: string): string {
  const parts = uri.split('/')
  const rkey = parts[parts.length - 1]
  if (!rkey) {
    throw new Error('Invalid AT URI: missing rkey')
  }
  return rkey
}
