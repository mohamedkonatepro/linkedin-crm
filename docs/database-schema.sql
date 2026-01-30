-- LinkedIn CRM Database Schema
-- For Supabase (PostgreSQL)

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================
-- USERS (CRM Users)
-- =====================
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  avatar_url TEXT,
  
  -- LinkedIn account linked
  linkedin_id TEXT UNIQUE,
  linkedin_name TEXT,
  linkedin_avatar_url TEXT,
  linkedin_connected_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================
-- CONTACTS (LinkedIn Contacts)
-- =====================
CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  
  -- LinkedIn info
  linkedin_id TEXT NOT NULL,
  name TEXT NOT NULL,
  headline TEXT,
  profile_url TEXT,
  avatar_url TEXT,
  company TEXT,
  location TEXT,
  
  -- CRM fields
  tags TEXT[] DEFAULT '{}',
  priority INTEGER DEFAULT 0, -- 0=normal, 1=high, 2=urgent
  status TEXT DEFAULT 'active', -- active, archived, blocked
  notes TEXT,
  
  -- Metadata
  first_contact_at TIMESTAMPTZ,
  last_contact_at TIMESTAMPTZ,
  message_count INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, linkedin_id)
);

-- Index for fast lookups
CREATE INDEX idx_contacts_user_id ON contacts(user_id);
CREATE INDEX idx_contacts_linkedin_id ON contacts(linkedin_id);
CREATE INDEX idx_contacts_priority ON contacts(user_id, priority DESC);
CREATE INDEX idx_contacts_tags ON contacts USING GIN(tags);

-- =====================
-- CONVERSATIONS
-- =====================
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE NOT NULL,
  
  -- LinkedIn thread info
  linkedin_thread_id TEXT NOT NULL,
  
  -- Status
  is_starred BOOLEAN DEFAULT FALSE,
  is_archived BOOLEAN DEFAULT FALSE,
  is_unread BOOLEAN DEFAULT FALSE,
  unread_count INTEGER DEFAULT 0,
  
  -- Last message preview
  last_message_preview TEXT,
  last_message_at TIMESTAMPTZ,
  last_message_from_me BOOLEAN,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, linkedin_thread_id)
);

-- Index for fast lookups
CREATE INDEX idx_conversations_user_id ON conversations(user_id);
CREATE INDEX idx_conversations_contact_id ON conversations(contact_id);
CREATE INDEX idx_conversations_last_message ON conversations(user_id, last_message_at DESC);
CREATE INDEX idx_conversations_unread ON conversations(user_id, is_unread) WHERE is_unread = TRUE;

-- =====================
-- MESSAGES
-- =====================
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE NOT NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  
  -- LinkedIn message info
  linkedin_message_urn TEXT UNIQUE NOT NULL,
  
  -- Content
  content TEXT NOT NULL,
  content_type TEXT DEFAULT 'text', -- text, image, file, etc.
  
  -- Metadata
  is_from_me BOOLEAN NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  sent_at TIMESTAMPTZ NOT NULL,
  
  -- Attachments (JSON array)
  attachments JSONB DEFAULT '[]',
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  synced_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_user_id ON messages(user_id);
CREATE INDEX idx_messages_sent_at ON messages(conversation_id, sent_at DESC);
CREATE INDEX idx_messages_linkedin_urn ON messages(linkedin_message_urn);

-- =====================
-- TAGS (Custom Tags)
-- =====================
CREATE TABLE tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  
  name TEXT NOT NULL,
  color TEXT DEFAULT '#3B82F6', -- Hex color
  description TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, name)
);

-- =====================
-- SYNC LOG (Track sync status)
-- =====================
CREATE TABLE sync_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  
  sync_type TEXT NOT NULL, -- 'full', 'incremental', 'conversation'
  status TEXT NOT NULL, -- 'started', 'completed', 'failed'
  
  conversations_synced INTEGER DEFAULT 0,
  messages_synced INTEGER DEFAULT 0,
  
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  error_message TEXT
);

-- =====================
-- ROW LEVEL SECURITY
-- =====================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_log ENABLE ROW LEVEL SECURITY;

-- Users can only access their own data
CREATE POLICY "Users can view own profile" ON users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON users
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can view own contacts" ON contacts
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view own conversations" ON conversations
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view own messages" ON messages
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own tags" ON tags
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view own sync logs" ON sync_log
  FOR ALL USING (auth.uid() = user_id);

-- =====================
-- FUNCTIONS
-- =====================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER contacts_updated_at
  BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Update conversation stats when message is inserted
CREATE OR REPLACE FUNCTION update_conversation_on_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE conversations SET
    last_message_preview = LEFT(NEW.content, 100),
    last_message_at = NEW.sent_at,
    last_message_from_me = NEW.is_from_me,
    unread_count = CASE 
      WHEN NOT NEW.is_from_me AND NOT NEW.is_read THEN unread_count + 1 
      ELSE unread_count 
    END,
    is_unread = CASE 
      WHEN NOT NEW.is_from_me AND NOT NEW.is_read THEN TRUE 
      ELSE is_unread 
    END,
    updated_at = NOW()
  WHERE id = NEW.conversation_id;
  
  -- Update contact stats
  UPDATE contacts SET
    last_contact_at = NEW.sent_at,
    message_count = message_count + 1,
    updated_at = NOW()
  WHERE id = NEW.contact_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER message_inserted
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION update_conversation_on_message();

-- =====================
-- REALTIME
-- =====================

-- Enable realtime for key tables
ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
