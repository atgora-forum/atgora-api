CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"recipient_did" text NOT NULL,
	"type" text NOT NULL,
	"subject_uri" text NOT NULL,
	"actor_did" text NOT NULL,
	"community_did" text NOT NULL,
	"read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "notifications_recipient_did_idx" ON "notifications" USING btree ("recipient_did");--> statement-breakpoint
CREATE INDEX "notifications_recipient_read_idx" ON "notifications" USING btree ("recipient_did","read");--> statement-breakpoint
CREATE INDEX "notifications_created_at_idx" ON "notifications" USING btree ("created_at");