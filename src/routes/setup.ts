import { z } from "zod/v4";
import type { FastifyPluginCallback } from "fastify";

// ---------------------------------------------------------------------------
// Zod schemas for request validation
// ---------------------------------------------------------------------------

const initializeBodySchema = z.object({
  communityName: z.string().trim().min(1).optional(),
});

// ---------------------------------------------------------------------------
// Setup routes plugin
// ---------------------------------------------------------------------------

/**
 * Setup wizard routes for first-time community initialization.
 *
 * - GET  /api/setup/status     -- Check if community is initialized (public)
 * - POST /api/setup/initialize -- Initialize community with first admin (auth required)
 */
export function setupRoutes(): FastifyPluginCallback {
  return (app, _opts, done) => {
    const { setupService, authMiddleware } = app;

    // -------------------------------------------------------------------
    // GET /api/setup/status (public, no auth required)
    // -------------------------------------------------------------------

    app.get("/api/setup/status", async (_request, reply) => {
      try {
        const status = await setupService.getStatus();
        return await reply.status(200).send(status);
      } catch (err: unknown) {
        app.log.error({ err }, "Failed to get setup status");
        return await reply.status(502).send({
          error: "Service temporarily unavailable",
        });
      }
    });

    // -------------------------------------------------------------------
    // POST /api/setup/initialize (requires auth)
    // -------------------------------------------------------------------

    app.post(
      "/api/setup/initialize",
      { preHandler: [authMiddleware.requireAuth] },
      async (request, reply) => {
        // Validate request body
        const parsed = initializeBodySchema.safeParse(request.body);
        if (!parsed.success) {
          return await reply.status(400).send({ error: "Invalid request body" });
        }

        // request.user is guaranteed by requireAuth
        const user = request.user;
        if (!user) {
          return await reply.status(401).send({ error: "Authentication required" });
        }

        try {
          const result = await setupService.initialize(
            user.did,
            parsed.data.communityName,
          );

          if ("alreadyInitialized" in result) {
            return await reply.status(409).send({
              error: "Community already initialized",
            });
          }

          return await reply.status(200).send(result);
        } catch (err: unknown) {
          app.log.error({ err }, "Failed to initialize community");
          return await reply.status(502).send({
            error: "Service temporarily unavailable",
          });
        }
      },
    );

    done();
  };
}
