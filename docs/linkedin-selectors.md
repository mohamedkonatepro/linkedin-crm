# LinkedIn Messaging - CSS Selectors Documentation

> Analysé le 2025-01-30 sur linkedin.com/messaging/

## Structure Générale

LinkedIn utilise une Single Page App (Ember.js) avec des classes CSS dynamiques mais prévisibles.

---

## 1. Liste des Conversations

### Container Principal
```css
ul.msg-conversations-container__conversations-list
```

### Item de Conversation
```css
li.msg-conversation-listitem
```

### Carte de Conversation
```css
div.msg-conversation-card
```

### Éléments de la Carte

| Élément | Sélecteur CSS |
|---------|---------------|
| Nom du participant | `h3.msg-conversation-listitem__participant-names span.truncate` |
| Date/heure | `time.msg-conversation-listitem__time-stamp` |
| Aperçu du message | `p.msg-conversation-card__message-snippet` |
| Photo de profil | `img.presence-entity__image` |
| Conversation active | `.msg-conversations-container__convo-item-link--active` |
| Étoile/favori | `.msg-conversation-card__star-icon` |
| Statut en ligne | `.presence-entity__indicator:not(.hidden)` |

### Extraction de l'ID LinkedIn
Le profil ID est dans le href des liens:
```
href="https://www.linkedin.com/in/ACoAAB-ldo0BRvt5jQW1OOXOk0ez8OWs7IBSKCU"
```
Pattern regex: `/ACoAA[A-Za-z0-9_-]+/`

---

## 2. Liste des Messages (Thread)

### Container Principal
```css
ul.msg-s-message-list-content
```

### Item de Message
```css
li.msg-s-message-list__event
```

### Event de Message
```css
div.msg-s-event-listitem
```

### Data Attributes
```html
data-event-urn="urn:li:msg_message:(urn:li:fsd_profile:PROFILE_ID,MESSAGE_ID)"
```

### Classes de Contexte

| Classe | Signification |
|--------|---------------|
| `msg-s-event-listitem--other` | Message reçu (pas de moi) |
| `msg-s-event-listitem--last-in-group` | Dernier message d'un groupe |
| (absence de `--other`) | Message envoyé par moi |

### Éléments du Message

| Élément | Sélecteur CSS |
|---------|---------------|
| Lien profil | `a.msg-s-event-listitem__link` |
| Photo profil | `img.msg-s-event-listitem__profile-picture` |
| Nom expéditeur | `span.msg-s-message-group__profile-link` |
| Heure | `time.msg-s-message-group__timestamp` |
| Date (séparateur) | `time.msg-s-message-list__time-heading` |
| Contenu message | `p.msg-s-event-listitem__body` |
| Bulle message | `div.msg-s-event-listitem__message-bubble` |

### Indicateur de Lecture
Pour les messages envoyés, le texte "Envoyé le DD/MM/YYYY, HH:MM" indique un message envoyé:
```css
div[class*="msg-s-event-listitem"] > div.msg-s-event-listitem__message-bubble
```
Contient une icône checkmark si lu.

---

## 3. Zone de Saisie

```css
/* Input de message */
div.msg-form__contenteditable[contenteditable="true"]

/* Bouton envoyer */
button.msg-form__send-button

/* Boutons d'action */
button[aria-label*="Joindre une image"]
button[aria-label*="Joindre un fichier"]
button[aria-label*="GIF"]
button[aria-label*="émoticônes"]
```

---

## 4. Header de Conversation

```css
/* Nom du contact dans le header */
h2.msg-entity-lockup__entity-title

/* Titre/poste du contact */
.msg-entity-lockup__entity-subtitle

/* Boutons d'action */
button[aria-label*="étoile"]
button[aria-label*="options"]
```

---

## 5. Pagination / Scroll Infini

LinkedIn charge les conversations et messages au scroll:
- Observer: `li.msg-s-message-list__loader`
- Quand visible = chargement en cours
- Trigger: scroll vers le haut dans la liste des messages

---

## 6. Bonnes Pratiques de Scraping

### Timing
- Attendre le chargement complet (pas de `.msg-s-message-list__loader:not(.hidden)`)
- Délai entre actions: 500-1000ms minimum
- Rate limiting: max 10-20 requêtes/minute

### Détection Bot
LinkedIn détecte:
- Mouvements de souris non naturels
- Actions trop rapides
- User-agent suspect
- Pas de cookies de session valides

### Approche Recommandée
1. **Extension Chrome** (meilleur choix)
   - Accès au DOM natif
   - Session utilisateur authentique
   - Pas de risque CORS
   
2. **API non officielle** (risqué)
   - Cookies + headers LinkedIn
   - Peut casser à tout moment
   - Risque de ban

---

## 7. Exemple de Structure JSON

### Conversation
```json
{
  "id": "thread_abc123",
  "participant": {
    "linkedinId": "ACoAAB-ldo0BRvt5jQW1OOXOk0ez8OWs7IBSKCU",
    "name": "Mohamed Konaté",
    "profileUrl": "https://linkedin.com/in/...",
    "avatarUrl": "https://media.licdn.com/...",
    "headline": "Développeur React | NextJS | NodeJS"
  },
  "lastMessage": {
    "preview": "Oui et toi ?",
    "timestamp": "2025-11-16T03:51:00Z",
    "isFromMe": false
  },
  "isStarred": false,
  "isUnread": false
}
```

### Message
```json
{
  "id": "msg_xyz789",
  "urn": "urn:li:msg_message:(...)",
  "conversationId": "thread_abc123",
  "sender": {
    "linkedinId": "ACoAAB-ldo0BRvt5jQW1OOXOk0ez8OWs7IBSKCU",
    "name": "Mohamed Konaté",
    "isMe": false
  },
  "content": "Oui et toi ?",
  "timestamp": "2025-11-16T03:51:00Z",
  "isRead": true
}
```

---

## 8. URLs Clés

| Page | URL |
|------|-----|
| Messagerie | `https://www.linkedin.com/messaging/` |
| Thread spécifique | `https://www.linkedin.com/messaging/thread/{thread_id}/` |
| Profil | `https://www.linkedin.com/in/{profile_id}` |

---

*Document généré automatiquement - À mettre à jour si LinkedIn change sa structure*
