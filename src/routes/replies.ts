import type { FastifyPluginCallback } from "fastify";

// ---------------------------------------------------------------------------
// Reply CRUD routes plugin (placeholder -- endpoints added in Task 3)
// ---------------------------------------------------------------------------

/**
 * Reply routes for the Barazo forum.
 *
 * - POST   /api/topics/:topicRkey/replies          -- Create a reply
 * - GET    /api/topics/:topicRkey/replies           -- List replies for a topic
 * - GET    /api/topics/:topicRkey/replies/:rkey     -- Get a single reply
 * - PUT    /api/topics/:topicRkey/replies/:rkey     -- Update a reply
 * - DELETE /api/topics/:topicRkey/replies/:rkey     -- Delete a reply
 */
export function replyRoutes(): FastifyPluginCallback {
  return (app, _opts, done) => {
    app.log.debug("Reply routes registered (placeholder)");
    done();
  };
}
