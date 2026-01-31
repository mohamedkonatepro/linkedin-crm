/**
 * LinkedIn CRM Sync - Popup Script (Simplified)
 * Single button to sync conversations via DOM scraping
 */

// Elements
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const syncBtn = document.getElementById('syncBtn');
const syncBtnText = document.getElementById('syncBtnText');
const apiUrl = document.getElementById('apiUrl');
const convLimit = document.getElementById('convLimit');
const msgLimit = document.getElementById('msgLimit');
const convCount = document.getElementById('convCount');
const msgCount = document.getElementById('msgCount');
const lastSync = document.getElementById('lastSync');
const progressBar = document.getElementById('progressBar');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');

// State
let isSyncing = false;
let linkedInTabId = null;
let linkedInFrameId = null;

// =====================
// STORAGE
// =====================

async function loadConfig() {
  const result = await chrome.storage.local.get([
    'apiUrl', 'convLimit', 'msgLimit', 'lastSyncTime', 'lastStats'
  ]);
  
  if (result.apiUrl) apiUrl.value = result.apiUrl;
  if (result.convLimit) convLimit.value = result.convLimit;
  if (result.msgLimit) msgLimit.value = result.msgLimit;
  
  if (result.lastStats) {
    convCount.textContent = result.lastStats.conversations || 0;
    msgCount.textContent = result.lastStats.messages || 0;
  }
  
  if (result.lastSyncTime) {
    lastSync.textContent = `Dernière sync: ${formatTime(new Date(result.lastSyncTime))}`;
  }
}

async function saveConfig() {
  await chrome.storage.local.set({
    apiUrl: apiUrl.value,
    convLimit: parseInt(convLimit.value) || 50,
    msgLimit: parseInt(msgLimit.value) || 20,
  });
}

// =====================
// UI UPDATES
// =====================

