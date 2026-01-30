/**
 * LinkedIn CRM - Content Script
 * Scrapes LinkedIn messaging and syncs with CRM
 */

// Configuration
const CONFIG = {
  API_URL: '', // Will be set from popup
  SYNC_INTERVAL: 30000, // 30 seconds
  SCRAPE_DELAY: 500, // Delay between scraping operations
};

// State
let isInitialized = false;
let syncInterval = null;

// =====================
// SELECTORS
// =====================
const SELECTORS = {
  // Conversation list
  conversationList: 'ul.msg-conversations-container__conversations-list',
  conversationItem: 'li.msg-conversation-listitem',
  conversationCard: 'div.msg-conversation-card',
  participantName: 'h3.msg-conversation-listitem__participant-names span.truncate',
  conversationTime: 'time.msg-conversation-listitem__time-stamp',
  messagePreview: 'p.msg-conversation-card__message-snippet',
  profileImage: 'img.presence-entity__image',
  activeConversation: '.msg-conversations-container__convo-item-link--active',
  starIcon: '.msg-conversation-card__star-icon',
  
  // Message list
  messageList: 'ul.msg-s-message-list-content',
  messageItem: 'li.msg-s-message-list__event',
  messageEvent: 'div.msg-s-event-listitem',
  messageOther: 'msg-s-event-listitem--other',
  senderLink: 'a.msg-s-event-listitem__link',
  senderImage: 'img.msg-s-event-listitem__profile-picture',
  senderName: 'span.msg-s-message-group__profile-link',
  messageTime: 'time.msg-s-message-group__timestamp',
  dateHeader: 'time.msg-s-message-list__time-heading',
  messageBody: 'p.msg-s-event-listitem__body',
  messageBubble: 'div.msg-s-event-listitem__message-bubble',
};

// =====================
// UTILITY FUNCTIONS
// =====================

function extractLinkedInId(url) {
  if (!url) return null;
  const match = url.match(/ACoAA[A-Za-z0-9_-]+/);
  return match ? match[0] : null;
}

