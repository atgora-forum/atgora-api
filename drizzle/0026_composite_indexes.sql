CREATE INDEX IF NOT EXISTS "topics_community_category_activity_idx" ON "topics" ("community_did","category","last_activity_at");
CREATE INDEX IF NOT EXISTS "replies_root_uri_created_at_idx" ON "replies" ("root_uri","created_at");
CREATE INDEX IF NOT EXISTS "reactions_subject_uri_type_idx" ON "reactions" ("subject_uri","type");
