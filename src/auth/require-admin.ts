import type { FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import type { AuthMiddleware } from "./middleware.js";
import type { Database } from "../db/index.js";
import { users } from "../db/schema/users.js";

/**
 * Create a requireAdmin preHandler hook for Fastify routes.
 *
 * This middleware:
 * 1. Delegates to requireAuth to verify the user is authenticated
 * 2. Looks up the user in the database by DID
 * 3. Checks if the user has the "admin" role
 * 4. Returns 403 if the user is not an admin
 *
 * @param db - Database instance for user lookups
 * @param authMiddleware - Auth middleware with requireAuth hook
 * @returns A Fastify preHandler function
 */
export function createRequireAdmin(
  db: Database,
  authMiddleware: AuthMiddleware,
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    // First, run requireAuth to verify authentication
    await authMiddleware.requireAuth(request, reply);

    // If requireAuth sent a response (e.g. 401), stop here
    if (reply.sent) {
      return;
    }

    // At this point request.user should be set by requireAuth
    if (!request.user) {
      await reply.status(403).send({ error: "Admin access required" });
      return;
    }

    // Look up user role in database
    const rows = await db
      .select()
      .from(users)
      .where(eq(users.did, request.user.did));

    const userRow = rows[0];
    if (!userRow || userRow.role !== "admin") {
      await reply.status(403).send({ error: "Admin access required" });
      return;
    }
  };
}
