-- Schema simplifié pour LinkedIn CRM (sans auth pour l'instant)
-- ATTENTION: Ce script supprime les tables existantes !

-- Supprimer les tables existantes (dans le bon ordre à cause des FK)
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS conversations CASCADE;

-- Table des conversations
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  linkedin_thread_id TEXT UNIQUE NOT NULL,
  contact_linkedin_id TEXT,
  contact_name TEXT NOT NULL,
  contact_avatar_url TEXT,
  contact_headline TEXT,
  is_starred BOOLEAN DEFAULT FALSE,
  is_read BOOLEAN DEFAULT TRUE,
  unread_count INTEGER DEFAULT 0,
  last_message_preview TEXT,
  last_message_at TIMESTAMPTZ,
  last_message_from_me BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table des messages
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  linkedin_message_urn TEXT UNIQUE NOT NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  linkedin_thread_id TEXT NOT NULL,
  content TEXT,
  is_from_me BOOLEAN DEFAULT FALSE,
  is_read BOOLEAN DEFAULT FALSE,
  sent_at TIMESTAMPTZ,
  attachments JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour les performances
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_linkedin_thread_id ON messages(linkedin_thread_id);
CREATE INDEX idx_messages_sent_at ON messages(sent_at DESC);
CREATE INDEX idx_conversations_linkedin_thread_id ON conversations(linkedin_thread_id);
CREATE INDEX idx_conversations_last_message_at ON conversations(last_message_at DESC);

-- Fonction pour mettre à jour updated_at automatiquement
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger pour conversations
DROP TRIGGER IF EXISTS update_conversations_updated_at ON conversations;
CREATE TRIGGER update_conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Désactiver RLS pour simplifier (pas d'auth)
ALTER TABLE conversations DISABLE ROW LEVEL SECURITY;
ALTER TABLE messages DISABLE ROW LEVEL SECURITY;
