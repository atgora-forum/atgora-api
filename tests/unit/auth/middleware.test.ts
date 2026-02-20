import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import Fastify from 'fastify'
import type { FastifyInstance } from 'fastify'
import { createAuthMiddleware } from '../../../src/auth/middleware.js'
import type { RequestUser } from '../../../src/auth/middleware.js'
import type { SessionService, Session } from '../../../src/auth/session.js'
import type { DidDocumentVerifier } from '../../../src/lib/did-document-verifier.js'
import type { Logger } from '../../../src/lib/logger.js'

// ---------------------------------------------------------------------------
// Standalone mock functions (avoids @typescript-eslint/unbound-method)
// ---------------------------------------------------------------------------

const validateAccessTokenFn = vi.fn<(...args: unknown[]) => Promise<Session | undefined>>()
const verifyDidFn =
  vi.fn<(...args: unknown[]) => Promise<{ active: true } | { active: false; reason: string }>>()

function createMockSessionService(): SessionService {
  return {
    createSession: vi.fn(),
    validateAccessToken: validateAccessTokenFn,
    refreshSession: vi.fn(),
    deleteSession: vi.fn(),
    deleteAllSessionsForDid: vi.fn(),
  }
}

function createMockDidVerifier(): DidDocumentVerifier {
  return {
    verify: verifyDidFn,
  }
}

// Logger mock functions
const logErrorFn = vi.fn()
const logWarnFn = vi.fn()

function createMockLogger(): Logger {
  return {
    info: vi.fn(),
    error: logErrorFn,
    warn: logWarnFn,
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn(),
    silent: vi.fn(),
    level: 'silent',
  } as unknown as Logger
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VALID_TOKEN = 'a'.repeat(64)
const VALID_SESSION: Session = {
  sid: 's'.repeat(64),
  did: 'did:plc:abc123',
  handle: 'alice.bsky.social',
  accessTokenHash: 'h'.repeat(64),
  accessTokenExpiresAt: Date.now() + 900_000,
  createdAt: Date.now() - 60_000,
}

// ---------------------------------------------------------------------------
// requireAuth tests
// ---------------------------------------------------------------------------

describe('requireAuth middleware', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    const mockSessionService = createMockSessionService()
    const mockLogger = createMockLogger()
    const mockDidVerifier = createMockDidVerifier()

    const { requireAuth } = createAuthMiddleware(mockSessionService, mockDidVerifier, mockLogger)

    app = Fastify({ logger: false })

    // Fastify requires decoration before hooks can set properties
    app.decorateRequest('user', undefined)

    app.get('/test', { preHandler: [requireAuth] }, (request) => {
      return { user: request.user }
    })

    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    // Default: DID verification passes
    verifyDidFn.mockResolvedValue({ active: true })
  })

  it('returns 401 for missing Authorization header', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/test',
    })

    expect(response.statusCode).toBe(401)
    expect(response.json<{ error: string }>()).toStrictEqual({ error: 'Authentication required' })
  })

  it('returns 401 for non-Bearer authorization scheme', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { authorization: 'Basic dXNlcjpwYXNz' },
    })

    expect(response.statusCode).toBe(401)
    expect(response.json<{ error: string }>()).toStrictEqual({ error: 'Authentication required' })
  })

  it('returns 401 for empty Bearer token', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { authorization: 'Bearer ' },
    })

    expect(response.statusCode).toBe(401)
    expect(response.json<{ error: string }>()).toStrictEqual({ error: 'Authentication required' })
  })

  it('returns 401 for invalid/expired token', async () => {
    validateAccessTokenFn.mockResolvedValueOnce(undefined)

    const response = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
    })

    expect(response.statusCode).toBe(401)
    expect(response.json<{ error: string }>()).toStrictEqual({ error: 'Invalid or expired token' })
    expect(validateAccessTokenFn).toHaveBeenCalledWith(VALID_TOKEN)
  })

  it('sets request.user and returns 200 for valid token with active DID', async () => {
    validateAccessTokenFn.mockResolvedValueOnce(VALID_SESSION)
    verifyDidFn.mockResolvedValueOnce({ active: true })

    const response = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
    })

    expect(response.statusCode).toBe(200)

    const body = response.json<{ user: RequestUser }>()
    expect(body.user).toStrictEqual({
      did: VALID_SESSION.did,
      handle: VALID_SESSION.handle,
      sid: VALID_SESSION.sid,
    })
    expect(validateAccessTokenFn).toHaveBeenCalledWith(VALID_TOKEN)
    expect(verifyDidFn).toHaveBeenCalledWith(VALID_SESSION.did)
  })

  it('returns 401 when DID is deactivated/tombstoned', async () => {
    validateAccessTokenFn.mockResolvedValueOnce(VALID_SESSION)
    verifyDidFn.mockResolvedValueOnce({ active: false, reason: 'DID has been tombstoned' })

    const response = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
    })

    expect(response.statusCode).toBe(401)
    expect(response.json<{ error: string }>()).toStrictEqual({
      error: 'DID is no longer active',
    })
  })

  it('returns 502 when DID verification fails with resolution error', async () => {
    validateAccessTokenFn.mockResolvedValueOnce(VALID_SESSION)
    verifyDidFn.mockResolvedValueOnce({
      active: false,
      reason: 'DID document resolution failed',
    })

    const response = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
    })

    expect(response.statusCode).toBe(502)
    expect(response.json<{ error: string }>()).toStrictEqual({
      error: 'Service temporarily unavailable',
    })
  })

  it('returns 502 when DID verifier throws', async () => {
    validateAccessTokenFn.mockResolvedValueOnce(VALID_SESSION)
    verifyDidFn.mockRejectedValueOnce(new Error('Unexpected error'))

    const response = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
    })

    expect(response.statusCode).toBe(502)
    expect(response.json<{ error: string }>()).toStrictEqual({
      error: 'Service temporarily unavailable',
    })
    expect(logErrorFn).toHaveBeenCalledOnce()
  })

  it('returns 502 when sessionService throws', async () => {
    validateAccessTokenFn.mockRejectedValueOnce(new Error('Valkey connection lost'))

    const response = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
    })

    expect(response.statusCode).toBe(502)
    expect(response.json<{ error: string }>()).toStrictEqual({
      error: 'Service temporarily unavailable',
    })
    expect(logErrorFn).toHaveBeenCalledOnce()
  })
})

