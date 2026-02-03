/**
 * LinkedIn CRM Sync - Content Script
 * Uses LinkedIn API (not DOM scraping) for reliable data extraction
 * Includes WebSocket interception for real-time message detection
 */

console.log('🔌 LinkedIn CRM Content Script loaded on:', window.location.href);

// Config
let config = {
  apiUrl: 'http://localhost:3000',
  convLimit: 50,
  msgLimit: 20,
};

// Track seen message URNs to avoid duplicates
const seenMessageUrns = new Set();

// Cache the user's URN for isFromMe detection in WebSocket messages
let cachedUserUrn = null;

// Try to load cached userUrn from storage
chrome.storage.local.get(['userUrn'], (result) => {
  if (result.userUrn) {
    cachedUserUrn = result.userUrn;
    console.log('📋 Loaded cached userUrn:', cachedUserUrn?.substring(0, 30) + '...');
  }
});

// =====================
// WEBSOCKET INTERCEPTION FOR REALTIME
// =====================

function setupWebSocketInterception() {
  console.log('🔗 Setting up WebSocket interception for realtime...');
  
  const OriginalWebSocket = window.WebSocket;
  
  window.WebSocket = function(url, protocols) {
    console.log('🌐 WebSocket connecting to:', url);
    
    const ws = protocols 
      ? new OriginalWebSocket(url, protocols) 
      : new OriginalWebSocket(url);
    
    // Intercept LinkedIn realtime WebSocket
    if (url.includes('linkedin.com') || url.includes('realtime')) {
      console.log('✅ Intercepting LinkedIn WebSocket:', url);
      
      ws.addEventListener('message', (event) => {
        try {
          processWebSocketMessage(event.data);
        } catch (e) {
          // Silently ignore parsing errors
        }
      });
      
      ws.addEventListener('open', () => {
        console.log('🟢 LinkedIn WebSocket opened');
        notifyRealtimeStatus(true);
      });
      
      ws.addEventListener('close', () => {
        console.log('🔴 LinkedIn WebSocket closed');
        notifyRealtimeStatus(false);
      });
    }
    
    return ws;
  };
  
  // Preserve WebSocket prototype and static properties
  window.WebSocket.prototype = OriginalWebSocket.prototype;
  window.WebSocket.CONNECTING = OriginalWebSocket.CONNECTING;
  window.WebSocket.OPEN = OriginalWebSocket.OPEN;
  window.WebSocket.CLOSING = OriginalWebSocket.CLOSING;
  window.WebSocket.CLOSED = OriginalWebSocket.CLOSED;
  
  console.log('✅ WebSocket interception ready');
}

function processWebSocketMessage(data) {
  // LinkedIn WebSocket can send binary or text data
  let parsed = null;
  
  if (typeof data === 'string') {
    try {
      parsed = JSON.parse(data);
    } catch (e) {
      // Not JSON, might be a ping/pong or binary frame
      return;
    }
  } else if (data instanceof Blob) {
    // Handle blob data asynchronously
    data.text().then(text => {
      try {
        const blobParsed = JSON.parse(text);
        handleLinkedInRealtimeData(blobParsed);
      } catch (e) {}
    });
    return;
  } else if (data instanceof ArrayBuffer) {
    // Try to decode as UTF-8
    try {
      const decoder = new TextDecoder('utf-8');
      const text = decoder.decode(data);
      parsed = JSON.parse(text);
    } catch (e) {
      return;
    }
  }
  
  if (parsed) {
    handleLinkedInRealtimeData(parsed);
  }
}

