import { sql } from 'drizzle-orm'
import pino from 'pino'
import { createDb } from '../src/db/index.js'
import type { Database } from '../src/db/index.js'
import type { Logger } from '../src/lib/logger.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BackfillDeps {
  db: Database
  logger: Logger
}

export interface BackfillResult {
  updated: number
}

// ---------------------------------------------------------------------------
// Core logic (testable)
// ---------------------------------------------------------------------------

/**
 * Backfill reply depth using a recursive CTE.
 *
 * Direct replies to a topic (parent_uri = root_uri) get depth 1.
 * Nested replies get parent_depth + 1.
 *
 * Idempotent: safe to run multiple times. Overwrites existing depth values
 * with correct computed values.
 */
export async function backfillReplyDepth(deps: BackfillDeps): Promise<BackfillResult> {
  const { db, logger } = deps

  logger.info('Starting reply depth backfill')

  const result = await db.execute(sql`
    WITH RECURSIVE reply_tree AS (
      -- Base case: direct replies to topic (depth 1)
      SELECT uri, parent_uri, root_uri, 1 AS computed_depth
      FROM replies
      WHERE parent_uri = root_uri

      UNION ALL

      -- Recursive case: nested replies
      SELECT r.uri, r.parent_uri, r.root_uri, rt.computed_depth + 1
      FROM replies r
      INNER JOIN reply_tree rt ON r.parent_uri = rt.uri
      WHERE r.parent_uri != r.root_uri
    )
    UPDATE replies
    SET depth = reply_tree.computed_depth
    FROM reply_tree
    WHERE replies.uri = reply_tree.uri
      AND replies.depth != reply_tree.computed_depth
  `)

  const updated = Number(result.rowCount ?? 0)

  logger.info({ updated }, 'Reply depth backfill complete')

  return { updated }
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const logger = pino({ level: 'info' })

  const databaseUrl = process.env['DATABASE_URL']
  if (!databaseUrl) {
    logger.fatal('DATABASE_URL environment variable is required')
    process.exit(1)
  }

  const { db, client } = createDb(databaseUrl)

  try {
    const result = await backfillReplyDepth({ db, logger })
    logger.info({ updated: result.updated }, 'Backfill complete')
  } finally {
    await client.end()
  }

  process.exit(0)
}

// Only run main when executed directly via tsx (not imported by Vitest)
const isDirectExecution =
  process.argv[1]?.endsWith('backfill-reply-depth.ts') === true &&
  typeof process.env['VITEST'] === 'undefined'
if (isDirectExecution) {
  main().catch((err: unknown) => {
    // eslint-disable-next-line no-console -- CLI fallback for fatal errors before logger setup
    console.error('Backfill failed:', err)
    process.exit(1)
  })
}
