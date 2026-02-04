# LinkedIn CRM

Un CRM de messagerie LinkedIn en temps réel avec extension Chrome.

## ✨ Fonctionnalités

### ✅ Implémentées

- **Sync bidirectionnelle** - Conversations et messages via API LinkedIn (pas de scraping DOM)
- **Realtime WebSocket** - Nouveaux messages instantanés sans polling
- **Envoi de messages** - Texte, images, fichiers, audio via API Dash
- **Tags personnalisables** - À relancer, Prospect, Client, Lead chaud, Partenaire, Recruteur
- **Notes** - Notes persistantes par conversation
- **Rappels** - Système de reminders avec dates
- **Favoris** - Marquer les conversations importantes
- **Filtrage** - Par tag, favoris, non-lus
- **Recherche** - Dans les conversations
- **LinkedIn en iframe** - Accès direct à LinkedIn dans le CRM (bypass X-Frame-Options)

### 🔜 Roadmap

- [ ] Authentification utilisateurs (Supabase Auth)
- [ ] Multi-utilisateurs / équipes
- [ ] Notifications push
- [ ] Application mobile (PWA)
- [ ] Templates de messages
- [ ] Statistiques et analytics

## 🚀 Stack technique

| Composant | Technologie |
|-----------|-------------|
| Frontend | Next.js 14 (App Router) + TypeScript + Tailwind CSS |
| Backend | Next.js API Routes |
| Database | Supabase (PostgreSQL) |
| Extension | Chrome Manifest V3 |
| Realtime | WebSocket interception + API GraphQL LinkedIn |

## 📁 Structure du projet

```
linkedin-crm/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── sync/          # Sync conversations/messages
│   │   │   ├── realtime/      # WebSocket → serveur
│   │   │   ├── tags/          # CRUD tags
│   │   │   ├── notes/         # CRUD notes
│   │   │   └── reminders/     # CRUD rappels
│   │   └── crm/
│   │       └── page.tsx       # Interface CRM principale
│   └── lib/
│       └── supabase/          # Client Supabase
├── extension/
│   ├── manifest.json          # Manifest V3
│   ├── background.js          # Service worker (API calls)
│   ├── content.js             # WebSocket interception
│   ├── popup.html/js          # UI extension
│   └── rules.json             # Bypass X-Frame-Options
├── supabase/
│   ├── schema.sql             # Tables principales
│   └── schema-v2.sql          # Tags, rappels, notes
└── docs/
    ├── ARCHITECTURE-MULTI-USER.md   # Architecture multi-utilisateurs
    ├── REALTIME-ARCHITECTURE.md     # WebSocket et zero-polling
    └── linkedin-selectors.md        # Sélecteurs CSS (legacy)
```

## 🛠️ Installation

### 1. Prérequis

- Node.js 18+
- Compte Supabase
- Chrome/Chromium

### 2. Installation

```bash
git clone https://github.com/mohamedkonatepro/linkedin-crm.git
cd linkedin-crm
npm install
```

### 3. Configuration Supabase

1. Créer un projet sur [supabase.com](https://supabase.com)
2. Exécuter les scripts SQL :

```bash
# Tables principales
psql -f supabase/schema.sql

# Tags, rappels, notes
psql -f supabase/schema-v2.sql
```

3. Configurer les variables d'environnement :

```bash
cp .env.example .env.local
```

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
```

### 4. Lancer le serveur

```bash
npm run dev
```

### 5. Installer l'extension Chrome

1. Ouvrir `chrome://extensions/`
2. Activer **Mode développeur**
3. Cliquer **Charger l'extension non empaquetée**
4. Sélectionner le dossier `extension/`

## 📱 Utilisation

1. **Ouvrir LinkedIn Messaging** dans Chrome - l'extension capture les queryIds automatiquement
2. **Ouvrir le CRM** sur `localhost:3000/crm`
3. **Cliquer Sync** - synchronise conversations et messages
4. **Utiliser le CRM** - le realtime est actif via WebSocket

### Raccourcis

| Action | Comment |
|--------|---------|
| Sync manuelle | Bouton 🔄 en haut |
| Voir LinkedIn | Toggle "LinkedIn" (iframe) |
| Ajouter tag | Clic droit sur conversation |
| Ajouter note | Panel latéral |
| Créer rappel | Icône 🔔 |

## 🔧 Architecture technique

### Realtime sans polling

L'extension intercepte le WebSocket natif de LinkedIn pour un realtime instantané **sans polling** :

```
LinkedIn WebSocket ──► Extension (content.js) ──► CRM Server ──► UI
```

Voir [docs/REALTIME-ARCHITECTURE.md](docs/REALTIME-ARCHITECTURE.md) pour les détails.

### API LinkedIn (reverse-engineered)

| Endpoint | Usage |
|----------|-------|
| `voyagerMessagingGraphQL/graphql` | Fetch conversations/messages |
| `voyagerMessagingDashMessengerMessages` | Envoyer messages |
| `voyagerVideoDashMediaUploadMetadata` | Upload fichiers |

### Multi-utilisateurs (futur)

Architecture prévue pour permettre à des assistants d'accéder au compte LinkedIn de l'admin :

```
Admin ──► Stocke cookies ──► Serveur ──► Assistant (injection à la volée)
```

Voir [docs/ARCHITECTURE-MULTI-USER.md](docs/ARCHITECTURE-MULTI-USER.md) pour les détails.

## 📊 Base de données

### Tables principales

```sql
conversations     # Conversations LinkedIn
messages          # Messages
tags              # Tags personnalisables
conversation_tags # Liaison conversation ↔ tags
reminders         # Rappels
```

### Schéma

Voir `supabase/schema.sql` et `supabase/schema-v2.sql`.

## 🔐 Sécurité

- **Données locales** - Tout reste sur ton Supabase
- **Pas de credentials stockés** - Cookies utilisés à la volée
- **HTTPS obligatoire** en production
- **Row Level Security** prêt pour multi-tenant

## ⚠️ Avertissements

- **ToS LinkedIn** - L'utilisation d'APIs non officielles peut violer les conditions d'utilisation
- **Rate limiting** - Ne pas abuser, risque de ban
- **Usage personnel recommandé**

## 📄 Documentation

- [Architecture Multi-Utilisateurs](docs/ARCHITECTURE-MULTI-USER.md)
- [Architecture Realtime](docs/REALTIME-ARCHITECTURE.md)
- [Sélecteurs CSS LinkedIn](docs/linkedin-selectors.md)

## 🤝 Contribution

1. Fork le projet
2. Créer une branche (`git checkout -b feature/ma-feature`)
3. Commit (`git commit -m 'Add ma feature'`)
4. Push (`git push origin feature/ma-feature`)
5. Ouvrir une Pull Request

## 📄 License

MIT

---

*Développé par [Mohamed Konaté](https://linkedin.com/in/mohamed-konate/)*
