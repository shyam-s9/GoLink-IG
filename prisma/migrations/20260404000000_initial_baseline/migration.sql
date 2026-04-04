CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS "Users" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "platform_user_id" VARCHAR UNIQUE NOT NULL,
  "full_name" VARCHAR,
  "access_token" TEXT NOT NULL,
  "role" VARCHAR DEFAULT 'CUSTOMER',
  "is_active" BOOLEAN DEFAULT true,
  "created_at" TIMESTAMP DEFAULT NOW(),
  "updated_at" TIMESTAMP DEFAULT NOW(),
  "last_login_at" TIMESTAMP,
  "last_login_ip" VARCHAR,
  "last_security_scan_at" TIMESTAMP,
  "token_expires_at" TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "Reels_Automation" (
  "id" SERIAL PRIMARY KEY,
  "user_id" UUID REFERENCES "Users"("id") ON DELETE CASCADE,
  "reel_id" VARCHAR NOT NULL,
  "trigger_keyword" VARCHAR NOT NULL,
  "public_reply_text" TEXT,
  "affiliate_link" TEXT NOT NULL,
  "is_enabled" BOOLEAN DEFAULT true,
  "total_delivered" INTEGER DEFAULT 0,
  "created_at" TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "Analytics" (
  "id" SERIAL PRIMARY KEY,
  "automation_id" INTEGER REFERENCES "Reels_Automation"("id") ON DELETE CASCADE,
  "follower_platform_id" VARCHAR,
  "action_type" VARCHAR,
  "sentiment_score" FLOAT,
  "sentiment_label" VARCHAR,
  "timestamp" TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "Leads" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "user_id" UUID REFERENCES "Users"("id") ON DELETE CASCADE,
  "platform_handle" VARCHAR,
  "email" VARCHAR,
  "lead_score" INTEGER DEFAULT 0,
  "source" VARCHAR DEFAULT 'PLATFORM_AUTOMATION',
  "status" VARCHAR DEFAULT 'NEW',
  "created_at" TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "Customer_Security_Posture" (
  "user_id" UUID PRIMARY KEY REFERENCES "Users"("id") ON DELETE CASCADE,
  "risk_level" VARCHAR DEFAULT 'normal',
  "last_risk_score" INTEGER DEFAULT 0,
  "suspicious_request_count" INTEGER DEFAULT 0,
  "blocked_request_count" INTEGER DEFAULT 0,
  "compromised_signals" INTEGER DEFAULT 0,
  "last_incident_at" TIMESTAMP,
  "last_seen_at" TIMESTAMP,
  "updated_at" TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "Security_Events" (
  "id" BIGSERIAL PRIMARY KEY,
  "user_id" UUID REFERENCES "Users"("id") ON DELETE SET NULL,
  "actor_type" VARCHAR DEFAULT 'anonymous',
  "event_type" VARCHAR NOT NULL,
  "severity" VARCHAR DEFAULT 'low',
  "risk_score" INTEGER DEFAULT 0,
  "blocked" BOOLEAN DEFAULT false,
  "ip_address" VARCHAR,
  "user_agent" TEXT,
  "fingerprint" VARCHAR,
  "details" JSONB DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "Security_Incidents" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "user_id" UUID REFERENCES "Users"("id") ON DELETE CASCADE,
  "category" VARCHAR NOT NULL,
  "status" VARCHAR DEFAULT 'open',
  "severity" VARCHAR DEFAULT 'medium',
  "risk_score" INTEGER DEFAULT 0,
  "summary" TEXT,
  "recommended_action" TEXT,
  "metadata" JSONB DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMP DEFAULT NOW(),
  "updated_at" TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "Auth_Sessions" (
  "id" BIGSERIAL PRIMARY KEY,
  "session_hash" VARCHAR UNIQUE NOT NULL,
  "user_id" UUID REFERENCES "Users"("id") ON DELETE CASCADE,
  "ip_address" VARCHAR,
  "user_agent" TEXT,
  "fingerprint" VARCHAR,
  "revoke_reason" VARCHAR,
  "expires_at" TIMESTAMP NOT NULL,
  "revoked_at" TIMESTAMP,
  "last_seen_at" TIMESTAMP DEFAULT NOW(),
  "created_at" TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "Audit_Log" (
  "id" BIGSERIAL PRIMARY KEY,
  "user_id" UUID REFERENCES "Users"("id") ON DELETE SET NULL,
  "actor_type" VARCHAR DEFAULT 'system',
  "action" VARCHAR NOT NULL,
  "target_type" VARCHAR,
  "target_id" VARCHAR,
  "request_id" VARCHAR,
  "metadata" JSONB DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMP DEFAULT NOW()
);

DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Users' AND column_name = 'ig_user_id') THEN ALTER TABLE "Users" RENAME COLUMN "ig_user_id" TO "platform_user_id"; END IF; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Analytics' AND column_name = 'follower_ig_id') THEN ALTER TABLE "Analytics" RENAME COLUMN "follower_ig_id" TO "follower_platform_id"; END IF; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Leads' AND column_name = 'ig_handle') THEN ALTER TABLE "Leads" RENAME COLUMN "ig_handle" TO "platform_handle"; END IF; END $$;

CREATE INDEX IF NOT EXISTS "idx_security_events_user_created" ON "Security_Events"("user_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_security_events_fingerprint_created" ON "Security_Events"("fingerprint", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_automation_user_enabled" ON "Reels_Automation"("user_id", "is_enabled");
CREATE INDEX IF NOT EXISTS "idx_auth_sessions_user_created" ON "Auth_Sessions"("user_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_audit_log_user_created" ON "Audit_Log"("user_id", "created_at" DESC);