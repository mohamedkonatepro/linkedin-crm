/**
 * LinkedIn CRM - Background Service Worker
 */

// Handle installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('LinkedIn CRM extension installed');
});

// Handle messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SYNC_COMPLETE') {
    // Badge update to show sync status
    chrome.action.setBadgeText({ text: '✓' });
    chrome.action.setBadgeBackgroundColor({ color: '#22c55e' });
    
    // Clear badge after 2 seconds
    setTimeout(() => {
      chrome.action.setBadgeText({ text: '' });
    }, 2000);
  }
  
  return true;
});

// Listen for tab updates to inject content script if needed
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url?.includes('linkedin.com/messaging')) {
    console.log('LinkedIn messaging page detected');
  }
});
