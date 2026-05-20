CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username        VARCHAR(32) UNIQUE NOT NULL,
  phone           VARCHAR(20) UNIQUE,
  email           VARCHAR(255) UNIQUE,
  password_hash   TEXT NOT NULL,
  display_name    VARCHAR(64),
  avatar_url      TEXT,
  bio_audio_url   TEXT,
  bio_text        TEXT,
  is_verified     BOOLEAN DEFAULT FALSE,
  is_creator      BOOLEAN DEFAULT FALSE,
  is_adult_creator BOOLEAN DEFAULT FALSE,
  kyc_status      VARCHAR(20) DEFAULT 'none',
  tier            VARCHAR(20) DEFAULT 'free',
  signal_identity_key     TEXT,
  signal_signed_prekey    JSONB,
  signal_prekeys          JSONB,
  last_seen       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE user_follows (
  follower_id   UUID REFERENCES users(id) ON DELETE CASCADE,
  following_id  UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (follower_id, following_id)
);

CREATE TABLE user_blocks (
  blocker_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  blocked_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (blocker_id, blocked_id)
);

CREATE TABLE auth_sessions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
  device_id     VARCHAR(128),
  device_name   VARCHAR(64),
  refresh_token TEXT UNIQUE NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE conversations (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type          VARCHAR(10) NOT NULL,
  name          VARCHAR(128),
  avatar_url    TEXT,
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE conversation_members (
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
  role            VARCHAR(20) DEFAULT 'member',
  sender_key      TEXT,
  joined_at       TIMESTAMPTZ DEFAULT NOW(),
  last_read_at    TIMESTAMPTZ,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE messages (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id   UUID REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id         UUID REFERENCES users(id),
  type              VARCHAR(20) NOT NULL,
  audio_url         TEXT,
  audio_duration_ms INTEGER,
  audio_waveform    JSONB,
  content_encrypted TEXT,
  transcription     TEXT,
  language          VARCHAR(10),
  reply_to_id       UUID REFERENCES messages(id),
  is_ephemeral      BOOLEAN DEFAULT FALSE,
  expires_at        TIMESTAMPTZ,
  sent_at           TIMESTAMPTZ DEFAULT NOW(),
  edited_at         TIMESTAMPTZ,
  deleted_at        TIMESTAMPTZ
);

CREATE TABLE message_receipts (
  message_id    UUID REFERENCES messages(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
  status        VARCHAR(10) NOT NULL,
  at            TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (message_id, user_id)
);

CREATE TABLE message_reactions (
  message_id    UUID REFERENCES messages(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
  emoji         VARCHAR(10) NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (message_id, user_id)
);

CREATE TABLE vocal_posts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  author_id       UUID REFERENCES users(id) ON DELETE CASCADE,
  audio_url       TEXT NOT NULL,
  audio_duration_ms INTEGER,
  audio_waveform  JSONB,
  transcription   TEXT,
  language        VARCHAR(10),
  caption         TEXT,
  hashtags        TEXT[],
  parent_id       UUID REFERENCES vocal_posts(id),
  root_id         UUID REFERENCES vocal_posts(id),
  visibility      VARCHAR(20) DEFAULT 'public',
  is_adult        BOOLEAN DEFAULT FALSE,
  likes_count     INTEGER DEFAULT 0,
  replies_count   INTEGER DEFAULT 0,
  reposts_count   INTEGER DEFAULT 0,
  listens_count   INTEGER DEFAULT 0,
  boosted_until   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE TABLE vocal_post_likes (
  post_id       UUID REFERENCES vocal_posts(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE vocal_post_reposts (
  post_id       UUID REFERENCES vocal_posts(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE bookmarks (
  user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
  post_id       UUID REFERENCES vocal_posts(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, post_id)
);

CREATE TABLE stadions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  host_id         UUID REFERENCES users(id) ON DELETE CASCADE,
  title           VARCHAR(128) NOT NULL,
  description     TEXT,
  cover_url       TEXT,
  type            VARCHAR(20) NOT NULL,
  category        VARCHAR(50),
  tags            TEXT[],
  is_live         BOOLEAN DEFAULT FALSE,
  started_at      TIMESTAMPTZ,
  ended_at        TIMESTAMPTZ,
  recording_url   TEXT,
  recording_duration_ms INTEGER,
  transcription   TEXT,
  chapters        JSONB,
  is_public       BOOLEAN DEFAULT TRUE,
  is_adult        BOOLEAN DEFAULT FALSE,
  peak_listeners  INTEGER DEFAULT 0,
  total_listens   INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE stadion_participants (
  stadion_id    UUID REFERENCES stadions(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
  role          VARCHAR(20) DEFAULT 'listener',
  joined_at     TIMESTAMPTZ DEFAULT NOW(),
  left_at       TIMESTAMPTZ,
  PRIMARY KEY (stadion_id, user_id)
);

CREATE TABLE stadion_tips (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  stadion_id    UUID REFERENCES stadions(id) ON DELETE CASCADE,
  sender_id     UUID REFERENCES users(id),
  amount_cents  INTEGER NOT NULL,
  currency      VARCHAR(10) DEFAULT 'EUR',
  znd_amount    DECIMAL(18,8),
  message       TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE creator_subscriptions_plans (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  creator_id      UUID REFERENCES users(id) ON DELETE CASCADE,
  name            VARCHAR(64) NOT NULL,
  description     TEXT,
  price_cents     INTEGER NOT NULL,
  currency        VARCHAR(10) DEFAULT 'EUR',
  billing_period  VARCHAR(20) DEFAULT 'monthly',
  is_adult        BOOLEAN DEFAULT FALSE,
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE creator_subscriptions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  plan_id         UUID REFERENCES creator_subscriptions_plans(id),
  subscriber_id   UUID REFERENCES users(id) ON DELETE CASCADE,
  creator_id      UUID REFERENCES users(id) ON DELETE CASCADE,
  stripe_subscription_id  TEXT UNIQUE,
  stripe_customer_id      TEXT,
  status          VARCHAR(20) DEFAULT 'active',
  current_period_start    TIMESTAMPTZ,
  current_period_end      TIMESTAMPTZ,
  cancelled_at            TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE creator_content (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  creator_id      UUID REFERENCES users(id) ON DELETE CASCADE,
  title           VARCHAR(128),
  audio_url       TEXT NOT NULL,
  preview_url     TEXT,
  duration_ms     INTEGER,
  transcription   TEXT,
  is_adult        BOOLEAN DEFAULT FALSE,
  required_plan_id UUID REFERENCES creator_subscriptions_plans(id),
  price_cents     INTEGER,
  listens_count   INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE private_rooms (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  creator_id      UUID REFERENCES users(id),
  subscriber_id   UUID REFERENCES users(id),
  subscription_id UUID REFERENCES creator_subscriptions(id),
  status          VARCHAR(20) DEFAULT 'pending',
  started_at      TIMESTAMPTZ,
  ended_at        TIMESTAMPTZ,
  duration_ms     INTEGER,
  session_key_encrypted TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE notifications (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
  type          VARCHAR(50) NOT NULL,
  actor_id      UUID REFERENCES users(id),
  target_type   VARCHAR(30),
  target_id     UUID,
  data          JSONB,
  is_read       BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE reports (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reporter_id     UUID REFERENCES users(id),
  target_type     VARCHAR(30) NOT NULL,
  target_id       UUID NOT NULL,
  reason          VARCHAR(50) NOT NULL,
  details         TEXT,
  status          VARCHAR(20) DEFAULT 'pending',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE user_wallets (
  user_id               UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  wallet_address        VARCHAR(42) UNIQUE NOT NULL,
  encrypted_private_key TEXT NOT NULL,
  znd_balance           DECIMAL(18,8) DEFAULT 0,
  znd_staked            DECIMAL(18,8) DEFAULT 0,
  stake_unlocks_at      TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE znd_transactions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  from_user_id    UUID REFERENCES users(id),
  to_user_id      UUID REFERENCES users(id),
  to_address      VARCHAR(42),
  amount          DECIMAL(18,8) NOT NULL,
  type            VARCHAR(30) NOT NULL,
  reference_id    UUID,
  tx_hash         VARCHAR(66),
  status          VARCHAR(20) DEFAULT 'pending',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE content_access (
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  content_id  UUID REFERENCES creator_content(id) ON DELETE CASCADE,
  unlocked_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, content_id)
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id, sent_at DESC);
CREATE INDEX idx_vocal_posts_author ON vocal_posts(author_id, created_at DESC);
CREATE INDEX idx_vocal_posts_feed ON vocal_posts(created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_stadions_live ON stadions(is_live, started_at DESC) WHERE is_live = TRUE;
CREATE INDEX idx_follows_following ON user_follows(following_id);
CREATE INDEX idx_follows_follower ON user_follows(follower_id);
CREATE INDEX idx_notifs_user ON notifications(user_id, created_at DESC) WHERE is_read = FALSE;
CREATE INDEX idx_znd_tx_from ON znd_transactions(from_user_id, created_at DESC);
CREATE INDEX idx_znd_tx_to ON znd_transactions(to_user_id, created_at DESC);

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER conversations_updated_at BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE FUNCTION update_post_likes_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE vocal_posts SET likes_count = likes_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE vocal_posts SET likes_count = likes_count - 1 WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER vocal_post_likes_count
  AFTER INSERT OR DELETE ON vocal_post_likes
  FOR EACH ROW EXECUTE FUNCTION update_post_likes_count();