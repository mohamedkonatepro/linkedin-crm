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
    // The miniProfile contains the URN
    const profileUrn = meData.miniProfile?.entityUrn || meData.entityUrn;
    if (profileUrn) {
      // Convert from urn:li:fs_miniProfile to urn:li:fsd_profile
      mailboxUrn = profileUrn.replace('fs_miniProfile', 'fsd_profile');
      console.log('📋 Got mailbox URN:', mailboxUrn);
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
    
    // New GraphQL endpoint (LinkedIn changed their API!)
    const queryId = 'messengerConversations.9501074288a12f3ae9e3c7ea243bccbf';
    const variables = `(query:(predicateUnions:List((conversationCategoryPredicate:(category:INBOX)))),count:${count},mailboxUrn:${encodeURIComponent(userUrn)})`;
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
  let start = 0;
  const count = 40; // LinkedIn's max per request
  let total = Infinity;
  
  while (start < total) {
    const result = await fetchConversations(start, count);
    allConversations.push(...result.conversations);
    total = result.total;
    start += count;
    
    if (onProgress) {
      onProgress({
        fetched: allConversations.length,
        total,
        percent: Math.round((allConversations.length / total) * 100),
      });
    }
    
    // Rate limiting - wait between requests
    await delay(500 + Math.random() * 500);
  }
  
  return allConversations;
}

async function fetchMessages(conversationUrn, createdBefore = null, count = 20) {
  // Extract conversation ID from URN
  const convId = conversationUrn.replace('urn:li:msg_conversation:', '');
  
  let endpoint = `/voyager/api/messaging/conversations/${encodeURIComponent(conversationUrn)}/events?keyVersion=LEGACY_INBOX&count=${count}`;
  
  if (createdBefore) {
    endpoint += `&createdBefore=${createdBefore}`;
  }
  
  try {
    const data = await makeLinkedInRequest(endpoint);
    console.log('💬 Fetched messages for', convId, ':', data);
    
    // Store messages
    if (data.elements) {
      for (const msg of data.elements) {
        capturedData.messages.set(msg.entityUrn, msg);
      }
    }
    
    return {
      messages: data.elements || [],
      paging: data.paging,
    };
  } catch (e) {
    console.error('❌ Error fetching messages:', e);
    throw e;
  }
}

async function fetchAllMessages(conversationUrn, onProgress) {
  const allMessages = [];
  let createdBefore = null;
  const count = 40;
  let hasMore = true;
  
  while (hasMore) {
    const result = await fetchMessages(conversationUrn, createdBefore, count);
    
    if (result.messages.length === 0) {
      hasMore = false;
    } else {
      allMessages.push(...result.messages);
      
      // Get the oldest message's timestamp for pagination
      const oldestMsg = result.messages[result.messages.length - 1];
      createdBefore = oldestMsg.createdAt;
      
      if (result.messages.length < count) {
        hasMore = false;
      }
    }
    
    if (onProgress) {
      onProgress({
        fetched: allMessages.length,
        conversationUrn,
      });
    }
    
    // Rate limiting
    await delay(300 + Math.random() * 300);
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

// Initial cookie capture
getLinkedInCookies().then(cookies => {
  if (cookies.JSESSIONID) {
    linkedInAuth.csrfToken = cookies.JSESSIONID.replace(/"/g, '');
    linkedInAuth.lastUpdated = Date.now();
    console.log('🔑 Initial CSRF token captured from cookies');
  }
});
