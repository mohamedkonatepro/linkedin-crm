/**
 * LinkedIn CRM - Background Service Worker
 * Intercepts LinkedIn API requests to capture conversations and messages
 */

// Storage for captured data
let linkedInAuth = {
  csrfToken: null,
  cookies: null,
  lastUpdated: null,
};

let capturedData = {
  conversations: new Map(),
  messages: new Map(),
  profiles: new Map(),
};

// Auto-discovered queryIds from LinkedIn's own requests
let discoveredQueryIds = {
  conversations: null,  // messengerConversations.xxxxx
  messages: null,       // messengerMessages.xxxxx
  mailboxCounts: null,  // messengerMailboxCounts.xxxxx
  lastUpdated: null,
};

// LinkedIn API endpoints we care about
const API_PATTERNS = {
  conversations: /\/voyager\/api\/messaging\/conversations/,
  messages: /\/voyager\/api\/messaging\/conversations\/[^/]+\/events/,
  profile: /\/voyager\/api\/identity\/profiles/,
  graphql: /\/voyager\/api\/graphql/,
};

// =====================
// NETWORK INTERCEPTION
// =====================

// Listen for web requests to LinkedIn API
chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    // Capture auth headers
    const headers = {};
    for (const header of details.requestHeaders || []) {
      headers[header.name.toLowerCase()] = header.value;
      
      // Capture CSRF token
      if (header.name.toLowerCase() === 'csrf-token') {
        linkedInAuth.csrfToken = header.value;
        linkedInAuth.lastUpdated = Date.now();
        console.log('🔑 Captured CSRF token');
      }
    }
    
    // Auto-discover queryIds from LinkedIn's own requests
    if (details.url.includes('voyagerMessagingGraphQL/graphql')) {
      const url = new URL(details.url);
      const queryId = url.searchParams.get('queryId');
      
      if (queryId) {
        if (queryId.startsWith('messengerConversations.')) {
          discoveredQueryIds.conversations = queryId;
          discoveredQueryIds.lastUpdated = Date.now();
          console.log('🔍 Auto-discovered conversations queryId:', queryId);
        } else if (queryId.startsWith('messengerMessages.')) {
          discoveredQueryIds.messages = queryId;
          discoveredQueryIds.lastUpdated = Date.now();
          console.log('🔍 Auto-discovered messages queryId:', queryId);
        } else if (queryId.startsWith('messengerMailboxCounts.')) {
          discoveredQueryIds.mailboxCounts = queryId;
          discoveredQueryIds.lastUpdated = Date.now();
          console.log('🔍 Auto-discovered mailboxCounts queryId:', queryId);
        }
        
        // Persist discovered queryIds
        chrome.storage.local.set({ discoveredQueryIds });
      }
    }
    
    // Log API calls
    if (isLinkedInAPI(details.url)) {
      console.log('📤 LinkedIn API Request:', details.method, details.url);
    }
  },
  { urls: ["https://*.linkedin.com/*"] },
  ["requestHeaders"]
);

// Listen for responses to capture data
chrome.webRequest.onCompleted.addListener(
  async (details) => {
    if (!isLinkedInAPI(details.url)) return;
    
    // We can't read response body directly with webRequest API
    // But we log the URLs for analysis
    console.log('📥 LinkedIn API Response:', details.statusCode, details.url);
    
    // Notify content script to capture the data from the page
    notifyContentScript(details);
  },
  { urls: ["https://*.linkedin.com/*"] }
);

function isLinkedInAPI(url) {
  return url.includes('/voyager/api/') || url.includes('/flagship/');
}

function notifyContentScript(details) {
  // Send message to content script about the API call
  chrome.tabs.query({ url: "https://www.linkedin.com/*" }, (tabs) => {
    for (const tab of tabs) {
      chrome.tabs.sendMessage(tab.id, {
        type: 'API_DETECTED',
        url: details.url,
        method: details.method,
        statusCode: details.statusCode,
      }).catch(() => {}); // Ignore errors if content script not loaded
    }
  });
}

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

