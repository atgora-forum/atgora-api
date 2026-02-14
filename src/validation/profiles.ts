import { z } from "zod/v4";

// ---------------------------------------------------------------------------
// Body schemas
// ---------------------------------------------------------------------------

/** Schema for PUT /api/users/me/preferences body. */
export const userPreferencesSchema = z.object({
  maturityLevel: z
    .enum(["sfw", "mature"])
    .optional(),
  mutedWords: z
    .array(z.string().min(1).max(200))
    .max(500)
    .optional(),
  blockedDids: z
    .array(z.string().min(1))
    .max(1000)
    .optional(),
  mutedDids: z
    .array(z.string().min(1))
    .max(1000)
    .optional(),
  crossPostBluesky: z
    .boolean()
    .optional(),
  crossPostFrontpage: z
    .boolean()
    .optional(),
});

export type UserPreferencesInput = z.infer<typeof userPreferencesSchema>;

/** Schema for PUT /api/users/me/communities/:communityId/preferences body. */
export const communityPreferencesSchema = z.object({
  maturityOverride: z
    .enum(["sfw", "mature"])
    .nullable()
    .optional(),
  mutedWords: z
    .array(z.string().min(1).max(200))
    .max(500)
    .nullable()
    .optional(),
  blockedDids: z
    .array(z.string().min(1))
    .max(1000)
    .nullable()
    .optional(),
  mutedDids: z
    .array(z.string().min(1))
    .max(1000)
    .nullable()
    .optional(),
  notificationPrefs: z
    .object({
      replies: z.boolean(),
      reactions: z.boolean(),
      mentions: z.boolean(),
      modActions: z.boolean(),
    })
    .nullable()
    .optional(),
});

export type CommunityPreferencesInput = z.infer<typeof communityPreferencesSchema>;

/** Schema for POST /api/users/me/age-declaration body. */
export const ageDeclarationSchema = z.object({
  confirm: z.literal(true),
});

export type AgeDeclarationInput = z.infer<typeof ageDeclarationSchema>;
