/**
 * LinkedIn CRM - Background Service Worker
 * Handles API requests to bypass mixed content restrictions
 */

// Handle installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('LinkedIn CRM extension installed');
});

// Handle messages from content script and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received:', message.type);

  if (message.type === 'SYNC_COMPLETE') {
    // Badge update to show sync status
    chrome.action.setBadgeText({ text: '✓' });
    chrome.action.setBadgeBackgroundColor({ color: '#22c55e' });

    // Clear badge after 2 seconds
    setTimeout(() => {
      chrome.action.setBadgeText({ text: '' });
    }, 2000);
  }

  // Handle API requests from content script
  if (message.type === 'API_REQUEST') {
    const { url, method, body } = message;

    console.log('Background making API request to:', url);

    fetch(url, {
      method: method || 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    })
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        console.log('Background API success:', data);
        sendResponse({ ok: true, data });
      })
      .catch(error => {
        console.error('Background API error:', error);
        sendResponse({ ok: false, error: error.message });
      });

    // Return true to indicate we'll send response asynchronously
    return true;
  }

  return true;
});

// Listen for tab updates to inject content script if needed
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url?.includes('linkedin.com/messaging')) {
    console.log('LinkedIn messaging page detected');
  }
});
