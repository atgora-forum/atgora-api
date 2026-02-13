CREATE TABLE "topics" (
	"uri" text PRIMARY KEY NOT NULL,
	"rkey" text NOT NULL,
	"author_did" text NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"content_format" text,
	"category" text NOT NULL,
	"tags" jsonb,
	"community_did" text NOT NULL,
	"cid" text NOT NULL,
	"labels" jsonb,
	"reply_count" integer DEFAULT 0 NOT NULL,
	"reaction_count" integer DEFAULT 0 NOT NULL,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"indexed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"embedding" text
);
--> statement-breakpoint
CREATE TABLE "replies" (
	"uri" text PRIMARY KEY NOT NULL,
	"rkey" text NOT NULL,
	"author_did" text NOT NULL,
	"content" text NOT NULL,
	"content_format" text,
	"root_uri" text NOT NULL,
	"root_cid" text NOT NULL,
	"parent_uri" text NOT NULL,
	"parent_cid" text NOT NULL,
	"community_did" text NOT NULL,
	"cid" text NOT NULL,
	"labels" jsonb,
	"reaction_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"indexed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"embedding" text
);
--> statement-breakpoint
CREATE TABLE "reactions" (
	"uri" text PRIMARY KEY NOT NULL,
	"rkey" text NOT NULL,
	"author_did" text NOT NULL,
	"subject_uri" text NOT NULL,
	"subject_cid" text NOT NULL,
	"type" text NOT NULL,
	"community_did" text NOT NULL,
	"cid" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"indexed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reactions_author_subject_type_uniq" UNIQUE("author_did","subject_uri","type")
);
--> statement-breakpoint
CREATE TABLE "tracked_repos" (
	"did" text PRIMARY KEY NOT NULL,
	"tracked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "topics_author_did_idx" ON "topics" USING btree ("author_did");--> statement-breakpoint
CREATE INDEX "topics_category_idx" ON "topics" USING btree ("category");--> statement-breakpoint
CREATE INDEX "topics_created_at_idx" ON "topics" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "topics_community_did_idx" ON "topics" USING btree ("community_did");--> statement-breakpoint
CREATE INDEX "replies_author_did_idx" ON "replies" USING btree ("author_did");--> statement-breakpoint
CREATE INDEX "replies_root_uri_idx" ON "replies" USING btree ("root_uri");--> statement-breakpoint
CREATE INDEX "replies_parent_uri_idx" ON "replies" USING btree ("parent_uri");--> statement-breakpoint
CREATE INDEX "replies_created_at_idx" ON "replies" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "replies_community_did_idx" ON "replies" USING btree ("community_did");--> statement-breakpoint
CREATE INDEX "reactions_author_did_idx" ON "reactions" USING btree ("author_did");--> statement-breakpoint
CREATE INDEX "reactions_subject_uri_idx" ON "reactions" USING btree ("subject_uri");--> statement-breakpoint
CREATE INDEX "reactions_community_did_idx" ON "reactions" USING btree ("community_did");