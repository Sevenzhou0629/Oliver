CREATE TABLE IF NOT EXISTS app_state (
 id integer PRIMARY KEY CHECK(id=1),
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
 version bigint NOT NULL DEFAULT 0
);
-- MVP serialized aggregate. Server enforces member scope. Split into normalized,
-- encrypted per-member tables with RLS before multi-household production launch.