function handleLinkedInRealtimeData(data) {
  if (!data) return;
  
  const messages = [];
  
  // LinkedIn realtime format 1: com.linkedin.messenger.Message in included
  if (data.included && Array.isArray(data.included)) {
    for (const item of data.included) {
      if (item.$type === 'com.linkedin.messenger.Message') {
        if (item.entityUrn && !seenMessageUrns.has(item.entityUrn)) {
          seenMessageUrns.add(item.entityUrn);
          messages.push(extractMessageData(item));
        }
      }
    }
  }
  
  // LinkedIn realtime format 2: direct message object
  if (data.$type === 'com.linkedin.messenger.Message') {
    if (data.entityUrn && !seenMessageUrns.has(data.entityUrn)) {
      seenMessageUrns.add(data.entityUrn);
      messages.push(extractMessageData(data));
    }
  }
  
  // LinkedIn realtime format 3: event-based (MESSAGING_EVENT)
  if (data.eventType === 'MESSAGING_EVENT' || data.type === 'MESSAGING_EVENT') {
    const msgData = data.message || data.data?.message;
    if (msgData?.entityUrn && !seenMessageUrns.has(msgData.entityUrn)) {
      seenMessageUrns.add(msgData.entityUrn);
      messages.push(extractMessageData(msgData));
    }
  }
  
  // LinkedIn realtime format 4: payload wrapper
  if (data.payload?.message) {
    const msgData = data.payload.message;
    if (msgData.entityUrn && !seenMessageUrns.has(msgData.entityUrn)) {
      seenMessageUrns.add(msgData.entityUrn);
      messages.push(extractMessageData(msgData));
    }
  }
  
  // LinkedIn realtime format 5: array of events
  if (Array.isArray(data)) {
    for (const item of data) {
      handleLinkedInRealtimeData(item);
    }
    return;
  }
  
  // If we found new messages, notify
  if (messages.length > 0) {
    console.log(`⚡ WebSocket: ${messages.length} new message(s)`, messages.map(m => m.body?.slice(0, 30)));
    notifyNewMessages(messages);
  }
}

function extractMessageData(item) {
  const sender = item['*sender'] || item.sender?.entityUrn || item.senderUrn;

  // Determine if message is from me by comparing sender with cached userUrn
  let isFromMe = false;
  if (cachedUserUrn && sender) {
    const myProfileId = cachedUserUrn.split(':').pop()?.split(',')[0];
    isFromMe = myProfileId ? sender.includes(myProfileId) : false;
  }

  return {
    entityUrn: item.entityUrn,
    body: item.body?.text || item.body || '',
    createdAt: item.deliveredAt || item.createdAt,
    sender: sender,
    isFromMe: isFromMe,
    conversationUrn: item['*conversation'] || item.conversationUrn || extractConversationUrn(item.entityUrn),
    attachments: extractAttachments(item.renderContent || item.attachments)
  };
}

function extractConversationUrn(messageUrn) {
  if (!messageUrn) return null;
  // Format: urn:li:msg_message:(profileUrn,threadId-messageId)
  const match = messageUrn.match(/urn:li:msg_message:\(([^,]+),([^-]+)/);
  if (match) {
    return `urn:li:msg_conversation:(${match[1]},${match[2]})`;
  }
  return null;
}

function extractAttachments(renderContent) {
  if (!renderContent || !Array.isArray(renderContent)) return null;
  
  const attachments = [];
  for (const content of renderContent) {
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
        size: content.file.byteSize
      });
    }
    if (content.audio?.url) {
      attachments.push({
        type: 'audio',
        url: content.audio.url,
        duration: content.audio.duration
      });
    }
  }
  
  return attachments.length > 0 ? attachments : null;
}

function notifyNewMessages(messages) {
  // Send to parent window (CRM iframe container)
  window.parent.postMessage({
    source: 'linkedin-extension',
    type: 'NEW_MESSAGES',
    messages: messages,
    timestamp: Date.now()
  }, '*');
  
  // Also notify background script for server sync
  chrome.runtime.sendMessage({
    type: 'REALTIME_MESSAGES',
    messages: messages
  }).catch(() => {});
}

function notifyRealtimeStatus(connected) {
  window.parent.postMessage({
    source: 'linkedin-extension',
    type: 'REALTIME_STATUS',
    connected: connected,
    timestamp: Date.now()
  }, '*');
  
  chrome.runtime.sendMessage({
    type: 'REALTIME_STATUS',
    connected: connected
  }).catch(() => {});
}

// Initialize WebSocket interception IMMEDIATELY (before LinkedIn loads)
setupWebSocketInterception();

// =====================
// WINDOW MESSAGE HANDLER (CRM -> Extension)
// =====================

