/**
 * LinkedIn CRM Sync - Content Script
 * Scrapes LinkedIn Messaging DOM for conversations and messages
 */

console.log('🔌 LinkedIn CRM Content Script loaded on:', window.location.href);

// Config
let config = {
  apiUrl: 'http://localhost:3000',
  convLimit: 50,
  msgLimit: 20,
};

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
      // Check if there's a LinkedIn iframe on this page
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
      return true; // Keep channel open for async
      
    default:
      sendResponse({ error: 'Unknown message type' });
  }
});

// =====================
// DOM SCRAPING
// =====================

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

async function performFullSync() {
  console.log('🔄 Starting full sync with config:', config);
  
  // Make sure we're on LinkedIn Messaging
  if (!window.location.href.includes('linkedin.com/messaging')) {
    // Try to find the messaging page or navigate to it
    const messagingLink = document.querySelector('a[href*="/messaging"]');
    if (messagingLink) {
      messagingLink.click();
      await delay(2000);
    }
  }
  
  // Wait for conversation list to load
  await waitForElement('.msg-conversations-container__conversations-list, .msg-conversation-listitem');
  
  // Scrape conversations AND their messages together
  const conversations = await scrapeConversationsWithMessages(config.convLimit, config.msgLimit);
  console.log(`📬 Scraped ${conversations.length} conversations`);
  
  let totalMessages = 0;
  for (const conv of conversations) {
    totalMessages += (conv.messages || []).length;
  }
  
  // Send to CRM server
  if (config.apiUrl) {
    try {
      await syncToServer(conversations);
      console.log('✅ Synced to server');
    } catch (e) {
      console.error('❌ Server sync failed:', e);
    }
  }
  
  return {
    ok: true,
    conversations,
    totalMessages,
  };
}

async function waitForElement(selector, timeout = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const el = document.querySelector(selector);
    if (el) return el;
    await delay(200);
  }
  throw new Error(`Element not found: ${selector}`);
}

async function scrapeConversationsWithMessages(convLimit, msgLimit) {
  const conversations = [];
  const convItems = document.querySelectorAll('.msg-conversation-listitem, .msg-conversations-container__conversations-list li');
  
  const total = Math.min(convItems.length, convLimit);
  console.log(`🔍 Found ${convItems.length} conversation items, will process ${total}`);
  
  for (let i = 0; i < total; i++) {
    sendProgress(i + 1, total, 'conversations');
    
    const item = convItems[i];
    if (!item) continue;
    
    try {
      // Click on conversation to load it
      console.log(`📬 Clicking conversation ${i + 1}...`);
      item.click();
      await delay(1000); // Wait for URL to update and messages to load
      
      // Get thread ID from URL IMMEDIATELY after click
      const urlMatch = window.location.href.match(/thread\/([^/]+)/);
      const threadId = urlMatch ? urlMatch[1] : `conv-${i}-${Date.now()}`;
      
      console.log(`📬 Conv ${i + 1}: URL threadId = ${threadId}`);
      
      // Extract conversation data
      const conv = extractConversationData(item);
      if (conv) {
        conv.threadId = threadId;
        
        // IMMEDIATELY scrape messages while this conversation is open
        console.log(`💬 Scraping messages for conv ${i + 1} (${conv.name})...`);
        const messages = await scrapeMessagesForConversation(conv, msgLimit);
        conv.messages = messages;
        
        console.log(`✅ Conv ${i + 1}: ${conv.name} - ${messages.length} messages (threadId: ${threadId})`);
        conversations.push(conv);
      }
    } catch (e) {
      console.error(`❌ Error processing conversation ${i}:`, e);
    }
    
    // Delay before next conversation
    await delay(500);
  }
  
  return conversations;
}

function extractConversationData(item) {
  // Get participant name
  const nameEl = item.querySelector(
    '.msg-conversation-listitem__participant-names, ' +
    '.msg-conversation-card__participant-names, ' +
    'h3'
  );
  const name = nameEl?.textContent?.trim() || 'Unknown';
  
  // Get avatar
  const avatarEl = item.querySelector('img.presence-entity__image, img.msg-facepile-grid__img');
  const avatarUrl = avatarEl?.src || null;
  
  // Get last message preview
  const previewEl = item.querySelector(
    '.msg-conversation-listitem__message-snippet, ' +
    '.msg-conversation-card__message-snippet, ' +
    'p'
  );
  const lastMessagePreview = previewEl?.textContent?.trim() || '';
  
  // Get timestamp
  const timeEl = item.querySelector('time');
  const lastMessageTime = timeEl?.getAttribute('datetime') || timeEl?.textContent || null;
  
  // Check if unread
  const isUnread = item.classList.contains('msg-conversation-listitem--unread') ||
                   item.querySelector('.msg-conversation-listitem__unread-count') !== null;
  
  // Check if starred
  const isStarred = item.querySelector('.msg-conversation-listitem__starred-icon') !== null;
  
  // Get LinkedIn ID from profile link
  const profileLink = document.querySelector('.msg-thread__link-to-profile, .msg-s-message-group__profile-link');
  const linkedinId = profileLink?.href?.match(/\/in\/([^/]+)/)?.[1] || null;
  
  return {
    name,
    avatarUrl,
    lastMessagePreview,
    lastMessageTime,
    isUnread,
    isStarred,
    linkedinId,
  };
}

