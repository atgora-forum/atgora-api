ALTER TABLE "community_settings" ADD COLUMN "header_logo_url" text;
ALTER TABLE "community_settings" ADD COLUMN "show_community_name" boolean NOT NULL DEFAULT true;
