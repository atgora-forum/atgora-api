import type { FastifyPluginCallback } from "fastify";

// ---------------------------------------------------------------------------
// Topic CRUD routes plugin (placeholder -- endpoints added in Task 2)
// ---------------------------------------------------------------------------

/**
 * Topic routes for the Barazo forum.
 *
 * - POST   /api/topics          -- Create a new topic
 * - GET    /api/topics           -- List topics (paginated)
 * - GET    /api/topics/:rkey     -- Get a single topic
 * - PUT    /api/topics/:rkey     -- Update a topic
 * - DELETE /api/topics/:rkey     -- Delete a topic
 */
export function topicRoutes(): FastifyPluginCallback {
  return (app, _opts, done) => {
    app.log.debug("Topic routes registered (placeholder)");
    done();
  };
}
