# Architecture Realtime - LinkedIn CRM

> Comment recevoir les messages LinkedIn en temps réel sans polling.

---

## 📋 Sommaire

1. [Analyse du système actuel](#analyse-du-système-actuel)
2. [WebSocket LinkedIn](#websocket-linkedin)
3. [Stratégie "Zero Polling"](#stratégie-zero-polling)
4. [Formats de messages WebSocket](#formats-de-messages-websocket)
5. [Gestion des déconnexions](#gestion-des-déconnexions)
6. [API LinkedIn documentée](#api-linkedin-documentée)
7. [Implémentation recommandée](#implémentation-recommandée)

---

## Analyse du système actuel

### Deux mécanismes de réception

| Mécanisme | Fichier | Description |
|-----------|---------|-------------|
| **WebSocket Interception** | `content.js` | Intercepte le WebSocket natif de LinkedIn |
| **Polling Backup** | `background.js` | Polling toutes les 30s comme fallback |

### Pourquoi le polling existe

Le polling sert de "filet de sécurité" si :
- Le WebSocket se déconnecte silencieusement
- LinkedIn change le format des messages
- Certains événements ne passent pas par le WebSocket

### Problème du polling

```
Polling 30s × 8h de travail = 960 requêtes/jour/utilisateur
```

- Consommation CPU/réseau
- Risque de rate limiting LinkedIn
- Charge serveur inutile

---

## WebSocket LinkedIn

### Comment ça fonctionne

LinkedIn ouvre un WebSocket pour le realtime quand l'utilisateur est sur la page de messagerie :

```javascript
// content.js - Interception du WebSocket natif
const OriginalWebSocket = window.WebSocket;

window.WebSocket = function(url, protocols) {
  const ws = new OriginalWebSocket(url, protocols);
  
  if (url.includes('linkedin.com') || url.includes('realtime')) {
    ws.addEventListener('message', (event) => {
      processWebSocketMessage(event.data);
    });
  }
  
  return ws;
};
```

### Événements capturés

| Événement | Description |
|-----------|-------------|
| `message` | Nouveau message reçu |
| `open` | WebSocket connecté |
| `close` | WebSocket déconnecté |

### Notification au CRM

Quand un nouveau message arrive :

```javascript
// Vers le parent (iframe CRM)
window.parent.postMessage({
  source: 'linkedin-extension',
  type: 'NEW_MESSAGES',
  messages: messages
}, '*');

// Vers le background script (sync serveur)
chrome.runtime.sendMessage({
  type: 'REALTIME_MESSAGES',
  messages: messages
});
```

---

## Stratégie "Zero Polling"

### Principe

```
┌─────────────────────────────────────────────────────────┐
│                   USER OUVRE LE CRM                     │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  1. SYNC INITIALE                                       │
│     Extension fait UN fetch complet                     │
│     → Rattrape tous les messages manqués                │
│                                                         │
│  2. WEBSOCKET ACTIF                                     │
│     Realtime instantané ⚡                               │
│     → Aucun polling nécessaire                          │
│                                                         │
│  3. DÉTECTION DÉCONNEXION                               │
│     Si WebSocket close → Re-sync immédiate              │
│                                                         │
│  4. SYNC DE SORTIE (optionnel)                          │
│     Avant de fermer → Un dernier fetch                  │
│                                                         │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                 USER PAS SUR LE CRM                     │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ❌ Pas de polling                                       │
│  ❌ Pas de requêtes                                      │
│  💤 Extension inactive                                  │
│                                                         │
│  → Tout sera rattrapé à la prochaine ouverture          │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Avantages

| Métrique | Avec polling 30s | Zero polling |
|----------|------------------|--------------|
| Requêtes/jour (8h) | ~960 | ~5-10 |
| CPU | Constant | Quasi nul |
| Risque rate limit | Moyen | Très faible |
| Realtime | ✅ | ✅ |

### Implémentation

```javascript
// background.js - Désactiver le polling par défaut
const POLLING_CONFIG = {
  enabled: false,  // ← DÉSACTIVÉ
  // ...
};

// Sync seulement quand le CRM est détecté
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url?.includes('localhost:3000/crm')) {
    // Faire UNE sync complète
    await performFullSync();
  }
});
```

---

## Formats de messages WebSocket

LinkedIn utilise plusieurs formats. L'extension les gère tous :

### Format 1 : `included` array

```json
{
  "included": [
    {
      "$type": "com.linkedin.messenger.Message",
      "entityUrn": "urn:li:msg_message:(...)",
      "body": { "text": "Hello!" },
      "deliveredAt": 1707000000000,
      "*sender": "urn:li:fsd_profile:xxx"
    }
  ]
}
```

### Format 2 : Direct message object

```json
{
  "$type": "com.linkedin.messenger.Message",
  "entityUrn": "...",
  "body": { "text": "..." }
}
```

### Format 3 : Event-based

```json
{
  "eventType": "MESSAGING_EVENT",
  "message": {
    "entityUrn": "...",
    "body": { "text": "..." }
  }
}
```

### Format 4 : Payload wrapper

```json
{
  "payload": {
    "message": { ... }
  }
}
```

### Format 5 : Array

```json
[
  { "$type": "com.linkedin.messenger.Message", ... },
  { "$type": "com.linkedin.messenger.Message", ... }
]
```

### Code de parsing

```javascript
// content.js - handleLinkedInRealtimeData()
function handleLinkedInRealtimeData(data) {
  const messages = [];
  
  // Format 1
  if (data.included && Array.isArray(data.included)) {
    for (const item of data.included) {
      if (item.$type === 'com.linkedin.messenger.Message') {
        messages.push(extractMessageData(item));
      }
    }
  }
  
  // Format 2
  if (data.$type === 'com.linkedin.messenger.Message') {
    messages.push(extractMessageData(data));
  }
  
  // Format 3
  if (data.eventType === 'MESSAGING_EVENT') {
    messages.push(extractMessageData(data.message));
  }
  
  // ... autres formats
}
```

---

## Gestion des déconnexions

### Détection

```javascript
ws.addEventListener('close', () => {
  console.log('🔴 LinkedIn WebSocket closed');
  notifyRealtimeStatus(false);
});
```

### Réaction

Quand le WebSocket se déconnecte :

```javascript
// background.js
case 'REALTIME_STATUS':
  POLLING_CONFIG.isWebSocketActive = message.connected;
  
  if (!message.connected) {
    // WebSocket down → sync immédiate pour rattraper
    setTimeout(performFullSync, 2000);
  }
  break;
```

### Reconnexion automatique

LinkedIn reconnecte automatiquement son WebSocket. L'extension le ré-intercepte car le patch reste actif :

```javascript
window.WebSocket = function(...) {
  // Chaque nouvelle connexion est interceptée
};
```

---

## API LinkedIn documentée

### Endpoints découverts

| Endpoint | Méthode | Usage |
|----------|---------|-------|
| `/voyager/api/voyagerMessagingGraphQL/graphql` | GET | Fetch conversations/messages |
| `/voyager/api/voyagerMessagingDashMessengerMessages?action=createMessage` | POST | Envoyer un message |
| `/voyager/api/voyagerVideoDashMediaUploadMetadata?action=upload` | POST | Init upload fichier |
| `/voyager/api/me` | GET | Info utilisateur connecté |

### Headers requis

```javascript
headers: {
  'accept': 'application/vnd.linkedin.normalized+json+2.1',
  'csrf-token': cookies['JSESSIONID'],  // Inclut déjà "ajax:"
  'x-restli-protocol-version': '2.0.0',
  'x-li-lang': 'fr_FR',
  'x-li-track': JSON.stringify({
    clientVersion: '1.13.42216',
    osName: 'web',
    deviceFormFactor: 'DESKTOP',
    mpName: 'voyager-web'
  })
}
```

### Query IDs (GraphQL)

Les queryIds sont dynamiques et changent. L'extension les découvre automatiquement :

```javascript
// Interception des requêtes LinkedIn
chrome.webRequest.onBeforeSendHeaders.addListener((details) => {
  if (details.url.includes('voyagerMessagingGraphQL')) {
    const queryId = new URL(details.url).searchParams.get('queryId');
    
    if (queryId.startsWith('messengerConversations.')) {
      discoveredQueryIds.conversations.push(queryId);
    }
  }
});
```

### Format envoi de message

```javascript
// POST /voyagerMessagingDashMessengerMessages?action=createMessage
{
  "message": {
    "body": { "attributes": [], "text": "Hello!" },
    "renderContentUnions": [],  // Pour les attachments
    "conversationUrn": "urn:li:msg_conversation:(urn:li:fsd_profile:xxx,2-xxx)",
    "originToken": "uuid-v4"
  },
  "mailboxUrn": "urn:li:fsd_profile:xxx",
  "trackingId": "base64-random",
  "dedupeByClientGeneratedToken": false
}
```

### Format envoi avec fichier

```javascript
// 1. Init upload
POST /voyagerVideoDashMediaUploadMetadata?action=upload
{ "mediaUploadType": "MESSAGING_FILE_ATTACHMENT", "fileSize": 1234, "filename": "doc.pdf" }

// 2. Upload binaire
PUT {singleUploadUrl}
Headers: media-type-family: DOCUMENT

// 3. Envoyer message avec attachment
renderContentUnions: [{
  file: {
    assetUrn: "urn:li:digitalmediaAsset:xxx",
    byteSize: 1234,
    mediaType: "application/pdf",
    name: "doc.pdf"
  }
}]
```

---

## Implémentation recommandée

### Config extension (zero polling)

```javascript
// background.js
const POLLING_CONFIG = {
  enabled: false,           // Désactivé par défaut
  onOpenSync: true,         // Sync à l'ouverture du CRM
  onDisconnectSync: true,   // Sync si WebSocket down
  manualRefresh: true,      // Bouton refresh disponible
};
```

### Flow complet

```
1. User ouvre CRM
   ↓
2. Extension détecte (tabs.onUpdated)
   ↓
3. Sync initiale (fetchConversations + fetchMessages)
   ↓
4. WebSocket actif → realtime ⚡
   ↓
5. Si WebSocket close → re-sync
   ↓
6. User peut refresh manuellement si besoin
   ↓
7. User ferme CRM → rien ne tourne
```

### Garantie de ne rien louper

| Scénario | Solution |
|----------|----------|
| User absent 2 jours | Sync complète à l'ouverture |
| WebSocket down pendant utilisation | Re-sync automatique |
| Message arrive pendant sync | WebSocket le capte aussi |
| Doublon (sync + WebSocket) | Déduplication par `entityUrn` |

### Code de déduplication

```javascript
const seenMessageUrns = new Set();

function processMessage(msg) {
  if (seenMessageUrns.has(msg.entityUrn)) {
    return; // Déjà vu, ignorer
  }
  seenMessageUrns.add(msg.entityUrn);
  // Traiter le message...
}
```

---

## Résumé

| Question | Réponse |
|----------|---------|
| Peut-on supprimer le polling ? | ✅ Oui |
| Risque de louper des messages ? | ❌ Non (sync à l'ouverture + WebSocket) |
| Performance | 🟢 Excellente (quasi zéro overhead) |
| Fiabilité | 🟢 Haute (déduplication + re-sync auto) |

---

*Document créé le 2026-02-04*
