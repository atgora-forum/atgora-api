import {
  pgTable,
  text,
  integer,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

export const replies = pgTable(
  "replies",
  {
    uri: text("uri").primaryKey(),
    rkey: text("rkey").notNull(),
    authorDid: text("author_did").notNull(),
    content: text("content").notNull(),
    contentFormat: text("content_format"),
    rootUri: text("root_uri").notNull(),
    rootCid: text("root_cid").notNull(),
    parentUri: text("parent_uri").notNull(),
    parentCid: text("parent_cid").notNull(),
    communityDid: text("community_did").notNull(),
    cid: text("cid").notNull(),
    labels: jsonb("labels").$type<{ values: { val: string }[] }>(),
    reactionCount: integer("reaction_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    indexedAt: timestamp("indexed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    embedding: text("embedding"),
  },
  (table) => [
    index("replies_author_did_idx").on(table.authorDid),
    index("replies_root_uri_idx").on(table.rootUri),
    index("replies_parent_uri_idx").on(table.parentUri),
    index("replies_created_at_idx").on(table.createdAt),
    index("replies_community_did_idx").on(table.communityDid),
  ],
);