async function makeLinkedInRequest(endpoint, options = {}) {
  const cookies = await getLinkedInCookies();
  
  // Build cookie string
  const cookieString = Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
  
  // Get CSRF token from cookies
  const csrfToken = cookies['JSESSIONID']?.replace(/"/g, '') || linkedInAuth.csrfToken;
  
  if (!csrfToken) {
    throw new Error('No CSRF token available. Visit LinkedIn first.');
  }
  
  const headers = {
    'accept': 'application/vnd.linkedin.normalized+json+2.1',
    'accept-language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
    'csrf-token': csrfToken,
    'x-li-lang': 'fr_FR',
    'x-li-page-instance': 'urn:li:page:messaging_thread_detail;' + generateUUID(),
    'x-li-track': JSON.stringify({
      clientVersion: '1.13.8752',
      mpVersion: '1.13.8752',
      osName: 'web',
      timezoneOffset: -1,
      timezone: 'Europe/Paris',
      deviceFormFactor: 'DESKTOP',
      mpName: 'voyager-web'
    }),
    'x-restli-protocol-version': '2.0.0',
    ...options.headers,
  };
  
  const url = endpoint.startsWith('http') 
    ? endpoint 
    : `https://www.linkedin.com${endpoint}`;
  
  console.log('🌐 Making LinkedIn API request:', url);
  
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body,
    credentials: 'include',
  });
  
  if (!response.ok) {
    throw new Error(`LinkedIn API error: ${response.status} ${response.statusText}`);
  }
  
  return response.json();
}

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// =====================
// API METHODS
// =====================

// Store mailbox URN (user's profile URN)
let mailboxUrn = null;

async function getMailboxUrn() {
  if (mailboxUrn) return mailboxUrn;
  
  // Get current user's profile URN via /me endpoint
  try {
    const meData = await makeLinkedInRequest('/voyager/api/me');
    
    // Try multiple places where the URN might be
    // 1. In included array (most reliable)
    const miniProfile = meData.included?.find(item => 
      item.$type === 'com.linkedin.voyager.identity.shared.MiniProfile'
    );
    
    // 2. dashEntityUrn is the fsd_profile format we need
    const dashUrn = miniProfile?.dashEntityUrn;
    
    // 3. Or convert from fs_miniProfile format
    const fsUrn = miniProfile?.entityUrn || meData.data?.['*miniProfile'];
    
    if (dashUrn) {
      mailboxUrn = dashUrn;
    } else if (fsUrn) {
      // Convert from urn:li:fs_miniProfile to urn:li:fsd_profile
      mailboxUrn = fsUrn.replace('fs_miniProfile', 'fsd_profile');
    }
    
    if (mailboxUrn) {
      console.log('📋 Got mailbox URN:', mailboxUrn);
    } else {
      console.error('❌ Could not extract mailbox URN from:', meData);
    }
    
    return mailboxUrn;
  } catch (e) {
    console.error('❌ Error getting mailbox URN:', e);
    return null;
  }
}

