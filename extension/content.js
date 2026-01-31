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
let extensionValid = true;

// Check if extension context is still valid
function isExtensionValid() {
  try {
    // This will throw if extension was reloaded
    chrome.runtime.getURL('');
    return true;
  } catch (e) {
    return false;
  }
}

// Stop all intervals when extension is invalidated
function cleanupOnInvalidation() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
  extensionValid = false;
  console.log('LinkedIn CRM: Extension reloaded - refresh the page to reconnect');
}

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
  // LinkedIn uses relative dates like "16 nov. 2025", "15:03", "lundi", "hier", etc.
  if (!dateStr) return null;
  
  const str = dateStr.trim().toLowerCase();
  
  // If it's just a time (HH:MM), assume today
  if (/^\d{1,2}:\d{2}$/.test(str)) {
    const [hours, minutes] = str.split(':');
    const date = new Date();
    date.setHours(parseInt(hours), parseInt(minutes), 0, 0);
    return date.toISOString();
  }
  
  // Day names (French and English) - calculate relative date
  const dayNames = {
    // French
    'lundi': 1, 'mardi': 2, 'mercredi': 3, 'jeudi': 4, 'vendredi': 5, 'samedi': 6, 'dimanche': 0,
    // English
    'monday': 1, 'tuesday': 2, 'wednesday': 3, 'thursday': 4, 'friday': 5, 'saturday': 6, 'sunday': 0,
  };
  
  // Check for day name
  for (const [dayName, dayNum] of Object.entries(dayNames)) {
    if (str.includes(dayName)) {
      const today = new Date();
      const currentDay = today.getDay();
      let daysAgo = currentDay - dayNum;
      if (daysAgo <= 0) daysAgo += 7; // If same day or future, go back a week
      const date = new Date(today);
      date.setDate(date.getDate() - daysAgo);
      date.setHours(0, 0, 0, 0);
      return date.toISOString();
    }
  }
  
  // Check for "hier" / "yesterday"
  if (str.includes('hier') || str.includes('yesterday')) {
    const date = new Date();
    date.setDate(date.getDate() - 1);
    date.setHours(0, 0, 0, 0);
    return date.toISOString();
  }
  
  // Check for "aujourd'hui" / "today"
  if (str.includes("aujourd'hui") || str.includes('today')) {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date.toISOString();
  }
  
  // French and English month names
  const months = {
    // French (full and abbreviated)
    'janvier': 0, 'janv': 0, 'février': 1, 'févr': 1, 'mars': 2, 'avril': 3, 'avr': 3,
    'mai': 4, 'juin': 5, 'juillet': 6, 'juil': 6, 'août': 7, 'aout': 7,
    'septembre': 8, 'sept': 8, 'octobre': 9, 'oct': 9, 'novembre': 10, 'nov': 10,
    'décembre': 11, 'déc': 11, 'decembre': 11, 'dec': 11,
    // English (full and abbreviated)
    'january': 0, 'jan': 0, 'february': 1, 'feb': 1, 'march': 2, 'mar': 2,
    'april': 3, 'apr': 3, 'may': 4, 'june': 5, 'jun': 5, 'july': 6, 'jul': 6,
    'august': 7, 'aug': 7, 'september': 8, 'sep': 8, 'october': 9, 'oct': 9,
    'november': 10, 'nov': 10, 'december': 11, 'dec': 11,
  };
  
  // Parse "16 nov. 2025" (with year) - use str (trimmed)
  const matchWithYear = str.match(/(\d{1,2})\s+(\w+)\.?\s+(\d{4})/);
  if (matchWithYear) {
    const [, day, monthStr, year] = matchWithYear;
    const month = months[monthStr.replace('.', '')];
    if (month !== undefined) {
      return new Date(parseInt(year), month, parseInt(day)).toISOString();
    }
  }
  
  // Parse "15 janv." or "23 janv." (WITHOUT year - assume current year)
  const matchNoYear = str.match(/(\d{1,2})\s+(\w+)\.?$/);
  if (matchNoYear) {
    const [, day, monthStr] = matchNoYear;
    const month = months[monthStr.replace('.', '')];
    if (month !== undefined) {
      const currentYear = new Date().getFullYear();
      return new Date(currentYear, month, parseInt(day)).toISOString();
    }
  }
  
  // Parse English format "Nov 16, 2025"
  const matchEn = str.match(/(\w+)\.?\s+(\d{1,2}),?\s+(\d{4})/);
  if (matchEn) {
    const [, monthStr, day, year] = matchEn;
    const month = months[monthStr.replace('.', '')];
    if (month !== undefined) {
      return new Date(parseInt(year), month, parseInt(day)).toISOString();
    }
  }
  
  // Parse English format without year "Jan 15" or "Jan. 15"
  const matchEnNoYear = str.match(/(\w+)\.?\s+(\d{1,2})$/);
  if (matchEnNoYear) {
    const [, monthStr, day] = matchEnNoYear;
    const month = months[monthStr.replace('.', '')];
    if (month !== undefined) {
      const currentYear = new Date().getFullYear();
      return new Date(currentYear, month, parseInt(day)).toISOString();
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
      // Check for date header - prefer datetime attribute
      const dateHeader = item.querySelector(SELECTORS.dateHeader);
      if (dateHeader) {
        // First try datetime attribute
        const datetimeAttr = dateHeader.getAttribute('datetime');
        if (datetimeAttr) {
          currentDate = datetimeAttr;
        } else {
          currentDate = parseLinkedInDate(dateHeader.textContent);
        }
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
      
      // Get time - try multiple sources
      const timeElement = item.querySelector(SELECTORS.messageTime);
      let timestamp = null;
      
      // First try: look for tooltip/label with full date (e.g., "Envoyé le 11/11/2025, 15:34")
      // This appears on sent messages in title attribute or text content
      let tooltipMatch = null;
      const allElements = item.querySelectorAll('div, span');
      for (const el of allElements) {
        // Check title attribute (most common for sent indicator)
        const title = el.getAttribute('title') || '';
        const titleMatch = title.match(/Envoyé le (\d{1,2})\/(\d{1,2})\/(\d{4}),?\s*(\d{1,2}):(\d{2})/);
        if (titleMatch) {
          tooltipMatch = titleMatch;
          break;
        }
        // Also check textContent and aria-label
        const text = el.textContent || el.getAttribute('aria-label') || '';
        const textMatch = text.match(/Envoyé le (\d{1,2})\/(\d{1,2})\/(\d{4}),?\s*(\d{1,2}):(\d{2})/);
        if (textMatch) {
          tooltipMatch = textMatch;
          break;
        }
      }
      
      if (tooltipMatch) {
        const [, day, month, year, hours, minutes] = tooltipMatch;
        const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hours), parseInt(minutes));
        timestamp = date.toISOString();
      }
      // Second try: use datetime attribute
      else if (timeElement?.getAttribute('datetime')) {
        timestamp = timeElement.getAttribute('datetime');
      }
      // Third try: combine currentDate with time string
      else if (timeElement) {
        const timeStr = timeElement.textContent?.replace('•', '').trim();
        if (currentDate && timeStr) {
          const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})/);
          if (timeMatch) {
            const [, hours, minutes] = timeMatch;
            const date = new Date(currentDate);
            date.setHours(parseInt(hours), parseInt(minutes), 0, 0);
            timestamp = date.toISOString();
          }
        }
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
  // Check if extension is still valid
  if (!isExtensionValid()) {
    cleanupOnInvalidation();
    return null;
  }
  
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
  
  // Send to popup for display (wrapped in try-catch to handle extension reload)
  try {
    chrome.runtime.sendMessage({
      type: 'SYNC_DATA',
      data,
    });
  } catch (e) {
    // Extension context invalidated - ignore (happens after extension reload)
    console.log('LinkedIn CRM: Extension reloaded, refresh page to reconnect');
  }
  
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

