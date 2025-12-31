// content.js - AUTO-TAILOR + ATTACH v1.5.0 + WORKDAY FULL FLOW
// Automatically triggers tailoring on ATS pages, then attaches files
// Now includes Workday 4-step automation

(function() {
  'use strict';

  console.log('[ATS Tailor] AUTO-TAILOR v1.5.0 loaded on:', window.location.hostname);

  // ============ CONFIGURATION ============
  const SUPABASE_URL = 'https://wntpldomgjutwufphnpg.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndudHBsZG9tZ2p1dHd1ZnBobnBnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2MDY0NDAsImV4cCI6MjA4MjE4MjQ0MH0.vOXBQIg6jghsAby2MA1GfE-MNTRZ9Ny1W2kfUHGUzNM';
  
  // Workday Credentials (stored in chrome.storage, fallback defaults)
  let WORKDAY_EMAIL = 'Maxokafordev@gmail.com';
  let WORKDAY_PASSWORD = 'May19315park@';
  
  const SUPPORTED_HOSTS = [
    'greenhouse.io', 'job-boards.greenhouse.io', 'boards.greenhouse.io',
    'workday.com', 'myworkdayjobs.com', 'smartrecruiters.com',
    'bullhornstaffing.com', 'bullhorn.com', 'teamtailor.com',
    'workable.com', 'apply.workable.com', 'icims.com',
    'oracle.com', 'oraclecloud.com', 'taleo.net'
  ];

  // ============ WORKDAY SELECTORS (UPDATED FOR REAL WORKDAY PAGES) ============
  const WORKDAY_SELECTORS = {
    // Apply button selectors - multiple fallbacks for different Workday implementations
    apply: [
      'button[data-automation-id="jobPostingApplyButton"]',
      'a[data-automation-id="jobPostingApplyButton"]',
      '[data-automation-id="applyButton"]',
      'button.css-1ew5k9l', // Common Workday apply button class
      'a[href*="apply"]',
      'button', // Will be filtered by text content
    ],
    manualApply: [
      'button[data-automation-id="applyManually"]',
      '[data-automation-id="manuallyApply"]',
      'button[data-automation-id="continueWithoutLinkedin"]',
      'a[data-automation-id="applyManually"]',
    ],
    email: [
      'input[data-automation-id="email"]',
      'input[data-automation-id="userName"]', 
      'input[name="username"]',
      'input[type="email"]',
      'input[id*="email" i]',
      'input[name*="email" i]',
    ],
    password: [
      'input[data-automation-id="password"]',
      'input[name="password"]',
      'input[type="password"]',
    ],
    signIn: [
      'button[data-automation-id="signInButton"]',
      'button[type="submit"]',
      'input[type="submit"]',
    ],
    createAccount: [
      '[data-automation-id="createAccountLink"]',
      'a[href*="createAccount"]',
    ],
    firstName: ['input[data-automation-id="legalNameSection_firstName"]', 'input[data-automation-id="firstName"]', 'input[name*="firstName" i]'],
    lastName: ['input[data-automation-id="legalNameSection_lastName"]', 'input[data-automation-id="lastName"]', 'input[name*="lastName" i]'],
    email2: ['input[data-automation-id="email"]', 'input[name*="email" i]', 'input[type="email"]'],
    phone: ['input[data-automation-id="phone"]', 'input[name*="phone" i]', 'input[type="tel"]'],
    address: ['input[data-automation-id="addressSection_addressLine1"]', 'input[data-automation-id="addressLine1"]', 'input[name*="address" i]'],
    city: ['input[data-automation-id="addressSection_city"]', 'input[data-automation-id="city"]', 'input[name*="city" i]'],
    state: ['select[data-automation-id="addressSection_countryRegion"]', 'select[data-automation-id="state"]', 'input[name*="state" i]'],
    postalCode: ['input[data-automation-id="addressSection_postalCode"]', 'input[data-automation-id="postal"]', 'input[name*="zip" i]', 'input[name*="postal" i]'],
    country: ['select[data-automation-id="addressSection_country"]', 'select[data-automation-id="country"]'],
    continueBtn: ['button[data-automation-id="bottom-navigation-next-button"]', 'button[data-automation-id="saveAndContinueButton"]'],
    saveBtn: ['button[data-automation-id="saveAndContinue"]', 'button[type="submit"]'],
    STOP_AT: ['input[type="file"]', 'textarea[data-automation-id*="cover"]', '[data-automation-id="file-upload"]', 'div[data-automation-id="resumeUpload"]']
  };

  const isSupportedHost = (hostname) =>
    SUPPORTED_HOSTS.some((h) => hostname === h || hostname.endsWith(`.${h}`));

  if (!isSupportedHost(window.location.hostname)) {
    console.log('[ATS Tailor] Not a supported ATS host, skipping');
    return;
  }

  console.log('[ATS Tailor] Supported ATS detected - AUTO-TAILOR MODE ACTIVE!');

  // ============ STATE ============
  let filesLoaded = false;
  let cvFile = null;
  let coverFile = null;
  let coverLetterText = '';
  let hasTriggeredTailor = false;
  let tailoringInProgress = false;
  let workdayFlowInProgress = false;
  const startTime = Date.now();
  const currentJobUrl = window.location.href;

  // ============ UTILITY FUNCTIONS ============
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function normalizeLocation(text) {
    if (!text) return '';
    if (text.includes('US') || text.includes('United States')) {
      const cityMatch = text.match(/([A-Za-z\s]+),\s*(US|United States)/);
      const city = cityMatch?.[1]?.trim();
      return city ? `${city}, United States` : 'United States';
    }
    return text;
  }

  async function waitForElement(selectors, timeout = 10000, textMatch = null) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      for (const selector of selectors) {
        try {
          // Handle :contains pseudo-selector
          if (selector.includes(':contains(')) {
            const match = selector.match(/(.+?):contains\("(.+?)"\)/);
            if (match) {
              const [, baseSelector, text] = match;
              const elements = document.querySelectorAll(baseSelector || '*');
              for (const el of elements) {
                if (el.textContent?.includes(text) && el.offsetParent !== null) {
                  return el;
                }
              }
            }
          } else {
            const elements = document.querySelectorAll(selector);
            for (const el of elements) {
              if (el && el.offsetParent !== null) {
                // If textMatch is provided, check text content
                if (textMatch) {
                  const text = el.textContent?.trim().toLowerCase();
                  if (text === textMatch.toLowerCase() || text?.includes(textMatch.toLowerCase())) {
                    return el;
                  }
                } else {
                  return el;
                }
              }
            }
          }
        } catch (e) {}
      }
      await sleep(200);
    }
    return null;
  }

  async function clickElement(selectors, description = '', textMatch = null) {
    const el = await waitForElement(selectors, 5000, textMatch);
    if (el) {
      console.log(`[ATS Tailor] Clicking: ${description || selectors[0]}`);
      // Try multiple click methods for Workday
      try {
        el.focus();
        el.click();
      } catch (e) {}
      try {
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      } catch (e) {}
      await sleep(800);
      return true;
    }
    console.log(`[ATS Tailor] Could not find: ${description || selectors[0]}`);
    return false;
  }

  async function fillInput(selectors, value, description = '') {
    const el = await waitForElement(selectors, 3000);
    if (el && value) {
      console.log(`[ATS Tailor] Filling: ${description || selectors[0]}`);
      el.focus();
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      await sleep(200);
      return true;
    }
    return false;
  }

  function isAtResumeSection() {
    for (const selector of WORKDAY_SELECTORS.STOP_AT) {
      const el = document.querySelector(selector);
      if (el && el.offsetParent !== null) return true;
    }
    return false;
  }

  // ============ WORKDAY JOB SCRAPING ============
  function scrapeWorkdayJob() {
    const getText = (selectors) => {
      for (const sel of selectors) {
        try {
          const el = document.querySelector(sel);
          if (el?.textContent?.trim()) return el.textContent.trim();
        } catch {}
      }
      return '';
    };

    const title = getText([
      'h1[data-automation-id="jobPostingHeader"]',
      'h2[data-automation-id="jobPostingHeader"]',
      'h1',
      '[data-automation-id="jobTitle"]'
    ]);

    const company = getText([
      'div[data-automation-id="jobPostingCompany"]',
      '[data-automation-id="companyName"]',
      '.css-1m5e5g2'
    ]) || document.title.split(' at ').pop()?.split('|')[0]?.trim() || '';

    const rawLocation = getText([
      'div[data-automation-id="locations"]',
      '[data-automation-id="jobLocation"]',
      '.css-cygeeu'
    ]);
    const location = normalizeLocation(rawLocation);

    const description = getText([
      'div[data-automation-id="jobPostingDescription"]',
      '[data-automation-id="jobPostingDescription"]'
    ]).substring(0, 3000);

    return { title, company, location, description, url: window.location.href, platform: 'workday' };
  }

  // ============ WORKDAY FULL FLOW ============
  async function handleWorkdayFullFlow(candidateData = null) {
    if (workdayFlowInProgress) {
      console.log('[ATS Tailor] Workday flow already in progress');
      return;
    }

    workdayFlowInProgress = true;
    console.log('[ATS Tailor] 🚀 Starting Workday Full Flow');
    createStatusBanner();
    updateBanner('Workday Flow: Scraping job data...', 'working');

    try {
      // Load Workday credentials from storage
      const stored = await new Promise(resolve => {
        chrome.storage.local.get(['workday_email', 'workday_password'], resolve);
      });
      if (stored.workday_email) WORKDAY_EMAIL = stored.workday_email;
      if (stored.workday_password) WORKDAY_PASSWORD = stored.workday_password;

      // STEP 0: Scrape job data BEFORE clicking Apply
      const jobData = scrapeWorkdayJob();
      console.log('[ATS Tailor] Job scraped:', jobData.title, 'at', jobData.company);

      // STEP 1: Click Apply button (search by text "Apply")
      updateBanner('Step 1/4: Clicking Apply...', 'working');
      
      // Try specific selectors first, then fallback to text-based search
      let applyClicked = await clickElement(WORKDAY_SELECTORS.apply.slice(0, -1), 'Apply Button');
      if (!applyClicked) {
        // Fallback: find button/link with exact "Apply" text
        applyClicked = await clickElement(['button', 'a'], 'Apply Button', 'Apply');
      }
      if (!applyClicked) {
        console.log('[ATS Tailor] No Apply button found, may already be on application page');
      } else {
        console.log('[ATS Tailor] ✅ Apply button clicked!');
      }
      await sleep(2000);

      // STEP 2: Click Apply Manually (if popup appears)
      updateBanner('Step 2/4: Apply Manually...', 'working');
      await clickElement(WORKDAY_SELECTORS.manualApply, 'Apply Manually');
      await sleep(1500);

      // STEP 3: Login (if login modal appears)
      const emailField = await waitForElement(WORKDAY_SELECTORS.email, 3000);
      if (emailField) {
        updateBanner('Step 3/4: Logging in...', 'working');
        await fillInput(WORKDAY_SELECTORS.email, WORKDAY_EMAIL, 'Email');
        await fillInput(WORKDAY_SELECTORS.password, WORKDAY_PASSWORD, 'Password');
        await clickElement(WORKDAY_SELECTORS.signIn, 'Sign In');
        await sleep(3000);
      }

      // STEP 4: Auto-fill application pages until Resume section
      updateBanner('Step 4/4: Auto-filling application...', 'working');
      
      // Get candidate data from storage if not provided
      if (!candidateData) {
        const profile = await new Promise(resolve => {
          chrome.storage.local.get(['ats_session'], async (result) => {
            if (!result.ats_session?.access_token) {
              resolve(null);
              return;
            }
            try {
              const profileRes = await fetch(
                `${SUPABASE_URL}/rest/v1/profiles?user_id=eq.${result.ats_session.user.id}&select=*`,
                {
                  headers: {
                    apikey: SUPABASE_ANON_KEY,
                    Authorization: `Bearer ${result.ats_session.access_token}`,
                  },
                }
              );
              const profileRows = await profileRes.json();
              resolve(profileRows?.[0] || null);
            } catch (e) {
              resolve(null);
            }
          });
        });
        candidateData = profile;
      }

      // Auto-fill fields on each page
      let pageCount = 0;
      const maxPages = 10;
      
      while (pageCount < maxPages && !isAtResumeSection()) {
        pageCount++;
        console.log(`[ATS Tailor] Filling application page ${pageCount}`);
        
        // Fill personal info
        if (candidateData) {
          await fillInput(WORKDAY_SELECTORS.firstName, candidateData.first_name, 'First Name');
          await fillInput(WORKDAY_SELECTORS.lastName, candidateData.last_name, 'Last Name');
          await fillInput(WORKDAY_SELECTORS.email2, candidateData.email, 'Email');
          await fillInput(WORKDAY_SELECTORS.phone, candidateData.phone, 'Phone');
          await fillInput(WORKDAY_SELECTORS.address, candidateData.address, 'Address');
          await fillInput(WORKDAY_SELECTORS.city, candidateData.city, 'City');
          await fillInput(WORKDAY_SELECTORS.postalCode, candidateData.zip_code, 'Postal Code');
          
          // Handle state dropdown/input
          const stateEl = await waitForElement(WORKDAY_SELECTORS.state, 1000);
          if (stateEl && candidateData.state) {
            if (stateEl.tagName === 'SELECT') {
              stateEl.value = candidateData.state;
              stateEl.dispatchEvent(new Event('change', { bubbles: true }));
            } else {
              await fillInput(WORKDAY_SELECTORS.state, candidateData.state, 'State');
            }
          }
        }

        // Check if we've reached resume upload section
        if (isAtResumeSection()) {
          console.log('[ATS Tailor] 🎯 Reached Resume section - triggering ATS Tailor');
          break;
        }

        // Click Continue/Next to go to next page
        const continueClicked = await clickElement(WORKDAY_SELECTORS.continueBtn, 'Continue');
        if (!continueClicked) {
          // Try Save button as fallback
          await clickElement(WORKDAY_SELECTORS.saveBtn, 'Save');
        }
        
        await sleep(2000);
      }

      // TRIGGER EXISTING ATS TAILOR for resume/cover letter
      updateBanner('✅ Workday prep complete! Triggering ATS Tailor...', 'success');
      
      // Store job data for the tailor
      await new Promise(resolve => {
        chrome.storage.local.set({ 
          workday_job_data: jobData,
          workday_flow_complete: true 
        }, resolve);
      });

      // Send message to trigger main ATS tailor functionality
      chrome.runtime.sendMessage({
        action: 'ATS_TAILOR_AUTOFILL',
        platform: 'workday',
        candidate: candidateData,
        jobData: jobData
      });

      // Trigger the auto-tailor if on resume page
      if (isAtResumeSection()) {
        hasTriggeredTailor = false; // Reset to allow tailoring
        await autoTailorDocuments();
      }

    } catch (error) {
      console.error('[ATS Tailor] Workday flow error:', error);
      updateBanner(`Workday Error: ${error.message}`, 'error');
    } finally {
      workdayFlowInProgress = false;
    }
  }

  // ============ MESSAGE LISTENER FOR WORKDAY FLOW ============
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'START_WORKDAY_FLOW') {
      handleWorkdayFullFlow(message.candidateData);
      sendResponse({ status: 'started' });
      return true;
    }
    
    if (message.action === 'AUTOFILL_CANDIDATE') {
      // Handle bulk apply autofill
      if (message.candidate && message.platform === 'workday') {
        handleWorkdayFullFlow({
          first_name: message.candidate.name?.split(' ')[0] || '',
          last_name: message.candidate.name?.split(' ').slice(1).join(' ') || '',
          email: message.candidate.email,
          phone: message.candidate.phone
        });
      }
      sendResponse({ status: 'processing' });
      return true;
    }
  });

  // ============ PLATFORM DETECTION ============
  function detectPlatform() {
    const hostname = window.location.hostname;
    const url = window.location.href;
    
    if (hostname.includes('workday.com') || hostname.includes('myworkdayjobs.com')) {
      // Check if this is a job posting page vs application page
      if (url.includes('/job/') || url.includes('/jobs/')) {
        return 'workday_full_flow';
      }
      return 'workday';
    }
    if (hostname.includes('greenhouse.io')) return 'greenhouse';
    if (hostname.includes('smartrecruiters.com')) return 'smartrecruiters';
    if (hostname.includes('workable.com')) return 'workable';
    return 'unknown';
  }

  // Check if Workday automation is enabled
  async function isWorkdayAutoEnabled() {
    return new Promise(resolve => {
      chrome.storage.local.get(['workday_auto_enabled'], result => {
        resolve(result.workday_auto_enabled !== false); // Default enabled
      });
    });
  }

  // ============ STATUS BANNER ============
  function createStatusBanner() {
    if (document.getElementById('ats-auto-banner')) return;
    
    const banner = document.createElement('div');
    banner.id = 'ats-auto-banner';
    banner.innerHTML = `
      <style>
        #ats-auto-banner {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          z-index: 999999;
          background: linear-gradient(135deg, #ff6b35 0%, #ff8c42 100%);
          padding: 12px 20px;
          font: bold 14px system-ui, sans-serif;
          color: #000;
          text-align: center;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
          animation: ats-pulse 2s ease-in-out infinite;
        }
        @keyframes ats-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.85; }
        }
        #ats-auto-banner .ats-status { margin-left: 10px; }
        #ats-auto-banner.success { background: linear-gradient(135deg, #00ff88 0%, #00cc66 100%); }
        #ats-auto-banner.error { background: linear-gradient(135deg, #ff4444 0%, #cc0000 100%); color: #fff; }
      </style>
      <span>🚀 ATS TAILOR</span>
      <span class="ats-status" id="ats-banner-status">Detecting upload fields...</span>
    `;
    document.body.appendChild(banner);
  }

  function updateBanner(status, type = 'working') {
    const banner = document.getElementById('ats-auto-banner');
    const statusEl = document.getElementById('ats-banner-status');
    if (banner) {
      banner.className = type === 'success' ? 'success' : type === 'error' ? 'error' : '';
    }
    if (statusEl) statusEl.textContent = status;
  }

  function hideBanner() {
    const banner = document.getElementById('ats-auto-banner');
    if (banner) {
      setTimeout(() => banner.remove(), 5000);
    }
  }

  // ============ PDF FILE CREATION ============
  function createPDFFile(base64, name) {
    try {
      if (!base64) return null;
      
      let data = base64;
      if (base64.includes(',')) {
        data = base64.split(',')[1];
      }
      
      const byteString = atob(data);
      const buffer = new ArrayBuffer(byteString.length);
      const view = new Uint8Array(buffer);
      for (let i = 0; i < byteString.length; i++) {
        view[i] = byteString.charCodeAt(i);
      }
      
      const file = new File([buffer], name, { type: 'application/pdf' });
      console.log(`[ATS Tailor] Created PDF: ${name} (${file.size} bytes)`);
      return file;
    } catch (e) {
      console.error('[ATS Tailor] PDF creation failed:', e);
      return null;
    }
  }

  // ============ FIELD DETECTION ============
  function isCVField(input) {
    const text = (
      (input.labels?.[0]?.textContent || '') +
      (input.name || '') +
      (input.id || '') +
      (input.getAttribute('aria-label') || '') +
      (input.closest('label')?.textContent || '')
    ).toLowerCase();
    
    let parent = input.parentElement;
    for (let i = 0; i < 5 && parent; i++) {
      const parentText = (parent.textContent || '').toLowerCase().substring(0, 200);
      if ((parentText.includes('resume') || parentText.includes('cv')) && !parentText.includes('cover')) {
        return true;
      }
      parent = parent.parentElement;
    }
    
    return /(resume|cv|curriculum)/i.test(text) && !/cover/i.test(text);
  }

  function isCoverField(input) {
    const text = (
      (input.labels?.[0]?.textContent || '') +
      (input.name || '') +
      (input.id || '') +
      (input.getAttribute('aria-label') || '') +
      (input.closest('label')?.textContent || '')
    ).toLowerCase();
    
    let parent = input.parentElement;
    for (let i = 0; i < 5 && parent; i++) {
      const parentText = (parent.textContent || '').toLowerCase().substring(0, 200);
      if (parentText.includes('cover')) {
        return true;
      }
      parent = parent.parentElement;
    }
    
    return /cover/i.test(text);
  }

  function hasUploadFields() {
    // Check for file inputs
    const fileInputs = document.querySelectorAll('input[type="file"]');
    if (fileInputs.length > 0) return true;
    
    // Check for Greenhouse-style upload buttons
    const greenhouseUploads = document.querySelectorAll('[data-qa-upload], [data-qa="upload"], [data-qa="attach"]');
    if (greenhouseUploads.length > 0) return true;
    
    // Check for Workable autofill text
    if (document.body.textContent.includes('Autofill application')) return true;
    
    // Check for Resume/CV labels with buttons
    const labels = document.querySelectorAll('label, h3, h4, span');
    for (const label of labels) {
      const text = label.textContent?.toLowerCase() || '';
      if ((text.includes('resume') || text.includes('cv')) && text.length < 50) {
        return true;
      }
    }
    
    return false;
  }

  // ============ FIRE EVENTS ============
  function fireEvents(input) {
    ['change', 'input'].forEach(type => {
      input.dispatchEvent(new Event(type, { bubbles: true }));
    });
  }

  // ============ KILL X BUTTONS (scoped) ============
  function killXButtons() {
    // IMPORTANT: do NOT click generic "remove" buttons globally.
    // Only click remove/clear controls that are near file inputs / upload widgets.
    const isNearFileInput = (el) => {
      const root = el.closest('form') || document.body;
      const candidates = [
        el.closest('[data-qa-upload]'),
        el.closest('[data-qa="upload"]'),
        el.closest('[data-qa="attach"]'),
        el.closest('.field'),
        el.closest('[class*="upload" i]'),
        el.closest('[class*="attachment" i]'),
      ].filter(Boolean);

      for (const c of candidates) {
        if (c.querySelector('input[type="file"]')) return true;
        const t = (c.textContent || '').toLowerCase();
        if (t.includes('resume') || t.includes('cv') || t.includes('cover')) return true;
      }

      // fallback: within same form, are there any file inputs at all?
      return !!root.querySelector('input[type="file"]');
    };

    const selectors = [
      'button[aria-label*="remove" i]',
      'button[aria-label*="delete" i]',
      'button[aria-label*="clear" i]',
      '.remove-file',
      '[data-qa-remove]',
      '[data-qa*="remove"]',
      '[data-qa*="delete"]',
      '.file-preview button',
      '.file-upload-remove',
      '.attachment-remove',
    ];

    document.querySelectorAll(selectors.join(', ')).forEach((btn) => {
      try {
        if (!isNearFileInput(btn)) return;
        btn.click();
      } catch {}
    });

    document.querySelectorAll('button, [role="button"]').forEach((btn) => {
      const text = btn.textContent?.trim();
      if (text === '×' || text === 'x' || text === 'X' || text === '✕') {
        try {
          if (!isNearFileInput(btn)) return;
          btn.click();
        } catch {}
      }
    });
  }

  // ============ FORCE CV REPLACE ============
  function forceCVReplace() {
    if (!cvFile) return false;
    let attached = false;

    document.querySelectorAll('input[type="file"]').forEach((input) => {
      if (!isCVField(input)) return;

      // If already attached, do nothing (prevents flicker)
      if (input.files && input.files.length > 0) {
        attached = true;
        return;
      }

      const dt = new DataTransfer();
      dt.items.add(cvFile);
      input.files = dt.files;
      fireEvents(input);
      attached = true;
      console.log('[ATS Tailor] CV attached!');
    });

    return attached;
  }

  // ============ FORCE COVER REPLACE ============
  function forceCoverReplace() {
    if (!coverFile && !coverLetterText) return false;
    let attached = false;

    if (coverFile) {
      document.querySelectorAll('input[type="file"]').forEach((input) => {
        if (!isCoverField(input)) return;

        // If already attached, do nothing (prevents flicker)
        if (input.files && input.files.length > 0) {
          attached = true;
          return;
        }

        const dt = new DataTransfer();
        dt.items.add(coverFile);
        input.files = dt.files;
        fireEvents(input);
        attached = true;
        console.log('[ATS Tailor] Cover Letter attached!');
      });
    }

    if (coverLetterText) {
      document.querySelectorAll('textarea').forEach((textarea) => {
        const label = textarea.labels?.[0]?.textContent || textarea.name || textarea.id || '';
        if (/cover/i.test(label)) {
          if ((textarea.value || '').trim() === coverLetterText.trim()) {
            attached = true;
            return;
          }
          textarea.value = coverLetterText;
          fireEvents(textarea);
          attached = true;
        }
      });
    }

    return attached;
  }

  // ============ FORCE EVERYTHING ============
  function forceEverything() {
    // STEP 1: Greenhouse specific - click attach buttons to reveal hidden inputs
    document.querySelectorAll('[data-qa-upload], [data-qa="upload"], [data-qa="attach"]').forEach(btn => {
      const parent = btn.closest('.field') || btn.closest('[class*="upload"]') || btn.parentElement;
      const existingInput = parent?.querySelector('input[type="file"]');
      if (!existingInput || existingInput.offsetParent === null) {
        try { btn.click(); } catch {}
      }
    });
    
    // STEP 2: Make any hidden file inputs visible and accessible
    document.querySelectorAll('input[type="file"]').forEach(input => {
      if (input.offsetParent === null) {
        input.style.cssText = 'display:block !important; visibility:visible !important; opacity:1 !important; position:relative !important;';
      }
    });
    
    // STEP 3: Attach files
    forceCVReplace();
    forceCoverReplace();
  }

  // ============ EXTRACT JOB INFO ============
  function extractJobInfo() {
    const getText = (selectors) => {
      for (const sel of selectors) {
        try {
          const el = document.querySelector(sel);
          if (el?.textContent?.trim()) return el.textContent.trim();
        } catch {}
      }
      return '';
    };

    const getMeta = (name) =>
      document.querySelector(`meta[name="${name}"]`)?.getAttribute('content') ||
      document.querySelector(`meta[property="${name}"]`)?.getAttribute('content') || '';

    const hostname = window.location.hostname;
    
    const platformSelectors = {
      greenhouse: {
        title: ['h1.app-title', 'h1.posting-headline', 'h1', '[data-test="posting-title"]'],
        company: ['#company-name', '.company-name', '.posting-categories strong'],
        location: ['.location', '.posting-categories .location'],
        description: ['#content', '.posting', '.posting-description'],
      },
      workday: {
        title: ['h1[data-automation-id="jobPostingHeader"]', 'h1'],
        company: ['div[data-automation-id="jobPostingCompany"]'],
        location: ['div[data-automation-id="locations"]'],
        description: ['div[data-automation-id="jobPostingDescription"]'],
      },
      smartrecruiters: {
        title: ['h1[data-test="job-title"]', 'h1'],
        company: ['[data-test="job-company-name"]'],
        location: ['[data-test="job-location"]'],
        description: ['[data-test="job-description"]'],
      },
      workable: {
        title: ['h1', '[data-ui="job-title"]'],
        company: ['[data-ui="company-name"]'],
        location: ['[data-ui="job-location"]'],
        description: ['[data-ui="job-description"]'],
      },
    };

    let platformKey = null;
    if (hostname.includes('greenhouse.io')) platformKey = 'greenhouse';
    else if (hostname.includes('workday.com') || hostname.includes('myworkdayjobs.com')) platformKey = 'workday';
    else if (hostname.includes('smartrecruiters.com')) platformKey = 'smartrecruiters';
    else if (hostname.includes('workable.com')) platformKey = 'workable';

    const selectors = platformKey ? platformSelectors[platformKey] : null;

    let title = selectors ? getText(selectors.title) : '';
    if (!title) title = getMeta('og:title') || document.title?.split('|')?.[0]?.split('-')?.[0]?.trim() || '';

    let company = selectors ? getText(selectors.company) : '';
    if (!company) company = getMeta('og:site_name') || '';
    if (!company && title.includes(' at ')) {
      company = document.title.split(' at ').pop()?.split('|')[0]?.split('-')[0]?.trim() || '';
    }

    const location = selectors ? getText(selectors.location) : '';
    const rawDesc = selectors ? getText(selectors.description) : '';
    const description = rawDesc?.trim()?.length > 80 ? rawDesc.trim().substring(0, 3000) : '';

    return { title, company, location, description, url: window.location.href, platform: platformKey || hostname };
  }

  // ============ AUTO-TAILOR DOCUMENTS ============
  async function autoTailorDocuments() {
    if (hasTriggeredTailor || tailoringInProgress) {
      console.log('[ATS Tailor] Already triggered or in progress, skipping');
      return;
    }

    // Check if we've already tailored for this URL
    const cached = await new Promise(resolve => {
      chrome.storage.local.get(['ats_tailored_urls'], result => {
        resolve(result.ats_tailored_urls || {});
      });
    });
    
    if (cached[currentJobUrl]) {
      console.log('[ATS Tailor] Already tailored for this URL, loading cached files');
      loadFilesAndStart();
      return;
    }

    hasTriggeredTailor = true;
    tailoringInProgress = true;
    
    createStatusBanner();
    updateBanner('Generating tailored CV & Cover Letter...', 'working');

    try {
      // Get session
      const session = await new Promise(resolve => {
        chrome.storage.local.get(['ats_session'], result => resolve(result.ats_session));
      });

      if (!session?.access_token || !session?.user?.id) {
        updateBanner('Please login via extension popup first', 'error');
        console.log('[ATS Tailor] No session, user needs to login');
        tailoringInProgress = false;
        return;
      }

      // Get user profile
      updateBanner('Loading your profile...', 'working');
      const profileRes = await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?user_id=eq.${session.user.id}&select=first_name,last_name,email,phone,linkedin,github,portfolio,cover_letter,work_experience,education,skills,certifications,achievements,ats_strategy,city,country,address,state,zip_code`,
        {
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      if (!profileRes.ok) {
        throw new Error('Could not load profile');
      }

      const profileRows = await profileRes.json();
      const p = profileRows?.[0] || {};

      // Extract job info from page
      const jobInfo = extractJobInfo();
      if (!jobInfo.title) {
        updateBanner('Could not detect job info, please use popup', 'error');
        tailoringInProgress = false;
        return;
      }

      console.log('[ATS Tailor] Job detected:', jobInfo.title, 'at', jobInfo.company);
      updateBanner(`Tailoring for: ${jobInfo.title}...`, 'working');

      // Call tailor API
      const response = await fetch(`${SUPABASE_URL}/functions/v1/tailor-application`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          jobTitle: jobInfo.title,
          company: jobInfo.company,
          location: jobInfo.location,
          description: jobInfo.description,
          requirements: [],
          userProfile: {
            firstName: p.first_name || '',
            lastName: p.last_name || '',
            email: p.email || session.user.email || '',
            phone: p.phone || '',
            linkedin: p.linkedin || '',
            github: p.github || '',
            portfolio: p.portfolio || '',
            coverLetter: p.cover_letter || '',
            workExperience: Array.isArray(p.work_experience) ? p.work_experience : [],
            education: Array.isArray(p.education) ? p.education : [],
            skills: Array.isArray(p.skills) ? p.skills : [],
            certifications: Array.isArray(p.certifications) ? p.certifications : [],
            achievements: Array.isArray(p.achievements) ? p.achievements : [],
            atsStrategy: p.ats_strategy || '',
            city: p.city || undefined,
            country: p.country || undefined,
            address: p.address || undefined,
            state: p.state || undefined,
            zipCode: p.zip_code || undefined,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Tailoring failed');
      }

      const result = await response.json();
      if (result.error) throw new Error(result.error);

      console.log('[ATS Tailor] Tailoring complete! Match score:', result.matchScore);
      updateBanner(`✅ Generated! Match: ${result.matchScore}% - Attaching files...`, 'success');

      // Store PDFs in chrome.storage for the attach loop
      const fallbackName = `${(p.first_name || '').trim()}_${(p.last_name || '').trim()}`.replace(/\s+/g, '_') || 'Applicant';
      
      await new Promise(resolve => {
        chrome.storage.local.set({
          cvPDF: result.resumePdf,
          coverPDF: result.coverLetterPdf,
          coverLetterText: result.tailoredCoverLetter || result.coverLetter || '',
          cvFileName: result.cvFileName || `${fallbackName}_CV.pdf`,
          coverFileName: result.coverLetterFileName || `${fallbackName}_Cover_Letter.pdf`,
          ats_lastGeneratedDocuments: {
            cv: result.tailoredResume,
            coverLetter: result.tailoredCoverLetter || result.coverLetter,
            cvPdf: result.resumePdf,
            coverPdf: result.coverLetterPdf,
            cvFileName: result.cvFileName || `${fallbackName}_CV.pdf`,
            coverFileName: result.coverLetterFileName || `${fallbackName}_Cover_Letter.pdf`,
            matchScore: result.matchScore || 0,
          }
        }, resolve);
      });

      // Mark this URL as tailored
      cached[currentJobUrl] = Date.now();
      await new Promise(resolve => {
        chrome.storage.local.set({ ats_tailored_urls: cached }, resolve);
      });

      // Now load files and start attaching
      loadFilesAndStart();
      
      updateBanner(`✅ Done! Match: ${result.matchScore}% - Files attached!`, 'success');
      hideBanner();

    } catch (error) {
      console.error('[ATS Tailor] Auto-tailor error:', error);
      updateBanner(`Error: ${error.message}`, 'error');
    } finally {
      tailoringInProgress = false;
    }
  }

  // ============ TURBO-FAST REPLACE LOOP (guarded) ============
  let attachLoopStarted = false;
  let attachLoop200ms = null;
  let attachLoop1s = null;

  function stopAttachLoops() {
    if (attachLoop200ms) clearInterval(attachLoop200ms);
    if (attachLoop1s) clearInterval(attachLoop1s);
    attachLoop200ms = null;
    attachLoop1s = null;
    attachLoopStarted = false;
  }

  function areBothAttached() {
    const fileInputs = Array.from(document.querySelectorAll('input[type="file"]'));
    const cvOk = !cvFile || fileInputs.some((i) => isCVField(i) && i.files && i.files.length > 0);
    const coverOk = (!coverFile && !coverLetterText) ||
      fileInputs.some((i) => isCoverField(i) && i.files && i.files.length > 0) ||
      Array.from(document.querySelectorAll('textarea')).some((t) => /cover/i.test((t.labels?.[0]?.textContent || t.name || t.id || '')) && (t.value || '').trim().length > 0);

    return cvOk && coverOk;
  }

  function ultraFastReplace() {
    if (attachLoopStarted) return;
    attachLoopStarted = true;

    // Run a single cleanup once right before attaching (prevents UI flicker)
    killXButtons();

    attachLoop200ms = setInterval(() => {
      if (!filesLoaded) return;
      forceCVReplace();
      forceCoverReplace();

      if (areBothAttached()) {
        console.log('[ATS Tailor] Attach complete — stopping loops');
        stopAttachLoops();
      }
    }, 200);

    attachLoop1s = setInterval(() => {
      if (!filesLoaded) return;
      forceEverything();

      if (areBothAttached()) {
        console.log('[ATS Tailor] Attach complete — stopping loops');
        stopAttachLoops();
      }
    }, 1000);
  }

  // ============ LOAD FILES AND START ==========
  function loadFilesAndStart() {
    chrome.storage.local.get(['cvPDF', 'coverPDF', 'coverLetterText', 'cvFileName', 'coverFileName'], (data) => {
      cvFile = createPDFFile(data.cvPDF, data.cvFileName || 'Tailored_Resume.pdf');
      coverFile = createPDFFile(data.coverPDF, data.coverFileName || 'Tailored_Cover_Letter.pdf');
      coverLetterText = data.coverLetterText || '';
      filesLoaded = true;

      console.log('[ATS Tailor] Files loaded, starting attach');

      // Immediate attach attempt
      forceEverything();

      // Start guarded loop
      ultraFastReplace();
    });
  }

  // ============ INIT - AUTO-DETECT AND TAILOR ============
  async function initAutoTailor() {
    const platform = detectPlatform();
    console.log('[ATS Tailor] Detected platform:', platform);

    // AUTO-START WORKDAY FLOW if on a Workday job page
    if (platform === 'workday_full_flow') {
      console.log('[ATS Tailor] 🎯 Workday job page detected!');
      
      // Check if auto-enabled
      const autoEnabled = await isWorkdayAutoEnabled();
      if (autoEnabled) {
        console.log('[ATS Tailor] ✅ Workday auto-mode enabled, starting flow in 2 seconds...');
        
        // Show notification banner
        createStatusBanner();
        updateBanner('🎯 Workday detected! Auto-starting in 2s...', 'working');
        
        // Wait for page to fully load, then start
        setTimeout(async () => {
          console.log('[ATS Tailor] 🚀 Auto-starting Workday Full Flow!');
          await handleWorkdayFullFlow();
        }, 2000);
      } else {
        console.log('[ATS Tailor] ⏸️ Workday auto-mode disabled. Use popup to trigger.');
        createStatusBanner();
        updateBanner('Workday detected! Click "Run Workday Flow" in extension popup', 'working');
        setTimeout(() => {
          const banner = document.getElementById('ats-auto-banner');
          if (banner) banner.remove();
        }, 5000);
      }
      return;
    }

    // Standard ATS flow - wait for page to stabilize
    setTimeout(() => {
      if (hasUploadFields()) {
        console.log('[ATS Tailor] Upload fields detected! Starting auto-tailor...');
        autoTailorDocuments();
      } else {
        console.log('[ATS Tailor] No upload fields yet, watching for changes...');
        
        // Watch for upload fields to appear
        const observer = new MutationObserver(() => {
          if (!hasTriggeredTailor && hasUploadFields()) {
            console.log('[ATS Tailor] Upload fields appeared! Starting auto-tailor...');
            observer.disconnect();
            autoTailorDocuments();
          }
        });
        
        observer.observe(document.body, { childList: true, subtree: true });
        
        // Fallback: check again after 5s
        setTimeout(() => {
          if (!hasTriggeredTailor && hasUploadFields()) {
            observer.disconnect();
            autoTailorDocuments();
          }
        }, 5000);
      }
    }, 1500); // Wait 1.5s for page to load
  }

  // Start
  initAutoTailor();

})();
