# LinkedIn CRM

Un CRM de messagerie LinkedIn en temps réel.

## 🚀 Stack

- **Frontend:** Next.js 14 (App Router) + TypeScript + Tailwind CSS
- **Backend:** Next.js API Routes
- **Database:** Supabase (PostgreSQL)
- **State:** Zustand
- **Déploiement:** Vercel

## 📁 Structure

```
linkedin-crm/
├── src/
│   ├── app/               # Pages Next.js (App Router)
│   │   ├── api/sync/      # API de synchronisation
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/        # Composants React
│   ├── lib/               # Utilitaires (Supabase client)
│   ├── store/             # State Zustand
│   └── types/             # Types TypeScript
├── extension/             # Extension Chrome
│   ├── manifest.json
│   ├── content.js         # Script de scraping LinkedIn
│   ├── popup.html/js      # Interface de l'extension
│   └── background.js
└── docs/                  # Documentation
    ├── linkedin-selectors.md  # Sélecteurs CSS LinkedIn
    └── database-schema.sql    # Schéma Supabase
```

## 🛠️ Installation

### 1. Cloner et installer

```bash
cd linkedin-crm
npm install
```

### 2. Configurer Supabase

1. Créer un projet sur [supabase.com](https://supabase.com)
2. Exécuter le SQL dans `docs/database-schema.sql`
3. Copier `.env.example` vers `.env.local`:

```bash
cp .env.example .env.local
```

4. Remplir les variables:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
```

### 3. Lancer en développement

```bash
npm run dev
```

### 4. Installer l'extension Chrome

1. Ouvrir `chrome://extensions/`
2. Activer "Mode développeur"
3. Cliquer "Charger l'extension non empaquetée"
4. Sélectionner le dossier `extension/`

## 📱 Utilisation

1. **Connecter ton compte LinkedIn** via l'extension Chrome
2. **Ouvrir LinkedIn Messaging** - l'extension sync automatiquement
3. **Voir tes conversations** dans le CRM
4. **Tagger, prioriser, filtrer** tes contacts

## 🔧 Fonctionnalités

### MVP (Phase 1)
- [x] Sync des conversations LinkedIn
- [x] Sync des messages
- [x] Liste des conversations avec filtres
- [x] Vue des messages par thread
- [x] Tags sur les contacts
- [x] Priorités (Urgent, Haute, Normale)
- [x] Favoris / Étoiles
- [ ] Authentification Supabase
- [ ] Envoi de messages via extension

### Phase 2
- [ ] Recherche full-text
- [ ] Templates de messages
- [ ] Notes sur les contacts
- [ ] Rappels / Relances
- [ ] Statistiques
- [ ] Export CSV

### Phase 3
- [ ] Multi-comptes LinkedIn
- [ ] Équipe / Multi-utilisateurs
- [ ] API publique
- [ ] Webhooks
- [ ] Intégrations (Notion, Slack, etc.)

## 🔐 Sécurité

- Les données restent sur Supabase (tu contrôles)
- Row Level Security (RLS) activé
- L'extension ne stocke pas de credentials
- HTTPS obligatoire

## ⚠️ Avertissements

- **ToS LinkedIn:** Le scraping peut violer les conditions d'utilisation
- **Rate limiting:** Ne pas abuser, risque de ban du compte
- **Usage personnel recommandé**

## 📄 License

MIT
