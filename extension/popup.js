/**
 * LinkedIn CRM - Popup Script
 * Handles UI and communication with background script
 */

// Elements
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const syncBtn = document.getElementById('syncBtn');
const apiSyncBtn = document.getElementById('apiSyncBtn');
const fetchAllConvBtn = document.getElementById('fetchAllConvBtn');
const fetchAllMsgBtn = document.getElementById('fetchAllMsgBtn');
const apiUrl = document.getElementById('apiUrl');
const autoSync = document.getElementById('autoSync');
const convCount = document.getElementById('convCount');
const msgCount = document.getElementById('msgCount');
const conversationList = document.getElementById('conversationList');
const lastSync = document.getElementById('lastSync');
const progressBar = document.getElementById('progressBar');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');

// State
let isConnected = false;
let isSyncing = false;
let currentTabId = null;
let apiConversations = [];

// =====================
// STORAGE
// =====================

async function loadConfig() {
  const result = await chrome.storage.local.get(['apiUrl', 'autoSync', 'lastSyncData', 'lastSyncTime', 'apiConversations']);
  
  if (result.apiUrl) {
    apiUrl.value = result.apiUrl;
  }
  
  if (result.autoSync) {
    autoSync.checked = result.autoSync;
  }
  
  if (result.lastSyncData) {
    updateUI(result.lastSyncData);
  }
  
  if (result.lastSyncTime) {
    lastSync.textContent = formatTime(new Date(result.lastSyncTime));
  }
  
  if (result.apiConversations) {
    apiConversations = result.apiConversations;
    updateConversationCount();
  }
}

async function saveConfig() {
  await chrome.storage.local.set({
    apiUrl: apiUrl.value,
    autoSync: autoSync.checked,
  });
}

// =====================
// UI UPDATES
// =====================

function setStatus(status, text) {
  statusDot.className = 'status-dot';
  if (status === 'connected') {
    statusDot.classList.add('connected');
    isConnected = true;
    syncBtn.disabled = false;
  } else if (status === 'syncing') {
    statusDot.classList.add('syncing');
  } else {
    isConnected = false;
    syncBtn.disabled = true;
  }
  statusText.textContent = text;
}

function showProgress(show, percent = 0, text = 'Chargement...') {
  if (show) {
    progressBar.classList.add('active');
    progressText.classList.add('active');
    progressFill.style.width = `${percent}%`;
    progressText.textContent = text;
  } else {
    progressBar.classList.remove('active');
    progressText.classList.remove('active');
  }
}

function updateConversationCount() {
  convCount.textContent = apiConversations.length || 0;
}

function updateUI(data) {
  // Update counts
  convCount.textContent = data.conversations?.length || apiConversations.length || 0;
  msgCount.textContent = data.messages?.length || 0;
  
  // Update conversation list
  const conversations = data.conversations || [];
  if (conversations.length > 0) {
    conversationList.innerHTML = conversations.slice(0, 5).map(conv => `
      <div class="conversation-item">
        <img 
          class="conversation-avatar" 
          src="${conv.avatarUrl || conv.participantProfilePicture || 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22/>'}" 
          alt=""
          onerror="this.style.display='none'"
        >
        <div class="conversation-info">
          <div class="conversation-name">${escapeHtml(conv.name || conv.participantName || 'Unknown')}</div>
          <div class="conversation-preview">${escapeHtml(conv.lastMessagePreview || conv.lastMessage || '')}</div>
        </div>
      </div>
    `).join('');
  } else {
    conversationList.innerHTML = `
      <div class="empty-state">
        <p>Aucune conversation synchronisée</p>
      </div>
    `;
  }
  
  // Update last sync time
  lastSync.textContent = formatTime(new Date());
  
  // Save to storage
  chrome.storage.local.set({
    lastSyncData: data,
    lastSyncTime: new Date().toISOString(),
  });
}

function formatTime(date) {
  return date.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// =====================
// DOM SYNC (existing)
// =====================

async function getLinkedInTab() {
  const tabs = await chrome.tabs.query({
    url: 'https://www.linkedin.com/messaging/*',
    active: true,
    currentWindow: true,
  });
  
  if (tabs.length > 0) {
    return tabs[0];
  }
  
  // Try any messaging tab
  const allTabs = await chrome.tabs.query({
    url: 'https://www.linkedin.com/messaging/*',
  });
  
  return allTabs[0] || null;
}

async function checkConnection() {
  const tab = await getLinkedInTab();
  
  if (!tab) {
    setStatus('disconnected', 'Ouvre LinkedIn Messaging');
    currentTabId = null;
    return false;
  }
  
  currentTabId = tab.id;
  
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'PING' });
    if (response?.ok) {
      setStatus('connected', 'Connecté à LinkedIn');
      return true;
    }
  } catch (e) {
    console.log('Connection check failed:', e.message);
  }
  
  setStatus('disconnected', 'Rafraîchis la page LinkedIn (F5)');
  return false;
}