async function scrapeMessagesForConversation(conv, limit) {
  const messages = [];
  
  // Wait for messages to load
  await delay(800);
  
  // Try multiple selectors for message containers
  const messageEls = document.querySelectorAll(
    '.msg-s-event-listitem, ' +
    '.msg-s-message-list__event, ' +
    '[class*="msg-s-message-group"], ' +
    'li[class*="msg-s-event"]'
  );
  
  console.log(`📨 Found ${messageEls.length} message elements`);
  
  const total = Math.min(messageEls.length, limit);
  
  // Get messages (most recent first)
  for (let i = Math.max(0, messageEls.length - total); i < messageEls.length; i++) {
    const msgEl = messageEls[i];
    if (!msgEl) continue;
    
    try {
      const msg = extractMessageData(msgEl, i);
      if (msg && msg.content) {
        messages.push(msg);
      }
    } catch (e) {
      console.error('Error extracting message:', e);
    }
  }
  
  return messages;
}

function extractMessageData(msgEl, index) {
  // Get message content - try multiple selectors
  let content = '';
  const contentSelectors = [
    '.msg-s-event-listitem__body',
    '.msg-s-message-group__content',
    'p.msg-s-event-listitem__message-body',
    'p[class*="msg-s-event-listitem"]',
    '.msg-s-event-listitem__message-bubble p',
    'p[dir="ltr"]',
    '.msg-s-event-listitem p'
  ];
  
  for (const selector of contentSelectors) {
    const el = msgEl.querySelector(selector);
    if (el?.textContent?.trim()) {
      content = el.textContent.trim();
      break;
    }
  }
  
  // Fallback: get all paragraph text
  if (!content) {
    const paragraphs = msgEl.querySelectorAll('p');
    for (const p of paragraphs) {
      const text = p.textContent?.trim();
      if (text && text.length > 0 && !text.includes('Envoyé le')) {
        content = text;
        break;
      }
    }
  }
  
  // Get sender name
  const senderSelectors = [
    '.msg-s-message-group__name',
    '.msg-s-event-listitem__sender-name',
    'a[class*="msg-s-message-group__profile-link"] span',
    '.msg-s-event-listitem a[href*="/in/"] span'
  ];
  
  let senderName = null;
  for (const selector of senderSelectors) {
    const el = msgEl.querySelector(selector);
    if (el?.textContent?.trim()) {
      senderName = el.textContent.trim();
      break;
    }
  }
  
  // Get timestamp
  const timeEl = msgEl.querySelector('time');
  const timestamp = timeEl?.getAttribute('datetime') || timeEl?.textContent?.trim() || null;
  
  // Check if from me (multiple detection methods)
  // LinkedIn shows sent indicator (checkmarks) for messages you sent
  const hasSentIndicator = msgEl.querySelector(
    '[data-test-message-sent-indicator], ' +
    '.msg-s-message-list-content__sent-confirmation, ' +
    'img[alt*="Envoyé"], ' +
    'img[alt*="Lu"], ' +
    'img[alt*="Sent"], ' +
    'img[alt*="Read"], ' +
    '.msg-s-event-listitem__message-bubble svg'  // Checkmark icon
  ) !== null;
  
  const hasOutgoingClass = 
    msgEl.classList.contains('msg-s-event-listitem--outgoing') ||
    msgEl.querySelector('.msg-s-event-listitem__message-bubble--outgoing') !== null;
  
  // Check for "Envoyé le" text pattern (French) or "Sent" (English)
  const fullText = msgEl.textContent || '';
  const hasSentText = fullText.includes('Envoyé le') || fullText.includes('Sent');
  
  const isFromMe = hasSentIndicator || hasOutgoingClass || hasSentText;
  
  // Generate unique ID
  const urn = msgEl.getAttribute('data-event-urn') || 
              msgEl.getAttribute('data-id') || 
              `msg-${index}-${Date.now()}`;
  
  return {
    content,
    senderName,
    timestamp,
    isFromMe,
    urn,
  };
}

// =====================
// SERVER SYNC
// =====================

async function syncToServer(conversations) {
  const data = {
    type: 'dom_sync',
    timestamp: new Date().toISOString(),
    conversations: conversations.map(conv => ({
      threadId: conv.threadId,
      linkedinId: conv.linkedinId,
      name: conv.name,
      avatarUrl: conv.avatarUrl,
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
        sender: {
          name: msg.senderName,
        },
      }))
    ),
    currentConversation: null,
  };
  
  console.log('📤 Sending to server:', config.apiUrl, data);
  
  // Use background script to make the request (avoids CORS issues)
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
// AUTO-INIT
// =====================

// If we're on LinkedIn Messaging, set up observers for real-time updates
if (window.location.href.includes('linkedin.com/messaging')) {
  console.log('📍 On LinkedIn Messaging - ready for sync');
}