window.addEventListener('message', async (event) => {
  if (!event.data || event.data.source !== 'linkedin-crm') return;
  
  console.log('📨 Window message from CRM:', event.data.type);
  
  if (event.data.type === 'SEND_MESSAGE') {
    try {
      let response;
      
      // Check if there's a file attached
      if (event.data.file) {
        console.log('📎 File attached:', event.data.file.name, event.data.file.type);
        response = await chrome.runtime.sendMessage({
          type: 'SEND_MESSAGE_WITH_FILE',
          conversationUrn: event.data.conversationUrn,
          text: event.data.text || '',
          fileData: event.data.file.base64,
          filename: event.data.file.name,
          mimeType: event.data.file.type
        });
      } else {
        // Text-only message
        response = await chrome.runtime.sendMessage({
          type: 'SEND_MESSAGE',
          conversationUrn: event.data.conversationUrn,
          text: event.data.text
        });
      }
      
      window.parent.postMessage({
        source: 'linkedin-extension',
        type: 'SEND_MESSAGE_RESPONSE',
        ...response
      }, '*');
    } catch (e) {
      window.parent.postMessage({
        source: 'linkedin-extension',
        type: 'SEND_MESSAGE_RESPONSE',
        ok: false,
        error: e.message
      }, '*');
    }
  }
});

// =====================
// MESSAGE HANDLERS
// =====================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('📨 Content script received:', message.type);
  
  switch (message.type) {
    case 'PING':
      sendResponse({ ok: true, url: window.location.href });
      break;
      
    case 'CHECK_IFRAME':
      const iframe = document.querySelector('iframe[src*="linkedin.com/messaging"]');
      sendResponse({ hasIframe: !!iframe });
      break;
      
    case 'SET_CONFIG':
      config = { ...config, ...message.config };
      sendResponse({ ok: true });
      break;
      
    case 'FULL_SYNC':
      if (message.config) {
        config = { ...config, ...message.config };
      }
      performFullSync()
        .then(result => sendResponse(result))
        .catch(err => sendResponse({ ok: false, error: err.message }));
      return true;
      
    default:
      sendResponse({ error: 'Unknown message type' });
  }
});

// =====================
// API-BASED SYNC
// =====================

