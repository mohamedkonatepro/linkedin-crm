-- Schema v2: Ajout Tags, Rappels, Notes
-- Exécuter après schema.sql

-- Table des tags personnalisables
CREATE TABLE IF NOT EXISTS tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#3B82F6',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table de liaison conversation <-> tags (many-to-many)
CREATE TABLE IF NOT EXISTS conversation_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  tag_id UUID REFERENCES tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(conversation_id, tag_id)
);

-- Table des rappels
CREATE TABLE IF NOT EXISTS reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  reminder_at TIMESTAMPTZ NOT NULL,
  message TEXT,
  is_handled BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ajouter colonne note aux conversations
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS note TEXT;

-- Index pour les performances
CREATE INDEX IF NOT EXISTS idx_conversation_tags_conversation_id ON conversation_tags(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_tags_tag_id ON conversation_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_reminders_conversation_id ON reminders(conversation_id);
CREATE INDEX IF NOT EXISTS idx_reminders_reminder_at ON reminders(reminder_at);
CREATE INDEX IF NOT EXISTS idx_reminders_is_handled ON reminders(is_handled);

-- Désactiver RLS
ALTER TABLE tags DISABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_tags DISABLE ROW LEVEL SECURITY;
ALTER TABLE reminders DISABLE ROW LEVEL SECURITY;

-- Insérer les tags par défaut (optimisés pour un CRM LinkedIn)
INSERT INTO tags (name, color) VALUES
  ('À relancer', '#F59E0B'),   -- Orange: action prioritaire de suivi
  ('Prospect', '#3B82F6'),     -- Bleu: contact qualifié avec potentiel
  ('Client', '#10B981'),       -- Vert: relation commerciale active
  ('Lead chaud', '#EF4444'),   -- Rouge: opportunité urgente
  ('Partenaire', '#8B5CF6'),   -- Violet: collaboration business
  ('Recruteur', '#06B6D4')     -- Cyan: utile pour recherche d'emploi
ON CONFLICT DO NOTHING;
