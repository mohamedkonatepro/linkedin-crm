# LinkedIn Messaging API - Documentation Technique

> Découvert par reverse-engineering le 2026-02-05

## Vue d'ensemble

LinkedIn utilise une API GraphQL interne pour sa messagerie. Cette API évolue fréquemment et les `queryId` changent régulièrement.

## Authentification

### Cookies requis
- `li_at` - Token d'authentification principal
- `JSESSIONID` - Token CSRF (préfixé "ajax:")

### Headers requis
```javascript
{
  'accept': 'application/vnd.linkedin.normalized+json+2.1',
  'csrf-token': JSESSIONID_VALUE.replace(/"/g, ''),
  'x-restli-protocol-version': '2.0.0',
  'x-li-lang': 'fr_FR'  // optionnel
}
```

## API Conversations

### Endpoint
```
GET /voyager/api/voyagerMessagingGraphQL/graphql
```

### QueryIds découverts (février 2026)
Les queryIds changent avec les mises à jour de LinkedIn. L'extension les auto-découvre via interception réseau.

| QueryId | Format de réponse | Pagination |
|---------|-------------------|------------|
| `messengerConversations.9501074288a12f3ae9e3c7ea243bccbf` | `messengerConversationsByCategoryQuery` | ✅ nextCursor |
| `messengerConversations.0d5e6781bbee71c3e51c8843c6519f48` | `messengerConversationsBySyncToken` | ❌ syncToken only |

### Variables de requête
```javascript
const queryPart = 'query:(predicateUnions:List((conversationCategoryPredicate:(category:INBOX))))';
const variables = `(${queryPart},count:${pageSize},mailboxUrn:${encodeURIComponent(mailboxUrn)})`;

// Avec pagination
const variablesWithCursor = `(${queryPart},count:${pageSize},mailboxUrn:${encodeURIComponent(mailboxUrn)},nextCursor:${encodeURIComponent(cursor)})`;
```

### Paramètres
- `count` : Nombre de conversations par page (max ~20-25)
- `mailboxUrn` : URN du profil (format: `urn:li:fsd_profile:XXXX`)
- `nextCursor` : Cursor pour la page suivante (Base64 encodé)

## Pagination

### ⚠️ IMPORTANT - Deux formats de réponse différents

LinkedIn utilise différents queryIds qui retournent des structures différentes :

#### Format 1 : `messengerConversationsByCategoryQuery` (avec pagination)
```javascript
// Chemin du nextCursor
data.data?.data?.messengerConversationsByCategoryQuery?.metadata?.nextCursor

// Structure
{
  "data": {
    "data": {
      "messengerConversationsByCategoryQuery": {
        "metadata": {
          "nextCursor": "REVTQ0VORElORyYxNzY5ODk4NTM1MDExJjIt..."
        }
      }
    }
  },
  "included": [/* conversations, participants, etc. */]
}
```

#### Format 2 : `messengerConversationsBySyncToken` (sync différentiel)
```javascript
// Chemin du syncToken
data.data?.data?.messengerConversationsBySyncToken?.metadata?.newSyncToken

// Structure - PAS DE PAGINATION CLASSIQUE
{
  "data": {
    "data": {
      "messengerConversationsBySyncToken": {
        "metadata": {
          "newSyncToken": "tP2414Vnxu7I14VnLnVy..."
        }
      }
    }
  }
}
```

### Code de pagination robuste
```javascript
// Supporter les deux formats
const paging = data.data?.messengerConversationsByCriteria?.paging
  || data.data?.data?.messengerConversationsByCategoryQuery?.metadata;
const nextCursor = paging?.nextCursor || null;
```

## Récupérer le Mailbox URN

```javascript
const meData = await fetch('/voyager/api/me', {
  headers: { 'csrf-token': csrf },
  credentials: 'include'
}).then(r => r.json());

const miniProfile = meData.included?.find(i => 
  i.$type === 'com.linkedin.voyager.identity.shared.MiniProfile'
);

const mailboxUrn = miniProfile?.dashEntityUrn 
  || miniProfile?.entityUrn?.replace('fs_miniProfile', 'fsd_profile');
```

## Types de données dans `included`

| $type | Description |
|-------|-------------|
| `com.linkedin.messenger.Conversation` | Conversation |
| `com.linkedin.messenger.MessagingParticipant` | Participant |
| `com.linkedin.messenger.Message` | Message |
| `com.linkedin.voyager.identity.shared.MiniProfile` | Profil mini |

## Extraction des conversations

```javascript
const conversations = data.included?.filter(item => 
  item.$type === 'com.linkedin.messenger.Conversation'
) || [];

const participants = data.included?.filter(item => 
  item.$type === 'com.linkedin.messenger.MessagingParticipant'
) || [];
```

## Test de pagination réussi (2026-02-05)

Compte testé : Mohamed Konate
- **200+ conversations** chargées
- **10 pages** de 20 conversations
- Pagination fonctionnelle avec `nextCursor`

## Anciennes APIs (dépréciées)

```javascript
// ❌ NE FONCTIONNE PLUS (erreur 500)
GET /voyager/api/messaging/conversations?keyVersion=LEGACY_INBOX&start=0&count=20
```

## Auto-découverte des QueryIds

L'extension intercepte les requêtes LinkedIn via `chrome.webRequest.onBeforeSendHeaders` pour découvrir automatiquement les nouveaux queryIds :

```javascript
chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    if (details.url.includes('voyagerMessagingGraphQL/graphql')) {
      const url = new URL(details.url);
      const queryId = url.searchParams.get('queryId');
      
      if (queryId?.startsWith('messengerConversations.')) {
        // Stocker le queryId
        discoveredQueryIds.conversations.unshift(queryId);
      }
    }
  },
  { urls: ["https://*.linkedin.com/*"] },
  ["requestHeaders"]
);
```

## Bonnes pratiques

1. **Délai entre les requêtes** : 200-300ms pour éviter le rate limiting
2. **Limiter les pages** : Max 10 pages par sync pour éviter les blocages
3. **Fallback sur plusieurs queryIds** : Les queryIds peuvent changer, en garder plusieurs
4. **Refresh régulier** : Naviguer sur LinkedIn Messaging pour découvrir les nouveaux queryIds

## Références

- Extension : `/home/ubuntu/clawd/projects/linkedin-crm/extension/`
- Background script : `background.js`
- Documentation API interne : Ce fichier
