/*
// USE IT LIKE THIS:
// <script src="https://.../loginbroker.v1.js?mode=popup"></script>
// or
// <script src="https://.../loginbroker.v1.js?mode=redirect"></script>
//
// Create a callback function to handle when a session is received
function handleSessionReceived(sessionId) {
  console.log('Received sessionId:', sessionId);
  // Verify the sessionId on your server-side or API and get the logged-in user email
}

// Create a callback function to handle errors
function handleErrorReceived(error) {
  console.log('Error happened:', error);
}

// Create a new instance of the useLoginBroker function
const loginBroker = useLoginBroker('loginbroker', 'google', handleSessionReceived, handleErrorReceived);

// Start the login process
loginBroker.startLoginProcess();
*/

function useLoginBroker(tenantName, platform, onSessionReceived, onErrorReceived) {
  let sessionId = null;
  let retryCount = 0;
  let hasBeenPending = false;
  let hasCompleted = false;
  const storagePrefix = 'loginbroker:';
  const mode = getLoginMode();

  if (mode === 'redirect') {
    resumePendingLogin();
  }

  function generateRandomString(length) {
    const allowedChars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let randomString = '';

    for (let i = 0; i < length; i++) {
      const randomIndex = Math.floor(Math.random() * allowedChars.length);
      const randomChar = allowedChars.charAt(randomIndex);
      randomString += randomChar;
    }

    return randomString;
  }

  function getLoginMode() {
    console.group('LoginBroker: Determining Mode');
    try {
      const script = document.currentScript || findLoginBrokerScript();
      
      if (!script) {
        console.warn('No script tag found. Defaulting to popup.');
        console.groupEnd();
        return 'popup';
      }

      console.log('Found script tag:', script.src);
      const scriptUrl = new URL(script.src, window.location.href);
      const configuredMode = scriptUrl.searchParams.get('mode') || scriptUrl.searchParams.get('flow');
      
      console.log('Detected mode from URL params:', configuredMode);

      if (configuredMode === 'redirect') {
        console.log('Mode set to REDIRECT');
        console.groupEnd();
        return 'redirect';
      }

      console.log('Mode defaulting to POPUP');
      console.groupEnd();
      return 'popup';
    } catch (error) {
      console.error('Error in getLoginMode:', error);
      console.groupEnd();
      return 'popup'; 
    }
  }

  function findLoginBrokerScript() {
    const scripts = document.getElementsByTagName('script');
    console.log(`Searching through ${scripts.length} script tags...`);

    for (let i = scripts.length - 1; i >= 0; i--) {
      const script = scripts[i];
      // Check for .v2 specifically since that is your current file
      if (script.src && script.src.indexOf('loginbroker.v2.js') !== -1) {
        return script;
      }
    }

    return null;
  }

  function getStorageKey(currentSessionId) {
    return `${storagePrefix}${currentSessionId}`;
  }

  function persistSessionState(currentSessionId, state) {
    try {
      localStorage.setItem(getStorageKey(currentSessionId), JSON.stringify(state));
    } catch (error) {
      console.warn('Unable to save login broker state.', error);
    }
  }

  function readSessionState(currentSessionId) {
    try {
      const raw = localStorage.getItem(getStorageKey(currentSessionId));
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      console.warn('Unable to read login broker state.', error);
      return null;
    }
  }

  function clearSessionState(currentSessionId) {
    try {
      localStorage.removeItem(getStorageKey(currentSessionId));
    } catch (error) {
      console.warn('Unable to clear login broker state.', error);
    }
  }

  function cleanupUrlState() {
    try {
      const currentUrl = new URL(window.location.href);
      currentUrl.searchParams.delete('loginBrokerStatus');
      currentUrl.searchParams.delete('loginBrokerSessionId');
      window.history.replaceState({}, document.title, currentUrl.toString());
    } catch (error) {
      console.warn('Unable to clean login broker URL state.', error);
    }
  }

  function resumePendingLogin() {
    try {
      const currentUrl = new URL(window.location.href);
      const returnedSessionId = currentUrl.searchParams.get('loginBrokerSessionId');
      const returnedStatus = currentUrl.searchParams.get('loginBrokerStatus');

      if (returnedSessionId && returnedStatus === 'completed') {
        hasCompleted = true;
        sessionStorage.removeItem('loginbroker:pendingSessionId');
        clearSessionState(returnedSessionId);
        cleanupUrlState();
        onSessionReceived(returnedSessionId);
        return;
      }

      const pendingSessionId = sessionStorage.getItem('loginbroker:pendingSessionId');
      if (!pendingSessionId) {
        return;
      }

      const state = readSessionState(pendingSessionId);
      sessionId = pendingSessionId;

      if (state && state.status === 'completed') {
        hasCompleted = true;
        sessionStorage.removeItem('loginbroker:pendingSessionId');
        clearSessionState(pendingSessionId);
        onSessionReceived(pendingSessionId);
        return;
      }

      fetchStatus(pendingSessionId);
    } catch (error) {
      console.warn('Unable to resume login broker session.', error);
    }
  }

  function confirmLogin() {
    fetchStatus(sessionId);
  }

  function fetchStatus(currentSessionId) {
    console.log('fetchStatus starting');
    console.log('currentSessionId:', currentSessionId);
    if (currentSessionId) {
      fetch(`https://api.login.broker/${tenantName}/auth/status/${currentSessionId}`)
        .then(response => response.text())
        .then(handleStatusResponse)
        .catch(handleError);
    }
  }

  function handleStatusResponse(data) {
    if (hasCompleted) {
      return;
    }

    if (data === 'completed') {
      hasCompleted = true;
      sessionStorage.removeItem('loginbroker:pendingSessionId');
      clearSessionState(sessionId);
      onSessionReceived(sessionId);
    } else if (data === 'failed') {
      sessionStorage.removeItem('loginbroker:pendingSessionId');
      clearSessionState(sessionId);
      console.log('Login failed. Try again');
      onErrorReceived(data);
    } else if (data === 'pending') {
      hasBeenPending = true;
      retryLoginOrGiveUp();
    } else if (hasBeenPending) {
      console.log('Session expired');
      onErrorReceived(data);
    } else {
      console.log('Session not yet available');
      retryLoginOrGiveUp();
    }
  }

  function retryLoginOrGiveUp() {
    if (retryCount < 60) {
      retryCount++;
      setTimeout(confirmLogin, 2000); // Retry after 2 seconds
    } else {
      console.log('Max retries reached while pending. Giving up.');
      onErrorReceived('Max retries reached while pending. Giving up.');
    }
  }

  function handleError(error) {
    console.error(error);
    onErrorReceived(error);
  }

  function buildLoginUrl(currentSessionId) {
    const loginUrl = new URL(`https://${platform}.login.broker/${tenantName}/auth/${platform}/session/${currentSessionId}`);

    if (mode === 'redirect') {
      loginUrl.searchParams.set('returnUrl', window.location.href);
    }

    return loginUrl.toString();
  }

  function startPolling(currentSessionId) {
    sessionId = currentSessionId;
    retryCount = 0;
    hasBeenPending = false;
    hasCompleted = false;
    sessionStorage.setItem('loginbroker:pendingSessionId', currentSessionId);
    persistSessionState(currentSessionId, {
      status: 'pending',
      sessionId: currentSessionId,
      returnUrl: window.location.href,
      startedAt: new Date().toISOString()
    });

    setTimeout(() => {
      fetchStatus(currentSessionId);
    }, 2000);
  }

  function startLoginProcess() {
    const newSessionId = generateRandomString(15);
    const loginUrl = buildLoginUrl(newSessionId);

    startPolling(newSessionId);

    if (mode === 'redirect') {
      window.location.assign(loginUrl);
      return;
    }

    window.open(loginUrl, '_blank');
  }

  window.addEventListener('message', (event) => {
    if (!event.data || event.data.source !== 'loginbroker' || event.data.status !== 'completed') {
      return;
    }

    if (event.data.sessionId && !hasCompleted) {
      hasCompleted = true;
      sessionStorage.removeItem('loginbroker:pendingSessionId');
      clearSessionState(event.data.sessionId);
      onSessionReceived(event.data.sessionId);
    }
  });

  return { startLoginProcess };
}
