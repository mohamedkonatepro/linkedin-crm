/**
 * LinkedIn CRM Sync - Background Service Worker
 * Handles LinkedIn API calls and server communication
 * Includes intelligent polling for real-time backup
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

// =====================
// SYNC CONFIG (no polling)
// =====================

const SYNC_CONFIG = {
  conversationLimit: 50,  // Max conversations to sync
  messageLimit: 30,       // Max messages per conversation
  crmServerUrl: null,     // Auto-detected from CRM origin
  lastMessageTimestamp: null,  // For tracking new messages
};

// Track seen messages to avoid duplicates
const seenMessageUrns = new Set();

// Load persisted state on startup
chrome.storage.local.get(['discoveredQueryIds', 'pollingConfig', 'seenMessageUrns'], (result) => {
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
  
  if (result.pollingConfig) {
    Object.assign(SYNC_CONFIG, result.pollingConfig);
    console.log('📦 Loaded polling config:', SYNC_CONFIG);
  }
  
  if (result.seenMessageUrns && Array.isArray(result.seenMessageUrns)) {
    result.seenMessageUrns.forEach(urn => seenMessageUrns.add(urn));
    console.log('📦 Loaded', seenMessageUrns.size, 'seen message URNs');
  }
});

// =====================
// ON-DEMAND SYNC (No polling)
// =====================

let crmIsActive = false;  // Track if CRM is open

async function pollForNewMessages() {
  if (!discoveredQueryIds.conversations?.length) {
    console.log('⏳ Polling: No queryIds yet, waiting...');
    return;
  }

  try {
    console.log('🔄 Checking for new messages...');

    // Get userUrn to detect isFromMe
    const userUrn = await getMailboxUrn();
    const myProfileId = userUrn?.split(':').pop()?.split(',')[0];

    // Fetch recent conversations to check for new activity
    const conversations = await fetchConversations();

    // Only fetch messages for conversations with recent activity
    const recentConvs = conversations.slice(0, 10); // Top 10 most recent
    const newMessages = [];

    for (const conv of recentConvs) {
      // Check if this conversation has newer activity than our last poll
      if (SYNC_CONFIG.lastMessageTimestamp &&
          conv.lastActivityAt <= SYNC_CONFIG.lastMessageTimestamp) {
        continue;
      }

      try {
        const result = await fetchMessages(conv.entityUrn || conv._fullUrn, 5);

        for (const msg of result.messages || []) {
          if (!seenMessageUrns.has(msg.entityUrn)) {
            seenMessageUrns.add(msg.entityUrn);
            // Detect isFromMe by comparing sender with userUrn
            const isFromMe = myProfileId && msg.sender ? msg.sender.includes(myProfileId) : false;
            newMessages.push({
              ...msg,
              isFromMe,
              conversationUrn: conv.entityUrn || conv._fullUrn,
              participantName: conv._participantName
            });
          }
        }
      } catch (e) {
        console.warn('Error fetching messages for', conv._participantName, ':', e.message);
      }

      // Small delay between conversations
      await new Promise(r => setTimeout(r, 300));
    }
    
    // Update last message timestamp
    if (conversations.length > 0) {
      SYNC_CONFIG.lastMessageTimestamp = Math.max(
        ...conversations.map(c => c.lastActivityAt || 0)
      );
    }
    
    // If new messages found, notify CRM
    if (newMessages.length > 0) {
      console.log(`⚡ Polling: Found ${newMessages.length} new message(s)`);
      
      // Send to CRM server
      await notifyCRMServer(newMessages);
      
      // Persist seen URNs (keep last 1000)
      const urnsToSave = Array.from(seenMessageUrns).slice(-1000);
      chrome.storage.local.set({ seenMessageUrns: urnsToSave });
    } else {
      console.log('✓ Polling: No new messages');
    }
    
  } catch (e) {
    console.error('❌ Polling error:', e.message);
  }
}

async function notifyCRMServer(messages) {
  if (!SYNC_CONFIG.crmServerUrl) {
    console.log('⏸️ CRM URL not set, skipping server notification');
    return;
  }
  
  try {
    const response = await fetch(`${SYNC_CONFIG.crmServerUrl}/api/realtime`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'new_messages',
        messages: messages.map(msg => ({
          urn: msg.entityUrn,
          conversationId: msg.conversationUrn,
          content: msg.body || '',
          timestamp: msg.createdAt ? new Date(msg.createdAt).toISOString() : new Date().toISOString(),
          sender: msg.sender,
          participantName: msg.participantName,
          attachments: msg.attachments || null,
          isFromMe: msg.isFromMe || false
        })),
        timestamp: new Date().toISOString()
      })
    });

    if (response.ok) {
      console.log('✅ Notified CRM server of new messages');
    }
  } catch (e) {
    console.warn('Could not notify CRM server:', e.message);
  }
}

// DON'T start polling automatically - wait for CRM to signal it's active
// startPolling();
console.log('🔌 Extension ready - waiting for CRM to connect');

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

async function fetchConversations(count = 100) {
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
      // Try with count parameter for pagination
      const variables = `(mailboxUrn:${encodeURIComponent(userUrn)},count:${count})`;
      const endpoint = `/voyager/api/voyagerMessagingGraphQL/graphql?queryId=${queryId}&variables=${variables}`;
      console.log(`🔍 Trying with count=${count}:`, endpoint.substring(0, 120));
      
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
    case 'REALTIME_MESSAGES':
      // Messages from WebSocket interception in content script
      (async () => {
        const newMessages = [];
        for (const msg of message.messages || []) {
          if (!seenMessageUrns.has(msg.entityUrn)) {
            seenMessageUrns.add(msg.entityUrn);
            newMessages.push(msg);
          }
        }
        if (newMessages.length > 0) {
          console.log(`⚡ WebSocket: ${newMessages.length} new message(s) from content script`);
          await notifyCRMServer(newMessages);
        }
        sendResponse({ ok: true, count: newMessages.length });
      })();
      return true;
      
    case 'REALTIME_STATUS':
      // WebSocket connection status from content script
      console.log('📡 WebSocket status:', message.connected ? 'CONNECTED' : 'DISCONNECTED');
      
      // If WebSocket disconnected, check for missed messages
      if (!message.connected && crmIsActive) {
        console.log('⚡ WebSocket disconnected while CRM active - checking for missed messages');
        setTimeout(pollForNewMessages, 2000);
      }
      sendResponse({ ok: true });
      break;
      
    case 'SET_SYNC_CONFIG':
      Object.assign(SYNC_CONFIG, message.config);
      chrome.storage.local.set({ pollingConfig: SYNC_CONFIG });
      if (message.config.enabled !== undefined) {
        if (message.config.enabled) {
          startPolling();
        } else if (pollingInterval) {
          clearInterval(pollingInterval);
          pollingInterval = null;
        }
      }
      sendResponse({ ok: true, config: SYNC_CONFIG });
      break;
      
    case 'GET_POLLING_STATUS':
      sendResponse({
        ok: true,
        config: SYNC_CONFIG,
        isPolling: !!pollingInterval,
        seenCount: seenMessageUrns.size
      });
      break;
      
    case 'FORCE_POLL':
      pollForNewMessages()
        .then(() => sendResponse({ ok: true }))
        .catch(err => sendResponse({ ok: false, error: err.message }));
      return true;
      
    case 'CRM_ACTIVE':
      // CRM just opened - trigger initial sync (NO polling)
      console.log('🟢 CRM is now ACTIVE - triggering initial sync');
      crmIsActive = true;
      
      // Store CRM URL from message
      if (message.crmUrl) {
        SYNC_CONFIG.crmServerUrl = message.crmUrl;
        console.log('📍 CRM URL set to:', message.crmUrl);
      }
      (async () => {
        try {
          // Load user config from storage (popup settings)
          const stored = await chrome.storage.local.get(['convLimit', 'msgLimit']);
          const convLimit = stored.convLimit || SYNC_CONFIG.conversationLimit;
          const msgLimit = stored.msgLimit || SYNC_CONFIG.messageLimit;
          console.log(`📊 Sync limits: ${convLimit} conv, ${msgLimit} msg/conv`);
          
          // Do an immediate full sync
          const userUrn = await getMailboxUrn();
          const conversations = await fetchConversations(convLimit);
          
          // Fetch messages for top conversations
          const allMessages = [];
          for (const conv of conversations.slice(0, convLimit)) {
            try {
              const result = await fetchMessages(conv.entityUrn || conv._fullUrn, msgLimit);
              const myProfileId = userUrn?.split(':').pop()?.split(',')[0];
              
              for (const msg of result.messages || []) {
                const isFromMe = myProfileId && msg.sender ? msg.sender.includes(myProfileId) : false;
                allMessages.push({
                  ...msg,
                  isFromMe,
                  conversationUrn: conv.entityUrn || conv._fullUrn
                });
              }
            } catch (e) {
              console.warn('Error fetching messages for', conv._participantName);
            }
            await new Promise(r => setTimeout(r, 150));
          }
          
          // Send to CRM server (skip if URL not set)
          if (!SYNC_CONFIG.crmServerUrl) {
            console.warn('⚠️ CRM URL not set');
            sendResponse({ ok: true, conversations: conversations.length, messages: allMessages.length });
            return;
          }
          
          await fetch(`${SYNC_CONFIG.crmServerUrl}/api/sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'initial_sync',
              timestamp: new Date().toISOString(),
              conversations: conversations.map(c => ({
                threadId: c.entityUrn || c._fullUrn,
                linkedinId: c._participantId,
                name: c._participantName || 'Unknown',
                avatarUrl: c._participantPicture || null,
                headline: c._participantHeadline || '',
                lastMessageTime: c.lastActivityAt ? new Date(c.lastActivityAt).toISOString() : null,
                isUnread: (c.unreadCount || 0) > 0
              })),
              messages: allMessages.map(msg => ({
                urn: msg.entityUrn,
                conversationId: msg.conversationUrn,
                content: msg.body || '',
                timestamp: msg.createdAt ? new Date(msg.createdAt).toISOString() : new Date().toISOString(),
                isFromMe: msg.isFromMe || false,
                attachments: msg.attachments || null
              }))
            })
          });
          
          // NO polling - WebSocket handles realtime
          console.log('✅ Initial sync complete:', conversations.length, 'conversations,', allMessages.length, 'messages');
          sendResponse({ ok: true, conversations: conversations.length, messages: allMessages.length });
        } catch (err) {
          console.error('❌ Initial sync failed:', err);
          sendResponse({ ok: false, error: err.message });
        }
      })();
      return true;
      
    case 'CRM_INACTIVE':
      // CRM closed - mark as inactive
      console.log('🔴 CRM is now INACTIVE');
      crmIsActive = false;
      sendResponse({ ok: true });
      break;
      
    case 'FULL_SYNC':
      // Manual sync request from CRM
      console.log('🔄 Full sync requested by CRM');
      (async () => {
        try {
          // Load user config from storage (popup settings)
          const stored = await chrome.storage.local.get(['convLimit', 'msgLimit']);
          const convLimit = stored.convLimit || SYNC_CONFIG.conversationLimit;
          const msgLimit = stored.msgLimit || SYNC_CONFIG.messageLimit;
          console.log(`📊 Sync limits: ${convLimit} conv, ${msgLimit} msg/conv`);
          
          const userUrn = await getMailboxUrn();
          const conversations = await fetchConversations(convLimit);
          
          // Fetch messages for each conversation
          const allMessages = [];
          for (const conv of conversations.slice(0, convLimit)) {
            try {
              const result = await fetchMessages(conv.entityUrn || conv._fullUrn, msgLimit);
              const myProfileId = userUrn?.split(':').pop()?.split(',')[0];
              
              for (const msg of result.messages || []) {
                const isFromMe = myProfileId && msg.sender ? msg.sender.includes(myProfileId) : false;
                allMessages.push({
                  ...msg,
                  isFromMe,
                  conversationUrn: conv.entityUrn || conv._fullUrn,
                  participantName: conv._participantName
                });
              }
            } catch (e) {
              console.warn('Error fetching messages for', conv._participantName);
            }
            await new Promise(r => setTimeout(r, 200));
          }
          
          // Send to CRM server (skip if URL not set)
          if (!SYNC_CONFIG.crmServerUrl) {
            console.warn('⚠️ CRM URL not set');
            sendResponse({ ok: true, conversations: conversations.length, messages: allMessages.length });
            return;
          }
          
          await fetch(`${SYNC_CONFIG.crmServerUrl}/api/sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'full_sync',
              timestamp: new Date().toISOString(),
              conversations: conversations.map(c => ({
                threadId: c.entityUrn || c._fullUrn,
                linkedinId: c._participantId,
                name: c._participantName || 'Unknown',
                avatarUrl: c._participantPicture || null,
                headline: c._participantHeadline || '',
                lastMessageTime: c.lastActivityAt ? new Date(c.lastActivityAt).toISOString() : null,
                isUnread: (c.unreadCount || 0) > 0,
                isStarred: c.starred || false
              })),
              messages: allMessages.map(msg => ({
                urn: msg.entityUrn,
                conversationId: msg.conversationUrn,
                content: msg.body || '',
                timestamp: msg.createdAt ? new Date(msg.createdAt).toISOString() : new Date().toISOString(),
                isFromMe: msg.isFromMe || false,
                attachments: msg.attachments || null
              }))
            })
          });
          
          sendResponse({ ok: true, conversations: conversations.length, messages: allMessages.length });
        } catch (err) {
          sendResponse({ ok: false, error: err.message });
        }
      })();
      return true;
      
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
      
    case 'SEND_MESSAGE_WITH_FILE':
      (async () => {
        try {
          // message.fileData is base64, convert to ArrayBuffer
          const binary = atob(message.fileData);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          
          const fileSize = bytes.length;
          const filename = message.filename;
          const mimeType = message.mimeType;
          
          // Upload file
          const { urn, mediaTypeFamily } = await uploadFile(bytes, filename, mimeType);
          
          // Send message with attachment (pass fileSize, mimeType, filename for correct format)
          const result = await sendMessageWithAttachment(
            message.conversationUrn,
            message.text || '',
            urn,
            mediaTypeFamily,
            fileSize,      // AJOUTÉ
            mimeType,      // AJOUTÉ
            filename       // AJOUTÉ
          );
          
          sendResponse({ ok: true, result });
        } catch (err) {
          sendResponse({ ok: false, error: err.message });
        }
      })();
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
// NORMALIZE CONVERSATION URN
// =====================

async function normalizeConversationUrn(conversationUrn) {
  const userUrn = await getMailboxUrn();
  if (!userUrn) throw new Error('Could not get mailbox URN');
  
  // If already in correct format, return as-is
  if (conversationUrn.includes('urn:li:msg_conversation:(')) {
    console.log('📝 ConversationUrn already normalized:', conversationUrn.substring(0, 60));
    return conversationUrn;
  }
  
  // Extract threadId from various formats
  let threadId = conversationUrn;
  
  // Format: urn:li:msg_conversation:THREAD_ID
  if (conversationUrn.startsWith('urn:li:msg_conversation:')) {
    threadId = conversationUrn.replace('urn:li:msg_conversation:', '');
  }
  // Format: urn:li:messagingThread:THREAD_ID
  else if (conversationUrn.startsWith('urn:li:messagingThread:')) {
    threadId = conversationUrn.replace('urn:li:messagingThread:', '');
  }
  
  // Build correct format: urn:li:msg_conversation:(mailboxUrn,threadId)
  const normalizedUrn = `urn:li:msg_conversation:(${userUrn},${threadId})`;
  console.log('📝 Normalized conversationUrn:', normalizedUrn.substring(0, 80));
  return normalizedUrn;
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
  
  // Normalize the conversation URN
  const normalizedConversationUrn = await normalizeConversationUrn(conversationUrn);
  
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
      conversationUrn: normalizedConversationUrn,
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

// =====================
// UPLOAD FILE to LinkedIn
// =====================

async function uploadFile(fileData, filename, mimeType) {
  const cookies = await getLinkedInCookies();
  const csrfToken = cookies['JSESSIONID']?.replace(/"/g, '');
  
  if (!csrfToken) throw new Error('No CSRF token');
  
  // Determine media type
  let mediaUploadType = 'MESSAGING_FILE_ATTACHMENT';
  let mediaTypeFamily = 'DOCUMENT';
  
  if (mimeType.startsWith('image/')) {
    mediaUploadType = 'MESSAGING_PHOTO_ATTACHMENT';
    mediaTypeFamily = 'STILLIMAGE';
  } else if (mimeType.startsWith('audio/')) {
    mediaUploadType = 'MESSAGING_VOICE_ATTACHMENT';
    mediaTypeFamily = 'AUDIO';
  }
  
  // Step 1: Init upload
  console.log('📤 Initializing upload for:', filename, 'size:', fileData.byteLength, 'type:', mediaUploadType);
  
  const initBody = {
    mediaUploadType,
    fileSize: fileData.byteLength || fileData.size,
    filename
  };
  console.log('📤 Init body:', JSON.stringify(initBody));
  
  const initResp = await fetch('https://www.linkedin.com/voyager/api/voyagerVideoDashMediaUploadMetadata?action=upload', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'accept': 'application/json',
      'content-type': 'application/json',
      'csrf-token': csrfToken,
      'x-restli-protocol-version': '2.0.0',
    },
    body: JSON.stringify(initBody)
  });
  
  if (!initResp.ok) {
    const text = await initResp.text();
    console.error('❌ Upload init failed:', initResp.status, text);
    throw new Error('Upload init failed: ' + initResp.status + ' - ' + text.substring(0, 200));
  }
  
  const initData = await initResp.json();
  console.log('📤 Init response:', JSON.stringify(initData));
  
  const uploadUrl = initData.value?.singleUploadUrl;
  const urn = initData.value?.urn;
  
  if (!uploadUrl) {
    console.error('❌ No upload URL in response:', initData);
    throw new Error('No upload URL received');
  }
  
  // Step 2: Upload the file
  console.log('📤 Uploading file to:', uploadUrl.substring(0, 80) + '...');
  const uploadResp = await fetch(uploadUrl, {
    method: 'PUT',
    credentials: 'include',
    headers: {
      'media-type-family': mediaTypeFamily,
      'csrf-token': csrfToken,
    },
    body: fileData
  });
  
  if (!uploadResp.ok) {
    const text = await uploadResp.text();
    console.error('❌ File upload failed:', uploadResp.status, text);
    throw new Error('File upload failed: ' + uploadResp.status);
  }
  
  console.log('✅ File uploaded successfully! URN:', urn);
  return { urn, mediaTypeFamily };
}

// =====================
// SEND MESSAGE WITH ATTACHMENT
// =====================

async function sendMessageWithAttachment(conversationUrn, messageText, attachmentUrn, attachmentType, fileSize, mimeType, filename) {
  const cookies = await getLinkedInCookies();
  const csrfToken = cookies['JSESSIONID']?.replace(/"/g, '');
  const userUrn = await getMailboxUrn();
  
  if (!csrfToken) throw new Error('No CSRF token');
  if (!userUrn) throw new Error('Could not get mailbox URN');
  
  // Normalize the conversation URN
  const normalizedConversationUrn = await normalizeConversationUrn(conversationUrn);
  
  // Build renderContentUnions based on attachment type
  const renderContentUnions = [];
  if (attachmentType === 'STILLIMAGE') {
    renderContentUnions.push({ vectorImage: { digitalmediaAsset: attachmentUrn } });
  } else if (attachmentType === 'DOCUMENT') {
    // IMPORTANT: Use assetUrn (not asset) + include byteSize, mediaType, name
    renderContentUnions.push({ 
      file: { 
        assetUrn: attachmentUrn,
        byteSize: fileSize || 0,
        mediaType: mimeType || 'application/octet-stream',
        name: filename || 'file'
      } 
    });
  } else if (attachmentType === 'AUDIO') {
    renderContentUnions.push({ audio: { asset: attachmentUrn } });
  }
  
  // Generate tracking ID like in sendMessage
  const trackingBytes = new Uint8Array(16);
  crypto.getRandomValues(trackingBytes);
  const trackingId = String.fromCharCode.apply(null, trackingBytes);
  
  const body = {
    message: {
      body: { attributes: [], text: messageText || '' },
      renderContentUnions,
      conversationUrn: normalizedConversationUrn,
      originToken: crypto.randomUUID()
    },
    mailboxUrn: userUrn,
    trackingId: trackingId,
    dedupeByClientGeneratedToken: false
  };
  
  console.log('📤 Sending message with attachment...', { normalizedConversationUrn, attachmentUrn, attachmentType });
  console.log('📤 Body:', JSON.stringify(body, null, 2));
  
  const response = await fetch('https://www.linkedin.com/voyager/api/voyagerMessagingDashMessengerMessages?action=createMessage', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'accept': 'application/json',
      'content-type': 'application/json',
      'csrf-token': csrfToken,  // lowercase like in sendMessage
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
    console.error('❌ Send with attachment failed:', response.status, text);
    throw new Error('Send message failed: ' + response.status + ' - ' + text.substring(0, 200));
  }
  
  const data = await response.json();
  console.log('✅ Message with attachment sent!', data.value?.entityUrn);
  return data;
}

// Initial setup
getLinkedInCookies().then(cookies => {
  if (cookies.JSESSIONID) {
    console.log('🔑 CSRF token ready');
  }
});