async function performFullSync() {
  console.log('🔄 Starting API-based sync with config:', config);
  
  try {
    // Step 1: Get conversations via background script (API)
    sendProgress(0, 100, 'conversations');
    console.log('📬 Fetching conversations via API...');
    
    const convResponse = await chrome.runtime.sendMessage({
      type: 'FETCH_ALL_CONVERSATIONS'
    });
    
    if (!convResponse.ok) {
      // If API fails, show helpful error
      const error = convResponse.error || 'Failed to fetch conversations';
      if (error.includes('QueryId')) {
        throw new Error('QueryId pas encore capturé. Rafraîchis la page LinkedIn Messaging (F5).');
      }
      throw new Error(error);
    }
    
    const apiConversations = convResponse.data.slice(0, config.convLimit);
    const myUrn = convResponse.userUrn; // Get the connected user's URN
    console.log(`📬 Got ${apiConversations.length} conversations from API (myUrn: ${myUrn?.substring(0, 30)}...)`);

    // Cache the userUrn for WebSocket isFromMe detection
    if (myUrn) {
      cachedUserUrn = myUrn;
      chrome.storage.local.set({ userUrn: myUrn });
      console.log('💾 Cached userUrn for realtime isFromMe detection');
    }
    
    // Step 2: Transform conversations
    const conversations = apiConversations.map((conv, i) => {
      const participant = conv._participantName || 'Unknown';
      return {
        threadId: conv.entityUrn || conv._fullUrn || `conv-${i}`,
        linkedinId: conv._participantId || null,
        name: participant,
        avatarUrl: conv._participantPicture || null,
        headline: conv._participantHeadline || '',
        lastMessagePreview: conv.lastMessage?.body?.text || '',
        lastMessageTime: conv.lastActivityAt ? new Date(conv.lastActivityAt).toISOString() : null,
        isUnread: (conv.unreadCount || 0) > 0,
        isStarred: conv.starred || false,
        messages: []
      };
    });
    
    sendProgress(30, 100, 'conversations');
    
    // Step 3: Fetch messages for each conversation
    let totalMessages = 0;
    for (let i = 0; i < conversations.length; i++) {
      const conv = conversations[i];
      sendProgress(30 + Math.round((i / conversations.length) * 60), 100, 'messages');
      
      console.log(`💬 Fetching messages for ${conv.name} (${i + 1}/${conversations.length})...`);
      
      try {
        const msgResponse = await chrome.runtime.sendMessage({
          type: 'FETCH_MESSAGES',
          conversationUrn: conv.threadId,
          count: config.msgLimit
        });
        
        if (msgResponse.ok && msgResponse.data?.messages) {
          conv.messages = msgResponse.data.messages.map((msg, j) => {
            // Detect if message is from me by checking if sender contains my profile ID
            const myProfileId = myUrn?.split(':').pop()?.split(',')[0]; // Extract profile ID from URN
            const isFromMe = myProfileId && msg.sender ? msg.sender.includes(myProfileId) : false;
            
            return {
              urn: msg.entityUrn || `msg-${i}-${j}`,
              content: msg.body || '',
              isFromMe,
              timestamp: msg.createdAt ? new Date(msg.createdAt).toISOString() : null,
              senderName: null,
              attachments: msg.attachments || null // Include attachments!
            };
          });
          totalMessages += conv.messages.length;
          console.log(`   ✅ ${conv.messages.length} messages (myProfileId: ${myUrn?.split(':').pop()?.split(',')[0]?.substring(0, 15)}...)`);
        }
      } catch (e) {
        console.error(`   ❌ Error fetching messages for ${conv.name}:`, e);
        conv.messages = [];
      }
      
      // Small delay to avoid rate limiting
      await delay(200);
    }
    
    sendProgress(95, 100, 'syncing');
    
    // Step 4: Send to CRM server
    if (config.apiUrl) {
      console.log('📤 Sending to CRM server...');
      await syncToServer(conversations);
    }
    
    sendProgress(100, 100, 'done');
    
    return {
      ok: true,
      conversations,
      totalMessages
    };
    
  } catch (error) {
    console.error('❌ Sync failed:', error);
    throw error;
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function sendProgress(current, total, phase) {
  chrome.runtime.sendMessage({
    type: 'SYNC_PROGRESS',
    current,
    total,
    phase,
  });
}

// =====================
// SERVER SYNC
// =====================

async function syncToServer(conversations) {
  const data = {
    type: 'api_sync',
    timestamp: new Date().toISOString(),
    conversations: conversations.map(conv => ({
      threadId: conv.threadId,
      linkedinId: conv.linkedinId,
      name: conv.name,
      avatarUrl: conv.avatarUrl,
      headline: conv.headline,
      lastMessagePreview: conv.lastMessagePreview,
      lastMessageTime: conv.lastMessageTime,
      isUnread: conv.isUnread,
      isStarred: conv.isStarred,
      isActive: false,
    })),
    messages: conversations.flatMap(conv => 
      (conv.messages || []).map(msg => ({
        conversationId: conv.threadId,
        content: msg.content,
        isFromMe: msg.isFromMe,
        timestamp: msg.timestamp,
        urn: msg.urn,
        attachments: msg.attachments || null,
        sender: {
          name: msg.senderName,
        },
      }))
    ),
    currentConversation: null,
  };
  
  console.log('📤 Sync data:', {
    conversations: data.conversations.length,
    messages: data.messages.length,
    byConv: data.conversations.map(c => `${c.name}: ${data.messages.filter(m => m.conversationId === c.threadId).length} msgs`)
  });
  
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({
      type: 'SYNC_TO_SERVER',
      apiUrl: config.apiUrl,
      data,
    }, response => {
      if (response?.ok) {
        resolve(response.result);
      } else {
        reject(new Error(response?.error || 'Server sync failed'));
      }
    });
  });
}

// =====================
// INIT
// =====================

if (window.location.href.includes('linkedin.com/messaging')) {
  console.log('📍 On LinkedIn Messaging - ready for API sync');
}
