import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  createDidDocumentVerifier,
  DID_DOC_CACHE_PREFIX,
  DID_DOC_HARD_TTL,
  DID_DOC_SOFT_TTL,
} from '../../../src/lib/did-document-verifier.js'
import type { DidDocumentVerifier } from '../../../src/lib/did-document-verifier.js'
import type { Logger } from '../../../src/lib/logger.js'

// ---------------------------------------------------------------------------
// Mock logger
// ---------------------------------------------------------------------------

function createMockLogger(): Logger {
  return {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn(),
    silent: vi.fn(),
    level: 'silent',
  } as unknown as Logger
}

// ---------------------------------------------------------------------------
// Mock cache
// ---------------------------------------------------------------------------

function createMockCache() {
  return {
    get: vi.fn<(...args: unknown[]) => Promise<string | null>>(),
    set: vi.fn<(...args: unknown[]) => Promise<string>>(),
  }
}

type MockCache = ReturnType<typeof createMockCache>

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TEST_DID = 'did:plc:abc123def456'
const TEST_DID_WEB = 'did:web:example.com'

function activeDidDoc() {
  return {
    id: TEST_DID,
    alsoKnownAs: ['at://alice.bsky.social'],
    verificationMethods: { atproto: 'did:key:z123' },
    rotationKeys: ['did:key:z456'],
    services: {
      atproto_pds: { type: 'AtprotoPersonalDataServer', endpoint: 'https://pds.example.com' },
    },
  }
}

function cachedEntry(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    active: true,
    resolvedAt: Date.now() - 30 * 60 * 1000, // 30 min ago (within soft TTL)
    ...overrides,
  })
}

function staleCachedEntry() {
  return JSON.stringify({
    active: true,
    resolvedAt: Date.now() - 70 * 60 * 1000, // 70 min ago (past soft TTL)
  })
}

