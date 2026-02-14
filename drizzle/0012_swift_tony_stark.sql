CREATE TABLE "user_community_preferences" (
	"did" text NOT NULL,
	"community_did" text NOT NULL,
	"maturity_override" text,
	"muted_words" jsonb,
	"blocked_dids" jsonb,
	"muted_dids" jsonb,
	"notification_prefs" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_community_preferences_did_community_did_pk" PRIMARY KEY("did","community_did")
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"did" text PRIMARY KEY NOT NULL,
	"maturity_level" text DEFAULT 'sfw' NOT NULL,
	"age_declaration_at" timestamp with time zone,
	"muted_words" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"blocked_dids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"muted_dids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cross_post_bluesky" boolean DEFAULT false NOT NULL,
	"cross_post_frontpage" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "user_community_prefs_did_idx" ON "user_community_preferences" USING btree ("did");--> statement-breakpoint
CREATE INDEX "user_community_prefs_community_idx" ON "user_community_preferences" USING btree ("community_did");