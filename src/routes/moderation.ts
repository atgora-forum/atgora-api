import { eq, and, desc, sql } from "drizzle-orm";
import type { FastifyPluginCallback } from "fastify";
import {
  notFound,
  forbidden,
  badRequest,
  conflict,
} from "../lib/api-errors.js";
import {
  lockTopicSchema,
  pinTopicSchema,
  modDeleteSchema,
  banUserSchema,
  moderationLogQuerySchema,
  createReportSchema,
  reportQuerySchema,
  resolveReportSchema,
  reportedUsersQuerySchema,
  moderationThresholdsSchema,
} from "../validation/moderation.js";
import { topics } from "../db/schema/topics.js";
import { replies } from "../db/schema/replies.js";
import { users } from "../db/schema/users.js";
import { moderationActions } from "../db/schema/moderation-actions.js";
import { reports } from "../db/schema/reports.js";
import { communitySettings } from "../db/schema/community-settings.js";
import { createRequireModerator } from "../auth/require-moderator.js";

// ---------------------------------------------------------------------------
// OpenAPI JSON Schema definitions
// ---------------------------------------------------------------------------

const errorJsonSchema = {
  type: "object" as const,
  properties: {
    error: { type: "string" as const },
  },
};

const moderationActionJsonSchema = {
  type: "object" as const,
  properties: {
    id: { type: "number" as const },
    action: { type: "string" as const },
    targetUri: { type: ["string", "null"] as const },
    targetDid: { type: ["string", "null"] as const },
    moderatorDid: { type: "string" as const },
    reason: { type: ["string", "null"] as const },
    createdAt: { type: "string" as const, format: "date-time" as const },
  },
};