function deactivatedCachedEntry() {
  return JSON.stringify({
    active: false,
    reason: 'tombstoned',
    resolvedAt: Date.now() - 10 * 60 * 1000,
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DidDocumentVerifier', () => {
  let verifier: DidDocumentVerifier
  let mockCache: MockCache
  let mockLogger: Logger
  let originalFetch: typeof globalThis.fetch
  let mockFetch: ReturnType<typeof vi.fn<typeof globalThis.fetch>>

  beforeEach(() => {
    mockCache = createMockCache()
    mockLogger = createMockLogger()
    verifier = createDidDocumentVerifier(mockCache as never, mockLogger)

    originalFetch = globalThis.fetch
    mockFetch = vi.fn<typeof globalThis.fetch>()
    globalThis.fetch = mockFetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  // =========================================================================
  // Cache hit - active DID
  // =========================================================================

  describe('cache hit with active DID', () => {
    it('returns active result without calling PLC directory', async () => {
      mockCache.get.mockResolvedValueOnce(cachedEntry())

      const result = await verifier.verify(TEST_DID)

      expect(result).toStrictEqual({ active: true })
      expect(mockFetch).not.toHaveBeenCalled()
      expect(mockCache.get).toHaveBeenCalledWith(`${DID_DOC_CACHE_PREFIX}${TEST_DID}`)
    })
  })

  // =========================================================================
  // Cache hit - deactivated DID
  // =========================================================================

  describe('cache hit with deactivated DID', () => {
    it('returns inactive result', async () => {
      mockCache.get.mockResolvedValueOnce(deactivatedCachedEntry())

      const result = await verifier.verify(TEST_DID)

      expect(result).toStrictEqual({ active: false, reason: 'tombstoned' })
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  // =========================================================================
  // Cache miss - successful PLC resolution
  // =========================================================================

  describe('cache miss with successful PLC resolution', () => {
    it('resolves from PLC directory and caches the result', async () => {
      mockCache.get.mockResolvedValueOnce(null) // cache miss
      mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(activeDidDoc()), { status: 200 }))
      mockCache.set.mockResolvedValueOnce('OK')

      const result = await verifier.verify(TEST_DID)

      expect(result).toStrictEqual({ active: true })

      // Verify PLC directory was called
      expect(mockFetch).toHaveBeenCalledOnce()
      const [url] = mockFetch.mock.calls[0] as [string, RequestInit]
      expect(url).toBe(`https://plc.directory/${TEST_DID}`)

      // Verify cache was populated with hard TTL
      expect(mockCache.set).toHaveBeenCalledWith(
        `${DID_DOC_CACHE_PREFIX}${TEST_DID}`,
        expect.any(String) as string,
        'EX',
        DID_DOC_HARD_TTL
      )
    })
  })

  // =========================================================================
  // Cache miss - tombstoned DID (410)
  // =========================================================================

  describe('cache miss with tombstoned DID', () => {
    it('rejects with tombstoned reason and caches the result', async () => {
      mockCache.get.mockResolvedValueOnce(null)
      mockFetch.mockResolvedValueOnce(new Response('Gone', { status: 410 }))
      mockCache.set.mockResolvedValueOnce('OK')

      const result = await verifier.verify(TEST_DID)

      expect(result).toStrictEqual({ active: false, reason: 'DID has been tombstoned' })

      // Cache the tombstoned status to avoid repeated lookups
      expect(mockCache.set).toHaveBeenCalledOnce()
    })
  })

  // =========================================================================
  // Cache miss - DID not found (404)
  // =========================================================================

  describe('cache miss with DID not found', () => {
    it('rejects with not-found reason', async () => {
      mockCache.get.mockResolvedValueOnce(null)
      mockFetch.mockResolvedValueOnce(new Response('Not Found', { status: 404 }))

      const result = await verifier.verify(TEST_DID)

      expect(result).toStrictEqual({ active: false, reason: 'DID not found in PLC directory' })
    })
  })

  // =========================================================================
  // Resolution failure - no cache (fail closed)
  // =========================================================================

  describe('resolution failure with no cache', () => {
    it('rejects when PLC directory is unreachable and no cache exists', async () => {
      mockCache.get.mockResolvedValueOnce(null)
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const result = await verifier.verify(TEST_DID)

      expect(result).toStrictEqual({
        active: false,
        reason: 'DID document resolution failed',
      })
    })
  })

  // =========================================================================
  // Resolution failure - stale cache available (serve stale)
  // =========================================================================

  describe('resolution failure with stale cache available', () => {
    it('uses stale cached value when PLC directory fails', async () => {
      // First call: cache returns stale entry (past soft TTL but before hard TTL)
      // The verifier should try to refresh, fail, then serve stale
      mockCache.get.mockResolvedValueOnce(staleCachedEntry())
      // Background refresh will fail
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const result = await verifier.verify(TEST_DID)

      // Should still return active from stale cache
      expect(result).toStrictEqual({ active: true })
    })
  })

  // =========================================================================
  // Cache error - fallback to PLC directory
  // =========================================================================

  describe('cache error', () => {
    it('falls back to PLC directory when cache read fails', async () => {
      mockCache.get.mockRejectedValueOnce(new Error('Valkey down'))
      mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(activeDidDoc()), { status: 200 }))
      mockCache.set.mockRejectedValueOnce(new Error('Valkey down')) // cache write also fails

      const result = await verifier.verify(TEST_DID)

      expect(result).toStrictEqual({ active: true })
      expect(mockFetch).toHaveBeenCalledOnce()
    })

    it('rejects when both cache and PLC directory fail', async () => {
      mockCache.get.mockRejectedValueOnce(new Error('Valkey down'))
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const result = await verifier.verify(TEST_DID)

      expect(result).toStrictEqual({
        active: false,
        reason: 'DID document resolution failed',
      })
    })
  })

  // =========================================================================
  // did:web passthrough
  // =========================================================================

  describe('did:web handling', () => {
    it('allows did:web DIDs without PLC lookup', async () => {
      const result = await verifier.verify(TEST_DID_WEB)

      expect(result).toStrictEqual({ active: true })
      expect(mockFetch).not.toHaveBeenCalled()
      expect(mockCache.get).not.toHaveBeenCalled()
    })
  })

  // =========================================================================
  // Background refresh on soft TTL expiry
  // =========================================================================

  describe('background refresh', () => {
    it('triggers background refresh when cached entry is past soft TTL', async () => {
      mockCache.get.mockResolvedValueOnce(staleCachedEntry())
      // Background refresh succeeds
      mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(activeDidDoc()), { status: 200 }))
      mockCache.set.mockResolvedValueOnce('OK')

      const result = await verifier.verify(TEST_DID)

      // Returns immediately from stale cache
      expect(result).toStrictEqual({ active: true })

      // Wait for background refresh to complete
      await vi.waitFor(() => {
        expect(mockFetch).toHaveBeenCalledOnce()
      })
    })

    it('does not trigger background refresh when cached entry is within soft TTL', async () => {
      mockCache.get.mockResolvedValueOnce(cachedEntry())

      const result = await verifier.verify(TEST_DID)

      expect(result).toStrictEqual({ active: true })

      // No fetch should have been triggered
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  // =========================================================================
  // Constants exported correctly
  // =========================================================================

  describe('exported constants', () => {
    it('has 1-hour soft TTL', () => {
      expect(DID_DOC_SOFT_TTL).toBe(3600)
    })

    it('has 2-hour hard TTL', () => {
      expect(DID_DOC_HARD_TTL).toBe(7200)
    })

    it('has correct cache prefix', () => {
      expect(DID_DOC_CACHE_PREFIX).toBe('barazo:did-doc:')
    })
  })
})