async function triggerDOMSync() {
  if (isSyncing || !currentTabId) return;
  
  isSyncing = true;
  setStatus('syncing', 'Synchronisation DOM...');
  syncBtn.disabled = true;
  
  try {
    // Send config first
    await chrome.tabs.sendMessage(currentTabId, {
      type: 'SET_CONFIG',
      config: {
        API_URL: apiUrl.value,
      },
    });
    
    // Trigger sync
    const response = await chrome.tabs.sendMessage(currentTabId, {
      type: 'FULL_SYNC',
    });
    
    if (response) {
      updateUI(response);
      setStatus('connected', 'Synchronisé (DOM)');
    }
  } catch (e) {
    console.error('DOM Sync failed:', e);
    setStatus('connected', 'Erreur de sync');
  } finally {
    isSyncing = false;
    syncBtn.disabled = false;
  }
}

// =====================
// API SYNC (new)
// =====================

async function triggerAPISync() {
  if (isSyncing) return;
  
  isSyncing = true;
  setStatus('syncing', 'Sync API en cours...');
  apiSyncBtn.disabled = true;
  
  try {
    // Fetch first batch of conversations
    const response = await chrome.runtime.sendMessage({
      type: 'FETCH_CONVERSATIONS',
      start: 0,
      count: 20,
    });
    
    if (response.ok) {
      console.log('API Sync result:', response.data);
      
      // Transform API data to our format
      const conversations = transformAPIConversations(response.data.conversations);
      
      updateUI({
        conversations,
        messages: [],
      });
      
      setStatus('connected', `Sync API: ${conversations.length} conversations`);
    } else {
      throw new Error(response.error);
    }
  } catch (e) {
    console.error('API Sync failed:', e);
    setStatus('connected', 'Erreur API: ' + e.message);
  } finally {
    isSyncing = false;
    apiSyncBtn.disabled = false;
  }
}

async function fetchAllConversations() {
  if (isSyncing) return;
  
  isSyncing = true;
  setStatus('syncing', 'Récupération de toutes les conversations...');
  fetchAllConvBtn.disabled = true;
  showProgress(true, 0, 'Démarrage...');
  
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'FETCH_ALL_CONVERSATIONS',
    });
    
    if (response.ok) {
      apiConversations = response.data;
      const conversations = transformAPIConversations(response.data);
      
      // Save to storage
      await chrome.storage.local.set({ apiConversations: response.data });
      
      updateUI({
        conversations,
        messages: [],
      });
      
      // Sync to CRM server if configured
      if (apiUrl.value) {
        await syncToServer(conversations, []);
      }
      
      setStatus('connected', `✅ ${conversations.length} conversations récupérées`);
      showProgress(false);
    } else {
      throw new Error(response.error);
    }
  } catch (e) {
    console.error('Fetch all conversations failed:', e);
    setStatus('connected', 'Erreur: ' + e.message);
    showProgress(false);
  } finally {
    isSyncing = false;
    fetchAllConvBtn.disabled = false;
  }
}

async function fetchAllMessages() {
  if (isSyncing) return;
  
  if (apiConversations.length === 0) {
    alert('Récupère d\'abord les conversations !');
    return;
  }
  
  isSyncing = true;
  setStatus('syncing', 'Récupération de tous les messages...');
  fetchAllMsgBtn.disabled = true;
  
  const allMessages = [];
  const total = apiConversations.length;
  
  try {
    for (let i = 0; i < total; i++) {
      const conv = apiConversations[i];
      const convUrn = conv.entityUrn || conv['*conversation'];
      
      showProgress(true, Math.round((i / total) * 100), `Conversation ${i + 1}/${total}...`);
      
      const response = await chrome.runtime.sendMessage({
        type: 'FETCH_ALL_MESSAGES',
        conversationUrn: convUrn,
      });
      
      if (response.ok) {
        allMessages.push(...response.data);
      }
    }
    
    // Transform and update UI
    const messages = transformAPIMessages(allMessages);
    
    updateUI({
      conversations: transformAPIConversations(apiConversations),
      messages,
    });
    
    msgCount.textContent = messages.length;
    
    // Sync to CRM server if configured
    if (apiUrl.value) {
      await syncToServer(transformAPIConversations(apiConversations), messages);
    }
    
    setStatus('connected', `✅ ${messages.length} messages récupérés`);
    showProgress(false);
  } catch (e) {
    console.error('Fetch all messages failed:', e);
    setStatus('connected', 'Erreur: ' + e.message);
    showProgress(false);
  } finally {
    isSyncing = false;
    fetchAllMsgBtn.disabled = false;
  }
}

