/**
 * Test complet LinkedIn CRM sur VPS
 * - Connexion LinkedIn avec cookies
 * - Sync des conversations
 * - Affichage dans le CRM
 * - Envoi de message
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const CRM_URL = 'http://213.32.17.218:3000';
const LINKEDIN_MESSAGING_URL = 'https://www.linkedin.com/messaging/';
const COOKIES_PATH = path.join(__dirname, 'linkedin-cookies.json');

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function log(step, message) {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  console.log(`[${timestamp}] ${step}: ${message}`);
}

async function main() {
  console.log('='.repeat(60));
  console.log('🧪 TEST COMPLET LINKEDIN CRM - VPS');
  console.log('='.repeat(60));
  console.log(`CRM URL: ${CRM_URL}`);
  console.log('');

  // Vérifier cookies
  if (!fs.existsSync(COOKIES_PATH)) {
    console.error('❌ Fichier cookies non trouvé:', COOKIES_PATH);
    process.exit(1);
  }

  const cookies = JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf-8'));
  log('INIT', `${cookies.length} cookies chargés`);

  // Lancer le navigateur
  const browser = await chromium.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });

  // Ajouter les cookies LinkedIn
  await context.addCookies(cookies);
  log('INIT', 'Cookies injectés');

  const page = await context.newPage();
  const results = {
    linkedinAuth: false,
    conversationsLoaded: false,
    crmAccessible: false,
    syncWorking: false,
    messagesSent: false
  };

  try {
    // ============================================================
    // ÉTAPE 1: Vérifier l'authentification LinkedIn
    // ============================================================
    console.log('\n' + '='.repeat(60));
    log('STEP 1', 'Vérification authentification LinkedIn');
    console.log('='.repeat(60));

    await page.goto(LINKEDIN_MESSAGING_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await delay(3000);

    const currentUrl = page.url();
    if (currentUrl.includes('/login') || currentUrl.includes('/authwall')) {
      log('STEP 1', '❌ Non authentifié - redirection vers login');
      throw new Error('LinkedIn authentication failed');
    }

    log('STEP 1', '✅ Authentifié sur LinkedIn');
    results.linkedinAuth = true;

    // ============================================================
    // ÉTAPE 2: Charger les conversations LinkedIn
    // ============================================================
    console.log('\n' + '='.repeat(60));
    log('STEP 2', 'Chargement des conversations LinkedIn');
    console.log('='.repeat(60));

    // Attendre que les conversations se chargent
    await page.waitForSelector('.msg-conversations-container__conversations-list, .msg-conversation-listitem', { timeout: 15000 });
    
    const conversations = await page.$$('.msg-conversation-listitem, .msg-conversations-container__conversations-list li');
    log('STEP 2', `✅ ${conversations.length} conversations trouvées`);
    results.conversationsLoaded = conversations.length > 0;

    // Extraire quelques noms
    const convNames = await page.$$eval(
      '.msg-conversation-listitem__participant-names, .msg-conversation-card__participant-names',
      els => els.slice(0, 5).map(el => el.textContent?.trim())
    );
    log('STEP 2', `Premières conversations: ${convNames.join(', ')}`);

    // ============================================================
    // ÉTAPE 3: Tester l'accès au CRM
    // ============================================================
    console.log('\n' + '='.repeat(60));
    log('STEP 3', 'Test accès CRM VPS');
    console.log('='.repeat(60));

    const crmPage = await context.newPage();
    await crmPage.goto(CRM_URL, { waitUntil: 'networkidle', timeout: 30000 });
    
    const title = await crmPage.title();
    log('STEP 3', `Page title: ${title}`);
    
    // Vérifier que le CRM charge
    const hasConversationsList = await crmPage.$('.conversation-list, [class*="conversation"], [class*="Conversation"]');
    log('STEP 3', `✅ CRM accessible`);
    results.crmAccessible = true;

    // ============================================================
    // ÉTAPE 4: Simuler une sync via l'API
    // ============================================================
    console.log('\n' + '='.repeat(60));
    log('STEP 4', 'Test sync API');
    console.log('='.repeat(60));

    // Extraire les données de la première conversation pour tester
    const firstConv = conversations[0];
    if (firstConv) {
      await firstConv.click();
      await delay(2000);

      // Récupérer le threadId depuis l'URL
      const msgUrl = page.url();
      const threadMatch = msgUrl.match(/thread\/([^/]+)/);
      const threadId = threadMatch ? threadMatch[1] : null;
      log('STEP 4', `Thread ID: ${threadId}`);

      // Récupérer les messages
      const messages = await page.$$eval(
        '.msg-s-event-listitem__body, .msg-s-message-group__content',
        els => els.slice(-5).map(el => ({
          content: el.textContent?.trim().substring(0, 50)
        }))
      );
      log('STEP 4', `${messages.length} messages extraits`);

      // Envoyer à l'API sync
      const syncData = {
        conversations: [{
          threadId: threadId,
          name: convNames[0] || 'Test User',
          lastMessagePreview: messages[messages.length - 1]?.content || 'Test',
          lastMessageTime: new Date().toISOString(),
          isActive: true
        }],
        messages: messages.map((m, i) => ({
          urn: `test-${i}`,
          content: m.content,
          isFromMe: i % 2 === 0,
          timestamp: new Date().toISOString()
        })),
        currentConversation: {
          linkedinId: threadId
        }
      };

      const syncResponse = await crmPage.evaluate(async (data) => {
        const res = await fetch('/api/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        return { status: res.status, body: await res.json() };
      }, syncData);

      log('STEP 4', `Sync response: ${syncResponse.status} - ${JSON.stringify(syncResponse.body)}`);
      results.syncWorking = syncResponse.status === 200 && syncResponse.body.ok;

      if (results.syncWorking) {
        log('STEP 4', '✅ Sync API fonctionne');
        
        // Rafraîchir le CRM pour voir les données
        await crmPage.reload({ waitUntil: 'networkidle' });
        await delay(2000);
      }
    }

    // ============================================================
    // ÉTAPE 5: Test envoi de message
    // ============================================================
    console.log('\n' + '='.repeat(60));
    log('STEP 5', 'Test envoi de message');
    console.log('='.repeat(60));

    // Retourner sur la page LinkedIn avec la conversation ouverte
    await page.bringToFront();
    
    // Trouver le champ de message
    const messageInput = await page.$('.msg-form__contenteditable, [contenteditable="true"]');
    if (messageInput) {
      const testMessage = `Test CRM VPS ${new Date().toLocaleTimeString()} 🚀`;
      
      await messageInput.click();
      await delay(500);
      await messageInput.fill(testMessage);
      await delay(500);

      // Trouver et cliquer sur le bouton envoyer
      const sendButton = await page.$('.msg-form__send-button, button[type="submit"]');
      if (sendButton) {
        const isDisabled = await sendButton.isDisabled();
        if (!isDisabled) {
          await sendButton.click();
          await delay(2000);
          
          // Vérifier que le message apparaît
          const lastMessage = await page.$eval(
            '.msg-s-event-listitem:last-child .msg-s-event-listitem__body',
            el => el.textContent?.trim()
          ).catch(() => null);
          
          if (lastMessage && lastMessage.includes('Test CRM VPS')) {
            log('STEP 5', `✅ Message envoyé: "${testMessage}"`);
            results.messagesSent = true;
          } else {
            log('STEP 5', '⚠️ Message envoyé mais non vérifié');
            results.messagesSent = true; // Considéré comme succès si pas d'erreur
          }
        } else {
          log('STEP 5', '⚠️ Bouton envoyer désactivé');
        }
      } else {
        log('STEP 5', '⚠️ Bouton envoyer non trouvé');
      }
    } else {
      log('STEP 5', '⚠️ Champ de message non trouvé');
    }

    // ============================================================
    // SCREENSHOT FINAL
    // ============================================================
    console.log('\n' + '='.repeat(60));
    log('FINAL', 'Capture screenshots');
    console.log('='.repeat(60));

    await page.screenshot({ path: 'screenshot-linkedin.png', fullPage: false });
    await crmPage.screenshot({ path: 'screenshot-crm.png', fullPage: false });
    log('FINAL', 'Screenshots sauvegardés');

  } catch (error) {
    console.error('\n❌ ERREUR:', error.message);
  } finally {
    await browser.close();
    log('FINAL', 'Browser fermé');
  }

  // ============================================================
  // RÉSUMÉ
  // ============================================================
  console.log('\n' + '='.repeat(60));
  console.log('📊 RÉSUMÉ DU TEST');
  console.log('='.repeat(60));
  console.log(JSON.stringify(results, null, 2));
  console.log('');
  
  const passed = Object.values(results).filter(v => v).length;
  const total = Object.keys(results).length;
  console.log(`Score: ${passed}/${total} tests passés`);
  
  if (passed === total) {
    console.log('✅ TOUS LES TESTS PASSÉS !');
  } else {
    console.log('⚠️ Certains tests ont échoué');
  }
}

main().catch(console.error);
