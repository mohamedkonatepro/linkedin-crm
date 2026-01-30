/**
 * LinkedIn CRM - Popup Script
 */

// Elements
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const syncBtn = document.getElementById('syncBtn');
const apiUrl = document.getElementById('apiUrl');
const autoSync = document.getElementById('autoSync');
const convCount = document.getElementById('convCount');
const msgCount = document.getElementById('msgCount');
const conversationList = document.getElementById('conversationList');
const lastSync = document.getElementById('lastSync');

// State
let isConnected = false;
let isSyncing = false;
let currentTabId = null;

// =====================
// STORAGE
// =====================

async function loadConfig() {
  const result = await chrome.storage.local.get(['apiUrl', 'autoSync', 'lastSyncData', 'lastSyncTime']);
  
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

function updateUI(data) {
  // Update counts
  convCount.textContent = data.conversations?.length || 0;
  msgCount.textContent = data.messages?.length || 0;
  
  // Update conversation list
  if (data.conversations && data.conversations.length > 0) {
    conversationList.innerHTML = data.conversations.slice(0, 5).map(conv => `
      <div class="conversation-item">
        <img 
          class="conversation-avatar" 
          src="${conv.avatarUrl || 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22/>'}" 
          alt=""
          onerror="this.style.display='none'"
        >
        <div class="conversation-info">
          <div class="conversation-name">${escapeHtml(conv.name)}</div>
          <div class="conversation-preview">${escapeHtml(conv.lastMessagePreview || '')}</div>
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
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// =====================
// MESSAGING
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
    // Content script not loaded yet
    console.log('Connection check failed:', e.message);
  }
  
  setStatus('disconnected', 'Rafraîchis la page LinkedIn (F5)');
  return false;
}

async function triggerSync() {
  if (isSyncing || !currentTabId) return;
  
  isSyncing = true;
  setStatus('syncing', 'Synchronisation...');
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
      setStatus('connected', 'Synchronisé');
    }
  } catch (e) {
    console.error('Sync failed:', e);
    setStatus('connected', 'Erreur de sync');
  } finally {
    isSyncing = false;
    syncBtn.disabled = false;
  }
}

async function toggleAutoSync() {
  const enabled = autoSync.checked;
  
  // Save config regardless of connection status
  await saveConfig();
  
  if (!currentTabId) {
    console.log('No LinkedIn tab connected, config saved for later');
    return;
  }
  
  try {
    await chrome.tabs.sendMessage(currentTabId, {
      type: enabled ? 'START_AUTO_SYNC' : 'STOP_AUTO_SYNC',
    });
  } catch (e) {
    console.log('Tab not ready yet, config saved for later:', e.message);
    // Don't revert the checkbox - config is saved
  }
}

// =====================
// MESSAGE LISTENER
// =====================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SYNC_DATA') {
    updateUI(message.data);
  }
});

// =====================
// EVENT LISTENERS
// =====================

syncBtn.addEventListener('click', triggerSync);
autoSync.addEventListener('change', toggleAutoSync);
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