// =====================
// DATA TRANSFORMATION
// =====================

function transformAPIConversations(apiConversations) {
  console.log('🔄 Transforming', apiConversations.length, 'conversations');
  if (apiConversations.length > 0) {
    console.log('🔄 First conv keys:', Object.keys(apiConversations[0]));
  }
  
  return apiConversations.map((conv, index) => {
    const lastMessage = conv.lastActivityAt || conv.lastReadAt;
    
    // Use enriched data from background.js (prefixed with _)
    let participantName = conv._participantName || 'Unknown';
    let participantPicture = conv._participantPicture || null;
    let participantId = conv._participantId || null;
    
    // Fallback methods if enriched data not available
    if (participantName === 'Unknown') {
      // Method 1: participantFirstNames (legacy API)
      if (conv.participantFirstNames && Object.keys(conv.participantFirstNames).length > 0) {
        participantName = Object.values(conv.participantFirstNames).join(', ');
      }
      // Method 2: conversationParticipants
      else if (conv.conversationParticipants) {
        participantName = conv.conversationParticipants
          .map(p => p.firstName || p.name)
          .filter(Boolean)
          .join(', ');
      }
      // Method 3: title field
      else if (conv.title) {
        participantName = conv.title;
      }
    }
    
    // Get last message preview
    let lastMessagePreview = '';
    if (conv.lastMessage?.body?.text) {
      lastMessagePreview = conv.lastMessage.body.text;
    } else if (typeof conv.lastMessage?.body === 'string') {
      lastMessagePreview = conv.lastMessage.body;
    }
    
    const result = {
      id: conv.entityUrn || `conv-${index}`,
      entityUrn: conv.entityUrn,
      threadId: conv._fullUrn || conv.entityUrn,
      linkedinId: participantId,
      name: participantName,
      avatarUrl: participantPicture,
      headline: conv._participantHeadline || '',
      lastMessagePreview: lastMessagePreview,
      lastMessageTime: lastMessage ? new Date(lastMessage).toISOString() : null,
      unreadCount: conv.unreadCount || 0,
      isStarred: conv.starred || false,
      isUnread: (conv.unreadCount || 0) > 0,
    };
    
    if (index === 0) {
      console.log('🔄 First transformed:', result);
    }
    
    return result;
  });
}

function transformAPIMessages(apiMessages) {
  return apiMessages.map((msg, index) => {
    const fromProfile = msg['*from'] || msg.from;
    
    return {
      id: msg.entityUrn || `msg-${index}`,
      urn: msg.entityUrn,
      content: msg.body || msg.eventContent?.body || '',
      isFromMe: msg.fromCurrentUser || false,
      timestamp: msg.createdAt ? new Date(msg.createdAt).toISOString() : null,
      sender: {
        linkedinId: fromProfile,
        name: msg.fromParticipant?.firstName || 'Unknown',
      },
      conversationUrn: msg['*conversation'],
      raw: msg,
    };
  });
}

// =====================
// SERVER SYNC
// =====================

async function syncToServer(conversations, messages) {
  if (!apiUrl.value) return;
  
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'SYNC_TO_SERVER',
      apiUrl: apiUrl.value,
      data: {
        type: 'api_sync',
        timestamp: new Date().toISOString(),
        conversations,
        messages,
      },
    });
    
    if (!response.ok) {
      console.error('Server sync failed:', response.error);
    }
  } catch (e) {
    console.error('Server sync error:', e);
  }
}

// =====================
// PROGRESS LISTENER
// =====================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'FETCH_PROGRESS') {
    const { progress } = message;
    if (progress.percent !== undefined) {
      showProgress(true, progress.percent, `${progress.fetched}/${progress.total} conversations...`);
    } else if (progress.fetched !== undefined) {
      progressText.textContent = `${progress.fetched} messages...`;
    }
  }
  
  if (message.type === 'SYNC_DATA') {
    updateUI(message.data);
  }
});

// =====================
// EVENT LISTENERS
// =====================

syncBtn.addEventListener('click', triggerDOMSync);
apiSyncBtn.addEventListener('click', triggerAPISync);
fetchAllConvBtn.addEventListener('click', fetchAllConversations);
fetchAllMsgBtn.addEventListener('click', fetchAllMessages);
autoSync.addEventListener('change', saveConfig);
apiUrl.addEventListener('change', saveConfig);
apiUrl.addEventListener('blur', saveConfig);

// =====================
// INITIALIZATION
// =====================

async function init() {
  await loadConfig();
  await checkConnection();
  
  // Re-check connection every 2 seconds
  setInterval(checkConnection, 2000);
}

init();