async function fetchConversations(start = 0, count = 20) {
  // First, try the new GraphQL endpoint
  try {
    const userUrn = await getMailboxUrn();
    if (!userUrn) {
      throw new Error('Could not get mailbox URN');
    }
    
    // Use auto-discovered queryId, fallback to last known working one
    const queryId = discoveredQueryIds.conversations || 'messengerConversations.0d5e6781bbee71c3e51c8843c6519f48';
    console.log('📬 Using conversations queryId:', queryId, discoveredQueryIds.conversations ? '(auto-discovered)' : '(fallback)');
    
    const variables = `(mailboxUrn:${encodeURIComponent(userUrn)})`;
    const endpoint = `/voyager/api/voyagerMessagingGraphQL/graphql?queryId=${queryId}&variables=${variables}`;
    
    const data = await makeLinkedInRequest(endpoint);
    console.log('📬 Fetched conversations (GraphQL):', data);
    
    // Parse GraphQL response - conversations are in data.included
    const conversations = data.included?.filter(item => 
      item.$type === 'com.linkedin.messenger.Conversation'
    ) || [];
    
    // Also get participant info
    const participants = data.included?.filter(item =>
      item.$type === 'com.linkedin.messenger.MessagingParticipant' ||
      item.$type === 'com.linkedin.voyager.dash.identity.profile.Profile'
    ) || [];
    
    // Store in cache
    for (const conv of conversations) {
      capturedData.conversations.set(conv.entityUrn || conv['*conversation'], conv);
    }
    
    return {
      conversations: conversations,
      participants: participants,
      paging: data.data?.messengerConversationsByCategoryConnection?.paging,
      total: conversations.length,
    };
  } catch (graphqlError) {
    console.warn('⚠️ GraphQL failed, trying legacy endpoint:', graphqlError.message);
    
    // Fallback to legacy endpoint (might still work in some cases)
    const endpoint = `/voyager/api/messaging/conversations?keyVersion=LEGACY_INBOX&start=${start}&count=${count}`;
    
    try {
      const data = await makeLinkedInRequest(endpoint);
      console.log('📬 Fetched conversations (legacy):', data);
      
      if (data.elements) {
        for (const conv of data.elements) {
          capturedData.conversations.set(conv.entityUrn, conv);
        }
      }
      
      return {
        conversations: data.elements || [],
        paging: data.paging,
        total: data.paging?.total || 0,
      };
    } catch (e) {
      console.error('❌ Error fetching conversations:', e);
      throw e;
    }
  }
}

async function fetchAllConversations(onProgress) {
  const allConversations = [];
  const count = 25; // LinkedIn's max per request (was 40, now 25 for GraphQL)
  
  // For GraphQL, we use cursor-based pagination
  // For now, just fetch first batch (will add cursor support later)
  const result = await fetchConversations(0, count);
  allConversations.push(...result.conversations);
  
  if (onProgress) {
    onProgress({
      fetched: allConversations.length,
      total: allConversations.length,
      percent: 100,
    });
  }
  
  return allConversations;
}

async function fetchMessages(conversationUrn, createdBefore = null, count = 100) {
  console.log('💬 Fetching messages for:', conversationUrn);
  
  // Use auto-discovered queryId, fallback to last known working one
  const queryId = discoveredQueryIds.messages || 'messengerMessages.5846eeb71c981f11e0134cb6626cc314';
  console.log('💬 Using messages queryId:', queryId, discoveredQueryIds.messages ? '(auto-discovered)' : '(fallback)');
  
  const endpoint = `/voyager/api/voyagerMessagingGraphQL/graphql?queryId=${queryId}&variables=(conversationUrn:${encodeURIComponent(conversationUrn)})`;
  
  try {
    const data = await makeLinkedInRequest(endpoint);
    console.log('💬 Fetched messages (GraphQL):', data);
    
    // Parse GraphQL response - messages are in included
    const messages = (data.included || []).filter(item => 
      item.$type === 'com.linkedin.messenger.Message'
    );
    
    // Store messages with correct body extraction
    for (const msg of messages) {
      // Extract text from body.text (GraphQL format)
      const msgData = {
        ...msg,
        body: msg.body?.text || msg.body || '',  // body.text is the actual content
        createdAt: msg.deliveredAt || msg.createdAt
      };
      capturedData.messages.set(msg.entityUrn, msgData);
    }
    
    // Return parsed messages
    const parsedMessages = messages.map(msg => ({
      entityUrn: msg.entityUrn,
      body: msg.body?.text || '',
      createdAt: msg.deliveredAt || msg.createdAt,
      sender: msg['*sender'],
      conversation: msg['*conversation']
    }));
    
    return {
      messages: parsedMessages,
      paging: null, // GraphQL uses different pagination
    };
  } catch (e) {
    console.error('❌ Error fetching messages:', e);
    throw e;
  }
}

async function fetchAllMessages(conversationUrn, onProgress) {
  // For GraphQL, we get all messages in one call (up to 100)
  const result = await fetchMessages(conversationUrn);
  const allMessages = result.messages;
  
  if (onProgress) {
    onProgress({ fetched: allMessages.length });
  }
  
  return allMessages;
}