function parseLinkedInDate(dateStr) {
  // LinkedIn uses relative dates like "16 nov. 2025" or "15:03"
  if (!dateStr) return null;
  
  // If it's just a time (HH:MM), assume today
  if (/^\d{1,2}:\d{2}$/.test(dateStr.trim())) {
    const [hours, minutes] = dateStr.trim().split(':');
    const date = new Date();
    date.setHours(parseInt(hours), parseInt(minutes), 0, 0);
    return date.toISOString();
  }
  
  // French month names
  const months = {
    'janv': 0, 'févr': 1, 'mars': 2, 'avr': 3, 'mai': 4, 'juin': 5,
    'juil': 6, 'août': 7, 'sept': 8, 'oct': 9, 'nov': 10, 'déc': 11
  };
  
  // Parse "16 nov. 2025"
  const match = dateStr.match(/(\d{1,2})\s+(\w+)\.?\s+(\d{4})/);
  if (match) {
    const [, day, monthStr, year] = match;
    const month = months[monthStr.toLowerCase().replace('.', '')];
    if (month !== undefined) {
      return new Date(parseInt(year), month, parseInt(day)).toISOString();
    }
  }
  
  return null;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// =====================
// SCRAPING FUNCTIONS
// =====================

function scrapeConversationList() {
  const conversations = [];
  const items = document.querySelectorAll(SELECTORS.conversationItem);
  
  items.forEach((item, index) => {
    try {
      const card = item.querySelector(SELECTORS.conversationCard);
      if (!card) return;
      
      // Get profile link to extract LinkedIn ID
      const profileLink = item.querySelector('a[href*="/in/"]');
      const linkedinId = profileLink ? extractLinkedInId(profileLink.href) : null;
      
      const conversation = {
        index,
        linkedinId,
        name: item.querySelector(SELECTORS.participantName)?.textContent?.trim() || 'Unknown',
        avatarUrl: item.querySelector(SELECTORS.profileImage)?.src || null,
        lastMessagePreview: item.querySelector(SELECTORS.messagePreview)?.textContent?.trim() || '',
        lastMessageTime: parseLinkedInDate(
          item.querySelector(SELECTORS.conversationTime)?.textContent
        ),
        isActive: !!item.querySelector(SELECTORS.activeConversation),
        isStarred: !!item.querySelector(`${SELECTORS.starIcon}:not(:empty)`),
        threadId: extractThreadId(item),
      };
      
      // Extract if last message is from me
      const preview = conversation.lastMessagePreview;
      if (preview.startsWith('Vous :') || preview.startsWith('You:')) {
        conversation.lastMessageFromMe = true;
        conversation.lastMessagePreview = preview.replace(/^(Vous|You)\s*:\s*/, '');
      } else if (preview.includes(' : ')) {
        conversation.lastMessageFromMe = false;
        conversation.lastMessagePreview = preview.split(' : ').slice(1).join(' : ');
      }
      
      conversations.push(conversation);
    } catch (e) {
      console.error('Error scraping conversation:', e);
    }
  });
  
  return conversations;
}

function extractThreadId(item) {
  // Try to get thread ID from data attributes or URL
  const link = item.querySelector('a[href*="/messaging/thread/"]');
  if (link) {
    const match = link.href.match(/\/thread\/([^/]+)/);
    return match ? match[1] : null;
  }
  return null;
}

function scrapeMessages() {
  const messages = [];
  const items = document.querySelectorAll(SELECTORS.messageItem);
  let currentDate = null;
  
  items.forEach((item, index) => {
    try {
      // Check for date header
      const dateHeader = item.querySelector(SELECTORS.dateHeader);
      if (dateHeader) {
        currentDate = parseLinkedInDate(dateHeader.textContent);
      }
      
      const event = item.querySelector(SELECTORS.messageEvent);
      if (!event) return;
      
      // Get message URN from data attribute
      const urn = event.dataset.eventUrn;
      if (!urn) return;
      
      // Determine if message is from me
      const isFromMe = !event.classList.contains(SELECTORS.messageOther);
      
      // Get sender info
      const senderLink = item.querySelector(SELECTORS.senderLink);
      const senderId = senderLink ? extractLinkedInId(senderLink.href) : null;
      const senderName = item.querySelector(SELECTORS.senderName)?.textContent?.trim();
      const senderAvatar = item.querySelector(SELECTORS.senderImage)?.src;
      
      // Get message content
      const content = item.querySelector(SELECTORS.messageBody)?.textContent?.trim() || '';
      
      // Get time
      const timeElement = item.querySelector(SELECTORS.messageTime);
      const timeStr = timeElement?.textContent?.replace('•', '').trim();
      
      // Combine date and time
      let timestamp = null;
      if (currentDate && timeStr) {
        const [hours, minutes] = timeStr.split(':');
        const date = new Date(currentDate);
        date.setHours(parseInt(hours) || 0, parseInt(minutes) || 0, 0, 0);
        timestamp = date.toISOString();
      }
      
      const message = {
        index,
        urn,
        content,
        isFromMe,
        timestamp,
        sender: {
          linkedinId: senderId,
          name: senderName,
          avatarUrl: senderAvatar,
        },
      };
      
      messages.push(message);
    } catch (e) {
      console.error('Error scraping message:', e);
    }
  });
  
  return messages;
}

function getCurrentConversationInfo() {
  // Get info about the currently open conversation
  const header = document.querySelector('.msg-entity-lockup__entity-title');
  const subtitle = document.querySelector('.msg-entity-lockup__entity-subtitle');
  const profileLink = document.querySelector('.msg-thread__link-to-profile');
  
  return {
    name: header?.textContent?.trim(),
    headline: subtitle?.textContent?.trim(),
    linkedinId: profileLink ? extractLinkedInId(profileLink.href) : null,
    profileUrl: profileLink?.href,
  };
}

// =====================
// SYNC FUNCTIONS
// =====================

async function syncToServer(data) {
  if (!CONFIG.API_URL) {
    console.log('LinkedIn CRM: No API URL configured');
    return;
  }

  try {
    // Clean URL (remove trailing slash)
    const baseUrl = CONFIG.API_URL.replace(/\/+$/, '');

    // Use background script to bypass mixed content restrictions (HTTPS -> HTTP)
    const response = await chrome.runtime.sendMessage({
      type: 'API_REQUEST',
      url: `${baseUrl}/api/sync`,
      method: 'POST',
      body: data,
    });

    if (!response || !response.ok) {
      throw new Error(response?.error || 'Sync failed');
    }

    console.log('LinkedIn CRM: Sync success via background', response.data);
    return response.data;
  } catch (e) {
    console.error('LinkedIn CRM: Sync error', e);
    throw e;
  }
}

async function performFullSync() {
  console.log('LinkedIn CRM: Starting full sync...');
  
  const conversations = scrapeConversationList();
  const currentConversation = getCurrentConversationInfo();
  const messages = scrapeMessages();
  
  const data = {
    type: 'full',
    timestamp: new Date().toISOString(),
    conversations,
    currentConversation,
    messages,
  };
  
  // Send to popup for display
  chrome.runtime.sendMessage({
    type: 'SYNC_DATA',
    data,
  });
  
  // If API is configured, sync to server
  if (CONFIG.API_URL) {
    await syncToServer(data);
  }
  
  console.log('LinkedIn CRM: Sync complete', {
    conversations: conversations.length,
    messages: messages.length,
  });
  
  return data;
}

// =====================
// MESSAGE HANDLERS
// =====================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('LinkedIn CRM: Received message', message);
  
  switch (message.type) {
    case 'PING':
      sendResponse({ ok: true, page: 'messaging' });
      break;
      
    case 'GET_CONVERSATIONS':
      sendResponse({ conversations: scrapeConversationList() });
      break;
      
    case 'GET_MESSAGES':
      sendResponse({ messages: scrapeMessages() });
      break;
      
    case 'FULL_SYNC':
      performFullSync().then(data => sendResponse(data));
      return true; // Keep channel open for async response
      
    case 'SET_CONFIG':
      Object.assign(CONFIG, message.config);
      sendResponse({ ok: true });
      break;
      
    case 'START_AUTO_SYNC':
      if (!syncInterval) {
        syncInterval = setInterval(performFullSync, CONFIG.SYNC_INTERVAL);
        console.log('LinkedIn CRM: Auto-sync started');
      }
      sendResponse({ ok: true });
      break;
      
    case 'STOP_AUTO_SYNC':
      if (syncInterval) {
        clearInterval(syncInterval);
        syncInterval = null;
        console.log('LinkedIn CRM: Auto-sync stopped');
      }
      sendResponse({ ok: true });
      break;
      
    default:
      sendResponse({ error: 'Unknown message type' });
  }
});