const reportJsonSchema = {
  type: "object" as const,
  properties: {
    id: { type: "number" as const },
    reporterDid: { type: "string" as const },
    targetUri: { type: "string" as const },
    targetDid: { type: "string" as const },
    reasonType: { type: "string" as const },
    description: { type: ["string", "null"] as const },
    status: { type: "string" as const },
    resolutionType: { type: ["string", "null"] as const },
    resolvedBy: { type: ["string", "null"] as const },
    resolvedAt: { type: ["string", "null"] as const },
    createdAt: { type: "string" as const, format: "date-time" as const },
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function serializeAction(row: typeof moderationActions.$inferSelect) {
  return {
    id: row.id,
    action: row.action,
    targetUri: row.targetUri,
    targetDid: row.targetDid,
    moderatorDid: row.moderatorDid,
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
  };
}

function serializeReport(row: typeof reports.$inferSelect) {
  return {
    id: row.id,
    reporterDid: row.reporterDid,
    targetUri: row.targetUri,
    targetDid: row.targetDid,
    reasonType: row.reasonType,
    description: row.description,
    status: row.status,
    resolutionType: row.resolutionType,
    resolvedBy: row.resolvedBy,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function encodeCursor(createdAt: string, id: number): string {
  return Buffer.from(JSON.stringify({ createdAt, id })).toString("base64");
}

function decodeCursor(cursor: string): { createdAt: string; id: number } | null {
  try {
    const decoded = JSON.parse(
      Buffer.from(cursor, "base64").toString("utf-8"),
    ) as Record<string, unknown>;
    if (typeof decoded.createdAt === "string" && typeof decoded.id === "number") {
      return { createdAt: decoded.createdAt, id: decoded.id };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Extract DID from an AT URI.
 * Format: at://did:plc:xxx/collection/rkey -> did:plc:xxx
 */
function extractDidFromUri(uri: string): string | undefined {
  const match = /^at:\/\/(did:[^/]+)\//.exec(uri);
  return match?.[1];
}

// ---------------------------------------------------------------------------
// Moderation routes plugin
// ---------------------------------------------------------------------------

export function moderationRoutes(): FastifyPluginCallback {
  return (app, _opts, done) => {
    const { db, env, authMiddleware } = app;
    const requireModerator = createRequireModerator(db, authMiddleware, app.log);
    const requireAdmin = app.requireAdmin;
    const communityDid = env.COMMUNITY_DID ?? "did:plc:placeholder";

    // -------------------------------------------------------------------
    // POST /api/moderation/lock/:id (moderator+)
    // -------------------------------------------------------------------

    app.post("/api/moderation/lock/:id", {
      preHandler: [requireModerator],
      schema: {
        tags: ["Moderation"],
        summary: "Lock or unlock a topic",
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string" } },
        },
        body: {
          type: "object",
          properties: {
            reason: { type: "string", maxLength: 500 },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              uri: { type: "string" },
              isLocked: { type: "boolean" },
            },
          },
          401: errorJsonSchema,
          403: errorJsonSchema,
          404: errorJsonSchema,
        },
      },
    }, async (request, reply) => {
      const user = request.user;
      if (!user) {
        return reply.status(401).send({ error: "Authentication required" });
      }

      const { id } = request.params as { id: string };
      const decodedUri = decodeURIComponent(id);
      const parsed = lockTopicSchema.safeParse(request.body);

      const topicRows = await db
        .select()
        .from(topics)
        .where(and(eq(topics.uri, decodedUri), eq(topics.communityDid, communityDid)));

      const topic = topicRows[0];
      if (!topic) {
        throw notFound("Topic not found");
      }

      const newLocked = !topic.isLocked;
      const action = newLocked ? "lock" : "unlock";

      await db.transaction(async (tx) => {
        await tx
          .update(topics)
          .set({ isLocked: newLocked })
          .where(eq(topics.uri, decodedUri));

        await tx.insert(moderationActions).values({
          action,
          targetUri: decodedUri,
          moderatorDid: user.did,
          communityDid,
          reason: parsed.success ? parsed.data.reason : undefined,
        });
      });

      app.log.info(
        { action, topicUri: decodedUri, moderatorDid: user.did },
        `Topic ${action}ed`,
      );

      return reply.status(200).send({
        uri: decodedUri,
        isLocked: newLocked,
      });
    });

    // -------------------------------------------------------------------
    // POST /api/moderation/pin/:id (moderator+)
    // -------------------------------------------------------------------

    app.post("/api/moderation/pin/:id", {
      preHandler: [requireModerator],
      schema: {
        tags: ["Moderation"],
        summary: "Pin or unpin a topic",
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string" } },
        },
        body: {
          type: "object",
          properties: {
            reason: { type: "string", maxLength: 500 },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              uri: { type: "string" },
              isPinned: { type: "boolean" },
            },
          },
          401: errorJsonSchema,
          403: errorJsonSchema,
          404: errorJsonSchema,
        },
      },
    }, async (request, reply) => {
      const user = request.user;
      if (!user) {
        return reply.status(401).send({ error: "Authentication required" });
      }

      const { id } = request.params as { id: string };
      const decodedUri = decodeURIComponent(id);
      const parsed = pinTopicSchema.safeParse(request.body);

      const topicRows = await db
        .select()
        .from(topics)
        .where(and(eq(topics.uri, decodedUri), eq(topics.communityDid, communityDid)));

      const topic = topicRows[0];
      if (!topic) {
        throw notFound("Topic not found");
      }

      const newPinned = !topic.isPinned;
      const action = newPinned ? "pin" : "unpin";

      await db.transaction(async (tx) => {
        await tx
          .update(topics)
          .set({ isPinned: newPinned })
          .where(eq(topics.uri, decodedUri));

        await tx.insert(moderationActions).values({
          action,
          targetUri: decodedUri,
          moderatorDid: user.did,
          communityDid,
          reason: parsed.success ? parsed.data.reason : undefined,
        });
      });

      app.log.info(
        { action, topicUri: decodedUri, moderatorDid: user.did },
        `Topic ${action}ned`,
      );

      return reply.status(200).send({
        uri: decodedUri,
        isPinned: newPinned,
      });
    });

    // -------------------------------------------------------------------
    // POST /api/moderation/delete/:id (moderator+)
    // -------------------------------------------------------------------

    app.post("/api/moderation/delete/:id", {
      preHandler: [requireModerator],
      schema: {
        tags: ["Moderation"],
        summary: "Mod-delete content (marks as deleted in index, does NOT delete from PDS)",
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string" } },
        },
        body: {
          type: "object",
          required: ["reason"],
          properties: {
            reason: { type: "string", minLength: 1, maxLength: 500 },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              uri: { type: "string" },
              isModDeleted: { type: "boolean" },
            },
          },
          400: errorJsonSchema,
          401: errorJsonSchema,
          403: errorJsonSchema,
          404: errorJsonSchema,
          409: errorJsonSchema,
        },
      },
    }, async (request, reply) => {
      const user = request.user;
      if (!user) {
        return reply.status(401).send({ error: "Authentication required" });
      }

      const { id } = request.params as { id: string };
      const decodedUri = decodeURIComponent(id);
      const parsed = modDeleteSchema.safeParse(request.body);
      if (!parsed.success) {
        throw badRequest("Reason is required for mod-delete");
      }

      // Check if this is a topic or reply
      const topicRows = await db
        .select()
        .from(topics)
        .where(and(eq(topics.uri, decodedUri), eq(topics.communityDid, communityDid)));

      const topic = topicRows[0];

      if (topic) {
        if (topic.isModDeleted) {
          throw conflict("Content already mod-deleted");
        }

        await db.transaction(async (tx) => {
          await tx
            .update(topics)
            .set({ isModDeleted: true })
            .where(eq(topics.uri, decodedUri));

          await tx.insert(moderationActions).values({
            action: "delete",
            targetUri: decodedUri,
            targetDid: topic.authorDid,
            moderatorDid: user.did,
            communityDid,
            reason: parsed.data.reason,
          });
        });

        app.log.info(
          { action: "delete", topicUri: decodedUri, moderatorDid: user.did },
          "Topic mod-deleted",
        );

        return reply.status(200).send({
          uri: decodedUri,
          isModDeleted: true,
        });
      }

      // Not a topic -- check replies
      const replyRows = await db
        .select()
        .from(replies)
        .where(and(eq(replies.uri, decodedUri), eq(replies.communityDid, communityDid)));

      const replyRow = replyRows[0];
      if (!replyRow) {
        throw notFound("Content not found");
      }

      // For replies, we delete from the index entirely (no isModDeleted column on replies)
      await db.transaction(async (tx) => {
        await tx
          .delete(replies)
          .where(eq(replies.uri, decodedUri));

        // Decrement reply count on parent topic
        await tx
          .update(topics)
          .set({ replyCount: sql`GREATEST(${topics.replyCount} - 1, 0)` })
          .where(eq(topics.uri, replyRow.rootUri));

        await tx.insert(moderationActions).values({
          action: "delete",
          targetUri: decodedUri,
          targetDid: replyRow.authorDid,
          moderatorDid: user.did,
          communityDid,
          reason: parsed.data.reason,
        });
      });

      app.log.info(
        { action: "delete", replyUri: decodedUri, moderatorDid: user.did },
        "Reply mod-deleted",
      );

      return reply.status(200).send({
        uri: decodedUri,
        isModDeleted: true,
      });
    });

    // -------------------------------------------------------------------
    // POST /api/moderation/ban (admin only)
    // -------------------------------------------------------------------

    app.post("/api/moderation/ban", {
      preHandler: [requireAdmin],
      schema: {
        tags: ["Moderation"],
        summary: "Ban or unban a user by DID",
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          required: ["did", "reason"],
          properties: {
            did: { type: "string", minLength: 1 },
            reason: { type: "string", minLength: 1, maxLength: 500 },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              did: { type: "string" },
              isBanned: { type: "boolean" },
            },
          },
          400: errorJsonSchema,
          401: errorJsonSchema,
          403: errorJsonSchema,
          404: errorJsonSchema,
        },
      },
    }, async (request, reply) => {
      const admin = request.user;
      if (!admin) {
        return reply.status(401).send({ error: "Authentication required" });
      }

      const parsed = banUserSchema.safeParse(request.body);
      if (!parsed.success) {
        throw badRequest("DID and reason are required");
      }

      const { did: targetDid, reason } = parsed.data;

      // Prevent self-ban
      if (targetDid === admin.did) {
        throw badRequest("Cannot ban yourself");
      }

      // Check user exists
      const userRows = await db
        .select()
        .from(users)
        .where(eq(users.did, targetDid));

      const targetUser = userRows[0];
      if (!targetUser) {
        throw notFound("User not found");
      }

      // Prevent banning other admins
      if (targetUser.role === "admin") {
        throw forbidden("Cannot ban an admin");
      }

      const newBanned = !targetUser.isBanned;
      const action = newBanned ? "ban" : "unban";

      await db.transaction(async (tx) => {
        await tx
          .update(users)
          .set({ isBanned: newBanned })
          .where(eq(users.did, targetDid));

        await tx.insert(moderationActions).values({
          action,
          targetDid,
          moderatorDid: admin.did,
          communityDid,
          reason,
        });
      });

      app.log.info(
        { action, targetDid, adminDid: admin.did },
        `User ${action}ned`,
      );

      return reply.status(200).send({
        did: targetDid,
        isBanned: newBanned,
      });
    });

    // -------------------------------------------------------------------
    // GET /api/moderation/log (moderator+)
    // -------------------------------------------------------------------

    app.get("/api/moderation/log", {
      preHandler: [requireModerator],
      schema: {
        tags: ["Moderation"],
        summary: "Get moderation action log (paginated)",
        security: [{ bearerAuth: [] }],
        querystring: {
          type: "object",
          properties: {
            cursor: { type: "string" },
            limit: { type: "string" },
            action: {
              type: "string",
              enum: ["lock", "unlock", "pin", "unpin", "delete", "ban", "unban"],
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              actions: { type: "array", items: moderationActionJsonSchema },
              cursor: { type: ["string", "null"] },
            },
          },
          400: errorJsonSchema,
        },
      },
    }, async (request, reply) => {
      const parsed = moderationLogQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw badRequest("Invalid query parameters");
      }

      const { cursor, limit, action } = parsed.data;
      const conditions = [eq(moderationActions.communityDid, communityDid)];

      if (action) {
        conditions.push(eq(moderationActions.action, action));
      }

      if (cursor) {
        const decoded = decodeCursor(cursor);
        if (decoded) {
          conditions.push(
            sql`(${moderationActions.createdAt}, ${moderationActions.id}) < (${decoded.createdAt}::timestamptz, ${decoded.id})`,
          );
        }
      }

      const whereClause = and(...conditions);
      const fetchLimit = limit + 1;

      const rows = await db
        .select()
        .from(moderationActions)
        .where(whereClause)
        .orderBy(desc(moderationActions.createdAt))
        .limit(fetchLimit);

      const hasMore = rows.length > limit;
      const resultRows = hasMore ? rows.slice(0, limit) : rows;

      let nextCursor: string | null = null;
      if (hasMore) {
        const lastRow = resultRows[resultRows.length - 1];
        if (lastRow) {
          nextCursor = encodeCursor(lastRow.createdAt.toISOString(), lastRow.id);
        }
      }

      return reply.status(200).send({
        actions: resultRows.map(serializeAction),
        cursor: nextCursor,
      });
    });

    // -------------------------------------------------------------------
    // POST /api/moderation/report (authenticated user)
    // -------------------------------------------------------------------

    app.post("/api/moderation/report", {
      preHandler: [authMiddleware.requireAuth],
      schema: {
        tags: ["Moderation"],
        summary: "Report content for moderator review",
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          required: ["targetUri", "reasonType"],
          properties: {
            targetUri: { type: "string", minLength: 1 },
            reasonType: {
              type: "string",
              enum: ["spam", "sexual", "harassment", "violation", "misleading", "other"],
            },
            description: { type: "string", maxLength: 1000 },
          },
        },
        response: {
          201: reportJsonSchema,
          400: errorJsonSchema,
          401: errorJsonSchema,
          404: errorJsonSchema,
          409: errorJsonSchema,
        },
      },
    }, async (request, reply) => {
      const user = request.user;
      if (!user) {
        return reply.status(401).send({ error: "Authentication required" });
      }

      const parsed = createReportSchema.safeParse(request.body);
      if (!parsed.success) {
        throw badRequest("Invalid report data");
      }

      const { targetUri, reasonType, description } = parsed.data;

      // Extract target DID from URI
      const targetDid = extractDidFromUri(targetUri);
      if (!targetDid) {
        throw badRequest("Invalid target URI format");
      }

      // Cannot report own content
      if (targetDid === user.did) {
        throw badRequest("Cannot report your own content");
      }

      // Verify target content exists (topic or reply)
      const topicRows = await db
        .select({ uri: topics.uri })
        .from(topics)
        .where(and(eq(topics.uri, targetUri), eq(topics.communityDid, communityDid)));

      let contentExists = topicRows.length > 0;

      if (!contentExists) {
        const replyRows = await db
          .select({ uri: replies.uri })
          .from(replies)
          .where(and(eq(replies.uri, targetUri), eq(replies.communityDid, communityDid)));
        contentExists = replyRows.length > 0;
      }

      if (!contentExists) {
        throw notFound("Content not found");
      }

      // Check for duplicate report
      const existingReports = await db
        .select({ id: reports.id })
        .from(reports)
        .where(
          and(
            eq(reports.reporterDid, user.did),
            eq(reports.targetUri, targetUri),
            eq(reports.communityDid, communityDid),
          ),
        );

      if (existingReports.length > 0) {
        throw conflict("You have already reported this content");
      }

      const inserted = await db
        .insert(reports)
        .values({
          reporterDid: user.did,
          targetUri,
          targetDid,
          reasonType,
          description,
          communityDid,
        })
        .returning();

      const report = inserted[0];
      if (!report) {
        throw badRequest("Failed to create report");
      }

      app.log.info(
        { reportId: report.id, reporterDid: user.did, targetUri, reasonType },
        "Content reported",
      );

      return reply.status(201).send(serializeReport(report));
    });

    // -------------------------------------------------------------------
    // GET /api/moderation/reports (moderator+)
    // -------------------------------------------------------------------

    app.get("/api/moderation/reports", {
      preHandler: [requireModerator],
      schema: {
        tags: ["Moderation"],
        summary: "List content reports (paginated)",
        security: [{ bearerAuth: [] }],
        querystring: {
          type: "object",
          properties: {
            status: { type: "string", enum: ["pending", "resolved"] },
            cursor: { type: "string" },
            limit: { type: "string" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              reports: { type: "array", items: reportJsonSchema },
              cursor: { type: ["string", "null"] },
            },
          },
          400: errorJsonSchema,
        },
      },
    }, async (request, reply) => {
      const parsed = reportQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw badRequest("Invalid query parameters");
      }

      const { status, cursor, limit } = parsed.data;
      const conditions = [eq(reports.communityDid, communityDid)];

      if (status) {
        conditions.push(eq(reports.status, status));
      }

      if (cursor) {
        const decoded = decodeCursor(cursor);
        if (decoded) {
          conditions.push(
            sql`(${reports.createdAt}, ${reports.id}) < (${decoded.createdAt}::timestamptz, ${decoded.id})`,
          );
        }
      }

      const whereClause = and(...conditions);
      const fetchLimit = limit + 1;

      const rows = await db
        .select()
        .from(reports)
        .where(whereClause)
        .orderBy(desc(reports.createdAt))
        .limit(fetchLimit);

      const hasMore = rows.length > limit;
      const resultRows = hasMore ? rows.slice(0, limit) : rows;

      let nextCursor: string | null = null;
      if (hasMore) {
        const lastRow = resultRows[resultRows.length - 1];
        if (lastRow) {
          nextCursor = encodeCursor(lastRow.createdAt.toISOString(), lastRow.id);
        }
      }

      return reply.status(200).send({
        reports: resultRows.map(serializeReport),
        cursor: nextCursor,
      });
    });

    // -------------------------------------------------------------------
    // PUT /api/moderation/reports/:id (moderator+)
    // -------------------------------------------------------------------

    app.put("/api/moderation/reports/:id", {
      preHandler: [requireModerator],
      schema: {
        tags: ["Moderation"],
        summary: "Resolve a content report",
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string" } },
        },
        body: {
          type: "object",
          required: ["resolutionType"],
          properties: {
            resolutionType: {
              type: "string",
              enum: ["dismissed", "warned", "labeled", "removed", "banned"],
            },
          },
        },
        response: {
          200: reportJsonSchema,
          400: errorJsonSchema,
          401: errorJsonSchema,
          404: errorJsonSchema,
          409: errorJsonSchema,
        },
      },
    }, async (request, reply) => {
      const user = request.user;
      if (!user) {
        return reply.status(401).send({ error: "Authentication required" });
      }

      const { id } = request.params as { id: string };
      const reportId = Number(id);
      if (Number.isNaN(reportId)) {
        throw badRequest("Invalid report ID");
      }

      const parsed = resolveReportSchema.safeParse(request.body);
      if (!parsed.success) {
        throw badRequest("Invalid resolution data");
      }

      const existing = await db
        .select()
        .from(reports)
        .where(
          and(
            eq(reports.id, reportId),
            eq(reports.communityDid, communityDid),
          ),
        );

      const report = existing[0];
      if (!report) {
        throw notFound("Report not found");
      }

      if (report.status === "resolved") {
        throw conflict("Report already resolved");
      }

      const updated = await db
        .update(reports)
        .set({
          status: "resolved",
          resolutionType: parsed.data.resolutionType,
          resolvedBy: user.did,
          resolvedAt: new Date(),
        })
        .where(eq(reports.id, reportId))
        .returning();

      const resolvedReport = updated[0];
      if (!resolvedReport) {
        throw notFound("Report not found after update");
      }

      app.log.info(
        {
          reportId,
          resolutionType: parsed.data.resolutionType,
          resolvedBy: user.did,
        },
        "Report resolved",
      );

      return reply.status(200).send(serializeReport(resolvedReport));
    });

    // -------------------------------------------------------------------
    // GET /api/admin/reports/users (admin only)
    // -------------------------------------------------------------------

    app.get("/api/admin/reports/users", {
      preHandler: [requireAdmin],
      schema: {
        tags: ["Admin"],
        summary: "Most-reported users in this community",
        security: [{ bearerAuth: [] }],
        querystring: {
          type: "object",
          properties: {
            limit: { type: "string" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              users: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    did: { type: "string" },
                    reportCount: { type: "number" },
                  },
                },
              },
            },
          },
        },
      },
    }, async (request, reply) => {
      const parsed = reportedUsersQuerySchema.safeParse(request.query);
      const limit = parsed.success ? parsed.data.limit : 25;

      const rows = await db
        .select({
          did: reports.targetDid,
          reportCount: sql<number>`count(*)::int`,
        })
        .from(reports)
        .where(eq(reports.communityDid, communityDid))
        .groupBy(reports.targetDid)
        .orderBy(sql`count(*) DESC`)
        .limit(limit);

      return reply.status(200).send({
        users: rows.map((r) => ({ did: r.did, reportCount: r.reportCount })),
      });
    });

    // -------------------------------------------------------------------
    // GET /api/admin/moderation/thresholds (admin only)
    // -------------------------------------------------------------------

    app.get("/api/admin/moderation/thresholds", {
      preHandler: [requireAdmin],
      schema: {
        tags: ["Admin"],
        summary: "Get moderation thresholds for this community",
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: "object",
            properties: {
              autoBlockReportCount: { type: "number" },
              warnThreshold: { type: "number" },
            },
          },
        },
      },
    }, async (_request, reply) => {
      const settingsRows = await db
        .select({ moderationThresholds: communitySettings.moderationThresholds })
        .from(communitySettings)
        .where(eq(communitySettings.id, "default"));

      const settings = settingsRows[0];
      const thresholds = settings?.moderationThresholds ?? {
        autoBlockReportCount: 5,
        warnThreshold: 3,
      };

      return reply.status(200).send({
        autoBlockReportCount: thresholds.autoBlockReportCount,
        warnThreshold: thresholds.warnThreshold,
      });
    });

    // -------------------------------------------------------------------
    // PUT /api/admin/moderation/thresholds (admin only)
    // -------------------------------------------------------------------

    app.put("/api/admin/moderation/thresholds", {
      preHandler: [requireAdmin],
      schema: {
        tags: ["Admin"],
        summary: "Update moderation thresholds",
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          properties: {
            autoBlockReportCount: { type: "number", minimum: 1, maximum: 100 },
            warnThreshold: { type: "number", minimum: 1, maximum: 50 },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              autoBlockReportCount: { type: "number" },
              warnThreshold: { type: "number" },
            },
          },
          400: errorJsonSchema,
        },
      },
    }, async (request, reply) => {
      const parsed = moderationThresholdsSchema.safeParse(request.body);
      if (!parsed.success) {
        throw badRequest("Invalid threshold values");
      }

      // Update community settings with moderation thresholds
      // Store as JSON in the community settings since we may not have dedicated columns
      await db
        .update(communitySettings)
        .set({
          moderationThresholds: {
            autoBlockReportCount: parsed.data.autoBlockReportCount,
            warnThreshold: parsed.data.warnThreshold,
          },
        })
        .where(eq(communitySettings.id, "default"));

      return reply.status(200).send({
        autoBlockReportCount: parsed.data.autoBlockReportCount,
        warnThreshold: parsed.data.warnThreshold,
      });
    });

    done();
  };
}
