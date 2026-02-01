/**
 * LinkedIn CRM Sync - Background Service Worker
 * Handles LinkedIn API calls and server communication
 */

console.log('🚀 LinkedIn CRM Background Script loaded');

// Auto-discovered queryIds from LinkedIn's own requests
// Store MULTIPLE queryIds since LinkedIn uses different ones
let discoveredQueryIds = {
  conversations: [],  // Array of queryIds
  messages: [],       // Array of queryIds
  lastUpdated: null,
};

let mailboxUrn = null;

// Load persisted queryIds on startup
chrome.storage.local.get(['discoveredQueryIds'], (result) => {
  if (result.discoveredQueryIds) {
    // Migrate from old format (string) to new format (array)
    if (typeof result.discoveredQueryIds.conversations === 'string') {
      discoveredQueryIds.conversations = [result.discoveredQueryIds.conversations];
    } else {
      discoveredQueryIds.conversations = result.discoveredQueryIds.conversations || [];
    }
    if (typeof result.discoveredQueryIds.messages === 'string') {
      discoveredQueryIds.messages = [result.discoveredQueryIds.messages];
    } else {
      discoveredQueryIds.messages = result.discoveredQueryIds.messages || [];
    }
    discoveredQueryIds.lastUpdated = result.discoveredQueryIds.lastUpdated;
    console.log('📦 Loaded persisted queryIds:', discoveredQueryIds);
  }
});

// =====================
// NETWORK INTERCEPTION - Capture queryIds
// =====================

chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    // Auto-discover queryIds from LinkedIn's own requests
    if (details.url.includes('voyagerMessagingGraphQL/graphql')) {
      const url = new URL(details.url);
      const queryId = url.searchParams.get('queryId');
      
      if (queryId) {
        if (queryId.startsWith('messengerConversations.')) {
          // Store multiple queryIds (most recent first)
          if (!discoveredQueryIds.conversations.includes(queryId)) {
            discoveredQueryIds.conversations.unshift(queryId);
            // Keep only last 5
            discoveredQueryIds.conversations = discoveredQueryIds.conversations.slice(0, 5);
            discoveredQueryIds.lastUpdated = Date.now();
            console.log('🔍 Auto-discovered conversations queryId:', queryId);
          }
        } else if (queryId.startsWith('messengerMessages.')) {
          if (!discoveredQueryIds.messages.includes(queryId)) {
            discoveredQueryIds.messages.unshift(queryId);
            discoveredQueryIds.messages = discoveredQueryIds.messages.slice(0, 5);
            discoveredQueryIds.lastUpdated = Date.now();
            console.log('🔍 Auto-discovered messages queryId:', queryId);
          }
        }
        
        // Persist
        chrome.storage.local.set({ discoveredQueryIds });
      }
    }
  },
  { urls: ["https://*.linkedin.com/*"] },
  ["requestHeaders"]
);

// =====================
// LINKEDIN API CLIENT
// =====================

async function getLinkedInCookies() {
  return new Promise((resolve) => {
    chrome.cookies.getAll({ domain: '.linkedin.com' }, (cookies) => {
      const cookieMap = {};
      for (const cookie of cookies) {
        cookieMap[cookie.name] = cookie.value;
      }
      resolve(cookieMap);
    });
  });
}

async function makeLinkedInRequest(endpoint) {
  const cookies = await getLinkedInCookies();
  const cookieString = Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
  
  const csrfToken = cookies['JSESSIONID']?.replace(/"/g, '');
  
  if (!csrfToken) {
    throw new Error('No CSRF token. Visit LinkedIn first.');
  }
  
  const url = endpoint.startsWith('http') 
    ? endpoint 
    : `https://www.linkedin.com${endpoint}`;
  
  console.log('🌐 API request:', url.substring(0, 100));
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'accept': 'application/vnd.linkedin.normalized+json+2.1',
      'cookie': cookieString,
      'csrf-token': csrfToken,
      'x-li-lang': 'fr_FR',
      'x-restli-protocol-version': '2.0.0',
    },
  });
  
  if (!response.ok) {
    throw new Error(`LinkedIn API error: ${response.status}`);
  }
  
  return response.json();
}