async function sendMessage(conversationUrn, text) {
  const endpoint = `/voyager/api/messaging/conversations/${encodeURIComponent(conversationUrn)}/events`;
  
  const body = {
    eventCreate: {
      value: {
        'com.linkedin.voyager.messaging.create.MessageCreate': {
          body: text,
          attachments: [],
          attributedBody: {
            text: text,
            attributes: [],
          },
        },
      },
    },
  };
  
  try {
    const data = await makeLinkedInRequest(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    
    console.log('✉️ Message sent:', data);
    return data;
  } catch (e) {
    console.error('❌ Error sending message:', e);
    throw e;
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// =====================
// MESSAGE HANDLERS
// =====================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('📨 Background received:', message.type);
  
  switch (message.type) {
    case 'GET_AUTH_STATUS':
      sendResponse({
        hasAuth: !!linkedInAuth.csrfToken,
        lastUpdated: linkedInAuth.lastUpdated,
      });
      break;
      
    case 'GET_QUERY_IDS':
      sendResponse({
        queryIds: discoveredQueryIds,
        hasConversations: !!discoveredQueryIds.conversations,
        hasMessages: !!discoveredQueryIds.messages,
      });
      break;
      
    case 'FETCH_CONVERSATIONS':
      fetchConversations(message.start || 0, message.count || 20)
        .then(data => sendResponse({ ok: true, data }))
        .catch(err => sendResponse({ ok: false, error: err.message }));
      return true;
      
    case 'FETCH_ALL_CONVERSATIONS':
      fetchAllConversations((progress) => {
        // Send progress updates
        chrome.runtime.sendMessage({ type: 'FETCH_PROGRESS', progress });
      })
        .then(data => sendResponse({ ok: true, data }))
        .catch(err => sendResponse({ ok: false, error: err.message }));
      return true;
      
    case 'FETCH_MESSAGES':
      fetchMessages(message.conversationUrn, message.createdBefore, message.count)
        .then(data => sendResponse({ ok: true, data }))
        .catch(err => sendResponse({ ok: false, error: err.message }));
      return true;
      
    case 'FETCH_ALL_MESSAGES':
      fetchAllMessages(message.conversationUrn, (progress) => {
        chrome.runtime.sendMessage({ type: 'FETCH_PROGRESS', progress });
      })
        .then(data => sendResponse({ ok: true, data }))
        .catch(err => sendResponse({ ok: false, error: err.message }));
      return true;
      
    case 'SEND_MESSAGE':
      sendMessage(message.conversationUrn, message.text)
        .then(data => sendResponse({ ok: true, data }))
        .catch(err => sendResponse({ ok: false, error: err.message }));
      return true;
      
    case 'GET_CAPTURED_DATA':
      sendResponse({
        conversations: Array.from(capturedData.conversations.values()),
        messages: Array.from(capturedData.messages.values()),
        profiles: Array.from(capturedData.profiles.values()),
      });
      break;
      
    case 'SYNC_TO_SERVER':
      syncToServer(message.apiUrl, message.data)
        .then(result => sendResponse({ ok: true, result }))
        .catch(err => sendResponse({ ok: false, error: err.message }));
      return true;
      
    case 'API_REQUEST':
      // Legacy support for content script API requests
      syncToServer(message.url.replace('/api/sync', ''), message.body)
        .then(result => sendResponse({ ok: true, data: result }))
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
// INITIALIZATION
// =====================

console.log('🚀 LinkedIn CRM Background Script loaded');

// Load persisted queryIds from storage
chrome.storage.local.get(['discoveredQueryIds'], (result) => {
  if (result.discoveredQueryIds) {
    discoveredQueryIds = { ...discoveredQueryIds, ...result.discoveredQueryIds };
    console.log('📦 Loaded persisted queryIds:', discoveredQueryIds);
  }
});

// Initial cookie capture
getLinkedInCookies().then(cookies => {
  if (cookies.JSESSIONID) {
    linkedInAuth.csrfToken = cookies.JSESSIONID.replace(/"/g, '');
    linkedInAuth.lastUpdated = Date.now();
    console.log('🔑 Initial CSRF token captured from cookies');
  }
});
