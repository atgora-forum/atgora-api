CREATE TABLE "community_filters" (
	"community_did" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"admin_did" text,
	"reason" text,
	"report_count" integer DEFAULT 0 NOT NULL,
	"last_reviewed_at" timestamp with time zone,
	"filtered_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account_filters" (
	"id" serial PRIMARY KEY NOT NULL,
	"did" text NOT NULL,
	"community_did" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"reason" text,
	"report_count" integer DEFAULT 0 NOT NULL,
	"ban_count" integer DEFAULT 0 NOT NULL,
	"last_reviewed_at" timestamp with time zone,
	"filtered_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ozone_labels" (
	"id" serial PRIMARY KEY NOT NULL,
	"src" text NOT NULL,
	"uri" text NOT NULL,
	"val" text NOT NULL,
	"neg" boolean DEFAULT false NOT NULL,
	"cts" timestamp with time zone NOT NULL,
	"exp" timestamp with time zone,
	"indexed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "community_filters_status_idx" ON "community_filters" USING btree ("status");--> statement-breakpoint
CREATE INDEX "community_filters_admin_did_idx" ON "community_filters" USING btree ("admin_did");--> statement-breakpoint
CREATE INDEX "community_filters_updated_at_idx" ON "community_filters" USING btree ("updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "account_filters_did_community_idx" ON "account_filters" USING btree ("did","community_did");--> statement-breakpoint
CREATE INDEX "account_filters_did_idx" ON "account_filters" USING btree ("did");--> statement-breakpoint
CREATE INDEX "account_filters_community_did_idx" ON "account_filters" USING btree ("community_did");--> statement-breakpoint
CREATE INDEX "account_filters_status_idx" ON "account_filters" USING btree ("status");--> statement-breakpoint
CREATE INDEX "account_filters_updated_at_idx" ON "account_filters" USING btree ("updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ozone_labels_src_uri_val_idx" ON "ozone_labels" USING btree ("src","uri","val");--> statement-breakpoint
CREATE INDEX "ozone_labels_uri_idx" ON "ozone_labels" USING btree ("uri");--> statement-breakpoint
CREATE INDEX "ozone_labels_val_idx" ON "ozone_labels" USING btree ("val");--> statement-breakpoint
CREATE INDEX "ozone_labels_indexed_at_idx" ON "ozone_labels" USING btree ("indexed_at");