// =====================
// PAGE API (for testing without popup)
// =====================

// Listen for messages from the page
window.addEventListener('message', async (event) => {
  if (event.source !== window) return;
  if (!event.data || event.data.source !== 'linkedin-crm-test') return;
  
  console.log('LinkedIn CRM: Received page message:', event.data.type);
  
  switch (event.data.type) {
    case 'TRIGGER_DOM_SYNC':
      const domResult = await performFullSync();
      window.postMessage({
        source: 'linkedin-crm-extension',
        type: 'DOM_SYNC_RESULT',
        data: domResult
      }, '*');
      break;
      
    case 'TRIGGER_API_SYNC':
      console.log('LinkedIn CRM: Triggering API sync...');
      chrome.runtime.sendMessage({ type: 'FETCH_ALL_CONVERSATIONS' }, (apiResult) => {
        console.log('LinkedIn CRM: Got API sync response:', apiResult);
        if (chrome.runtime.lastError) {
          console.error('LinkedIn CRM: API sync error:', chrome.runtime.lastError);
          window.postMessage({
            source: 'linkedin-crm-extension',
            type: 'API_SYNC_ERROR',
            error: chrome.runtime.lastError.message
          }, '*');
        } else if (apiResult?.ok) {
          window.postMessage({
            source: 'linkedin-crm-extension',
            type: 'API_SYNC_RESULT',
            data: apiResult
          }, '*');
        } else {
          window.postMessage({
            source: 'linkedin-crm-extension',
            type: 'API_SYNC_ERROR',
            error: apiResult?.error || 'Unknown error'
          }, '*');
        }
      });
      break;
      
    case 'GET_QUERY_IDS':
      console.log('LinkedIn CRM: Requesting queryIds from background...');
      chrome.runtime.sendMessage({ type: 'GET_QUERY_IDS' }, (queryIds) => {
        console.log('LinkedIn CRM: Got queryIds response:', queryIds);
        if (chrome.runtime.lastError) {
          console.error('LinkedIn CRM: sendMessage error:', chrome.runtime.lastError);
          window.postMessage({
            source: 'linkedin-crm-extension',
            type: 'QUERY_IDS_ERROR',
            error: chrome.runtime.lastError.message
          }, '*');
        } else {
          window.postMessage({
            source: 'linkedin-crm-extension',
            type: 'QUERY_IDS_RESULT',
            data: queryIds
          }, '*');
        }
      });
      break;
      
    case 'SET_CONFIG':
      Object.assign(CONFIG, event.data.config);
      window.postMessage({
        source: 'linkedin-crm-extension',
        type: 'CONFIG_SET',
        data: CONFIG
      }, '*');
      break;
  }
});

// Expose extension ID for debugging
try {
  window.__linkedinCrmExtensionId = chrome.runtime.id;
  console.log('LinkedIn CRM: Extension ID exposed:', chrome.runtime.id);
} catch (e) {
  // Ignore
}

console.log('LinkedIn CRM: Page API ready - use window.postMessage to test');
