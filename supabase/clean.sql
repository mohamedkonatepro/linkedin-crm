-- Script pour nettoyer toutes les données de la base
-- Exécute dans Supabase SQL Editor

-- Supprimer tous les messages
DELETE FROM messages;

-- Supprimer toutes les conversations
DELETE FROM conversations;

-- Optionnel: Reset les séquences (pas nécessaire avec UUID)
-- SELECT setval('messages_id_seq', 1, false);
-- SELECT setval('conversations_id_seq', 1, false);

-- Vérification
SELECT 'messages' as table_name, COUNT(*) as count FROM messages
UNION ALL
SELECT 'conversations', COUNT(*) FROM conversations;
