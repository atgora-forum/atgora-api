import type { FastifyReply, FastifyRequest } from 'fastify'
import type { SessionService } from './session.js'
import type { DidDocumentVerifier, DidVerificationResult } from '../lib/did-document-verifier.js'
import type { Logger } from '../lib/logger.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** User info attached to authenticated requests. */
export interface RequestUser {
  did: string
  handle: string
  sid: string
}

/** Auth middleware hooks returned by createAuthMiddleware. */
export interface AuthMiddleware {
  requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  optionalAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
}

// ---------------------------------------------------------------------------
// Extend Fastify's request type
// ---------------------------------------------------------------------------

declare module 'fastify' {
  interface FastifyRequest {
    /** Authenticated user info (set by requireAuth or optionalAuth middleware). */
    user?: RequestUser
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract Bearer token from the Authorization header.
 * Returns the token string if valid, or undefined if missing/malformed.
 */
function extractBearerToken(request: FastifyRequest): string | undefined {
  const authHeader = request.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return undefined
  }

  const token = authHeader.slice('Bearer '.length)
  if (token.length === 0) {
    return undefined
  }

  return token
}

/** Check if a DID verification failure is a transient resolution error. */
function isResolutionFailure(result: DidVerificationResult): boolean {
  return !result.active && result.reason === 'DID document resolution failed'
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create auth middleware hooks for Fastify route preHandler.
 *
 * @param sessionService - Session service for token validation
 * @param didVerifier - DID document verifier for checking DID status
 * @param logger - Pino logger instance
 * @returns Object with requireAuth and optionalAuth hooks
 */
export function createAuthMiddleware(
  sessionService: SessionService,
  didVerifier: DidDocumentVerifier,
  logger: Logger
): AuthMiddleware {
  /**
   * Require authentication. Returns 401 if no valid token, 502 if service error.
   * On success, sets `request.user` with the authenticated user info.
   * Verifies the DID document is still active via the PLC directory (cached).
   */
  async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const token = extractBearerToken(request)
    if (token === undefined) {
      await reply.status(401).send({ error: 'Authentication required' })
      return
    }

    try {
      const session = await sessionService.validateAccessToken(token)
      if (!session) {
        await reply.status(401).send({ error: 'Invalid or expired token' })
        return
      }

      // Verify DID document is still active
      const didResult = await didVerifier.verify(session.did)
      if (!didResult.active) {
        if (isResolutionFailure(didResult)) {
          // Transient failure with no cached data -- fail closed
          logger.error({ did: session.did, reason: didResult.reason }, 'DID verification failed')
          await reply.status(502).send({ error: 'Service temporarily unavailable' })
        } else {
          // DID is definitively deactivated/tombstoned/not found
          logger.warn({ did: session.did, reason: didResult.reason }, 'DID is no longer active')
          await reply.status(401).send({ error: 'DID is no longer active' })
        }
        return
      }

      request.user = {
        did: session.did,
        handle: session.handle,
        sid: session.sid,
      }
    } catch (err: unknown) {
      logger.error({ err }, 'Token validation failed in requireAuth')
      await reply.status(502).send({ error: 'Service temporarily unavailable' })
    }
  }

  /**
   * Optional authentication. If a valid token is present, sets `request.user`.
   * If no token, invalid token, DID inactive, or service error: continues
   * with `request.user` undefined.
   */
  async function optionalAuth(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const token = extractBearerToken(request)
    if (token === undefined) {
      return
    }

    try {
      const session = await sessionService.validateAccessToken(token)
      if (!session) {
        return
      }

      // Verify DID document is still active
      const didResult = await didVerifier.verify(session.did)
      if (!didResult.active) {
        logger.warn(
          { did: session.did, reason: didResult.reason },
          'DID verification failed in optionalAuth, continuing unauthenticated'
        )
        return
      }

      request.user = {
        did: session.did,
        handle: session.handle,
        sid: session.sid,
      }
    } catch (err: unknown) {
      logger.warn({ err }, 'Token validation failed in optionalAuth, continuing unauthenticated')
    }
  }

  return { requireAuth, optionalAuth }
}
