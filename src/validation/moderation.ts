import { z } from "zod";

// ---------------------------------------------------------------------------
// Moderation action schemas
// ---------------------------------------------------------------------------

export const lockTopicSchema = z.object({
  reason: z.string().max(500).optional(),
});

export const pinTopicSchema = z.object({
  reason: z.string().max(500).optional(),
});

export const modDeleteSchema = z.object({
  reason: z.string().min(1).max(500),
});

export const banUserSchema = z.object({
  did: z.string().min(1),
  reason: z.string().min(1).max(500),
});

export const unbanUserSchema = z.object({
  did: z.string().min(1),
  reason: z.string().max(500).optional(),
});

export const moderationLogQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  action: z
    .enum(["lock", "unlock", "pin", "unpin", "delete", "ban", "unban"])
    .optional(),
});

// ---------------------------------------------------------------------------
// Report schemas
// ---------------------------------------------------------------------------

export const createReportSchema = z.object({
  targetUri: z.string().min(1),
  reasonType: z.enum([
    "spam",
    "sexual",
    "harassment",
    "violation",
    "misleading",
    "other",
  ]),
  description: z.string().max(1000).optional(),
});

export const reportQuerySchema = z.object({
  status: z.enum(["pending", "resolved"]).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const resolveReportSchema = z.object({
  resolutionType: z.enum([
    "dismissed",
    "warned",
    "labeled",
    "removed",
    "banned",
  ]),
});

// ---------------------------------------------------------------------------
// Admin moderation schemas
// ---------------------------------------------------------------------------

export const moderationThresholdsSchema = z.object({
  autoBlockReportCount: z.number().int().min(1).max(100).default(5),
  warnThreshold: z.number().int().min(1).max(50).default(3),
});

export const reportedUsersQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
