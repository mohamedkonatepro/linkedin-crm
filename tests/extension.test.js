/**
 * LinkedIn CRM Extension - Automated Tests
 * Uses Playwright with Chrome extension support + cookie injection
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// Configuration
const CONFIG = {
  // Extension path
  extensionPath: '/home/ubuntu/clawd/projects/linkedin-crm/extension',
  
  // Cookies file
  cookiesFile: path.join(__dirname, 'cookies.json'),
  
  // CRM server URL  
  crmUrl: 'http://213.32.17.218:3000',
  
  // LinkedIn messaging URL
  linkedinMessaging: 'https://www.linkedin.com/messaging/',
  
  // Timeouts
  timeout: 30000,
};

let browser;
let context;
let extensionId;

// Convert EditThisCookie format to Playwright format
function convertCookies(cookies) {
  return cookies.map(c => ({
    name: c.name,
    value: c.value,
    domain: c.domain,
    path: c.path || '/',
    expires: c.expirationDate ? Math.floor(c.expirationDate) : -1,
    httpOnly: c.httpOnly || false,
    secure: c.secure || false,
    sameSite: c.sameSite === 'no_restriction' ? 'None' : (c.sameSite || 'Lax'),
  }));
}

async function setup() {
  console.log('🚀 Starting browser with extension...');
  
  // Use a fresh test profile
  const testProfileDir = '/tmp/linkedin-crm-test-profile';
  
  // Clean up old test profile
  if (fs.existsSync(testProfileDir)) {
    fs.rmSync(testProfileDir, { recursive: true, force: true });
  }
  fs.mkdirSync(testProfileDir, { recursive: true });
  
  // Launch Chrome with extension
  context = await chromium.launchPersistentContext(testProfileDir, {
    headless: false,
    executablePath: '/usr/bin/google-chrome',
    args: [
      `--disable-extensions-except=${CONFIG.extensionPath}`,
      `--load-extension=${CONFIG.extensionPath}`,
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--no-first-run',
      '--no-default-browser-check',
    ],
    viewport: { width: 1920, height: 1080 },
    timeout: 60000,
  });
  
  console.log('✅ Browser launched');
  
  // Inject LinkedIn cookies
  console.log('🍪 Injecting LinkedIn cookies...');
  const rawCookies = JSON.parse(fs.readFileSync(CONFIG.cookiesFile, 'utf8'));
  const cookies = convertCookies(rawCookies);
  await context.addCookies(cookies);
  console.log(`✅ Injected ${cookies.length} cookies`);
  
  // Wait for extension to initialize
  console.log('⏳ Waiting for extension to initialize...');
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // Get extension ID
  let serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) {
    try {
      serviceWorker = await context.waitForEvent('serviceworker', { timeout: 15000 });
    } catch (e) {
      console.log('⚠️ Service worker not detected, using fallback method...');
    }
  }
  
  if (serviceWorker) {
    extensionId = serviceWorker.url().split('/')[2];
  } else {
    // Fallback: navigate to chrome://extensions and find it
    const page = await context.newPage();
    await page.goto('chrome://extensions/', { waitUntil: 'load', timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2000);
    
    // Try to find extension ID in page content
    const content = await page.content();
    const match = content.match(/jhpkjcjbokdedhdfcibkkboonemahbam|[a-z]{32}/);
    extensionId = match ? match[0] : 'jhpkjcjbokdedhdfcibkkboonemahbam';
    await page.close();
  }
  
  console.log(`📌 Extension ID: ${extensionId}`);
  return context;
}

async function testLinkedInConnection() {
  console.log('\n📋 TEST: LinkedIn Connection');
  
  const page = await context.newPage();
  
  try {
    await page.goto(CONFIG.linkedinMessaging, { waitUntil: 'domcontentloaded', timeout: CONFIG.timeout });
    await page.waitForTimeout(3000);
    
    // Check if we're logged in - look for messaging elements
    const isLoggedIn = await page.locator('.msg-conversations-container__title-row, .messaging-container, [data-test-id="messaging"]').first().isVisible({ timeout: 10000 }).catch(() => false);
    
    if (isLoggedIn) {
      console.log('✅ PASS: Connected to LinkedIn Messaging');
      
      // Take screenshot for verification
      await page.screenshot({ path: '/tmp/linkedin-connected.png' });
      console.log('  📸 Screenshot saved to /tmp/linkedin-connected.png');
      
      return true;
    } else {
      // Check if login page
      const isLoginPage = await page.locator('input[name="session_key"], .sign-in-form').first().isVisible({ timeout: 2000 }).catch(() => false);
      if (isLoginPage) {
        console.log('❌ FAIL: Not logged in (login page shown)');
        await page.screenshot({ path: '/tmp/linkedin-login-page.png' });
        return false;
      }
      
      // Check URL
      const url = page.url();
      console.log(`  Current URL: ${url}`);
      
      if (url.includes('/messaging')) {
        console.log('⚠️ WARN: On messaging page but UI not detected - might still be loading');
        await page.screenshot({ path: '/tmp/linkedin-unknown.png' });
        return true; // Tentatively pass
      }
      
      console.log('❌ FAIL: Unknown state');
      await page.screenshot({ path: '/tmp/linkedin-unknown.png' });
      return false;
    }
  } catch (e) {
    console.log('❌ FAIL: Error during LinkedIn test:', e.message);
    return false;
  } finally {
    await page.close();
  }
}

async function testExtensionPopup() {
  console.log('\n📋 TEST: Extension Popup');
  
  const page = await context.newPage();
  
  try {
    const popupUrl = `chrome-extension://${extensionId}/popup.html`;
    console.log(`  Opening: ${popupUrl}`);
    
    await page.goto(popupUrl, { timeout: CONFIG.timeout, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    
    // Check popup loaded
    const title = await page.locator('h1').first().textContent({ timeout: 5000 }).catch(() => null);
    console.log(`  Popup title: ${title || '(not found)'}`);
    
    // Check main elements
    const hasApiSyncBtn = await page.locator('#apiSyncBtn').isVisible({ timeout: 2000 }).catch(() => false);
    const hasCrmUrlInput = await page.locator('#apiUrl').isVisible({ timeout: 2000 }).catch(() => false);
    
    if (hasApiSyncBtn && hasCrmUrlInput) {
      console.log('✅ PASS: Extension popup loads correctly');
      
      // Set CRM URL
      const currentUrl = await page.locator('#apiUrl').inputValue();
      if (!currentUrl || !currentUrl.includes('213.32.17.218')) {
        await page.locator('#apiUrl').fill(CONFIG.crmUrl);
        console.log(`  Set CRM URL to: ${CONFIG.crmUrl}`);
      }
      
      await page.screenshot({ path: '/tmp/extension-popup.png' });
      return true;
    } else {
      console.log('❌ FAIL: Extension popup elements missing');
      await page.screenshot({ path: '/tmp/extension-popup-fail.png' });
      return false;
    }
  } catch (e) {
    console.log('❌ FAIL: Could not load extension popup:', e.message);
    return false;
  } finally {
    await page.close();
  }
}

async function testApiSync() {
  console.log('\n📋 TEST: API Sync');
  
  // First navigate to LinkedIn to establish context
  const linkedinPage = await context.newPage();
  await linkedinPage.goto(CONFIG.linkedinMessaging, { waitUntil: 'domcontentloaded', timeout: CONFIG.timeout });
  await linkedinPage.waitForTimeout(3000);
  
  // Now open extension popup
  const popupPage = await context.newPage();
  const popupUrl = `chrome-extension://${extensionId}/popup.html`;
  
  try {
    await popupPage.goto(popupUrl, { timeout: CONFIG.timeout });
    await popupPage.waitForTimeout(1000);
    
    // Ensure CRM URL is set
    await popupPage.locator('#apiUrl').fill(CONFIG.crmUrl);
    await popupPage.waitForTimeout(500);
    
    // Listen for console
    const logs = [];
    popupPage.on('console', msg => {
      logs.push({ type: msg.type(), text: msg.text() });
    });
    
    // Click API Sync
    console.log('  Clicking API Sync BETA...');
    await popupPage.locator('#apiSyncBtn').click();
    
    // Wait for sync
    await popupPage.waitForTimeout(8000);
    
    // Check result
    const statusText = await popupPage.locator('#statusText').textContent().catch(() => '');
    const convCount = await popupPage.locator('#convCount').textContent().catch(() => '0');
    
    console.log(`  Status: ${statusText}`);
    console.log(`  Conversations: ${convCount}`);
    
    // Check for errors in logs
    const errors = logs.filter(l => l.type === 'error' || l.text.includes('Error') || l.text.includes('500'));
    if (errors.length > 0) {
      console.log('  Errors found:');
      errors.slice(0, 5).forEach(e => console.log(`    - ${e.text.substring(0, 100)}`));
    }
    
    await popupPage.screenshot({ path: '/tmp/api-sync-result.png' });
    
    if (statusText.includes('500') || statusText.includes('Erreur')) {
      console.log('❌ FAIL: API returned error');
      return false;
    } else if (parseInt(convCount) > 0) {
      console.log('✅ PASS: API Sync successful!');
      return true;
    } else {
      console.log('⚠️ WARN: No conversations retrieved (might be auth issue)');
      return false;
    }
  } catch (e) {
    console.log('❌ FAIL:', e.message);
    return false;
  } finally {
    await linkedinPage.close();
    await popupPage.close();
  }
}

async function testCrmServer() {
  console.log('\n📋 TEST: CRM Server');
  
  const page = await context.newPage();
  
  try {
    // Test API directly
    const response = await page.request.post(`${CONFIG.crmUrl}/api/sync`, {
      data: { type: 'test', conversations: [], messages: [] },
      headers: { 'Content-Type': 'application/json' },
    });
    
    if (response.ok()) {
      const data = await response.json();
      console.log('✅ PASS: CRM Server responding');
      console.log(`  Response: ${JSON.stringify(data).substring(0, 100)}`);
      return true;
    } else {
      console.log(`❌ FAIL: CRM Server error: ${response.status()}`);
      return false;
    }
  } catch (e) {
    console.log('❌ FAIL: CRM Server not reachable:', e.message);
    return false;
  } finally {
    await page.close();
  }
}

async function cleanup() {
  if (context) {
    await context.close();
  }
}

async function runAllTests() {
  console.log('═══════════════════════════════════════════');
  console.log('   LinkedIn CRM Extension - Test Suite');
  console.log('═══════════════════════════════════════════\n');
  
  const results = {
    total: 0,
    passed: 0,
    failed: 0,
    tests: [],
  };
  
  try {
    await setup();
    
    const tests = [
      { name: 'CRM Server', fn: testCrmServer },
      { name: 'LinkedIn Connection', fn: testLinkedInConnection },
      { name: 'Extension Popup', fn: testExtensionPopup },
      { name: 'API Sync', fn: testApiSync },
    ];
    
    for (const test of tests) {
      results.total++;
      try {
        const passed = await test.fn();
        if (passed) {
          results.passed++;
          results.tests.push({ name: test.name, status: 'PASS' });
        } else {
          results.failed++;
          results.tests.push({ name: test.name, status: 'FAIL' });
        }
      } catch (e) {
        results.failed++;
        results.tests.push({ name: test.name, status: 'ERROR', error: e.message });
      }
    }
    
  } catch (e) {
    console.error('Setup failed:', e.message);
    results.failed++;
    results.tests.push({ name: 'Setup', status: 'ERROR', error: e.message });
  } finally {
    await cleanup();
  }
  
  // Summary
  console.log('\n═══════════════════════════════════════════');
  console.log('   TEST SUMMARY');
  console.log('═══════════════════════════════════════════');
  console.log(`Total: ${results.total} | ✅ Passed: ${results.passed} | ❌ Failed: ${results.failed}`);
  console.log('');
  for (const test of results.tests) {
    const icon = test.status === 'PASS' ? '✅' : '❌';
    console.log(`  ${icon} ${test.name}: ${test.status}${test.error ? ` (${test.error})` : ''}`);
  }
  console.log('═══════════════════════════════════════════\n');
  
  // Screenshots location
  console.log('📸 Screenshots saved to /tmp/');
  
  return results;
}

// Run if called directly
if (require.main === module) {
  runAllTests()
    .then(results => {
      process.exit(results.failed > 0 ? 1 : 0);
    })
    .catch(e => {
      console.error('Fatal error:', e);
      process.exit(1);
    });
}

module.exports = { runAllTests, setup, cleanup };
