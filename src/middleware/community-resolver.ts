import type { FastifyInstance } from 'fastify'

declare module 'fastify' {
  interface FastifyRequest {
    communityDid: string | undefined
  }
}

export interface CommunityResolver {
  resolve(hostname: string): Promise<string | undefined>
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