async function getMailboxUrn() {
  if (mailboxUrn) return mailboxUrn;
  
  try {
    const meData = await makeLinkedInRequest('/voyager/api/me');
    const miniProfile = meData.included?.find(item => 
      item.$type === 'com.linkedin.voyager.identity.shared.MiniProfile'
    );
    
    const dashUrn = miniProfile?.dashEntityUrn;
    const fsUrn = miniProfile?.entityUrn;
    
    if (dashUrn) {
      mailboxUrn = dashUrn;
    } else if (fsUrn) {
      mailboxUrn = fsUrn.replace('fs_miniProfile', 'fsd_profile');
    }
    
    console.log('📋 Mailbox URN:', mailboxUrn);
    return mailboxUrn;
  } catch (e) {
    console.error('❌ Error getting mailbox URN:', e);
    return null;
  }
}

// =====================
// API METHODS
// =====================

async function fetchConversations() {
  if (!discoveredQueryIds.conversations?.length) {
    throw new Error('QueryId not discovered. Navigate to LinkedIn Messaging first.');
  }
  
  const userUrn = await getMailboxUrn();
  if (!userUrn) throw new Error('Could not get mailbox URN');
  
  // Try each queryId until one works
  let data = null;
  let lastError = null;
  
  for (const queryId of discoveredQueryIds.conversations) {
    try {
      const variables = `(mailboxUrn:${encodeURIComponent(userUrn)})`;
      const endpoint = `/voyager/api/voyagerMessagingGraphQL/graphql?queryId=${queryId}&variables=${variables}`;
      
      data = await makeLinkedInRequest(endpoint);
      
      // Check if we got actual data
      const convCount = data.included?.filter(i => i.$type === 'com.linkedin.messenger.Conversation')?.length || 0;
      if (convCount > 0) {
        console.log(`✅ QueryId ${queryId.substring(0, 30)}... returned ${convCount} conversations`);
        break;
      } else {
        console.log(`⚠️ QueryId ${queryId.substring(0, 30)}... returned 0 conversations, trying next...`);
        data = null;
      }
    } catch (e) {
      console.warn(`❌ QueryId ${queryId.substring(0, 30)}... failed:`, e.message);
      lastError = e;
    }
  }
  
  if (!data) {
    throw lastError || new Error('All queryIds failed. Refresh LinkedIn Messaging.');
  }
  
  // Parse conversations
  const conversations = data.included?.filter(item => 
    item.$type === 'com.linkedin.messenger.Conversation'
  ) || [];
  
  // Build participant map
  const participantMap = new Map();
  for (const item of data.included || []) {
    if (item.$type === 'com.linkedin.messenger.MessagingParticipant') {
      participantMap.set(item.entityUrn, item);
    }
  }
  
  // Enrich conversations
  for (const conv of conversations) {
    conv._fullUrn = `urn:li:msg_conversation:(${userUrn},${conv.entityUrn.split(':').pop()})`;
    
    const participantUrns = conv['*conversationParticipants'] || [];
    for (const pUrn of participantUrns) {
      if (pUrn.includes(userUrn.split(':').pop())) continue;
      
      const participant = participantMap.get(pUrn);
      if (participant) {
        const member = participant.participantType?.member;
        if (member) {
          const firstName = member.firstName?.text || '';
          const lastName = member.lastName?.text || '';
          conv._participantName = `${firstName} ${lastName}`.trim();
          conv._participantHeadline = member.headline?.text || '';
          const pictureRoot = member.profilePicture?.rootUrl || '';
          const pictureSegment = member.profilePicture?.artifacts?.[0]?.fileIdentifyingUrlPathSegment || '';
          conv._participantPicture = pictureRoot && pictureSegment ? `${pictureRoot}${pictureSegment}` : '';
          conv._participantId = participant.entityUrn;
          break;
        }
      }
    }
  }
  
  // Sort by lastActivityAt (most recent first) to prioritize visible conversations
  conversations.sort((a, b) => (b.lastActivityAt || 0) - (a.lastActivityAt || 0));
  
  console.log(`📬 Fetched ${conversations.length} conversations (sorted by recent activity)`);
  return conversations;
}

