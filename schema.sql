-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users Table (Creators)
CREATE TABLE Users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    platform_user_id VARCHAR UNIQUE NOT NULL,
    full_name VARCHAR,
    access_token TEXT NOT NULL, -- Encrypted (AES-256-GCM)
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Reels Automation Table
CREATE TABLE Reels_Automation (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES Users(id),
    reel_id VARCHAR NOT NULL,
    trigger_keyword VARCHAR NOT NULL, 
    public_reply_text TEXT, -- [NEW]
    affiliate_link TEXT NOT NULL,
    is_enabled BOOLEAN DEFAULT true,
    total_delivered INTEGER DEFAULT 0
);

-- Subscriptions Table
CREATE TABLE Subscriptions (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES Users(id),
    razorpay_sub_id VARCHAR UNIQUE,
    status VARCHAR, -- 'active', 'expired', 'halted'
    next_billing_date TIMESTAMP
);

-- Analytics Table
CREATE TABLE Analytics (
    id SERIAL PRIMARY KEY,
    automation_id INTEGER REFERENCES Reels_Automation(id),
    follower_platform_id VARCHAR,
    action_type VARCHAR, -- 'DM_SENT' or 'FOLLOW_REQUIRED' or 'PUBLIC_REPLY'
    sentiment_score FLOAT, -- [NEW]
    sentiment_label VARCHAR, -- [NEW] 'positive', 'neutral', 'negative'
    timestamp TIMESTAMP DEFAULT NOW()
);

-- Leads Table (EMW Lead Management)
CREATE TABLE Leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES Users(id),
    platform_handle VARCHAR,
    email VARCHAR,
    lead_score INTEGER DEFAULT 0,
    source VARCHAR DEFAULT 'AUTOMATION_TRIGGER',
    status VARCHAR DEFAULT 'NEW', -- 'NEW', 'QUALIFIED', 'LOST'
    created_at TIMESTAMP DEFAULT NOW()
);
