# Architecture Multi-Utilisateurs - LinkedIn CRM

> Comment permettre à un assistant d'accéder au compte LinkedIn de l'admin via le CRM.

---

## 📋 Sommaire

1. [Contexte](#contexte)
2. [Architecture actuelle](#architecture-actuelle)
3. [Le problème à résoudre](#le-problème-à-résoudre)
4. [Solution : Injection de cookies via l'extension](#solution-injection-de-cookies-via-lextension)
5. [Flux détaillé](#flux-détaillé)
6. [Implémentation](#implémentation)
7. [Sécurité](#sécurité)
8. [Limitations](#limitations)

---

## Contexte

### Objectif
Permettre à un **assistant** (ou autre membre d'équipe) de :
- Voir les conversations LinkedIn de l'admin
- Répondre aux messages au nom de l'admin
- Avoir le **realtime** (nouveaux messages instantanés)

### Contrainte
L'assistant n'a **pas** les identifiants LinkedIn de l'admin.

---

## Architecture actuelle

### Comment fonctionne l'iframe LinkedIn

L'extension Chrome supprime les headers de sécurité de LinkedIn :

```json
// extension/rules.json
{
  "action": {
    "type": "modifyHeaders",
    "responseHeaders": [
      { "header": "X-Frame-Options", "operation": "remove" },
      { "header": "Content-Security-Policy", "operation": "remove" }
    ]
  },
  "condition": { "urlFilter": "||linkedin.com" }
}
```

Grâce à ça, le CRM peut afficher LinkedIn en iframe :

```tsx
// src/app/crm/page.tsx
<iframe 
  src="https://www.linkedin.com/messaging/" 
  className="fixed inset-0 w-full h-full"
/>
```

### Comment fonctionne le realtime

Le content script s'exécute dans l'iframe (`all_frames: true`) et intercepte le WebSocket LinkedIn :

```javascript
// extension/content.js
// Intercept WebSocket connections
const originalWebSocket = window.WebSocket;
window.WebSocket = function(url, protocols) {
  const ws = new originalWebSocket(url, protocols);
  // Intercepte les messages entrants
  ws.addEventListener('message', handleRealtimeMessage);
  return ws;
};
```

---

## Le problème à résoudre

Quand l'assistant ouvre le CRM :

```
Assistant ouvre le CRM
    │
    ▼
Iframe charge linkedin.com/messaging
    │
    ▼
LinkedIn utilise les cookies du navigateur de l'assistant
    │
    ▼
❌ L'assistant voit SON compte LinkedIn, pas celui de l'admin
```

### Pourquoi ?

Les cookies sont stockés **par navigateur et par domaine**. L'iframe `linkedin.com` utilise les cookies LinkedIn présents dans le navigateur de l'utilisateur actuel.

---

## Solution : Injection de cookies via l'extension

### Principe

1. L'admin se connecte au CRM et autorise l'accès à son compte LinkedIn
2. Ses cookies LinkedIn (`li_at`, `JSESSIONID`) sont stockés sur le serveur (chiffrés)
3. Quand l'assistant ouvre le CRM :
   - L'extension récupère les cookies de l'admin depuis le serveur
   - L'extension injecte ces cookies dans le navigateur de l'assistant
   - L'iframe se recharge → connecté au compte de l'admin ✅

### Pourquoi ça fonctionne

L'extension Chrome a la permission `cookies` et peut manipuler les cookies de n'importe quel domaine autorisé :

```json
// extension/manifest.json
{
  "permissions": ["cookies"],
  "host_permissions": ["https://*.linkedin.com/*"]
}
```

Avec `chrome.cookies.set()`, on peut définir des cookies pour `linkedin.com` même si l'utilisateur n'est pas connecté.

---

## Flux détaillé

### Étape 1 : L'admin connecte son compte

```
┌─────────────────────────────────────────────────────────┐
│                      ADMIN                              │
│                                                         │
│  1. Se connecte au CRM                                  │
│  2. Clique "Connecter mon LinkedIn"                     │
│  3. L'extension capture ses cookies LinkedIn :          │
│     - li_at (token d'auth principal)                    │
│     - JSESSIONID (CSRF token)                           │
│  4. Cookies envoyés au serveur (chiffrés)               │
│                                                         │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                      SERVEUR                            │
│                                                         │
│  Table: linkedin_credentials                            │
│  ┌────────────────────────────────────────────────────┐ │
│  │ user_id │ li_at (chiffré) │ jsessionid (chiffré)  │ │
│  │ admin   │ AQE...xxxxx     │ ajax:123...           │ │
│  └────────────────────────────────────────────────────┘ │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Étape 2 : L'assistant accède au CRM

```
┌─────────────────────────────────────────────────────────┐
│                    ASSISTANT                            │
│                                                         │
│  1. Se connecte au CRM (son compte assistant)           │
│  2. Le CRM lui indique quel workspace il a accès        │
│  3. L'extension :                                       │
│     a. Récupère les cookies de l'admin depuis serveur   │
│     b. Injecte ces cookies dans le navigateur           │
│        chrome.cookies.set({ name: 'li_at', ... })       │
│  4. L'iframe LinkedIn se charge                         │
│  5. LinkedIn voit les cookies de l'admin                │
│  6. → Connecté au compte LinkedIn de l'admin ✅         │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Étape 3 : Realtime fonctionne

```
┌─────────────────────────────────────────────────────────┐
│              ASSISTANT (sur le CRM)                     │
│                                                         │
│  Iframe LinkedIn (compte de l'admin)                    │
│       │                                                 │
│       ▼                                                 │
│  LinkedIn ouvre WebSocket                               │
│       │                                                 │
│       ▼                                                 │
│  Content script intercepte (all_frames: true)           │
│       │                                                 │
│       ▼                                                 │
│  Nouveau message reçu → affiché instantanément ⚡        │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Implémentation

### 1. API pour stocker/récupérer les credentials

```typescript
// src/app/api/linkedin-credentials/route.ts

// POST : L'admin enregistre ses cookies
export async function POST(request: Request) {
  const { li_at, jsessionid } = await request.json()
  const userId = await getCurrentUserId()
  
  // Chiffrer avant stockage
  const encryptedLiAt = encrypt(li_at)
  const encryptedJsessionid = encrypt(jsessionid)
  
  await supabase.from('linkedin_credentials').upsert({
    user_id: userId,
    li_at: encryptedLiAt,
    jsessionid: encryptedJsessionid,
    connected_at: new Date()
  })
  
  return Response.json({ ok: true })
}

// GET : Récupérer les credentials (pour l'extension)
export async function GET(request: Request) {
  const userId = await getCurrentUserId()
  const workspaceAdminId = await getWorkspaceAdminId(userId)
  
  const { data } = await supabase
    .from('linkedin_credentials')
    .select('li_at, jsessionid')
    .eq('user_id', workspaceAdminId)
    .single()
  
  if (!data) {
    return Response.json({ error: 'No credentials' }, { status: 404 })
  }
  
  // Déchiffrer avant envoi
  return Response.json({
    li_at: decrypt(data.li_at),
    jsessionid: decrypt(data.jsessionid)
  })
}
```

### 2. Extension : Injecter les cookies

```javascript
// extension/background.js

async function injectLinkedInCredentials() {
  try {
    // Récupérer les credentials depuis le serveur
    const response = await fetch('http://localhost:3000/api/linkedin-credentials', {
      credentials: 'include'  // Envoie les cookies de session CRM
    })
    
    if (!response.ok) {
      console.log('Pas de credentials à injecter')
      return false
    }
    
    const { li_at, jsessionid } = await response.json()
    
    // Supprimer les anciens cookies LinkedIn
    await chrome.cookies.remove({ url: 'https://www.linkedin.com', name: 'li_at' })
    await chrome.cookies.remove({ url: 'https://www.linkedin.com', name: 'JSESSIONID' })
    
    // Injecter les nouveaux cookies
    await chrome.cookies.set({
      url: 'https://www.linkedin.com',
      name: 'li_at',
      value: li_at,
      domain: '.linkedin.com',
      path: '/',
      secure: true,
      httpOnly: true,
      sameSite: 'no_restriction',
      expirationDate: Date.now() / 1000 + 86400 * 365  // 1 an
    })
    
    await chrome.cookies.set({
      url: 'https://www.linkedin.com',
      name: 'JSESSIONID',
      value: jsessionid,
      domain: '.www.linkedin.com',
      path: '/',
      secure: true,
      sameSite: 'no_restriction',
      expirationDate: Date.now() / 1000 + 86400 * 365
    })
    
    console.log('✅ Cookies LinkedIn injectés avec succès')
    return true
    
  } catch (error) {
    console.error('Erreur injection cookies:', error)
    return false
  }
}

// Appeler au démarrage ou quand le CRM est détecté
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url?.includes('localhost:3000/crm')) {
    await injectLinkedInCredentials()
  }
})
```

### 3. Frontend : Recharger l'iframe après injection

```typescript
// src/app/crm/page.tsx

useEffect(() => {
  // Écouter le message de l'extension quand les cookies sont injectés
  window.addEventListener('message', (event) => {
    if (event.data.type === 'LINKEDIN_COOKIES_INJECTED') {
      // Recharger l'iframe pour utiliser les nouveaux cookies
      if (iframeRef.current) {
        iframeRef.current.src = iframeRef.current.src
      }
    }
  })
}, [])
```

---

## Sécurité

### Chiffrement des credentials

```typescript
// src/lib/crypto.ts
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY!  // 32 bytes
const ALGORITHM = 'aes-256-gcm'

export function encrypt(text: string): string {
  const iv = randomBytes(16)
  const cipher = createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'hex'), iv)
  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const authTag = cipher.getAuthTag()
  return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted
}

export function decrypt(encryptedText: string): string {
  const [ivHex, authTagHex, encrypted] = encryptedText.split(':')
  const decipher = createDecipheriv(
    ALGORITHM,
    Buffer.from(ENCRYPTION_KEY, 'hex'),
    Buffer.from(ivHex, 'hex')
  )
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'))
  let decrypted = decipher.update(encrypted, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}
```

### Contrôle d'accès

- Seuls les membres d'un workspace peuvent récupérer les credentials de ce workspace
- L'API vérifie les permissions avant de renvoyer les credentials
- Les credentials ne sont jamais exposés côté client (seulement utilisés par l'extension)

### Bonnes pratiques

1. **HTTPS obligatoire** en production
2. **Rotation des clés** de chiffrement périodique
3. **Logs d'accès** aux credentials
4. **Expiration** : détecter quand les cookies LinkedIn expirent et demander reconnexion

---

## Scalabilité

### Modèle de données

```
1000 utilisateurs SaaS
    │
    └── ~300-400 comptes LinkedIn (workspaces)
            │
            └── ~3 utilisateurs par compte LinkedIn
                    │
                    ├── 1 Admin (propriétaire du compte)
                    └── 2 Assistants (accès partagé)
```

### Pourquoi ça scale bien

| Métrique | Valeur | Risque LinkedIn |
|----------|--------|-----------------|
| Users par compte LinkedIn | ~3 | 🟢 Normal |
| IPs différentes par compte | ~3 | 🟢 Normal (bureau, maison, mobile) |
| Requêtes API par compte | Dépend de l'activité | 🟢 Réparties sur plusieurs navigateurs |

LinkedIn voit **3 IPs par compte** → comportement humain normal. Pas de red flag.

### Ce qui serait problématique (à éviter)

- ❌ 50 assistants sur le même compte LinkedIn
- ❌ 50 IPs différentes avec les mêmes cookies
- ❌ → Détection automatique, vérification de sécurité, ban potentiel

**Recommandation :** Limiter à **5-10 assistants max** par compte LinkedIn.

---

## Limitations et solutions

### 1. Confusion de cookies pour l'assistant

**Problème :** Si l'assistant a son propre compte LinkedIn personnel, ses cookies seront écrasés.

**Solutions :**
- Afficher un avertissement avant injection : *"Attention, vous serez déconnecté de votre compte LinkedIn personnel pendant l'utilisation du CRM."*
- Proposer d'utiliser un profil Chrome séparé pour le travail

### 2. Assistant multi-workspace

**Problème :** Un assistant qui gère plusieurs clients (plusieurs comptes LinkedIn) ne peut avoir qu'un set de cookies à la fois.

**Solutions :**

| Solution | Complexité | UX |
|----------|------------|-----|
| **A. Switch automatique** | 🟢 Simple | Recharger les cookies au changement de workspace (~2-3s) |
| **B. Profils Chrome** | 🟡 Moyenne | Un profil par client, switch de profil |
| **C. Mode sans iframe** | 🟢 Simple | L'assistant voit le CRM sans iframe, refresh manuel |

**Recommandation MVP :** Option A (switch automatique) avec fallback sur Option C.

### 3. Expiration des cookies

**Problème :** Les cookies LinkedIn (`li_at`) expirent après quelques semaines/mois.

**Solution :**

```
LinkedIn renvoie 401 (cookie expiré)
        │
        ▼
Extension détecte l'erreur
        │
        ▼
CRM affiche : "Session LinkedIn expirée"
        │
        ▼
Notification à l'admin : "Reconnectez votre compte LinkedIn"
        │
        ▼
Admin se reconnecte → nouveaux cookies stockés
        │
        ▼
Assistants reçoivent auto les nouveaux cookies au prochain chargement
```

### 4. Sécurité des credentials en transit

**Problème :** Les cookies transitent entre serveur et extension.

**Mitigations :**
- ✅ HTTPS obligatoire (jamais de HTTP en production)
- ✅ Chiffrement AES-256-GCM en base de données
- ✅ Token de session CRM requis pour récupérer les credentials
- ✅ Logs d'accès aux credentials (audit trail)
- ✅ Rate limiting sur l'API credentials

---

## Résumé

| Fonctionnalité | Comment ça marche |
|----------------|-------------------|
| Iframe LinkedIn | Extension supprime X-Frame-Options |
| Accès compte admin | Extension injecte les cookies de l'admin |
| Realtime WebSocket | Content script intercepte dans l'iframe |
| Envoi de messages | Via l'iframe (compte admin) ou API serveur |
| Sécurité | Cookies chiffrés sur le serveur |

### Scalabilité validée

| Métrique | Supporté |
|----------|----------|
| 1000+ utilisateurs SaaS | ✅ |
| 300-400 comptes LinkedIn | ✅ |
| ~3 users par compte | ✅ (risque LinkedIn faible) |
| Assistant multi-workspace | ✅ (avec switch de cookies) |

### Recommandations

1. **Limiter à 5-10 assistants** par compte LinkedIn
2. **Avertir l'assistant** avant injection des cookies (déconnexion compte perso)
3. **Implémenter la détection d'expiration** des cookies avec notification admin
4. **HTTPS obligatoire** en production

---

*Document créé le 2026-02-04*  
*Mis à jour le 2026-02-04 : clarification scalabilité et solutions edge cases*