async function fetchMessages(conversationUrn, count = 20) {
  const userUrn = await getMailboxUrn();
  let fullConversationUrn = conversationUrn;
  
  if (!conversationUrn.includes('msg_conversation')) {
    const convId = conversationUrn.includes('urn:li:') 
      ? conversationUrn.split(':').pop() 
      : conversationUrn;
    fullConversationUrn = `urn:li:msg_conversation:(${userUrn},${convId})`;
  }
  
  // Try GraphQL API first with multiple queryIds
  if (discoveredQueryIds.messages?.length) {
    for (const queryId of discoveredQueryIds.messages) {
      try {
        const encodedUrn = encodeURIComponent(fullConversationUrn).replace(/\(/g, '%28').replace(/\)/g, '%29');
        const endpoint = `/voyager/api/voyagerMessagingGraphQL/graphql?queryId=${queryId}&variables=(conversationUrn:${encodedUrn})`;
        
        const data = await makeLinkedInRequest(endpoint);
        
        // Handle both old format (data.included) and new format (data.data.messengerMessagesBySyncToken)
        let rawMessages = data.included?.filter(item => 
          item.$type === 'com.linkedin.messenger.Message'
        ) || [];
        
        // New Dash format
        if (data.data?.messengerMessagesBySyncToken?.elements) {
          rawMessages = data.data.messengerMessagesBySyncToken.elements;
        }
        
        const messages = rawMessages.map(msg => {
          // Extract attachments from renderContent
          const attachments = [];
          for (const content of (msg.renderContent || [])) {
            if (content.vectorImage?.rootUrl) {
              attachments.push({
                type: 'image',
                url: content.vectorImage.rootUrl,
                asset: content.vectorImage.digitalmediaAsset
              });
            }
            if (content.file?.url) {
              attachments.push({
                type: 'file',
                name: content.file.name || 'file',
                url: content.file.url,
                size: content.file.byteSize,
                mediaType: content.file.mediaType
              });
            }
            if (content.audio?.url) {
              attachments.push({
                type: 'audio',
                url: content.audio.url,
                duration: content.audio.duration // in milliseconds
              });
            }
            if (content.video?.progressiveStreams?.[0]) {
              attachments.push({
                type: 'video',
                url: content.video.progressiveStreams[0].streamingLocations?.[0]?.url
              });
            }
          }
          
          return {
            entityUrn: msg.entityUrn,
            body: msg.body?.text || '',
            createdAt: msg.deliveredAt || msg.createdAt,
            sender: msg['*sender'] || msg.sender?.entityUrn,
            senderName: msg.sender?.participantType?.member?.firstName?.text,
            attachments: attachments.length > 0 ? attachments : undefined
          };
        });
        
        if (messages.length > 0) {
          console.log(`💬 Fetched ${messages.length} messages via GraphQL (queryId: ${queryId.substring(0, 25)}...)`);
          return { messages };
        }
      } catch (e) {
        console.warn(`GraphQL messages failed with ${queryId.substring(0, 25)}...:`, e.message);
      }
    }
  }
  
  // Fallback to legacy REST API (doesn't need queryId)
  try {
    const legacyUrn = encodeURIComponent(fullConversationUrn);
    const endpoint = `/voyager/api/messaging/conversations/${legacyUrn}/events?count=${count}`;
    
    const data = await makeLinkedInRequest(endpoint);
    
    const messages = (data.elements || []).map(msg => ({
      entityUrn: msg.entityUrn,
      body: msg.eventContent?.['com.linkedin.voyager.messaging.event.MessageEvent']?.body || '',
      createdAt: msg.createdAt,
      sender: msg.from?.['com.linkedin.voyager.messaging.MessagingMember']?.miniProfile?.entityUrn
    }));
    
    console.log(`💬 Fetched ${messages.length} messages via legacy API`);
    return { messages };
  } catch (e) {
    console.error('Legacy messages API also failed:', e.message);
    return { messages: [] };
  }
}

