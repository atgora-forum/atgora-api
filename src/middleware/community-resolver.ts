import type { FastifyInstance, FastifyRequest } from 'fastify'
import { badRequest } from '../lib/api-errors.js'

declare module 'fastify' {
  interface FastifyRequest {
    communityDid: string | undefined
  }
}

export interface CommunityResolver {
  resolve(hostname: string): Promise<string | undefined>
}

/**
 * Extract communityDid from request, throwing 400 if not set.
 * Use in route handlers that require a community context (most write operations).
 */
export function requireCommunityDid(request: FastifyRequest): string {
  const { communityDid } = request
  if (!communityDid) {
    throw badRequest('Community context required')
  }
  return communityDid
}

export function createSingleResolver(communityDid: string): CommunityResolver {
  return { resolve: async () => communityDid }
}

export function registerCommunityResolver(
  app: FastifyInstance,
  resolver: CommunityResolver,
  mode: 'single' | 'multi'
): void {
  app.decorateRequest('communityDid', undefined as string | undefined)

  app.addHook('onRequest', async (request, reply) => {
    const communityDid = await resolver.resolve(request.hostname)
    if (!communityDid && mode === 'single') {
      return reply.status(404).send({ error: 'Community not found' })
    }
    request.communityDid = communityDid
  })
}
