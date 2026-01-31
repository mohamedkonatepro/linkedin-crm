/**
 * Test script to capture LinkedIn API data structure
 * Run this in the browser console on LinkedIn messaging page
 */

(async () => {
  // Get CSRF token from cookies
  const getCsrfToken = () => {
    const match = document.cookie.match(/JSESSIONID="?([^";]+)"?/);
    return match ? match[1] : null;
  };

  const csrfToken = getCsrfToken();
  if (!csrfToken) {
    console.error('❌ No CSRF token found');
    return;
  }
  console.log('🔑 CSRF token:', csrfToken.slice(0, 20) + '...');

  // Get current user URN from page
  const getUserUrn = async () => {
    const res = await fetch('https://www.linkedin.com/voyager/api/me', {
      headers: {
        'csrf-token': csrfToken,
        'accept': 'application/vnd.linkedin.normalized+json+2.1',
      }
    });
    const data = await res.json();
    const miniProfile = data.included?.find(i => i.$type === 'com.linkedin.voyager.identity.shared.MiniProfile');
    return miniProfile?.dashEntityUrn || miniProfile?.entityUrn?.replace('fs_miniProfile', 'fsd_profile');
  };

  const userUrn = await getUserUrn();
  console.log('👤 User URN:', userUrn);

  // Fetch conversations
  const queryId = 'messengerConversations.0d5e6781bbee71c3e51c8843c6519f48';
  const url = `https://www.linkedin.com/voyager/api/voyagerMessagingGraphQL/graphql?queryId=${queryId}&variables=(mailboxUrn:${encodeURIComponent(userUrn)})`;
  
  console.log('🌐 Fetching:', url);
  
  const res = await fetch(url, {
    headers: {
      'csrf-token': csrfToken,
      'accept': 'application/vnd.linkedin.normalized+json+2.1',
    }
  });
  
  if (!res.ok) {
    console.error('❌ API error:', res.status, res.statusText);
    return;
  }
  
  const data = await res.json();
  
  console.log('📬 Full response:', data);
  console.log('📬 Types in included:', [...new Set(data.included?.map(i => i.$type) || [])]);
  
  // Find MessagingParticipants
  const participants = data.included?.filter(i => i.$type === 'com.linkedin.messenger.MessagingParticipant') || [];
  console.log('👥 MessagingParticipants count:', participants.length);
  
  if (participants.length > 0) {
    console.log('👥 First participant keys:', Object.keys(participants[0]));
    console.log('👥 First participant full:', JSON.stringify(participants[0], null, 2));
  }
  
  // Find conversations
  const conversations = data.included?.filter(i => i.$type === 'com.linkedin.messenger.Conversation') || [];
  console.log('💬 Conversations count:', conversations.length);
  
  if (conversations.length > 0) {
    console.log('💬 First conversation keys:', Object.keys(conversations[0]));
    console.log('💬 First conversation *conversationParticipants:', conversations[0]['*conversationParticipants']);
  }
  
  return { data, participants, conversations };
})();
