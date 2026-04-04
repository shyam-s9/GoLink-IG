CREATE TABLE IF NOT EXISTS "platform_config" (
  "id" SERIAL PRIMARY KEY,
  "key" VARCHAR NOT NULL UNIQUE,
  "value" VARCHAR NOT NULL,
  "updated_at" TIMESTAMP DEFAULT NOW()
);

INSERT INTO "platform_config" ("key", "value")
VALUES
  ('ai_tone', 'casual, warm, human'),
  ('ai_max_length', '300'),
  ('ai_safety_mode', 'on')
ON CONFLICT ("key") DO NOTHING;