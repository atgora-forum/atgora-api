ALTER TABLE "topics" ADD COLUMN "is_author_deleted" boolean DEFAULT false NOT NULL;
ALTER TABLE "replies" ADD COLUMN "is_author_deleted" boolean DEFAULT false NOT NULL;