// =====================
// MESSAGE HANDLERS
// =====================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('📨 Background received:', message.type);
  
  switch (message.type) {
    case 'FETCH_ALL_CONVERSATIONS':
      (async () => {
        try {
          const userUrn = await getMailboxUrn();
          const data = await fetchConversations();
          sendResponse({ ok: true, data, userUrn });
        } catch (err) {
          sendResponse({ ok: false, error: err.message });
        }
      })();
      return true;
      
    case 'FETCH_MESSAGES':
      fetchMessages(message.conversationUrn, message.count)
        .then(data => sendResponse({ ok: true, data }))
        .catch(err => sendResponse({ ok: false, error: err.message }));
      return true;
      
    case 'SYNC_TO_SERVER':
      syncToServer(message.apiUrl, message.data)
        .then(result => sendResponse({ ok: true, result }))
        .catch(err => sendResponse({ ok: false, error: err.message }));
      return true;
      
    case 'GET_QUERY_IDS':
      sendResponse({
        queryIds: discoveredQueryIds,
        hasConversations: discoveredQueryIds.conversations?.length > 0,
        hasMessages: discoveredQueryIds.messages?.length > 0,
        conversationsCount: discoveredQueryIds.conversations?.length || 0,
        messagesCount: discoveredQueryIds.messages?.length || 0,
      });
      break;
      
    case 'SEND_MESSAGE':
      sendMessage(message.conversationUrn, message.text)
        .then(result => sendResponse({ ok: true, result }))
        .catch(err => sendResponse({ ok: false, error: err.message }));
      return true;
      
    default:
      sendResponse({ error: 'Unknown message type' });
  }
});

async function syncToServer(apiUrl, data) {
  const response = await fetch(`${apiUrl}/api/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  
  if (!response.ok) {
    throw new Error(`Server error: ${response.status}`);
  }
  
  return response.json();
}

// =====================
// SEND MESSAGE via LinkedIn Dash API
// =====================

async function sendMessage(conversationUrn, messageText) {
  const cookies = await getLinkedInCookies();
  const csrfToken = cookies['JSESSIONID']?.replace(/"/g, '');
  
  if (!csrfToken) {
    throw new Error('No CSRF token. Visit LinkedIn first.');
  }
  
  const userUrn = await getMailboxUrn();
  if (!userUrn) throw new Error('Could not get mailbox URN');
  
  // Generate unique tokens
  const originToken = crypto.randomUUID();
  const trackingBytes = new Uint8Array(16);
  crypto.getRandomValues(trackingBytes);
  const trackingId = String.fromCharCode.apply(null, trackingBytes);
  
  const body = {
    message: {
      body: {
        attributes: [],
        text: messageText
      },
      renderContentUnions: [],
      conversationUrn: conversationUrn,
      originToken: originToken
    },
    mailboxUrn: userUrn,
    trackingId: trackingId,
    dedupeByClientGeneratedToken: false
  };
  
  const url = 'https://www.linkedin.com/voyager/api/voyagerMessagingDashMessengerMessages?action=createMessage';
  
  console.log('📤 Sending message via Dash API to:', conversationUrn);
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'content-type': 'application/json',
      'csrf-token': csrfToken, // JSESSIONID already contains "ajax:" prefix
      'x-restli-protocol-version': '2.0.0',
      'x-li-lang': 'fr_FR',
      'x-li-track': JSON.stringify({
        clientVersion: '1.13.42216',
        mpVersion: '1.13.42216',
        osName: 'web',
        timezoneOffset: 1,
        deviceFormFactor: 'DESKTOP',
        mpName: 'voyager-web'
      }),
    },
    body: JSON.stringify(body),
  });
  
  if (!response.ok) {
    const text = await response.text();
    console.error('Send failed:', response.status, text);
    throw new Error(`Failed to send message: ${response.status}`);
  }
  
  const data = await response.json();
  console.log('✅ Message sent successfully!', data.value?.entityUrn);
  return data;
}

// Initial setup
getLinkedInCookies().then(cookies => {
  if (cookies.JSESSIONID) {
    console.log('🔑 CSRF token ready');
  }
});