// =====================
// OBSERVERS
// =====================

// Watch for new messages
function setupMessageObserver() {
  const messageList = document.querySelector(SELECTORS.messageList);
  if (!messageList) return;
  
  const observer = new MutationObserver((mutations) => {
    // Debounce: only trigger once per batch of mutations
    clearTimeout(observer.debounceTimer);
    observer.debounceTimer = setTimeout(() => {
      console.log('LinkedIn CRM: Messages changed, syncing...');
      performFullSync();
    }, 1000);
  });
  
  observer.observe(messageList, {
    childList: true,
    subtree: true,
  });
  
  console.log('LinkedIn CRM: Message observer active');
}

// Watch for conversation list changes
function setupConversationObserver() {
  const conversationList = document.querySelector(SELECTORS.conversationList);
  if (!conversationList) return;
  
  const observer = new MutationObserver((mutations) => {
    clearTimeout(observer.debounceTimer);
    observer.debounceTimer = setTimeout(() => {
      console.log('LinkedIn CRM: Conversations changed, syncing...');
      performFullSync();
    }, 1000);
  });
  
  observer.observe(conversationList, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class'],
  });
  
  console.log('LinkedIn CRM: Conversation observer active');
}

// =====================
// INITIALIZATION
// =====================

function initialize() {
  if (isInitialized) return;
  
  console.log('LinkedIn CRM: Initializing content script...');
  
  // Wait for page to be ready
  const checkReady = setInterval(() => {
    const conversationList = document.querySelector(SELECTORS.conversationList);
    if (conversationList) {
      clearInterval(checkReady);
      
      // Setup observers
      setupConversationObserver();
      setupMessageObserver();
      
      // Initial sync
      performFullSync();
      
      isInitialized = true;
      console.log('LinkedIn CRM: Initialized successfully');
    }
  }, 500);
  
  // Timeout after 30 seconds
  setTimeout(() => clearInterval(checkReady), 30000);
}

// Start when page loads
if (document.readyState === 'complete') {
  initialize();
} else {
  window.addEventListener('load', initialize);
}

// Also try to initialize on URL changes (SPA navigation)
let lastUrl = location.href;
new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    if (location.href.includes('/messaging')) {
      isInitialized = false;
      setTimeout(initialize, 1000);
    }
  }
}).observe(document, { subtree: true, childList: true });

console.log('LinkedIn CRM: Content script loaded');
