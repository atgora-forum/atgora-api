import { describe, it, expect, afterEach } from 'vitest'
import Fastify from 'fastify'
import type { FastifyInstance } from 'fastify'
import {
  createSingleResolver,
  registerCommunityResolver,
} from '../../../src/middleware/community-resolver.js'
import type { CommunityResolver } from '../../../src/middleware/community-resolver.js'

describe('CommunityResolver', () => {
  describe('createSingleResolver', () => {
    it('returns the configured DID for any hostname', async () => {
      const resolver = createSingleResolver('did:plc:test123')
      expect(await resolver.resolve('anything.example.com')).toBe('did:plc:test123')
    })

    it('returns the same DID regardless of hostname', async () => {
      const resolver = createSingleResolver('did:plc:mycommunity')
      expect(await resolver.resolve('foo.bar.com')).toBe('did:plc:mycommunity')
      expect(await resolver.resolve('localhost')).toBe('did:plc:mycommunity')
      expect(await resolver.resolve('')).toBe('did:plc:mycommunity')
    })
  })

  describe('Fastify integration', () => {
    let app: FastifyInstance

    afterEach(async () => {
      await app.close()
    })

    it('sets request.communityDid in single mode', async () => {
      const resolver = createSingleResolver('did:plc:singlecommunity')

      app = Fastify({ logger: false })
      registerCommunityResolver(app, resolver, 'single')

      app.get('/test', (request) => {
        return { communityDid: request.communityDid }
      })
      await app.ready()

      const response = await app.inject({ method: 'GET', url: '/test' })
      expect(response.statusCode).toBe(200)
      expect(response.json<{ communityDid: string }>().communityDid).toBe('did:plc:singlecommunity')
    })

    it('returns 404 in single mode when resolver returns undefined', async () => {
      // Construct a resolver that returns undefined (shouldn't happen in single mode, but safety net)
      const resolver: CommunityResolver = { resolve: () => Promise.resolve(undefined) }

      app = Fastify({ logger: false })
      registerCommunityResolver(app, resolver, 'single')

      app.get('/test', (request) => {
        return { communityDid: request.communityDid }
      })
      await app.ready()

      const response = await app.inject({ method: 'GET', url: '/test' })
      expect(response.statusCode).toBe(404)
      expect(response.json<{ error: string }>().error).toBe('Community not found')
    })

    it('allows undefined communityDid in multi mode (aggregator)', async () => {
      const resolver: CommunityResolver = { resolve: () => Promise.resolve(undefined) }

      app = Fastify({ logger: false })
      registerCommunityResolver(app, resolver, 'multi')

      app.get('/test', (request) => {
        return { communityDid: request.communityDid ?? null }
      })
      await app.ready()

      const response = await app.inject({ method: 'GET', url: '/test' })
      expect(response.statusCode).toBe(200)
      expect(response.json<{ communityDid: null }>().communityDid).toBeNull()
    })
  })
})
