/*
// USE IT LIKE THIS:
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
    if (data === 'completed') {
      onSessionReceived(sessionId);
    } else if (data === 'failed') {
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

  function startLoginProcess() {
    const newSessionId = generateRandomString(15);
    window.open(`https://${platform}.login.broker/${tenantName}/auth/${platform}/session/${newSessionId}`);

    // Wait for the window to open and to save the new session in the API  
    setTimeout(() => {
      sessionId = newSessionId;
      fetchStatus(newSessionId);
    }, 2000); // Adjust the delay time as needed
  }

  return { startLoginProcess };
}
