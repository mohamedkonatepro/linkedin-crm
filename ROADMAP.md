# LinkedIn CRM - Roadmap

## 🎯 Phase actuelle : MVP SaaS (Single-tenant)

**Objectif :** Un utilisateur peut créer un compte, connecter son LinkedIn, et utiliser le CRM.

---

## ✅ Déjà fait
- [x] Interface CRM complète
- [x] Sync conversations/messages via extension
- [x] Envoi de messages (texte + fichiers)
- [x] Tags, Notes, Reminders
- [x] Supabase DB (conversations, messages, tags, reminders)

---

## 🚧 À faire : Auth + Connexion LinkedIn

### Étape 1 : Auth utilisateur (Supabase Auth)
- [ ] Setup Supabase Auth (email/password ou magic link)
- [ ] Page login/signup
- [ ] Protection des routes (middleware)
- [ ] Lier les données à l'utilisateur connecté (`user_id` dans les tables)

### Étape 2 : Connexion compte LinkedIn
- [ ] Flow "Connecter mon LinkedIn" dans l'UI
- [ ] Extension envoie les cookies LinkedIn au serveur
- [ ] Stockage sécurisé des credentials LinkedIn (chiffré)
- [ ] Indicateur de statut connexion LinkedIn

### Étape 3 : Serveur fait les appels LinkedIn
- [ ] Le serveur utilise les credentials stockés pour appeler l'API LinkedIn
- [ ] Plus besoin que l'extension soit active en permanence
- [ ] Refresh/reconnexion si les cookies expirent

---

## 🔮 Plus tard (hors scope MVP)

> 📖 Voir [docs/ARCHITECTURE-MULTI-USER.md](docs/ARCHITECTURE-MULTI-USER.md) pour l'architecture détaillée

### Multi-tenant (workspaces + équipes)
- [ ] Table `workspaces`
- [ ] Table `workspace_members` (rôles : admin, member)
- [ ] Invitations par email
- [ ] Un workspace = un compte LinkedIn
- [ ] Plusieurs users par workspace

### Mobile
- [ ] PWA (quick win)
- [ ] React Native (si besoin d'une vraie app)

---

## 📐 Architecture cible (MVP)

```
┌─────────────────────────────────────────────────────────┐
│                      Frontend                           │
│                   (Next.js App)                         │
│  ┌─────────┐  ┌─────────┐  ┌─────────────────────────┐ │
│  │ Login   │  │ CRM     │  │ Settings                │ │
│  │ Signup  │  │ Page    │  │ (Connecter LinkedIn)    │ │
│  └─────────┘  └─────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                    Backend API                          │
│                  (Next.js API Routes)                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐  │
│  │ /auth    │  │ /sync    │  │ /linkedin-credentials│  │
│  │          │  │ /messages│  │                      │  │
│  └──────────┘  └──────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│   Supabase   │  │   Supabase   │  │  LinkedIn    │
│     Auth     │  │   Database   │  │    API       │
│              │  │              │  │ (via stored  │
│              │  │              │  │  credentials)│
└──────────────┘  └──────────────┘  └──────────────┘
```

---

## 🗄️ Schema DB à modifier

```sql
-- Ajouter user_id à toutes les tables existantes
ALTER TABLE conversations ADD COLUMN user_id UUID REFERENCES auth.users(id);
ALTER TABLE tags ADD COLUMN user_id UUID REFERENCES auth.users(id);
ALTER TABLE reminders ADD COLUMN user_id UUID REFERENCES auth.users(id);

-- Nouvelle table pour stocker les credentials LinkedIn
CREATE TABLE linkedin_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  li_at TEXT NOT NULL,           -- Cookie principal (chiffré)
  jsessionid TEXT NOT NULL,      -- CSRF token (chiffré)
  profile_urn TEXT,              -- URN du profil LinkedIn
  profile_name TEXT,             -- Nom affiché
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,        -- Estimation expiration
  is_valid BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index
CREATE INDEX idx_conversations_user_id ON conversations(user_id);
CREATE INDEX idx_linkedin_credentials_user_id ON linkedin_credentials(user_id);

-- RLS (Row Level Security) - chaque user voit que ses données
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE linkedin_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own conversations" ON conversations
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users see own credentials" ON linkedin_credentials
  FOR ALL USING (auth.uid() = user_id);
```

---

## 🔐 Sécurité credentials LinkedIn

Les cookies LinkedIn sont sensibles. Recommandations :

1. **Chiffrement at rest** - Utiliser `pgcrypto` ou chiffrer côté app avant stockage
2. **Jamais exposer côté client** - Les credentials restent côté serveur
3. **Rotation** - Détecter quand les cookies expirent, demander reconnexion
4. **Logs** - Logger les accès aux credentials

---

*Dernière mise à jour : 2026-02-04*
