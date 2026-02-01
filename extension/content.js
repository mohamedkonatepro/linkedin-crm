/**
 * LinkedIn CRM Sync - Content Script
 * Uses LinkedIn API (not DOM scraping) for reliable data extraction
 */

console.log('🔌 LinkedIn CRM Content Script loaded on:', window.location.href);

// Config
let config = {
  apiUrl: 'http://localhost:3000',
  convLimit: 50,
  msgLimit: 20,
};

// =====================
// WINDOW MESSAGE HANDLER (CRM -> Extension)
// =====================

window.addEventListener('message', async (event) => {
  if (!event.data || event.data.source !== 'linkedin-crm') return;
  
  console.log('📨 Window message from CRM:', event.data.type);
  
  if (event.data.type === 'SEND_MESSAGE') {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'SEND_MESSAGE',
        conversationUrn: event.data.conversationUrn,
        text: event.data.text
      });
      
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
