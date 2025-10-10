// Session management for player reconnection
const SESSION_KEY = 'mungers_session_id';

/**
 * Get or create a unique session ID for this player
 * Stored in localStorage to persist across browser refreshes
 */
export function getSessionId() {
  let sessionId = localStorage.getItem(SESSION_KEY);
  if (!sessionId) {
    // Generate a new UUID
    sessionId = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, sessionId);
    console.log('🆕 Created new session ID:', sessionId.substring(0, 8));
  } else {
    console.log('♻️ Retrieved existing session ID:', sessionId.substring(0, 8));
  }
  return sessionId;
}

/**
 * Clear the session (when user explicitly leaves or session expires)
 */
export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  console.log('🗑️ Session cleared');
}

/**
 * Check if a session exists
 */
export function hasSession() {
  return localStorage.getItem(SESSION_KEY) !== null;
}