// ---------------------------------------------------------------------------
// optionalAuth tests
// ---------------------------------------------------------------------------

describe('optionalAuth middleware', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    const mockSessionService = createMockSessionService()
    const mockLogger = createMockLogger()
    const mockDidVerifier = createMockDidVerifier()

    const { optionalAuth } = createAuthMiddleware(mockSessionService, mockDidVerifier, mockLogger)

    app = Fastify({ logger: false })

    // Fastify requires decoration before hooks can set properties
    app.decorateRequest('user', undefined)

    app.get('/test', { preHandler: [optionalAuth] }, (request) => {
      return { user: request.user ?? null }
    })

    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    // Default: DID verification passes
    verifyDidFn.mockResolvedValue({ active: true })
  })

  it('sets request.user for valid token with active DID', async () => {
    validateAccessTokenFn.mockResolvedValueOnce(VALID_SESSION)
    verifyDidFn.mockResolvedValueOnce({ active: true })

    const response = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
    })

    expect(response.statusCode).toBe(200)

    const body = response.json<{ user: RequestUser }>()
    expect(body.user).toStrictEqual({
      did: VALID_SESSION.did,
      handle: VALID_SESSION.handle,
      sid: VALID_SESSION.sid,
    })
  })

  it('continues with request.user undefined for missing Authorization header', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/test',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json<{ user: null }>()).toStrictEqual({ user: null })
  })

  it('continues with request.user undefined for invalid token', async () => {
    validateAccessTokenFn.mockResolvedValueOnce(undefined)

    const response = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json<{ user: null }>()).toStrictEqual({ user: null })
  })

  it('continues with request.user undefined when DID is deactivated', async () => {
    validateAccessTokenFn.mockResolvedValueOnce(VALID_SESSION)
    verifyDidFn.mockResolvedValueOnce({ active: false, reason: 'DID has been tombstoned' })

    const response = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json<{ user: null }>()).toStrictEqual({ user: null })
    expect(logWarnFn).toHaveBeenCalledOnce()
  })

  it('continues with request.user undefined when DID verifier throws', async () => {
    validateAccessTokenFn.mockResolvedValueOnce(VALID_SESSION)
    verifyDidFn.mockRejectedValueOnce(new Error('Unexpected error'))

    const response = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json<{ user: null }>()).toStrictEqual({ user: null })
    expect(logWarnFn).toHaveBeenCalledOnce()
  })

  it('continues with request.user undefined when sessionService throws and logs warning', async () => {
    validateAccessTokenFn.mockRejectedValueOnce(new Error('Valkey connection lost'))

    const response = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json<{ user: null }>()).toStrictEqual({ user: null })

    expect(logWarnFn).toHaveBeenCalledOnce()
  })
})
