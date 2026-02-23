/**
 * Type declarations for @barazo/multi-tenant (private npm package).
 * This package is only required when COMMUNITY_MODE=multi.
 */
declare module '@barazo/multi-tenant' {
  import type { CommunityResolver } from '../middleware/community-resolver.js'
  import type { Database } from '../db/index.js'
  import type { Cache } from '../cache/index.js'

  export function createMultiResolver(db: Database, cache: Cache): CommunityResolver
}
