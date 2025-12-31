// ATS Tailored CV & Cover Letter - Background Service Worker
// Handles extension lifecycle and Workday full flow coordination

console.log('[ATS Tailor] Background service worker started');

// Handle extension installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('[ATS Tailor] Extension installed - setting defaults');
    // Set default Workday credentials and auto-enable
    chrome.storage.local.set({
      workday_email: 'Maxokafordev@gmail.com',
      workday_password: 'May19315park@',
      workday_auto_enabled: true
    });
  } else if (details.reason === 'update') {
    console.log('[ATS Tailor] Extension updated to version', chrome.runtime.getManifest().version);
    // Ensure workday_auto_enabled defaults to true on update if not set
    chrome.storage.local.get(['workday_auto_enabled'], (result) => {
      if (result.workday_auto_enabled === undefined) {
        chrome.storage.local.set({ workday_auto_enabled: true });
      }
    });
  }
});

// Keep service worker alive and handle messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'keepAlive') {
    sendResponse({ status: 'alive' });
    return true;
  }
  
  // Open the extension popup when automation starts
  if (message.action === 'openPopup') {
    chrome.action.setBadgeText({ text: '⚙️' });
    chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' });
    sendResponse({ status: 'badge_set' });
    return true;
  }
  
  // Clear badge when automation completes
  if (message.action === 'clearBadge') {
    chrome.action.setBadgeText({ text: '' });
    sendResponse({ status: 'badge_cleared' });
    return true;
  }

  // Handle Workday full flow trigger from popup
  if (message.action === 'TRIGGER_WORKDAY_FLOW') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'START_WORKDAY_FLOW',
          candidateData: message.candidateData
        });
      }
    });
    sendResponse({ status: 'triggered' });
    return true;
  }

  // Handle ATS Tailor autofill (from Workday flow completion)
  if (message.action === 'ATS_TAILOR_AUTOFILL') {
    console.log('[ATS Tailor] Received autofill request for platform:', message.platform);
    // Store the data for the content script to use
    chrome.storage.local.set({
      pending_autofill: {
        platform: message.platform,
        candidate: message.candidate,
        jobData: message.jobData,
        timestamp: Date.now()
      }
    });
    sendResponse({ status: 'queued' });
    return true;
  }

  // Handle Workday credentials update
  if (message.action === 'UPDATE_WORKDAY_CREDENTIALS') {
    chrome.storage.local.set({
      workday_email: message.email,
      workday_password: message.password
    });
    sendResponse({ status: 'updated' });
    return true;
  }
});