function setStatus(status, text) {
  statusDot.className = 'status-dot';
  if (status === 'connected') {
    statusDot.classList.add('connected');
    syncBtn.disabled = false;
  } else if (status === 'syncing') {
    statusDot.classList.add('syncing');
    syncBtn.disabled = true;
  } else {
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

function formatTime(date) {
  return date.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

// =====================
// CONNECTION CHECK
// =====================

async function findLinkedInTab() {
  // First, try to find a LinkedIn messaging tab (direct or in iframe)
  // The content script runs in iframes too (all_frames: true)
  let tabs = await chrome.tabs.query({
    url: 'https://www.linkedin.com/messaging/*',
  });
  
  if (tabs.length > 0) {
    return { tab: tabs[0], type: 'direct' };
  }
  
  // Try to find CRM page - the iframe inside will have the content script
  tabs = await chrome.tabs.query({
    url: ['http://localhost:3000/*', 'http://127.0.0.1:3000/*', 'https://*.vercel.app/*', 'http://*/*'],
  });
  
  for (const tab of tabs) {
    // Try to ping the LinkedIn iframe inside this tab
    try {
      // Get all frames in this tab
      const frames = await chrome.webNavigation.getAllFrames({ tabId: tab.id });
      
      for (const frame of frames || []) {
        if (frame.url?.includes('linkedin.com/messaging')) {
          // Found LinkedIn iframe! Try to communicate
          try {
            const response = await chrome.tabs.sendMessage(tab.id, { type: 'PING' }, { frameId: frame.frameId });
            if (response?.ok) {
              return { tab, type: 'iframe', frameId: frame.frameId };
            }
          } catch (e) {
            console.log('Frame ping failed:', e.message);
          }
        }
      }
    } catch (e) {
      console.log('Frame check failed:', e.message);
    }
  }
  
  // Finally, any LinkedIn tab
  tabs = await chrome.tabs.query({
    url: 'https://www.linkedin.com/*',
  });
  
  if (tabs.length > 0) {
    return { tab: tabs[0], type: 'linkedin' };
  }
  
  return null;
}

async function checkConnection() {
  const result = await findLinkedInTab();
  
  if (!result) {
    setStatus('disconnected', 'Ouvre LinkedIn ou le CRM');
    linkedInTabId = null;
    linkedInFrameId = null;
    return false;
  }
  
  linkedInTabId = result.tab.id;
  linkedInFrameId = result.frameId || null;
  
  if (result.type === 'iframe') {
    setStatus('connected', 'Iframe LinkedIn détecté ✓');
    return true;
  }
  
  if (result.type === 'direct') {
    // Check if content script is loaded
    try {
      const response = await chrome.tabs.sendMessage(result.tab.id, { type: 'PING' });
      if (response?.ok) {
        setStatus('connected', 'LinkedIn Messaging ✓');
        return true;
      }
    } catch (e) {
      // Content script not responding
    }
    setStatus('disconnected', 'Rafraîchis LinkedIn (F5)');
    return false;
  }
  
  setStatus('disconnected', 'Va sur LinkedIn Messaging');
  return false;
}

// =====================
// SYNC
// =====================

async function triggerSync() {
  if (isSyncing) return;
  
  isSyncing = true;
  setStatus('syncing', 'Synchronisation...');
  syncBtn.classList.add('syncing');
  syncBtnText.textContent = 'Synchronisation...';
  showProgress(true, 0, 'Démarrage...');
  
  const config = {
    apiUrl: apiUrl.value,
    convLimit: parseInt(convLimit.value) || 50,
    msgLimit: parseInt(msgLimit.value) || 20,
  };
  
  try {
    // Send sync command to content script (with frameId if iframe)
    const messageOptions = linkedInFrameId ? { frameId: linkedInFrameId } : {};
    const response = await chrome.tabs.sendMessage(linkedInTabId, {
      type: 'FULL_SYNC',
      config,
    }, messageOptions);
    
    if (response?.ok) {
      const stats = {
        conversations: response.conversations?.length || 0,
        messages: response.totalMessages || 0,
      };
      
      convCount.textContent = stats.conversations;
      msgCount.textContent = stats.messages;
      
      // Save stats
      await chrome.storage.local.set({
        lastSyncTime: new Date().toISOString(),
        lastStats: stats,
      });
      
      lastSync.textContent = `Dernière sync: ${formatTime(new Date())}`;
      setStatus('connected', `✅ ${stats.conversations} conv. synchronisées`);
      showProgress(true, 100, 'Terminé !');
      
      setTimeout(() => showProgress(false), 2000);
    } else {
      throw new Error(response?.error || 'Sync failed');
    }
  } catch (e) {
    console.error('Sync failed:', e);
    setStatus('connected', '❌ Erreur: ' + e.message);
    showProgress(false);
  } finally {
    isSyncing = false;
    syncBtn.classList.remove('syncing');
    syncBtnText.textContent = 'Synchroniser';
    syncBtn.disabled = false;
  }
}

// =====================
// PROGRESS LISTENER
// =====================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SYNC_PROGRESS') {
    const { current, total, phase } = message;
    const percent = total > 0 ? Math.round((current / total) * 100) : 0;
    
    if (phase === 'conversations') {
      showProgress(true, percent * 0.5, `Conversations: ${current}/${total}`);
    } else if (phase === 'messages') {
      showProgress(true, 50 + percent * 0.5, `Messages: ${current}/${total}`);
    }
  }
});

// =====================
// EVENT LISTENERS
// =====================

syncBtn.addEventListener('click', triggerSync);
apiUrl.addEventListener('change', saveConfig);
apiUrl.addEventListener('blur', saveConfig);
convLimit.addEventListener('change', saveConfig);
msgLimit.addEventListener('change', saveConfig);

// =====================
// INIT
// =====================

async function init() {
  await loadConfig();
  await checkConnection();
  
  // Re-check connection every 2 seconds
  setInterval(checkConnection, 2000);
}

init();
