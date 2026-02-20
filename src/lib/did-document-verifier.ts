import type { Cache } from '../cache/index.js'
import type { Logger } from './logger.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const DID_DOC_CACHE_PREFIX = 'barazo:did-doc:'
/** Soft TTL in seconds -- triggers background refresh after this. */
export const DID_DOC_SOFT_TTL = 3600 // 1 hour
/** Hard TTL in seconds -- Valkey key expiry. */
export const DID_DOC_HARD_TTL = 7200 // 2 hours

const PLC_DIRECTORY_URL = 'https://plc.directory'
const PLC_FETCH_TIMEOUT = 5000 // 5 seconds

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DidVerificationResult = { active: true } | { active: false; reason: string }

interface CachedDidEntry {
  active: boolean
  reason?: string
  resolvedAt: number
}

export interface DidDocumentVerifier {
  /** Verify that a DID is still active. */
  verify(did: string): Promise<DidVerificationResult>
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createDidDocumentVerifier(cache: Cache, logger: Logger): DidDocumentVerifier {
  /**
   * Resolve a DID document from PLC directory and return whether it's active.
   */
  async function resolveFromPlc(did: string): Promise<DidVerificationResult> {
    const url = `${PLC_DIRECTORY_URL}/${did}`

    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(PLC_FETCH_TIMEOUT),
    })

    if (response.ok) {
      return { active: true }
    }

    if (response.status === 410) {
      return { active: false, reason: 'DID has been tombstoned' }
    }

    if (response.status === 404) {
      return { active: false, reason: 'DID not found in PLC directory' }
    }

    // Unexpected status -- treat as resolution failure
    logger.warn({ did, status: response.status }, 'Unexpected PLC directory response')
    throw new Error(`PLC directory returned ${String(response.status)}`)
  }

  /**
   * Cache a verification result with hard TTL.
   */
  async function cacheResult(did: string, result: DidVerificationResult): Promise<void> {
    const entry: CachedDidEntry = {
      active: result.active,
      resolvedAt: Date.now(),
      ...(!result.active && { reason: (result as { reason: string }).reason }),
    }

    await cache.set(`${DID_DOC_CACHE_PREFIX}${did}`, JSON.stringify(entry), 'EX', DID_DOC_HARD_TTL)
  }

  /**
   * Trigger a non-blocking background refresh for a DID.
   */
  function backgroundRefresh(did: string): void {
    resolveFromPlc(did)
      .then(async (result) => {
        await cacheResult(did, result)
        logger.debug({ did }, 'Background DID document refresh completed')
      })
      .catch((err: unknown) => {
        logger.warn({ err, did }, 'Background DID document refresh failed')
      })
  }

  async function verify(did: string): Promise<DidVerificationResult> {
    // did:web -- skip PLC verification (PLC only handles did:plc)
    if (!did.startsWith('did:plc:')) {
      return { active: true }
    }

    // 1. Try cache
    let cachedEntry: CachedDidEntry | undefined
    try {
      const raw = await cache.get(`${DID_DOC_CACHE_PREFIX}${did}`)
      if (raw !== null) {
        cachedEntry = JSON.parse(raw) as CachedDidEntry

        const age = Date.now() - cachedEntry.resolvedAt
        const isPastSoftTtl = age > DID_DOC_SOFT_TTL * 1000

        if (!isPastSoftTtl) {
          // Fresh cache hit -- return immediately
          if (cachedEntry.active) {
            return { active: true }
          }
          return { active: false, reason: cachedEntry.reason ?? 'DID is not active' }
        }

        // Past soft TTL -- serve stale and trigger background refresh
        backgroundRefresh(did)

        if (cachedEntry.active) {
          return { active: true }
        }
        return { active: false, reason: cachedEntry.reason ?? 'DID is not active' }
      }
    } catch (err: unknown) {
      logger.warn({ err, did }, 'DID document cache read failed')
      // Fall through to PLC directory resolution
    }

    // 2. Cache miss -- resolve from PLC directory
    try {
      const result = await resolveFromPlc(did)

      // Cache the result (fire-and-forget on failure)
      cacheResult(did, result).catch((err: unknown) => {
        logger.warn({ err, did }, 'Failed to cache DID verification result')
      })

      return result
    } catch (err: unknown) {
      logger.error({ err, did }, 'DID document resolution failed')
      return { active: false, reason: 'DID document resolution failed' }
    }
  }

  return { verify }
}
