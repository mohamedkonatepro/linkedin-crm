/**
 * LinkedIn CRM Sync - Background Service Worker (Simplified)
 * Handles server communication and cookie management
 */

console.log('🚀 LinkedIn CRM Background Script loaded');

// =====================
// COOKIE MANAGEMENT
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

// =====================
// MESSAGE HANDLERS
// =====================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('📨 Background received:', message.type);
  
  switch (message.type) {
    case 'SYNC_TO_SERVER':
      syncToServer(message.apiUrl, message.data)
        .then(result => sendResponse({ ok: true, result }))
        .catch(err => sendResponse({ ok: false, error: err.message }));
      return true; // Keep channel open for async
      
    case 'GET_COOKIES':
      getLinkedInCookies()
        .then(cookies => sendResponse({ ok: true, cookies }))
        .catch(err => sendResponse({ ok: false, error: err.message }));
      return true;
      
    default:
      sendResponse({ error: 'Unknown message type' });
  }
});

// =====================
// SERVER SYNC
// =====================

async function syncToServer(apiUrl, data) {
  console.log('📤 Syncing to server:', apiUrl);
  
  const response = await fetch(`${apiUrl}/api/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Server error: ${response.status} - ${errorText}`);
  }
  
  return response.json();
}

// =====================
// INITIAL SETUP
// =====================

// Log when extension is installed
chrome.runtime.onInstalled.addListener((details) => {
  console.log('📦 Extension installed:', details.reason);
  
  // Set default config
  chrome.storage.local.set({
    apiUrl: 'http://localhost:3000',
    convLimit: 50,
    msgLimit: 20,
  });
});
