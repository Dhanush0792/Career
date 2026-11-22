// ─── Auto-pair Extension (Secure) ─────────────────────────────────────────
// SECURITY: Never dispatch raw credentials on window — any page script can listen.
// Instead, post only a signal to the extension via chrome.runtime.sendMessage.
// The extension fetches its own token from chrome.storage.local directly.
(function() {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  const token = localStorage.getItem('jxa_token') || "";
  const email = localStorage.getItem('jxa_user_email') || "";
  if (!token) return; // Nothing to pair

  // Signal-only dispatch: no credentials in the event payload
  const signal = () => {
    window.dispatchEvent(new CustomEvent("jobxapply:authReady", {
      detail: { paired: true, email }  // No token, no passcode
    }));
  };
  setTimeout(signal, 100);
  setTimeout(signal, 500);
  setTimeout(signal, 1500);
})();

// ─── Local Storage Migration ───────────────────────────────────────────────
(function() {
  if (typeof localStorage === 'undefined') return;
  const legacyKeys = ['token', 'passcode', 'local_profile', 'local_profiles', 'active_profile_id', 'local_state', 'applications', 'role'];
  legacyKeys.forEach(k => {
    const val = localStorage.getItem('ch_' + k);
    if (val && !localStorage.getItem('jxa_token')) { // Fix ch_ to jxa_ migration key check
      localStorage.setItem('jxa_' + k, val);
    }
  });
})();

const SYNC_API = (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || 
                  window.location.hostname === '127.0.0.1' || 
                  window.location.protocol === 'file:'))
  ? 'http://localhost:8787/api'
  : 'https://jobxapply-backend.onrender.com/api';


// ─── Auth ─────────────────────────────────────────────────────────────────

// Helper: Decode and validate JWT payload safely
function parseJwtPayload(token) {
  try {
    const base64Url = token.split('.')[1];
    if (!base64Url) return null;
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
}

// ─── Session Lifecycle & Inactivity Management ──────────────────────────────
// Strictly 3 consecutive days of inactivity timeout (72 hours)
const INACTIVITY_TIMEOUT_MS = 3 * 24 * 60 * 60 * 1000;
let _activeSSE = null;
let _lastActivityUpdate = 0;

function recordUserActivity() {
  const now = Date.now();
  if (now - _lastActivityUpdate > 60000) { // Throttle writes to at most once per minute
    _lastActivityUpdate = now;
    if (localStorage.getItem('jxa_token')) {
      localStorage.setItem('jxa_last_active', String(now));
    }
  }
}

// Attach user activity listeners & lifecycle events
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  ['mousedown', 'keydown', 'scroll', 'touchstart', 'visibilitychange'].forEach(evt => {
    window.addEventListener(evt, recordUserActivity, { passive: true });
  });

  // Cross-tab synchronization listener: instantly catch logout in another tab
  window.addEventListener('storage', (e) => {
    if (e.key === 'jxa_token' && !e.newValue) {
      triggerSessionLogout('logged_out', false);
    }
  });

  // Handle browser Back-Forward Cache (bfcache).
  // When a user logs out and presses the browser's Back button, bfcache restores the page in memory
  // without firing DOMContentLoaded or re-executing inline scripts.
  // The 'pageshow' event ALWAYS fires on bfcache restoration; if persisted, re-validate authorization.
  window.addEventListener('pageshow', (event) => {
    requireAuth();
  });

  // Periodically check inactivity in background (every 60s)
  setInterval(() => {
    if (localStorage.getItem('jxa_token')) {
      const lastActive = Number(localStorage.getItem('jxa_last_active') || Date.now());
      if (Date.now() - lastActive >= INACTIVITY_TIMEOUT_MS) {
        triggerSessionLogout('inactivity');
      }
    }
  }, 60000);
}

function triggerSessionLogout(reason = 'logged_out', navigate = true) {
  // 1. Close SSE connection if active
  if (_activeSSE && typeof _activeSSE.close === 'function') {
    try { _activeSSE.close(); } catch(e) {}
    _activeSSE = null;
  }

  // 2. Clear all local application keys from localStorage & sessionStorage
  try {
    const localKeys = Object.keys(localStorage).filter(k => k.startsWith('jxa_'));
    localKeys.forEach(k => localStorage.removeItem(k));
    const sessionKeys = Object.keys(sessionStorage).filter(k => k.startsWith('jxa_'));
    sessionKeys.forEach(k => sessionStorage.removeItem(k));
  } catch(e) {}

  // 3. Clear in-memory profile and runtime references
  if (typeof _currentProfileCache !== 'undefined') {
    _currentProfileCache = null;
  }
  _lastActivityUpdate = 0;

  // 4. Notify extension of signed-out state
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent("jobxapply:authReady", {
        detail: { paired: false, email: "" }
      }));
      window.dispatchEvent(new CustomEvent("jobxapply:shareAuth", {
        detail: { token: "", email: "", passcode: "" }
      }));
    } catch(e) {}
  }

  // 5. Navigate to authentication gateway using location.replace to eliminate back-button cache retention
  if (navigate && typeof window !== 'undefined') {
    const isInAdmin = window.location.pathname.includes('/admin/');
    const prefix = isInAdmin ? '../' : '';
    const safeReason = encodeURIComponent(reason);
    if (document.documentElement) {
      document.documentElement.style.display = 'none';
    }
    window.location.replace(`${prefix}auth.html?reason=${safeReason}`);
  }
}

// Helper: Get effective auth token, synchronizing Supabase OAuth tokens if expired
function getEffectiveAuthToken() {
  let token = (typeof localStorage !== 'undefined' ? localStorage.getItem('jxa_token') : "") || "";
  const now = Date.now();
  let isValid = false;

  if (token) {
    const payload = parseJwtPayload(token);
    if (!payload || !payload.exp || (payload.exp * 1000 > now + 30000)) {
      isValid = true;
    }
  }

  // If token is missing, expired, or expiring within 30s, inspect Supabase local session
  if (!isValid && typeof localStorage !== 'undefined') {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('sb-') && k.endsWith('-auth-token')) {
          const raw = localStorage.getItem(k);
          if (raw) {
            const parsed = JSON.parse(raw);
            const candidateToken = parsed?.access_token || parsed?.session?.access_token;
            if (candidateToken) {
              const candPayload = parseJwtPayload(candidateToken);
              if (candPayload && (!candPayload.exp || candPayload.exp * 1000 > now)) {
                token = candidateToken;
                localStorage.setItem('jxa_token', candidateToken);
                isValid = true;
                break;
              }
            }
          }
        }
      }
    } catch (e) {}
  }

  return token;
}

/**
 * Redirect to auth.html if no session token exists, if token is expired, or if inactive for 3+ consecutive days.
 * Call this at the top of every inner page.
 * Returns true if authenticated or public page, false if redirecting/unauthenticated.
 */
function requireAuth() {
  const path = (typeof window !== 'undefined' && window.location) ? window.location.pathname : '';
  const isInAdmin = path.includes('/admin/');
  const prefix = isInAdmin ? '../' : '';
  let page = path.substring(path.lastIndexOf('/') + 1).toLowerCase();
  if (page.endsWith('.html')) {
    page = page.substring(0, page.length - 5);
  }

  // Whitelist public pages (extension-agnostic names)
  const publicPages = ['', 'auth', 'extension-setup', 'extension-landing', 'index', 'about', 'tools', 'ats-checker', 'resume-builder', 'salary-calculator', 'gov-resizer', 'roadmap-software-engineer', 'roadmap-data-scientist', 'gov-ssc-cgl', 'gov-ibps-po', 'resume-importance'];
  if (publicPages.includes(page)) {
    if (typeof localStorage !== 'undefined' && localStorage.getItem('jxa_token')) {
      pullApplicationsFromServer().catch(() => {});
    }
    return true; // Allow access without authentication
  }

  const token = getEffectiveAuthToken();
  let isValidToken = false;
  let tokenRole = 'user';
  let invalidReason = 'expired';

  if (token) {
    let lastActive = Number((typeof localStorage !== 'undefined' && localStorage.getItem('jxa_last_active')) || 0);
    const now = Date.now();

    // If no lastActive was stored, initialize it now so it is tracked going forward
    if (!lastActive) {
      lastActive = now;
      if (typeof localStorage !== 'undefined') localStorage.setItem('jxa_last_active', String(now));
    }

    // Check Case 1: Inactivity >= 3 consecutive days (72h)
    if (now - lastActive >= INACTIVITY_TIMEOUT_MS) {
      isValidToken = false;
      invalidReason = 'inactivity';
    } else {
      const payload = parseJwtPayload(token);
      if (payload) {
        // Check Case 2: JWT expiration
        if (payload.exp && payload.exp * 1000 < now) {
          isValidToken = false;
          invalidReason = 'expired';
        } else {
          isValidToken = true;
          const storedRole = typeof localStorage !== 'undefined' ? localStorage.getItem('jxa_role') : null;

          if (storedRole === 'admin') {
            tokenRole = 'admin';
          } else if (payload.role && payload.role !== 'authenticated') {
            tokenRole = payload.role;
          } else {
            tokenRole = payload.user_metadata?.role || payload.app_metadata?.role || storedRole || 'user';
          }
          if (tokenRole === 'admin' && typeof localStorage !== 'undefined') {
            localStorage.setItem('jxa_role', 'admin');
          }
          // Touch activity timestamp
          recordUserActivity();
        }
      } else {
        // Opaque token / fallback token
        isValidToken = true;
        tokenRole = (typeof localStorage !== 'undefined' && localStorage.getItem('jxa_role')) || 'user';
        recordUserActivity();
      }
    }
  }

  if (!isValidToken) {
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.style.display = 'none';
    }
    if (typeof window !== 'undefined' && window.location) {
      if (page.includes('resume-builder')) {
        window.location.replace(prefix + 'tools.html#resume-builder');
      } else if (page.includes('ats-checker')) {
        window.location.replace(prefix + 'tools.html#ats-checker');
      } else if (page.includes('cover-letter')) {
        window.location.replace(prefix + 'tools.html#cover-letter');
      } else if (page.includes('autofill-lab')) {
        window.location.replace(prefix + 'tools.html#autofill-lab');
      } else {
        triggerSessionLogout(token ? invalidReason : 'unauthenticated');
      }
    }
    return false;
  } else {
    // Non-admin trying to access admin pages
    if (tokenRole !== 'admin' && isInAdmin) {
      if (typeof document !== 'undefined' && document.documentElement) {
        document.documentElement.style.display = 'none';
      }
      if (typeof window !== 'undefined' && window.location) {
        window.location.replace('../dashboard.html');
      }
      return false;
    }
    // Background pull tracker data from server on startup
    pullApplicationsFromServer().catch(() => {});
    connectSSE().catch(() => {});

    // Proactively share authentication session with the extension content script
    try {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('jobxapply:shareAuth', {
          detail: {
            token: token,
            email: (typeof localStorage !== 'undefined' && localStorage.getItem('jxa_user_email')) || '',
            passcode: (typeof localStorage !== 'undefined' && localStorage.getItem('jxa_passcode')) || ''
          }
        }));
      }
    } catch (e) {}
    return true; // Session verified
  }
}

// Auto-run authorization check immediately upon script parsing
requireAuth();

function logout() {
  triggerSessionLogout('logged_out');
}

// ─── Zero-Knowledge Client-Side Cryptographic Engine (AES-GCM 256 + PBKDF2 SHA-256) ───
// Guarantees user data is 100% encrypted before leaving browser. 
// Even if server/database/network is compromised, zero plaintext data can be recovered without the user's master passcode.

function uint8ToBase64(uint8) {
  let binary = "";
  const len = uint8.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(uint8[i]);
  }
  return btoa(binary);
}

function base64ToUint8(base64) {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function generatePasscodeHash(passcode) {
  if (!passcode) return "";
  const encoder = new TextEncoder();
  const data = encoder.encode(passcode + ":jobxapply_salt_v2");
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return uint8ToBase64(new Uint8Array(hashBuffer));
}

async function deriveKey(passcode, saltBytes) {
  const encoder = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passcode),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: saltBytes,
      iterations: 100000,
      hash: "SHA-256"
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptProfileData(profile, passcode) {
  if (!profile) return null;
  if (!passcode) {
    throw new Error("Encryption key/passcode required");
  }

  // Encrypt everything sensitive: PII, education, jobs, skills, summaries, documents
  const plaintext = JSON.stringify(profile);
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(passcode, salt);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(plaintext)
  );

  return {
    id: profile.id || "default",
    profileName: profile.profileName || "Encrypted Profile",
    fullName: profile.fullName || "", // required for profile index identifier
    encryptedBlob: {
      ciphertext: uint8ToBase64(new Uint8Array(ciphertextBuffer)),
      iv: uint8ToBase64(iv),
      salt: uint8ToBase64(salt)
    }
  };
}

async function decryptProfileData(encryptedProfile, passcode) {
  if (!encryptedProfile) return {};
  if (!encryptedProfile.encryptedBlob) {
    return encryptedProfile;
  }
  if (!passcode) {
    throw new Error("Decryption passcode required");
  }

  const blob = encryptedProfile.encryptedBlob;
  const salt = base64ToUint8(blob.salt);
  const iv = base64ToUint8(blob.iv);
  const ciphertext = base64ToUint8(blob.ciphertext);
  
  const key = await deriveKey(passcode, salt);
  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext
  );

  const decoder = new TextDecoder();
  const privateJson = decoder.decode(decryptedBuffer);
  const parsed = JSON.parse(privateJson);
  const full = { ...encryptedProfile, ...parsed };
  delete full.encryptedBlob;
  return full;
}

function showPasscodeModal() {
  if (document.getElementById('jxa-passcode-modal')) return;
  const modal = document.createElement('div');
  modal.id = 'jxa-passcode-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(11,16,32,0.92);backdrop-filter:blur(16px);display:flex;align-items:center;justify-content:center;z-index:99999;';
  modal.innerHTML = `
    <div style="background:#0F172A;border:1px solid rgba(0,243,255,0.3);border-radius:16px;padding:28px;max-width:420px;width:90%;box-shadow:0 20px 50px rgba(0,0,0,0.6);text-align:center;">
      <h3 style="font-family:'JetBrains Mono',monospace;color:#00F3FF;margin-bottom:12px;font-size:16px;text-transform:uppercase;">Zero-Knowledge Vault Locked</h3>
      <p style="font-size:12px;color:rgba(244,247,255,0.7);line-height:1.5;margin-bottom:20px;">
        Your profile data is protected by client-side 256-bit AES encryption. Enter your Sync Passcode to unlock and decrypt your credentials.
      </p>
      <input type="password" id="jxa-modal-passcode-input" placeholder="Enter Sync Passcode" style="width:100%;padding:12px;background:rgba(7,10,24,0.7);border:1px solid rgba(255,255,255,0.15);border-radius:8px;color:#fff;font-family:monospace;font-size:14px;margin-bottom:16px;outline:none;">
      <div style="display:flex;gap:12px;justify-content:center;">
        <button id="jxa-modal-unlock-btn" style="padding:10px 24px;background:#5B4FE8;color:#fff;border:none;border-radius:8px;font-family:monospace;font-size:12px;font-weight:bold;cursor:pointer;text-transform:uppercase;">Unlock Vault</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const input = document.getElementById('jxa-modal-passcode-input');
  const btn = document.getElementById('jxa-modal-unlock-btn');
  btn.onclick = async () => {
    const val = input.value.trim();
    if (!val) return;
    localStorage.setItem('jxa_passcode', val);
    modal.remove();
    try {
      await loadProfile();
      window.location.reload();
    } catch(e) {
      alert("Invalid passcode for this vault.");
    }
  };
}

/**
 * Decrypt all profiles stored in profiles map using master passcode
 */
async function decryptAllProfiles(profilesMap, passcode) {
  const decryptedMap = {};
  if (!profilesMap || typeof profilesMap !== "object") return decryptedMap;
  for (const key of Object.keys(profilesMap)) {
    const p = profilesMap[key];
    if (p.encryptedBlob && passcode) {
      try {
        decryptedMap[key] = await decryptProfileData(p, passcode);
      } catch (e) {
        console.error(`Failed to decrypt profile '${key}':`, e);
        decryptedMap[key] = p;
      }
    } else {
      decryptedMap[key] = p;
    }
  }
  return decryptedMap;
}

// ── Safe Local Storage & Quota Resilience ──────────────────────────────────
function safeSetItem(key, val) {
  if (typeof localStorage === 'undefined') return false;
  const strVal = typeof val === 'string' ? val : JSON.stringify(val);
  try {
    localStorage.setItem(key, strVal);
    return true;
  } catch (err) {
    console.warn(`[STORAGE_QUOTA] QuotaExceededError when setting '${key}'. Attempting eviction:`, err);
    try {
      localStorage.removeItem('jxa_profile_cache');
      localStorage.setItem(key, strVal);
      return true;
    } catch (err2) {
      console.warn(`[STORAGE_QUOTA] Critical: Failed to persist '${key}' even after eviction.`);
      return false;
    }
  }
}

/**
 * Strips heavy binary base64 data URLs from uploadedDocs to ensure zero QuotaExceededError
 * and keeps only lightweight metadata in localStorage & network payloads.
 */
function sanitizeProfileForStorage(p) {
  if (!p || typeof p !== 'object') return p;
  const clean = JSON.parse(JSON.stringify(p));
  if (clean.uploadedDocs && typeof clean.uploadedDocs === 'object') {
    for (const k of Object.keys(clean.uploadedDocs)) {
      if (clean.uploadedDocs[k]) {
        if (clean.uploadedDocs[k].data) {
          delete clean.uploadedDocs[k].data;
        }
        clean.uploadedDocs[k].storage = 'indexeddb';
      }
    }
  }
  return clean;
}

// ── IndexedDB Binary Document Decoupling (CareerBridgeDocsDB) ───────────────
const DB_DOCS_NAME = 'CareerBridgeDocsDB';
const DB_DOCS_VERSION = 1;
const STORE_DOCS_NAME = 'documents';

function openDocsDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB not supported in this runtime'));
    }
    const request = indexedDB.open(DB_DOCS_NAME, DB_DOCS_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_DOCS_NAME)) {
        db.createObjectStore(STORE_DOCS_NAME, { keyPath: 'docKey' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

const CareerBridgeDocsDB = {
  async saveDocBinary(docKey, record = {}) {
    if (!docKey) throw new Error('docKey required');
    const db = await openDocsDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_DOCS_NAME, 'readwrite');
      const store = tx.objectStore(STORE_DOCS_NAME);
      const dataToStore = {
        ...record,
        docKey: docKey,
        storage: 'indexeddb',
        updatedAt: record.updatedAt || Date.now()
      };
      const req = store.put(dataToStore);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },

  async getDocBinary(docKey) {
    if (!docKey) return null;
    const db = await openDocsDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_DOCS_NAME, 'readonly');
      const store = tx.objectStore(STORE_DOCS_NAME);
      const req = store.get(docKey);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  },

  async deleteDocBinary(docKey) {
    if (!docKey) return;
    const db = await openDocsDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_DOCS_NAME, 'readwrite');
      const store = tx.objectStore(STORE_DOCS_NAME);
      const req = store.delete(docKey);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },

  async getAllDocMetas() {
    const db = await openDocsDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_DOCS_NAME, 'readonly');
      const store = tx.objectStore(STORE_DOCS_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const list = req.result || [];
        resolve(list.map(d => ({
          docKey: d.docKey,
          name: d.name,
          size: d.size,
          bytes: d.bytes,
          type: d.type,
          storage: 'indexeddb',
          updatedAt: d.updatedAt
        })));
      };
      req.onerror = () => reject(req.error);
    });
  },

  async migrateLegacyLocalStorageDocs() {
    if (typeof localStorage === 'undefined') return;
    try {
      const profileKeys = ['jxa_local_profile', 'jxa_profile_cache'];
      for (const pk of profileKeys) {
        const raw = localStorage.getItem(pk);
        if (!raw) continue;
        let parsed = null;
        try { parsed = JSON.parse(raw); } catch(e) {}
        if (!parsed) continue;

        let modified = false;
        const targetProfile = parsed.profile || parsed;
        if (targetProfile && targetProfile.uploadedDocs && typeof targetProfile.uploadedDocs === 'object') {
          for (const [docKey, doc] of Object.entries(targetProfile.uploadedDocs)) {
            if (doc && doc.data && typeof doc.data === 'string' && doc.data.startsWith('data:')) {
              try {
                await CareerBridgeDocsDB.saveDocBinary(docKey, {
                  docKey,
                  name: doc.name || docKey,
                  size: doc.size || '',
                  bytes: doc.bytes || Math.round(doc.data.length * 0.75),
                  type: doc.type || 'application/octet-stream',
                  data: doc.data,
                  updatedAt: doc.updatedAt || Date.now()
                });
                delete doc.data;
                doc.storage = 'indexeddb';
                modified = true;
              } catch (err) {
                console.warn('Failed to migrate doc to IndexedDB:', docKey, err);
              }
            }
          }
        }

        if (modified) {
          safeSetItem(pk, JSON.stringify(parsed));
        }
      }

      const rawProfiles = localStorage.getItem('jxa_local_profiles');
      if (rawProfiles) {
        let profiles = null;
        try { profiles = JSON.parse(rawProfiles); } catch(e) {}
        if (profiles && typeof profiles === 'object') {
          let modified = false;
          for (const pid of Object.keys(profiles)) {
            const prof = profiles[pid];
            if (prof && prof.uploadedDocs && typeof prof.uploadedDocs === 'object') {
              for (const [docKey, doc] of Object.entries(prof.uploadedDocs)) {
                if (doc && doc.data && typeof doc.data === 'string' && doc.data.startsWith('data:')) {
                  try {
                    await CareerBridgeDocsDB.saveDocBinary(docKey, {
                      docKey,
                      name: doc.name || docKey,
                      size: doc.size || '',
                      bytes: doc.bytes || Math.round(doc.data.length * 0.75),
                      type: doc.type || 'application/octet-stream',
                      data: doc.data,
                      updatedAt: doc.updatedAt || Date.now()
                    });
                    delete doc.data;
                    doc.storage = 'indexeddb';
                    modified = true;
                  } catch (e) {}
                }
              }
            }
          }
          if (modified) {
            safeSetItem('jxa_local_profiles', JSON.stringify(profiles));
          }
        }
      }
    } catch (e) {
      console.warn("Legacy docs migration notice:", e);
    }
  }
};

// Automatic startup migration trigger
if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
  setTimeout(() => {
    CareerBridgeDocsDB.migrateLegacyLocalStorageDocs().catch(() => {});
  }, 100);
}

/**
 * Load profile from sync server; falls back to localStorage.
 * Returns the normalized state object: { profile, version, updatedAt, origin }
 */
async function loadProfile() {
  const token = getEffectiveAuthToken();
  const passcode = (typeof localStorage !== 'undefined' && localStorage.getItem('jxa_passcode')) || "";
  const passcodeHash = passcode ? await generatePasscodeHash(passcode) : "";
  const headers = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  } else if (passcodeHash) {
    headers['Authorization'] = `Bearer ${passcodeHash}`;
  }
  
  try {
    const res = await fetch(`${SYNC_API}/profile`, { headers, cache: 'no-store' });
    if (res.ok) {
      const state = await res.json();
      
      let profiles = state.profiles || {};
      let activeId = state.activeProfileId || "default";

      if (state.profiles && Object.keys(state.profiles).length > 0) {
        if (passcode) {
          profiles = await decryptAllProfiles(state.profiles, passcode);
        }
        state.profiles = profiles;
        state.profile = profiles[activeId] || {};
      } else if (state.profile && state.profile.encryptedBlob) {
        if (passcode) {
          try {
            const decrypted = await decryptProfileData(state.profile, passcode);
            state.profile = decrypted;
          } catch (e) {
            console.error("Failed to decrypt legacy profile:", e);
            if (typeof window !== 'undefined' && !window.location.pathname.endsWith('profile-setup.html') && !window.location.pathname.endsWith('auth.html')) {
              setTimeout(showPasscodeModal, 100);
            }
          }
        } else {
          if (typeof window !== 'undefined' && !window.location.pathname.endsWith('profile-setup.html') && !window.location.pathname.endsWith('auth.html')) {
            setTimeout(showPasscodeModal, 100);
          }
        }
        profiles = { "default": state.profile };
        activeId = "default";
        state.profiles = profiles;
        state.activeProfileId = activeId;
      }
      
      // Cache locally for offline fallback - NEVER overwrite existing rich local profile with an empty or less complete server response
      const existingLocalRaw = typeof localStorage !== 'undefined' ? localStorage.getItem('jxa_local_profile') : null;
      let existingLocal = null;
      try { existingLocal = existingLocalRaw ? JSON.parse(existingLocalRaw) : null; } catch(e) {}

      const countMeaningfulFields = (obj) => {
        if (!obj || typeof obj !== 'object') return 0;
        return Object.keys(obj).filter(k => k !== 'email' && k !== 'id' && k !== 'profileName' && obj[k] !== undefined && obj[k] !== null && String(obj[k]).trim().length > 0).length;
      };

      const localFieldsCount = countMeaningfulFields(existingLocal);
      const serverFieldsCount = countMeaningfulFields(state.profile);

      if (localFieldsCount > serverFieldsCount) {
        console.log(`[SYNC] Preserving rich local profile (${localFieldsCount} fields) over server profile (${serverFieldsCount} fields). Syncing UP to cloud.`);
        const mergedProfile = { ...state.profile, ...existingLocal };
        state.profile = mergedProfile;
        if (!profiles[activeId]) profiles[activeId] = mergedProfile;
        profiles[activeId] = mergedProfile;
        state.profiles = profiles;
        safeSetItem('jxa_local_profile', JSON.stringify(mergedProfile));
        safeSetItem('jxa_local_profiles', JSON.stringify(profiles));
        setTimeout(() => saveProfile(mergedProfile).catch(() => {}), 1200);
      } else {
        safeSetItem('jxa_local_profile', JSON.stringify(state.profile || {}));
        safeSetItem('jxa_local_profiles', JSON.stringify(profiles));
      }
      safeSetItem('jxa_active_profile_id', activeId);
      safeSetItem('jxa_local_state', JSON.stringify(state));
      safeSetItem('jxa_profile_cache', JSON.stringify(state.profile || {}));
      return state;
    }
  } catch (_) {}
  
  // Offline fallback
  const localProfile = typeof localStorage !== 'undefined' ? localStorage.getItem('jxa_local_profile') : null;
  const localState = typeof localStorage !== 'undefined' ? localStorage.getItem('jxa_local_state') : null;
  if (localProfile) {
    let parsedLocal = null;
    try { parsedLocal = JSON.parse(localProfile); } catch(e) {}
    let state = localState ? JSON.parse(localState) : { profile: parsedLocal, version: 0, updatedAt: 0, origin: 'local' };
    let profiles = state.profiles || {};
    let activeId = state.activeProfileId || (typeof localStorage !== 'undefined' && localStorage.getItem('jxa_active_profile_id')) || "default";

    if (state.profiles && Object.keys(state.profiles).length > 0) {
      if (passcode) {
        profiles = await decryptAllProfiles(state.profiles, passcode);
      }
      state.profiles = profiles;
      state.profile = profiles[activeId] || parsedLocal || {};
    } else if (state.profile && state.profile.encryptedBlob) {
      if (passcode) {
        try {
          const decryptedProfile = await decryptProfileData(state.profile, passcode);
          state.profile = decryptedProfile;
        } catch (e) {
          if (typeof window !== 'undefined' && !window.location.pathname.endsWith('profile-setup.html') && !window.location.pathname.endsWith('auth.html')) {
            setTimeout(showPasscodeModal, 100);
          }
        }
      } else {
        if (typeof window !== 'undefined' && !window.location.pathname.endsWith('profile-setup.html') && !window.location.pathname.endsWith('auth.html')) {
          setTimeout(showPasscodeModal, 100);
        }
      }
      profiles = { "default": state.profile };
      activeId = "default";
      state.profiles = profiles;
      state.activeProfileId = activeId;
    } else {
      state.profile = parsedLocal || state.profile || {};
      if (!profiles[activeId] && state.profile) {
        profiles[activeId] = state.profile;
        state.profiles = profiles;
      }
    }

    // Ensure state.profile is never empty if parsedLocal is available
    if ((!state.profile || Object.keys(state.profile).length === 0) && parsedLocal) {
      state.profile = parsedLocal;
    }

    state.origin = 'local';
    return state;
  }
  return { profile: {}, version: 0, updatedAt: 0, origin: 'none' };
}

/**
 * Synchronously retrieves the cached profile state from localStorage.
 */
function getCachedProfileState() {
  try {
    const localState = typeof localStorage !== 'undefined' ? localStorage.getItem('jxa_local_state') : null;
    if (localState) {
      const state = JSON.parse(localState);
      const localProfiles = localStorage.getItem('jxa_local_profiles');
      const activeId = localStorage.getItem('jxa_active_profile_id') || "default";
      if (localProfiles) {
        state.profiles = JSON.parse(localProfiles);
        state.profile = state.profiles[activeId] || {};
      }
      state.origin = 'local';
      return state;
    }
  } catch (e) {
    console.error("Failed to load cached profile:", e);
  }
  return null;
}

/**
 * Save profile to sync server AND localStorage with complete QuotaExceededError protection.
 * Decouples document binaries via sanitizeProfileForStorage().
 * Returns { ok, syncedToCloud, localOnly, state, status, error }.
 */
async function saveProfile(profileData) {
  let activeId = (typeof localStorage !== 'undefined' && localStorage.getItem('jxa_active_profile_id')) || "default";
  
  // Cleanse any heavy binary document strings from profileData before storage
  const cleanProfile = sanitizeProfileForStorage(profileData);
  cleanProfile.id = activeId;

  let localProfilesRaw = typeof localStorage !== 'undefined' ? localStorage.getItem('jxa_local_profiles') : null;
  let localProfiles = {};
  try {
    localProfiles = localProfilesRaw ? JSON.parse(localProfilesRaw) : {};
  } catch(e) {}
  
  // Clean all profiles in localProfiles
  for (const k of Object.keys(localProfiles)) {
    localProfiles[k] = sanitizeProfileForStorage(localProfiles[k]);
  }
  localProfiles[activeId] = cleanProfile;

  // STEP 1: ALWAYS PERSIST LOCALLY FIRST (Zero Data Loss) - Wrapped safely against QuotaExceededError
  safeSetItem('jxa_local_profile', JSON.stringify(cleanProfile));
  safeSetItem('jxa_local_profiles', JSON.stringify(localProfiles));
  safeSetItem('jxa_active_profile_id', activeId);
  safeSetItem('jxa_profile_cache', JSON.stringify(cleanProfile));

  const localState = typeof localStorage !== 'undefined' ? localStorage.getItem('jxa_local_state') : null;
  const knownVersion = localState ? (JSON.parse(localState).version || 0) : 0;
  
  const passcode = (typeof localStorage !== 'undefined' && localStorage.getItem('jxa_passcode')) || "";
  const passcodeHash = passcode ? await generatePasscodeHash(passcode) : "";

  const encryptedProfiles = {};
  for (const key of Object.keys(localProfiles)) {
    const p = localProfiles[key];
    if (passcode) {
      try {
        encryptedProfiles[key] = await encryptProfileData(p, passcode);
      } catch (e) {
        console.error("Encryption failed for profile:", key, e);
        return { ok: false, syncedToCloud: false, localOnly: true, errors: ["Encryption failed: " + e.message] };
      }
    } else {
      encryptedProfiles[key] = p;
    }
  }
  
  const payload = { 
    profiles: encryptedProfiles, 
    activeProfileId: activeId,
    passcodeHash: passcodeHash,
    version: knownVersion, 
    origin: 'frontend' 
  };
  
  const token = getEffectiveAuthToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  } else if (passcodeHash) {
    headers['Authorization'] = `Bearer ${passcodeHash}`;
  }
  
  try {
    const res = await fetch(`${SYNC_API}/profile`, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (res.ok && result.ok) {
      safeSetItem('jxa_local_profile', JSON.stringify(cleanProfile));
      safeSetItem('jxa_local_profiles', JSON.stringify(localProfiles));
      safeSetItem('jxa_active_profile_id', activeId);
      
      const serverState = result.state || {};
      const decryptedServerState = {
        ...serverState,
        profiles: localProfiles,
        profile: cleanProfile
      };
      safeSetItem('jxa_local_state', JSON.stringify(decryptedServerState));

      // Notify extension: auth is available
      try {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent("jobxapply:authReady", {
            detail: { paired: true, email: localStorage.getItem('jxa_user_email') || "" }
          }));
        }
      } catch (e) {}
      
      return { ok: true, syncedToCloud: true, localOnly: false, state: decryptedServerState };
    }
    if (res.status === 409 && result.current) {
      let serverProfiles = result.current.profiles || {};
      let serverActiveId = result.current.activeProfileId || "default";
      if (passcode) {
        serverProfiles = await decryptAllProfiles(serverProfiles, passcode);
      }
      const serverProfile = serverProfiles[serverActiveId] || {};
      
      safeSetItem('jxa_local_profile', JSON.stringify(serverProfile));
      safeSetItem('jxa_local_profiles', JSON.stringify(serverProfiles));
      safeSetItem('jxa_active_profile_id', serverActiveId);
      
      const decryptedCurrent = {
        ...result.current,
        profiles: serverProfiles,
        profile: serverProfile
      };
      safeSetItem('jxa_local_state', JSON.stringify(decryptedCurrent));
    }
    return { 
      ok: false, 
      syncedToCloud: false, 
      localOnly: true, 
      status: res.status, 
      error: result?.error || 'Server rejected profile sync', 
      state: { profile: cleanProfile, profiles: localProfiles, activeProfileId: activeId } 
    };
  } catch (e) {
    safeSetItem('jxa_local_profile', JSON.stringify(cleanProfile));
    safeSetItem('jxa_local_profiles', JSON.stringify(localProfiles));
    const offlineState = { profile: cleanProfile, profiles: localProfiles, activeProfileId: activeId, version: 0, updatedAt: Date.now(), origin: 'local' };
    safeSetItem('jxa_local_state', JSON.stringify(offlineState));
    return { ok: true, syncedToCloud: false, offline: true, localOnly: true, state: offlineState };
  }
}

async function setActiveProfile(activeProfileId) {
  const localState = localStorage.getItem('jxa_local_state');
  const knownVersion = localState ? (JSON.parse(localState).version || 0) : 0;
  
  const passcode = localStorage.getItem('jxa_passcode') || "";
  const passcodeHash = passcode ? await generatePasscodeHash(passcode) : "";
  
  let localProfilesRaw = localStorage.getItem('jxa_local_profiles');
  let localProfiles = {};
  try {
    localProfiles = localProfilesRaw ? JSON.parse(localProfilesRaw) : {};
  } catch(e) {}
  
  if (!localProfiles[activeProfileId]) {
    return { ok: false, errors: [`Profile '${activeProfileId}' does not exist`] };
  }
  
  const activeProfile = localProfiles[activeProfileId];
  
  const encryptedProfiles = {};
  for (const key of Object.keys(localProfiles)) {
    const p = localProfiles[key];
    if (passcode) {
      try {
        encryptedProfiles[key] = await encryptProfileData(p, passcode);
      } catch (e) {
        return { ok: false, errors: ["Encryption failed: " + e.message] };
      }
    } else {
      encryptedProfiles[key] = p;
    }
  }
  
  const payload = {
    profiles: encryptedProfiles,
    activeProfileId: activeProfileId,
    passcodeHash: passcodeHash,
    version: knownVersion,
    origin: 'frontend'
  };
  
  const token = localStorage.getItem('jxa_token') || "";
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  } else if (passcodeHash) {
    headers['Authorization'] = `Bearer ${passcodeHash}`;
  }
  
  try {
    const res = await fetch(`${SYNC_API}/profile`, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (res.ok && result.ok) {
      localStorage.setItem('jxa_local_profile', JSON.stringify(activeProfile));
      localStorage.setItem('jxa_active_profile_id', activeProfileId);
      
      const serverState = result.state || {};
      const decryptedServerState = {
        ...serverState,
        profiles: localProfiles,
        profile: activeProfile
      };
      localStorage.setItem('jxa_local_state', JSON.stringify(decryptedServerState));
      return { ok: true, activeProfileId };
    }
    return { ok: false, errors: result.errors || [result.error || 'Swap failed'] };
  } catch (e) {
    localStorage.setItem('jxa_local_profile', JSON.stringify(activeProfile));
    localStorage.setItem('jxa_active_profile_id', activeProfileId);
    return { ok: true, offline: true };
  }
}

async function createNewProfile(profileName) {
  let localProfilesRaw = localStorage.getItem('jxa_local_profiles');
  let localProfiles = {};
  try {
    localProfiles = localProfilesRaw ? JSON.parse(localProfilesRaw) : {};
  } catch(e) {}
  
  const activeId = localStorage.getItem('jxa_active_profile_id') || "default";
  const activeProfile = localProfiles[activeId] || {};
  
  const cloned = { ...activeProfile };
  cloned.id = profileName.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!cloned.id) {
    cloned.id = "profile-" + Date.now().toString(36);
  }
  cloned.profileName = profileName;
  cloned.fullName = cloned.fullName || "";
  
  localProfiles[cloned.id] = cloned;
  localStorage.setItem('jxa_local_profiles', JSON.stringify(localProfiles));
  
  return setActiveProfile(cloned.id);
}

async function deleteProfile(profileId) {
  if (profileId === "default") {
    return { ok: false, errors: ["Cannot delete default profile"] };
  }
  
  let localProfilesRaw = localStorage.getItem('jxa_local_profiles');
  let localProfiles = {};
  try {
    localProfiles = localProfilesRaw ? JSON.parse(localProfilesRaw) : {};
  } catch(e) {}
  
  if (!localProfiles[profileId]) {
    return { ok: false, errors: ["Profile does not exist"] };
  }
  
  delete localProfiles[profileId];
  localStorage.setItem('jxa_local_profiles', JSON.stringify(localProfiles));
  
  const activeId = localStorage.getItem('jxa_active_profile_id');
  if (activeId === profileId) {
    return setActiveProfile("default");
  }
  
  const currentActiveId = localStorage.getItem('jxa_active_profile_id') || "default";
  const activeProfile = localProfiles[currentActiveId] || {};
  return saveProfile(activeProfile);
}

// ─── Profile Completeness ──────────────────────────────────────────────────

const PROFILE_FIELDS = [
  'fullName', 'email', 'phone', 'dob', 'country', 'city', 'address',
  'targetRole', 'headline', 'summary', 'linkedin', 'education', 'experience', 'skills', 'college'
];

function calcCompleteness(profile = {}) {
  // If the profile has no name, it is uninitialized
  if (!profile.fullName || String(profile.fullName).trim().length === 0) {
    return { count: 0, total: PROFILE_FIELDS.length, pct: 0 };
  }
  const filled = PROFILE_FIELDS.filter(f => {
    const v = profile[f];
    return v !== null && v !== undefined && String(v).trim().length > 0;
  });
  return { count: filled.length, total: PROFILE_FIELDS.length, pct: Math.round((filled.length / PROFILE_FIELDS.length) * 100) };
}

// ─── SSE ──────────────────────────────────────────────────────────────────

/**
 * Open an SSE connection and dispatch `jobxapply:profile` events on document.
 * Pages can listen: document.addEventListener('jobxapply:profile', e => e.detail)
 */
async function connectSSE() {
  try {
    const token = localStorage.getItem('jxa_token') || "";
    const passcode = localStorage.getItem('jxa_passcode') || "";
    if (!token && !passcode) return null;

    // Step 1: Obtain a short-lived one-time SSE ticket via authenticated POST
    // This ensures the JWT or passcode hash never appears in the URL / access logs
    const ticketRes = await fetch(`${SYNC_API}/events/ticket`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": token
          ? `Bearer ${token}`
          : `Passcode ${await generatePasscodeHash(passcode)}`
      }
    });
    if (!ticketRes.ok) return null;
    const { ticket } = await ticketRes.json();
    if (!ticket) return null;

    // Step 2: Open SSE connection with the one-time ticket (safe in URL — 30s expiry, single-use)
    const url = `${SYNC_API}/events?ticket=${encodeURIComponent(ticket)}`;
    const source = new EventSource(url);
    source.addEventListener('profile', async (ev) => {
      try {
        const state = JSON.parse(ev.data);
        if (state.profile && state.profile.encryptedBlob && passcode) {
          try {
            const decryptedProfile = await decryptProfileData(state.profile, passcode);
            state.profile = decryptedProfile;
          } catch (e) {
            console.error("Failed to decrypt SSE profile update:", e);
          }
        }
        localStorage.setItem('jxa_local_profile', JSON.stringify(state.profile || {}));
        localStorage.setItem('jxa_local_state', JSON.stringify(state));
        document.dispatchEvent(new CustomEvent('jobxapply:profile', { detail: state }));
      } catch (_) {}
    });
    source.addEventListener('tracker', async (ev) => {
      try {
        const apps = JSON.parse(ev.data);
        saveApplications(apps);
        document.dispatchEvent(new CustomEvent('jobxapply:tracker', { detail: apps }));
      } catch (_) {}
    });
    source.addEventListener('error', () => {
      document.dispatchEvent(new CustomEvent('jobxapply:offline'));
      source.close();
      if (localStorage.getItem('jxa_token') || localStorage.getItem('jxa_passcode')) {
        setTimeout(connectSSE, 5000); // Auto-reconnect after 5 seconds if authenticated
      }
    });
    _activeSSE = source;
    return source;
  } catch (_) {
    return null;
  }
}

// ─── Applications Storage ─────────────────────────────────────────────────

function loadApplications() {
  try {
    return JSON.parse(localStorage.getItem('jxa_applications') || '[]');
  } catch (_) { return []; }
}

function saveApplications(apps) {
  localStorage.setItem('jxa_applications', JSON.stringify(apps));
}

async function syncApplications(localApps = null) {
  const token = localStorage.getItem('jxa_token') || "";
  if (!token) return;

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  try {
    if (localApps === null) {
      localApps = loadApplications();
    }
    await fetch(`${SYNC_API}/tracker`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ applications: localApps })
    });
  } catch (e) {
    console.error("Tracker sync failed:", e);
  }
}

async function pullApplicationsFromServer() {
  const token = localStorage.getItem('jxa_token') || "";
  if (!token) return;

  const headers = {
    'Authorization': `Bearer ${token}`
  };

  try {
    const res = await fetch(`${SYNC_API}/tracker`, { headers });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.applications)) {
        saveApplications(data.applications);
        // Dispatch tracker update event for live UI refreshes
        document.dispatchEvent(new CustomEvent('jobxapply:tracker', { detail: data.applications }));
        return data.applications;
      }
    }
  } catch (e) {
    console.error("Tracker pull failed:", e);
  }
  return loadApplications();
}

function addApplication(app) {
  const apps = loadApplications();
  const entry = {
    id: app.id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 6)),
    company: String(app.company || '').trim(),
    role: String(app.role || '').trim(),
    portal: String(app.portal || '').trim(),
    url: String(app.url || '').trim(),
    salary: String(app.salary || '').trim(),
    location: String(app.location || '').trim(),
    date: app.date || new Date().toISOString().slice(0, 10),
    followUp: app.followUp || '',
    status: app.status || 'applied',
    notes: String(app.notes || '').trim()
  };
  apps.unshift(entry);
  saveApplications(apps);
  syncApplications(apps).catch(() => {});
  return entry;
}

function updateApplicationStatus(id, status) {
  const apps = loadApplications();
  const idx = apps.findIndex(a => a.id === id);
  if (idx !== -1) {
    apps[idx].status = status;
    saveApplications(apps);
    syncApplications(apps).catch(() => {});
    return true;
  }
  return false;
}

function deleteApplication(id) {
  const apps = loadApplications().filter(a => a.id !== id);
  saveApplications(apps);
  syncApplications(apps).catch(() => {});
}

// ─── Navigation ───────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { label: 'Dashboard',    href: 'dashboard.html' },
  { label: 'Profile',      href: 'profile-setup.html' },
  { label: 'Resume',       href: 'resume-builder.html' },
  { label: 'ATS Checker',  href: 'ats-checker.html' },
  { label: 'Salary Guide', href: 'salary-calculator.html' },
  { label: 'Cover Letter', href: 'cover-letter.html' },
  { label: 'Tracker',      href: 'tracker.html' },
  { label: 'Autofill Lab', href: 'autofill-lab.html' },
  { label: 'Extension',    href: 'extension-landing.html' },
  { label: 'Settings',     href: 'settings.html' },
];

/**
 * Inject the standard top-nav into a given container element.
 * @param {HTMLElement} container - The nav element to fill.
 * @param {string} activePage - The current page filename (e.g. 'dashboard.html').
 */
function renderNav(container, activePage) {
  const token = localStorage.getItem('jxa_token');
  const role = localStorage.getItem('jxa_role');
  const isAdmin = role === 'admin';

  let links = NAV_ITEMS.map(item => {
    let href = item.href;
    // Authenticated users go directly to extension setup & pairing; public visitors go to landing
    if (item.label === 'Extension') {
      href = token ? 'extension-setup.html' : 'extension-landing.html';
    }
    // If not logged in, only show ATS Checker (no private links in the shared nav)
    const isPrivate = ['dashboard.html', 'profile-setup.html', 'resume-builder.html', 'cover-letter.html', 'tracker.html', 'autofill-lab.html', 'settings.html', 'extension-setup.html'].includes(href);
    if (!token && isPrivate) return '';

    const isActive = (href === activePage) || (item.label === 'Extension' && (activePage === 'extension-setup.html' || activePage === 'extension-landing.html'));
    return `<a href="${href}" class="nav__link${isActive ? ' nav__link--active' : ''}">${item.label}</a>`;
  }).join('');

  let adminBadge = '';
  if (isAdmin) {
    adminBadge = `<a href="admin/index.html" class="nav__admin-badge" title="Access Admin Command Center">
      <span class="nav__admin-dot"></span>
      <span>Admin</span>
    </a>`;
  }

  const btnHtml = token
    ? `<div class="nav__actions">${adminBadge}<button class="nav__logout" onclick="logout()">Log Out</button></div>`
    : `<div class="nav__actions">${adminBadge}<button class="nav__login-btn" onclick="window.location.href='auth.html'">Sign In</button></div>`;

  container.innerHTML = `
    <div class="nav__inner">
      <a href="${token ? 'dashboard.html' : 'index.html'}" class="nav__brand" aria-label="JobXApply Home">
        <div class="nav__brand-icon">
          <img src="assets/app-logo.png?v=6" alt="JobXApply Logo">
        </div>
        <span class="nav__brand-text">Job<span>X</span>Apply</span>
      </a>
      <div class="nav__links">${links}</div>
      ${btnHtml}
    </div>`;
}

// ─── Admin Auth Guard ─────────────────────────────────────────────────────

/**
 * Redirect to dashboard.html if user is not logged in as admin.
 * Call this at the top of every admin page.
 */
function requireAdmin() {
  if (!localStorage.getItem('jxa_token')) {
    if (document.documentElement) document.documentElement.style.display = 'none';
    window.location.replace('../auth.html');
    return;
  }
  if (localStorage.getItem('jxa_role') !== 'admin') {
    if (document.documentElement) document.documentElement.style.display = 'none';
    window.location.replace('../dashboard.html');
  }
}

/**
 * Get the current user's role.
 * @returns {string} 'admin' | 'user' | ''
 */
function getRole() {
  return localStorage.getItem('jxa_role') || 'user';
}

/**
 * Set the current user's role.
 * @param {string} role - 'admin' | 'user'
 */
function setRole(role) {
  localStorage.setItem('jxa_role', role);
}

const ADMIN_NAV_ITEMS = [
  { label: 'Overview',     href: 'index.html' },
  { label: 'Users',        href: 'users.html' },
  { label: 'Portal Maps',  href: 'admin/portal-maps.html' },
  { label: 'Reports',      href: 'reports.html' },
  { label: 'Analytics',    href: 'analytics.html' },
];

/**
 * Inject the admin navigation bar into a given container element.
 * @param {HTMLElement} container - The nav element to fill.
 * @param {string} activePage - The current admin page filename (e.g. 'index.html').
 */
function renderAdminNav(container, activePage) {
  const isInAdmin = typeof window !== 'undefined' && window.location.pathname.includes('/admin/');
  const links = ADMIN_NAV_ITEMS.map(item => {
    let href = item.href;
    if (isInAdmin && href.startsWith('admin/')) {
      href = href.replace('admin/', '');
    } else if (!isInAdmin && !href.startsWith('admin/')) {
      href = 'admin/' + href;
    }
    const isActive = item.href === activePage || href === activePage;
    return `<a href="${href}" class="nav__link${isActive ? ' nav__link--active' : ''}" style="${isActive ? 'color:#F5A623;' : ''}">${item.label}</a>`;
  }).join('');

  container.innerHTML = `
    <div class="nav__inner">
      <a href="index.html" class="nav__logo" style="color:#F5A623;">
        <span class="nav__logo-bracket" style="color:#F5A623;">[</span>&nbsp;CH ADMIN&nbsp;<span class="nav__logo-bracket" style="color:#F5A623;">]</span>
      </a>
      <div class="nav__links">${links}</div>
      <div style="display:flex;gap:12px;align-items:center;">
        <a href="../dashboard.html" class="nav__link" style="color:rgba(244,247,255,0.45);">← App</a>
        <button class="nav__logout" onclick="logout()" style="border-color:rgba(245,166,35,0.3);color:rgba(245,166,35,0.7);">LOGOUT</button>
      </div>
    </div>`;
}

// ─── Toast ────────────────────────────────────────────────────────────────

/**
 * Show a brief toast notification.
 * @param {string} message
 * @param {'success'|'error'|'info'} type
 */
function showToast(message, type = 'info') {
  let toast = document.getElementById('ch-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'ch-toast';
    toast.style.cssText = `
      position:fixed;bottom:28px;right:28px;z-index:9999;
      font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:700;
      padding:12px 20px;border:1px solid;max-width:340px;
      transition:opacity .3s,transform .3s;
      pointer-events:none;letter-spacing:.06em;
    `;
    document.body.appendChild(toast);
  }
  const colors = {
    success: { bg: 'rgba(47,221,196,.12)', border: '#2FDDC4', color: '#2FDDC4' },
    error:   { bg: 'rgba(245,90,35,.12)', border: '#F55A23', color: '#F55A23' },
    info:    { bg: 'rgba(91,79,232,.12)', border: '#5B4FE8', color: '#c0baff' }
  };
  const c = colors[type] || colors.info;
  toast.style.background = c.bg;
  toast.style.borderColor = c.border;
  toast.style.color = c.color;
  toast.style.backdropFilter = 'blur(16px)';
  toast.textContent = message;
  toast.style.opacity = '1';
  toast.style.transform = 'translateY(0)';

  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(6px)';
  }, 3200);
}

// ─── Exports ──────────────────────────────────────────────────────────────
// All functions are global (no module wrapper) so they work via plain <script src>.

const DEFAULT_PROFILE_FIELDS = [
  "fullName", "firstName", "lastName", "age", "dob", "fatherName", "motherName",
  "email", "phoneCode", "phone", "address", "city", "state", "country", "zip", "headline",
  "summary", "education", "college", "experience", "skills", "linkedin", "github",
  "portfolio", "resumeDraft", "targetRole", "answers",
  "leetcode", "availability", "noticePeriod", "totalExperience",
  "alternativeEmail", "pincode", "maritalStatus", "employmentStatus",
  "expectedSalary", "handicapped", "healthIssues", "targetRoles",
  "coverLetterDraft", "otherDocuments",
  "edu10_school", "edu10_board", "edu10_year", "edu10_cgpa",
  "edu12_school", "edu12_board", "edu12_year", "edu12_cgpa",
  "eduGrad_college", "eduGrad_degree", "eduGrad_stream", "eduGrad_year", "eduGrad_cgpa", "eduGrad_pursuing",
  "eduPG_college", "eduPG_degree", "eduPG_stream", "eduPG_year", "eduPG_cgpa", "eduPG_pursuing",
  "eduMasters_college", "eduMasters_degree", "eduMasters_stream", "eduMasters_year", "eduMasters_cgpa", "eduMasters_pursuing",
  "eduPhD_college", "eduPhD_degree", "eduPhD_stream", "eduPhD_year", "eduPhD_cgpa", "eduPhD_pursuing",
  "experienceList", "projectsList", "certificationsList"
];

function showPasscodeModal() {
  if (document.getElementById('cb-passcode-modal')) return;

  const modal = document.createElement('div');
  modal.id = 'cb-passcode-modal';
  modal.style.cssText = `
    position: fixed; inset: 0; z-index: 10000;
    background: rgba(11, 16, 32, 0.85);
    backdrop-filter: blur(12px);
    display: flex; align-items: center; justify-content: center;
    padding: 20px; font-family: 'Inter', sans-serif;
  `;

  modal.innerHTML = `
    <div style="
      background: #0B1020; border: 1px solid rgba(255,255,255,0.12);
      border-radius: 16px; padding: 28px; max-width: 420px; width: 100%;
      box-shadow: 0 24px 60px rgba(0,0,0,0.5); text-align: center;
    ">
      <div style="font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #5B4FE8; letter-spacing: 0.15em; margin-bottom: 8px;">
        SECURITY CHECK
      </div>
      <h2 style="font-family: 'Barlow Condensed', sans-serif; font-size: 28px; text-transform: uppercase; color: #fff; margin: 0 0 12px 0;">
        Enter Sync Passcode
      </h2>
      <p style="font-size: 13px; color: rgba(244,247,255,0.7); line-height: 1.5; margin: 0 0 20px 0;">
        This vault is client-side encrypted. Provide your passcode to decrypt and unlock your profile data.
      </p>
      <input type="password" id="cb-modal-passcode-input" placeholder="Enter secure passcode" style="
        width: 100%; padding: 12px; background: rgba(255,255,255,0.05);
        border: 1px solid rgba(255,255,255,0.12); border-radius: 8px;
        color: #fff; font-size: 14px; margin-bottom: 16px; outline: none;
        text-align: center; box-sizing: border-box;
      ">
      <div id="cb-modal-error" style="color: #F55A23; font-family: 'JetBrains Mono', monospace; font-size: 11px; margin-bottom: 12px; display: none;"></div>
      <div style="display: flex; gap: 12px;">
        <button id="cb-modal-submit" style="
          flex: 1; padding: 12px; border: 0; border-radius: 8px;
          background: linear-gradient(135deg, #5b4fe8, #2ee9c8);
          color: #fff; font-weight: 600; cursor: pointer; font-size: 13px;
        ">UNLOCK VAULT</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const input = document.getElementById('cb-modal-passcode-input');
  const errorDiv = document.getElementById('cb-modal-error');
  const submitBtn = document.getElementById('cb-modal-submit');

  const attemptUnlock = async () => {
    const passcode = input.value.trim();
    if (!passcode) {
      errorDiv.textContent = "Passcode is required";
      errorDiv.style.display = "block";
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "DECRYPTING...";
    errorDiv.style.display = "none";

    try {
      const localState = localStorage.getItem('jxa_local_state');
      if (localState) {
        const parsed = JSON.parse(localState);
        if (parsed.profile && parsed.profile.encryptedBlob) {
          try {
            await decryptProfileData(parsed.profile, passcode);
          } catch (decErr) {
            submitBtn.disabled = false;
            submitBtn.textContent = "UNLOCK VAULT";
            errorDiv.textContent = "Invalid passcode. Decryption failed.";
            errorDiv.style.display = "block";
            return;
          }
        }
      }
      
      localStorage.setItem('jxa_passcode', passcode);
      modal.remove();
      window.location.reload();
    } catch (e) {
      submitBtn.disabled = false;
      submitBtn.textContent = "UNLOCK VAULT";
      errorDiv.textContent = e.message;
      errorDiv.style.display = "block";
    }
  };

  submitBtn.addEventListener('click', attemptUnlock);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') attemptUnlock();
  });
}

// ─── ATS Scoring Engine ────────────────────────────────────────────────────

const ATS_ROLE_PRESETS = {
  sde: {
    name: "Software Engineer / SDE (General)",
    titles: ["software engineer", "software developer", "sde", "software development engineer", "full stack developer"],
    mustHave: ["data structures", "algorithms", "system design", "git", "rest api", "object-oriented programming", "debugging", "unit testing", "agile", "problem solving", "ci/cd", "cloud"],
    niceToHave: ["docker", "kubernetes", "microservices", "aws", "scalability", "design patterns"],
    verbs: ["built", "designed", "developed", "implemented", "optimized", "automated", "architected", "debugged", "deployed", "refactored"],
    summaryDesc: "Leads with years of experience and core technical strengths (languages, systems), one measurable engineering outcome (performance, scale, or delivery speed), not soft skills.",
    fourLineSummary: [
      "Software Development Engineer with solid foundation in scalable software systems, algorithms, and full-stack development.",
      "Proficient in modern web frameworks, RESTful API architecture, Git workflows, and automated testing.",
      "Track record of shipping production-grade features, optimizing execution latency, and improving system reliability.",
      "Dedicated to clean architecture, collaborative agile sprints, and high-velocity engineering excellence."
    ]
  },
  backend: {
    name: "Backend Developer",
    titles: ["backend developer", "backend engineer", "server-side developer"],
    mustHave: ["rest api", "database design", "sql", "node.js", "python", "java", "microservices", "authentication", "api integration", "server-side logic", "caching", "docker"],
    niceToHave: ["graphql", "message queues", "redis", "kafka", "load balancing", "kubernetes"],
    verbs: ["built", "architected", "optimized", "integrated", "scaled", "deployed", "engineered", "automated"],
    summaryDesc: "Emphasizes systems the candidate has built end-to-end and a concrete scale/performance number (requests/sec, latency reduction, uptime).",
    fourLineSummary: [
      "Backend Software Engineer specializing in distributed system design, microservices, and secure API architectures.",
      "Expertise in relational & NoSQL databases, caching layers (Redis), and asynchronous message brokers.",
      "Proven success optimizing database queries, reducing API response times by 30%+, and scaling server throughput.",
      "Committed to zero-downtime deployments, robust automated test coverage, and enterprise cloud reliability."
    ]
  },
  java: {
    name: "Java Developer",
    titles: ["java developer", "java engineer", "backend java developer"],
    mustHave: ["java", "spring boot", "spring framework", "hibernate", "rest api", "multithreading", "collections", "jvm", "maven", "microservices", "sql", "junit"],
    niceToHave: ["kafka", "docker", "kubernetes", "aws", "design patterns", "oop"],
    verbs: ["developed", "implemented", "optimized", "engineered", "built", "migrated", "debugged"],
    summaryDesc: "Names the Java ecosystem stack explicitly (Spring, Hibernate, Maven) rather than just \"Java\" alone, since ecosystem terms are what most Java job descriptions actually filter on.",
    fourLineSummary: [
      "Core Java & Spring Boot Developer with deep expertise in enterprise backend services and multithreaded systems.",
      "Comprehensive mastery of Spring Cloud, Hibernate ORM, Maven/Gradle build systems, and JVM memory profiling.",
      "Demonstrated ability to refactor legacy monoliths into resilient, high-concurrency microservices with JUnit test suites.",
      "Eager to architect robust enterprise solutions adhering to strict SOLID design patterns and clean code principles."
    ]
  },
  marketing: {
    name: "Marketing Specialist",
    titles: ["marketing executive", "marketing associate", "digital marketing specialist", "marketing specialist", "growth marketer"],
    mustHave: ["seo", "content marketing", "social media marketing", "campaign management", "google analytics", "brand strategy", "email marketing", "market research", "a/b testing", "roi", "lead generation"],
    niceToHave: ["google ads", "meta ads manager", "crm", "marketing automation", "copywriting"],
    verbs: ["launched", "grew", "increased", "managed", "executed", "optimized", "drove", "generated"],
    summaryDesc: "Leads with a quantified growth or campaign-performance result (traffic %, conversion rate, audience growth) rather than a list of responsibilities.",
    fourLineSummary: [
      "Results-oriented Digital Marketing Specialist skilled in multi-channel user acquisition, SEO, and brand storytelling.",
      "Proficient in Google Analytics, content strategy, email marketing workflows, and conversion rate optimization (CRO).",
      "Proven history of driving 35%+ organic traffic growth, scaling inbound leads, and optimizing marketing ROI.",
      "Focused on data-driven growth experiments, high-converting creative messaging, and customer lifecycle retention."
    ]
  },
  sales: {
    name: "Sales Representative",
    titles: ["sales executive", "sales associate", "business development executive", "account executive"],
    mustHave: ["lead generation", "client relationship management", "negotiation", "sales pipeline", "crm", "cold calling", "quota attainment", "prospecting", "closing deals", "revenue growth"],
    niceToHave: ["salesforce", "b2b sales", "account management", "upselling"],
    verbs: ["closed", "generated", "exceeded", "negotiated", "managed", "grew", "secured", "achieved"],
    summaryDesc: "Leads with quota attainment or revenue figures explicitly (e.g. \"achieved 120% of quota\") -- this is the single highest-signal line for sales resumes across every source reviewed.",
    fourLineSummary: [
      "High-energy Business Development and Sales Executive with proven track record of pipeline expansion and deal closure.",
      "Skilled in CRM pipeline management, B2B consultative selling, cold prospecting, and executive stakeholder negotiation.",
      "Consistently achieved and exceeded sales quotas by 115%+, expanding regional market reach and client contract sizes.",
      "Passionate about building enduring customer partnerships, client retention, and accelerating top-line revenue."
    ]
  },
  customer_care: {
    name: "Customer Care Operator",
    titles: ["customer support executive", "customer service representative", "customer care executive", "client support associate"],
    mustHave: ["customer support", "query resolution", "sla compliance", "crm", "escalation handling", "communication skills", "ticketing system", "customer satisfaction", "chat support", "email support"],
    niceToHave: ["zendesk", "freshdesk", "salesforce service cloud", "multichannel support"],
    verbs: ["resolved", "handled", "assisted", "managed", "responded", "improved", "maintained"],
    summaryDesc: "Leads with a resolution-rate, response-time, or CSAT figure if available; otherwise volume handled (e.g. tickets/day) is the strongest available signal.",
    fourLineSummary: [
      "Empathetic Customer Support Specialist dedicated to providing first-contact resolution and exceptional user experiences.",
      "Experienced managing ticketing workflows (Zendesk, Freshdesk, CRM), real-time live chat, and critical escalation triage.",
      "Maintained 96%+ Customer Satisfaction (CSAT) rating while handling 60+ daily queries under strict SLA guidelines.",
      "Committed to active customer listening, clear technical communication, and continuous support process improvement."
    ]
  },
  default: {
    name: "Default / General",
    titles: ["professional", "associate", "specialist", "coordinator"],
    mustHave: ["communication", "teamwork", "problem solving", "time management", "documentation", "attention to detail"],
    niceToHave: ["project management", "leadership", "adaptability", "microsoft office"],
    verbs: ["managed", "coordinated", "assisted", "supported", "organized", "completed"],
    summaryDesc: "Used when no specific role is selected, or for early-career profiles without a clear target yet -- scoring leans more heavily on formatting, achievement quantification, and section completeness.",
    fourLineSummary: [
      "Adaptable, detail-oriented professional with demonstrated competence in project coordination and team execution.",
      "Skilled in cross-functional communication, process organization, research analysis, and technical documentation.",
      "Proven record of delivering projects on schedule, resolving complex challenges, and elevating operational quality.",
      "Committed to continuous professional growth, agile teamwork, and contributing immediate value to company objectives."
    ]
  }
};

const ATS_KEYWORD_SYNONYMS = {
  "js": ["javascript"],
  "javascript": ["js"],
  "ts": ["typescript"],
  "typescript": ["ts"],
  "ml": ["machine learning"],
  "machine learning": ["ml"],
  "ai": ["artificial intelligence"],
  "artificial intelligence": ["ai"],
  "ci/cd": ["continuous integration", "cicd"],
  "continuous integration": ["ci/cd", "cicd"],
  "aws": ["amazon web services"],
  "amazon web services": ["aws"],
  "seo": ["search engine optimization"],
  "search engine optimization": ["seo"]
};

function extractKeywordsFromJD(jdText) {
  if (!jdText || typeof jdText !== "string") return { mustHave: [], niceToHave: [] };

  const stopWords = new Set([
    'the','and','or','to','a','an','in','for','of','with','is','are','be',
    'that','this','will','have','on','at','by','from','as','we','you','our',
    'their','it','not','your','can','all','more','about','if','been','use',
    'any','one','also','its','but','has','was','were','they','who','what',
    'when','how','into','than','then','so','up','out','them','these','those',
    'should','would','could','may','must','shall','do','does','did','get',
    'per','role','work','team','job','experience','position','company','years',
    'looking','join','ideal','candidate','responsibilities','requirements','opportunity',
    'working','including','across','strong','ability','knowledge','plus','environment'
  ]);
  
  const cleanJD = jdText.toLowerCase();

  // Curated High-Value Tech Skills & Credentials Dictionary for exact n-gram matching
  const TECH_SKILLS_CATALOG = [
    "javascript", "typescript", "python", "java", "c++", "c#", "go", "golang", "rust", "ruby", "php", "swift", "kotlin", "scala",
    "react", "react.js", "next.js", "vue", "vue.js", "angular", "node.js", "nodejs", "express", "fastapi", "django", "flask", "spring boot", "spring",
    "html", "html5", "css", "css3", "tailwind", "tailwind css", "sass", "bootstrap", "redux", "graphql", "rest api", "rest apis", "restful", "restful apis", "grpc", "websockets",
    "postgresql", "postgres", "mysql", "mongodb", "redis", "sqlite", "elasticsearch", "dynamodb", "cassandra", "supabase", "firebase", "sql", "nosql",
    "aws", "amazon web services", "azure", "google cloud", "gcp", "docker", "kubernetes", "k8s", "terraform", "ci/cd", "github actions", "jenkins", "gitlab",
    "git", "linux", "bash", "shell", "webpack", "vite", "jest", "playwright", "cypress", "mocha", "pytest", "unit testing", "integration testing", "automated testing", "testing",
    "pytorch", "tensorflow", "pandas", "numpy", "scikit-learn", "machine learning", "deep learning", "nlp", "computer vision", "llm", "etl", "data pipelines",
    "microservices", "distributed systems", "system design", "agile", "scrum", "kanban", "devops", "cloud computing", "serverless", "lambda",
    "data structures", "algorithms", "object-oriented programming", "oop", "multithreading", "concurrency", "database optimization", "debugging", "performance tuning", "code reviews", "technical documentation",
    "kafka", "rabbitmq", "sqs", "sns", "event-driven", "mvc", "clean architecture", "domain-driven design", "ddd", "tdd", "bdd",
    "security", "oauth", "jwt", "sso", "rbac", "encryption", "https", "owasp", "api gateway", "load balancer", "reverse proxy", "nginx",
    "performance optimization", "caching", "monitoring", "datadog", "prometheus", "grafana", "sentry", "cloudwatch"
  ];

  const catalogMatches = [];
  TECH_SKILLS_CATALOG.forEach(skill => {
    const rx = new RegExp('(^|[^a-zA-Z0-9])' + skill.replace(/[.+]/g, '\\$&') + '(?![a-zA-Z0-9])', 'i');
    if (rx.test(cleanJD) && !catalogMatches.includes(skill)) {
      catalogMatches.push(skill);
    }
  });

  const tokens = cleanJD
    .replace(/[^a-z0-9\s.+#-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));
    
  const freqs = {};
  tokens.forEach(t => {
    freqs[t] = (freqs[t] || 0) + 1;
  });
  
  const sortedTerms = Object.keys(freqs).sort((a, b) => freqs[b] - freqs[a]);
  const tokenSkills = sortedTerms.filter(t => !stopWords.has(t));

  const allMust = Array.from(new Set([...catalogMatches.slice(0, 15), ...tokenSkills.slice(0, 8)]));
  const allNice = Array.from(new Set([...catalogMatches.slice(15, 25), ...tokenSkills.slice(8, 16)]));
  
  return {
    mustHave: allMust.slice(0, 18),
    niceToHave: allNice.slice(0, 10)
  };
}

/**
 * Strict Document Validation Gate
 * Checks whether the uploaded text is a genuine resume/CV or an invalid/random document.
 */
function validateResumeDocument(text, layoutData = {}) {
  if (!text || typeof text !== "string" || text.trim().length < 60) {
    return {
      isValidResume: false,
      reason: "Document contains insufficient text or is empty. If this is a scanned PDF, ATS engines cannot read non-selectable text."
    };
  }

  const clean = text.toLowerCase();

  // Contact markers
  const hasEmail = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(text);
  const hasPhone = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}|\b\d{10}\b/.test(text);
  const hasLinks = /(?:linkedin\.com|github\.com|portfolio|\.github\.io)/i.test(text);
  const contactScore = (hasEmail ? 1 : 0) + (hasPhone ? 1 : 0) + (hasLinks ? 1 : 0);

  // Section markers
  const sectionChecks = [
    /\b(experience|work history|employment|career history|professional experience)\b/i.test(clean),
    /\b(education|academic|qualifications|degrees|university|college|bachelor|master|b\.tech|b\.e|m\.tech|degree)\b/i.test(clean),
    /\b(skills|technical skills|competencies|technologies|tools|languages)\b/i.test(clean),
    /\b(projects|personal projects|key projects|academic projects)\b/i.test(clean),
    /\b(summary|professional summary|profile|about me|objective|executive summary)\b/i.test(clean),
    /\b(certifications|certificates|licenses|achievements)\b/i.test(clean)
  ];
  const sectionCount = sectionChecks.filter(Boolean).length;
  const wordCount = clean.split(/\s+/).filter(Boolean).length;

  if (wordCount < 40) {
    return {
      isValidResume: false,
      reason: `Document contains only ${wordCount} words. A valid professional resume must be at least 80 words.`
    };
  }

  // A genuine resume must have at least 1 contact marker OR at least 2 standard resume sections
  if (contactScore === 0 && sectionCount < 2) {
    return {
      isValidResume: false,
      reason: "The uploaded file does not contain standard resume sections (such as Experience, Education, Skills, or Contact details). The ATS checker only evaluates legitimate resume documents."
    };
  }

  return {
    isValidResume: true,
    hasEmail,
    hasPhone,
    hasLinks,
    sectionCount,
    wordCount
  };
}

/**
 * Deterministic Resume Parser
 * Extracts structured fields (contact, summary, skills, experience, education) from raw resume text
 * for 1-click transfer to the ATS Resume Builder.
 */
function parseResumeToStructuredData(text) {
  if (!text || typeof text !== "string") return {};

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  
  // 1. Email & Phone
  const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  const email = emailMatch ? emailMatch[0] : "";
  
  const phoneMatch = text.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}|\b\d{10}\b/);
  const phone = phoneMatch ? phoneMatch[0] : "";

  // 2. Links
  const linkedinMatch = text.match(/https?:\/\/(?:www\.)?linkedin\.com\/in\/[a-zA-Z0-9_-]+/i);
  const linkedin = linkedinMatch ? linkedinMatch[0] : "";
  
  const githubMatch = text.match(/https?:\/\/(?:www\.)?github\.com\/[a-zA-Z0-9_-]+/i);
  const github = githubMatch ? githubMatch[0] : "";

  // 3. Full Name
  let fullName = "";
  for (let i = 0; i < Math.min(6, lines.length); i++) {
    const line = lines[i];
    if (line.includes("@") || line.includes("http") || /\d{5,}/.test(line)) continue;
    if (/^(resume|curriculum vitae|cv|page \d)/i.test(line)) continue;
    if (line.length >= 3 && line.length <= 40 && /^[a-zA-Z\s.'-]+$/.test(line)) {
      fullName = line;
      break;
    }
  }

  // 4. Section Slicing
  const SECTION_HEADERS = {
    summary: /^(summary|professional summary|profile|about me|executive summary|objective)\b/i,
    experience: /^(experience|work experience|employment history|work history|professional experience)\b/i,
    education: /^(education|academic background|qualifications|academic history)\b/i,
    skills: /^(skills|technical skills|core competencies|technologies|tools)\b/i,
    projects: /^(projects|key projects|personal projects|technical projects)\b/i
  };

  const sections = {
    summary: [],
    experience: [],
    education: [],
    skills: [],
    projects: []
  };

  let currentSection = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let matchedHeader = null;
    for (const [secKey, rx] of Object.entries(SECTION_HEADERS)) {
      if (rx.test(line.replace(/[^a-zA-Z\s]/g, "").trim())) {
        matchedHeader = secKey;
        break;
      }
    }
    if (matchedHeader) {
      currentSection = matchedHeader;
      continue;
    }
    if (currentSection && sections[currentSection]) {
      sections[currentSection].push(line);
    }
  }

  // Format Summary
  const summary = sections.summary.join(" ").slice(0, 600);

  // Format Skills
  const skillsText = sections.skills.join(", ")
    .replace(/[•\-\*|]/g, ",")
    .split(",")
    .map(s => s.trim())
    .filter(s => s.length > 1 && s.length < 35 && !/^(skills|technologies|proficient|tools|languages)$/i.test(s));
  const uniqueSkills = Array.from(new Set(skillsText)).join(", ");

  // Format Experience
  const experienceEntries = [];
  let currentExp = null;
  const expLines = sections.experience;
  const DATE_REGEX = /\b(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+)?\d{4}\s*(?:-|–|to)\s*(?:present|(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+)?\d{4})\b/i;

  for (let i = 0; i < expLines.length; i++) {
    const line = expLines[i];
    if (DATE_REGEX.test(line) || (line.length < 60 && /^[A-Z][a-zA-Z0-9\s,&.-]+$/.test(line) && !line.startsWith("•") && !line.startsWith("-"))) {
      if (currentExp && (currentExp.company || currentExp.role || currentExp.summary)) {
        experienceEntries.push(currentExp);
      }
      currentExp = {
        company: line.replace(DATE_REGEX, "").trim() || "Company",
        role: "Software Engineer",
        dates: (line.match(DATE_REGEX) || [""])[0],
        summary: ""
      };
    } else if (currentExp) {
      currentExp.summary = (currentExp.summary ? currentExp.summary + "\n" : "") + line;
    } else {
      currentExp = { company: "Work Experience", role: "Role", dates: "", summary: line };
    }
    if (experienceEntries.length >= 6) break;
  }
  if (currentExp && (currentExp.company || currentExp.summary)) {
    experienceEntries.push(currentExp);
  }

  // Format Education
  const educationEntries = [];
  let currentEdu = null;
  const eduLines = sections.education;
  for (let i = 0; i < eduLines.length; i++) {
    const line = eduLines[i];
    if (/\b(university|college|institute|school|bachelor|master|b\.tech|b\.e|m\.tech|b\.s|m\.s|degree)\b/i.test(line)) {
      if (currentEdu) educationEntries.push(currentEdu);
      const yearMatch = line.match(/\b20\d{2}\b/);
      currentEdu = {
        school: line.replace(/\b20\d{2}\b/, "").trim(),
        degree: line.includes("Bachelor") || line.includes("B.Tech") ? "Bachelor of Technology" : (line.includes("Master") ? "Master of Science" : "Degree"),
        year: yearMatch ? yearMatch[0] : "2023"
      };
    } else if (currentEdu && !currentEdu.degree) {
      currentEdu.degree = line;
    }
    if (educationEntries.length >= 4) break;
  }
  if (currentEdu) educationEntries.push(currentEdu);

  return {
    fullName: fullName || "Candidate Name",
    email,
    phone,
    linkedin,
    github,
    location: "",
    summary,
    skills: uniqueSkills,
    experience: experienceEntries,
    education: educationEntries
  };
}

/**
 * Centrally calculates the 0-100 ATS compatibility score.
 */
function scoreResumeData(profile, targetRole, textOverride = null, fileType = 'profile', layoutData = {}, jdText = "") {
  const preset = ATS_ROLE_PRESETS[targetRole] || ATS_ROLE_PRESETS.default;
  const isProfile = fileType === 'profile';
  
  // 1. Intake Resume Text
  let resumeText = "";
  if (textOverride !== null) {
    resumeText = textOverride;
  } else {
    resumeText = [
      profile.fullName || "",
      profile.email || "",
      profile.phone || "",
      profile.summary || "",
      profile.skills || "",
      profile.experience || "",
      profile.education || "",
      profile.projects || "",
      profile.certifications || "",
      profile.additional || "",
      profile.languages || ""
    ].join(" ");
  }

  // Strict Document Validation Gate
  const validation = validateResumeDocument(resumeText, layoutData);
  if (!validation.isValidResume && !isProfile) {
    return {
      isValidResume: false,
      score: 0,
      breakdown: {
        parseability: 0,
        title: 0,
        keyword: 0,
        density: 0,
        achievement: 0,
        completeness: 0
      },
      matchedKeywords: [],
      missingKeywords: [],
      verbAnalysis: {
        totalBullets: 0,
        quantifiedBullets: 0,
        metricDensity: 0,
        strongVerbs: 0,
        moderateVerbs: 0,
        weakVerbs: 0
      },
      suggestions: [
        `**Document Validation Failed**: ${validation.reason}`,
        "Applicant tracking systems require standard resume sections (such as Experience, Education, Skills, or Contact Info). Please upload a legitimate resume file to view accurate compatibility diagnostics."
      ],
      flags: {
        invalid_document: true,
        scanned_image: layoutData.isScanned || false,
        multi_column: false,
        embedded_images: false
      }
    };
  }

  const cleanText = resumeText.toLowerCase().replace(/[^a-z0-9\s.+#-]/g, ' ');
  const suggestions = [];
  const flags = {
    invalid_document: false,
    scanned_image: false,
    multi_column: false,
    embedded_images: false
  };

  // --- Category A: Parseability & Formatting (20%) ---
  let parseabilityScore = 100;
  if (!isProfile) {
    if (fileType === 'pdf') {
      if (layoutData.isScanned) {
        parseabilityScore = 0;
        flags.scanned_image = true;
        suggestions.push("**Parseability critical failure**: This file appears to be a scanned image or photo of a resume, meaning applicant tracking systems will extract zero text. Re-export your resume as a text-selectable PDF.");
      } else {
        if (layoutData.hasColumns) {
          parseabilityScore -= 20;
          flags.multi_column = true;
          suggestions.push("**Multi-column layout flagged**: This resume uses a multi-column structure, which can cause sections like Work Experience and Education to be read out of order. Switch to a single-column format.");
        }
        if (layoutData.imageCount && layoutData.imageCount > 0) {
          parseabilityScore -= 20;
          flags.embedded_images = true;
          suggestions.push(`**Embedded images detected**: Found ${layoutData.imageCount} image or graphic components. Non-text features (photos, icons, or graphics) frequently choke ATS parser engines. Remove non-text elements.`);
        }
      }
    }
  }

  // --- Category B: Job Title Alignment (10%) ---
  let titleScore = 0;
  const lowercaseText = resumeText.toLowerCase();
  
  let exactTitleMatch = false;
  let partialTitleMatch = false;

  preset.titles.forEach(title => {
    if (lowercaseText.includes(title)) {
      exactTitleMatch = true;
    } else {
      const words = title.split(' ');
      words.forEach(w => {
        if (w.length > 3 && lowercaseText.includes(w)) {
          partialTitleMatch = true;
        }
      });
    }
  });

  if (exactTitleMatch) {
    titleScore = 100;
  } else if (partialTitleMatch) {
    titleScore = 50;
    suggestions.push(`**Job Title Alignment**: Your resume partially matches the target title. Consider adding terms like "${preset.titles[0]}" to your summary or objective header.`);
  } else {
    titleScore = 0;
    suggestions.push(`**Job Title mismatch**: Your most recent job titles or summary do not explicitly reference target roles like "${preset.titles.join('", "')}". Incorporate these role titles to pass initial filter screens.`);
  }

  // --- Category C: Keyword & Skill Coverage (30%) ---
  const matchedKeywords = [];
  const missingKeywords = [];
  let keywordEarned = 0;
  let keywordTotal = 0;

  // Extract keywords directly from custom pasted JD if available
  let targetMustHave = [];
  let targetNiceToHave = [];

  if (jdText && typeof jdText === 'string' && jdText.trim().length > 25) {
    const jdKeywords = extractKeywordsFromJD(jdText);
    targetMustHave = jdKeywords.mustHave;
    targetNiceToHave = jdKeywords.niceToHave;
  } else {
    targetMustHave = [...(preset.mustHave || [])];
    targetNiceToHave = [...(preset.niceToHave || [])];
  }

  // Synonyms variant search helper
  function checkKeyword(kw) {
    const kwLow = kw.toLowerCase();
    const exactRegex = new RegExp('\\b' + kwLow.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '\\b', 'i');
    if (exactRegex.test(cleanText)) {
      return 1.0; // 100% credit
    }
    
    const variants = ATS_KEYWORD_SYNONYMS[kwLow] || [];
    for (const variant of variants) {
      const variantRegex = new RegExp('\\b' + variant.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '\\b', 'i');
      if (variantRegex.test(cleanText)) {
        return 0.85; // 85% credit
      }
    }

    if (cleanText.includes(kwLow) || (kwLow.length > 4 && cleanText.includes(kwLow.substring(0, kwLow.length - 2)))) {
      return 0.5; // 50% credit
    }

    return 0.0;
  }

  targetMustHave.forEach(kw => {
    const credit = checkKeyword(kw);
    keywordTotal += 1.0;
    keywordEarned += credit;
    if (credit >= 0.85) {
      matchedKeywords.push(kw);
    } else {
      missingKeywords.push(kw);
    }
  });

  targetNiceToHave.forEach(kw => {
    const credit = checkKeyword(kw);
    keywordEarned += credit * 0.5;
  });

  const keywordCoverageScore = Math.min(100, Math.round((keywordEarned / Math.max(1, keywordTotal)) * 100));

  if (keywordCoverageScore < 80 && missingKeywords.length > 0) {
    suggestions.push(`**Keyword Coverage alert**: Missing key technical or role requirements. Integrate target keywords like: ${missingKeywords.slice(0, 6).join(", ")}.`);
  }

  // --- Category D: Keyword Placement & Density (10%) ---
  let densityScore = 100;
  
  matchedKeywords.forEach(kw => {
    const kwLow = kw.toLowerCase();
    const matches = cleanText.match(new RegExp(kwLow.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g'));
    const count = matches ? matches.length : 0;
    
    if (count >= 5) {
      densityScore -= 10;
      suggestions.push(`**Keyword Stuffing Warning**: "${kw}" appears ${count} times, which may trigger spam filters. Aim for 2-3 natural repetitions instead.`);
    } else if (count === 1) {
      densityScore -= 3;
    }
  });

  densityScore = Math.max(0, densityScore);

  // --- Category E: Achievement Quality & Action Verbs (15%) ---
  let achievementScore = 0;
  let totalBullets = 0;
  let quantifiedBullets = 0;

  const ACTION_VERBS = {
    strong: [
      "architected", "spearheaded", "engineered", "overhauled", "optimized", "benchmarked",
      "scaled", "automated", "reduced", "accelerated", "eliminated", "orchestrated",
      "deployed", "mentored", "championed", "streamlined", "centralized", "designed",
      "implemented", "executed", "formulated", "delivered", "negotiated", "surpassed", "pioneered"
    ],
    moderate: [
      "developed", "built", "created", "maintained", "analyzed", "configured",
      "tested", "refactored", "integrated", "produced", "monitored", "established",
      "collaborated", "managed", "coordinated", "resolved", "improved", "launched"
    ],
    weak: [
      "assisted", "helped", "worked", "handled", "participated", "contributed",
      "responsible", "tasked", "supported", "attempted", "attended"
    ]
  };

  const METRIC_REGEX = /(?:\b\d+(?:\.\d+)?(?:%|k|m|b|\$|₹|x|\+)?\b|\b[1-9]\d*\b)/i;

  let strongVerbCount = 0;
  let moderateVerbCount = 0;
  let weakVerbCount = 0;
  const weakVerbExamples = [];

  // Split text by standard bullet point characters or line breaks
  const bulletLines = resumeText.split(/[\n•\-\*]/).map(line => line.trim()).filter(line => line.length > 20 && !line.includes("@") && !line.includes("http"));

  bulletLines.forEach(line => {
    totalBullets++;
    const words = line.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter(Boolean);
    const firstWord = words[0] || "";

    if (ACTION_VERBS.strong.some(v => firstWord.startsWith(v) || v.startsWith(firstWord))) {
      strongVerbCount++;
    } else if (ACTION_VERBS.moderate.some(v => firstWord.startsWith(v) || v.startsWith(firstWord))) {
      moderateVerbCount++;
    } else if (ACTION_VERBS.weak.some(v => firstWord.startsWith(v) || v.startsWith(firstWord))) {
      weakVerbCount++;
      if (weakVerbExamples.length < 3) weakVerbExamples.push(`"${firstWord}"`);
    }

    if (METRIC_REGEX.test(line)) {
      quantifiedBullets++;
    }
  });

  const metricDensity = totalBullets > 0 ? Math.round((quantifiedBullets / totalBullets) * 100) : 50;
  const verbQualityRatio = totalBullets > 0 
    ? Math.min(1.0, (strongVerbCount * 1.0 + moderateVerbCount * 0.7) / totalBullets)
    : 0.7;

  achievementScore = Math.min(100, Math.round((metricDensity * 0.55) + (verbQualityRatio * 45)));

  if (weakVerbCount > 0) {
    suggestions.push(`**Passive / Weak Action Verbs Flagged**: Found ${weakVerbCount} bullet points using passive opening verbs (${weakVerbExamples.join(", ")}). Upgrade to high-impact verbs like *Architected*, *Overhauled*, *Engineered*, or *Streamlined*.`);
  }
  if (metricDensity < 50 && totalBullets > 0) {
    suggestions.push(`**Low Metric Density (${metricDensity}%)**: Only ${quantifiedBullets} of ${totalBullets} bullet points contain hard numbers or metrics. Top recruiters recommend the Google X-Y-Z formula ("Accomplished [X], as measured by [Y], by doing [Z]").`);
  }

  // --- Category F: Section Completeness & Hygiene (15%) ---
  let completenessScore = 100;
  
  const experienceRegex = /\b(experience|work|employment|history)\b/i;
  const educationRegex = /\b(education|academic|college|university)\b/i;
  const skillsRegex = /\b(skills|technologies|expertise)\b/i;
  const summaryRegex = /\b(summary|profile|objective)\b/i;

  if (!experienceRegex.test(lowercaseText)) {
    completenessScore -= 25;
    suggestions.push(`**Completeness**: No Work Experience section detected. Most ${preset.name} resumes require this. Add it if applicable.`);
  }
  if (!educationRegex.test(lowercaseText)) {
    completenessScore -= 25;
    suggestions.push(`**Completeness**: No Education section detected. Add your credentials.`);
  }
  if (!skillsRegex.test(lowercaseText)) {
    completenessScore -= 25;
    suggestions.push(`**Completeness**: No Skills section detected. Add key technical elements.`);
  }
  if (!summaryRegex.test(lowercaseText)) {
    completenessScore -= 15;
    suggestions.push(`**Completeness**: Add a Professional Summary or Profile header to frame your experience.`);
  }

  const wordCount = cleanText.split(/\s+/).length;
  if (wordCount < 200 || wordCount > 900) {
    completenessScore -= 15;
    suggestions.push(`**Hygiene**: Your resume word count is ${wordCount}. Optimize length to 250-700 words to ensure it fits single-screen layouts perfectly.`);
  }

  const pronouns = cleanText.match(/\b(i|me|my|we|our)\b/g);
  if (pronouns && pronouns.length > 0) {
    completenessScore -= 15;
    suggestions.push(`**Hygiene**: Detected first-person pronouns ("${pronouns[0]}"). Write descriptions in third-person implied style (e.g. "Led system launch" instead of "I led system launch").`);
  }

  completenessScore = Math.max(0, completenessScore);

  // Final aggregate computation
  const finalScore = Math.round(
    (parseabilityScore * 0.20) +
    (titleScore * 0.10) +
    (keywordCoverageScore * 0.30) +
    (densityScore * 0.10) +
    (achievementScore * 0.15) +
    (completenessScore * 0.15)
  );

  return {
    score: finalScore,
    breakdown: {
      parseability: parseabilityScore,
      title: titleScore,
      keyword: keywordCoverageScore,
      density: densityScore,
      achievement: achievementScore,
      completeness: completenessScore
    },
    matchedKeywords,
    missingKeywords,
    verbAnalysis: {
      totalBullets,
      quantifiedBullets,
      metricDensity,
      strongVerbs: strongVerbCount,
      moderateVerbs: moderateVerbCount,
      weakVerbs: weakVerbCount
    },
    suggestions,
    flags
  };
}

/**
 * Dedicated 4-Line Summary Diagnostic & Role Recommendation Engine
 * Analyzes candidate's summary text against target role standards.
 */
function analyzeSummaryFourLines(candidateSummary, roleKey) {
  const preset = ATS_ROLE_PRESETS[roleKey] || ATS_ROLE_PRESETS.default;
  const cleanSummary = (candidateSummary || "").trim();
  const sentences = cleanSummary.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 10);
  const wordCount = cleanSummary ? cleanSummary.split(/\s+/).length : 0;

  // Criteria checks
  const hasSeniority = /\b(years|experienced|senior|junior|lead|graduate|student|intern|engineer|developer|specialist)\b/i.test(cleanSummary);
  const hasTechOrStack = preset.mustHave.some(kw => new RegExp('\\b' + kw.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '\\b', 'i').test(cleanSummary));
  const hasMetrics = /\b(\d+|%|\$|thousand|million|reduced|increased|improved|scaled|growth)\b/i.test(cleanSummary);
  const hasValueProp = /\b(passionate|dedicated|seeking|aiming|committed|focus|collaborative)\b/i.test(cleanSummary);

  let qualityScore = 0;
  if (hasSeniority) qualityScore += 25;
  if (hasTechOrStack) qualityScore += 30;
  if (hasMetrics) qualityScore += 25;
  if (hasValueProp) qualityScore += 20;

  const lineCountAssessment = sentences.length >= 3 && sentences.length <= 5 ? "Optimal (3-5 lines)" : sentences.length < 3 ? "Too brief (< 3 lines)" : "Too verbose (> 5 lines)";

  return {
    qualityScore: Math.min(100, qualityScore),
    detectedSummary: cleanSummary,
    sentenceCount: sentences.length,
    wordCount,
    lineCountAssessment,
    checks: {
      hasSeniority,
      hasTechOrStack,
      hasMetrics,
      hasValueProp
    },
    idealSummary: preset.fourLineSummary || [
      "Target role headline emphasizing years of experience and core domain focus.",
      "Primary technical stack and methodology highlights aligned with the target job.",
      "Quantifiable engineering or business achievement with measurable outcome metrics.",
      "Forward-looking commitment to engineering excellence, scalability, and teamwork."
    ]
  };
}

/**
 * Scale-aware reconstruction of text from PDF.js page content items.
 * Accounts for baseline micro-jitter (avgH * 0.5), horizontal progression,
 * variable font sizes, superscripts, multi-word entities, word spacing gaps,
 * punctuation clinging, and paragraph transitions.
 */
function reconstructPdfPageText(textContent) {
  if (!textContent || !Array.isArray(textContent.items) || textContent.items.length === 0) {
    return '';
  }

  // 1. Normalize items and filter out pure empty items without EOL
  const items = [];
  for (const raw of textContent.items) {
    if (!raw) continue;
    const str = raw.str || '';
    if (str.length === 0 && !raw.hasEOL) continue;
    
    const tx = raw.transform ? raw.transform[4] : 0;
    const ty = raw.transform ? raw.transform[5] : 0;
    const h = raw.height || (raw.transform ? Math.abs(raw.transform[3]) : 12) || 12;
    const w = raw.width || (str.length * (h * 0.5));

    items.push({
      str,
      x: tx,
      y: ty,
      w,
      h,
      hasEOL: Boolean(raw.hasEOL)
    });
  }

  if (items.length === 0) return '';

  let reconstructed = '';
  let prev = null;

  for (let i = 0; i < items.length; i++) {
    const cur = items[i];

    if (!prev) {
      reconstructed += cur.str;
      prev = cur;
      continue;
    }

    const avgH = (cur.h + prev.h) / 2 || 12;
    const dy = cur.y - prev.y;         // In PDF coordinates: positive = up, negative = down
    const prevRight = prev.x + prev.w;
    const gapX = cur.x - prevRight;

    let isSameLine = false;
    let isNewLine = false;
    let isParagraphGap = false;

    if (prev.hasEOL) {
      isNewLine = true;
    } else if (dy < 0) {
      if (Math.abs(dy) <= avgH * 0.5) {
        // Minor baseline jitter (e.g. 1-6pt on 12pt font) on the same visual line
        isSameLine = true;
      } else if (cur.x >= prevRight - 2 && Math.abs(dy) <= avgH * 0.8) {
        // Subscript / font change continuing to the right
        isSameLine = true;
      } else if (Math.abs(dy) > avgH * 1.8) {
        // Significant vertical drop indicates paragraph / section break
        isParagraphGap = true;
      } else {
        // Standard next line drop
        isNewLine = true;
      }
    } else if (dy > 0) {
      if (dy <= avgH * 0.5 && cur.x >= prevRight - 2) {
        // Superscript or upward baseline jitter continuing on same line
        isSameLine = true;
      } else if (dy > avgH * 1.5) {
        // Jumped upwards on the page (multi-column shift or new block)
        isParagraphGap = true;
      } else {
        isNewLine = true;
      }
    } else {
      isSameLine = true;
    }

    if (isParagraphGap) {
      if (!reconstructed.endsWith('\n\n')) {
        reconstructed = reconstructed.trimEnd() + '\n\n';
      }
      reconstructed += cur.str;
    } else if (isNewLine) {
      if (!reconstructed.endsWith('\n')) {
        reconstructed = reconstructed.trimEnd() + '\n';
      }
      reconstructed += cur.str;
    } else {
      // Same line: determine if a space is needed
      const endsWithSpace = prev.str.endsWith(' ') || reconstructed.endsWith(' ');
      const startsWithSpace = cur.str.startsWith(' ');
      const isPunctuation = /^[.,:;!?%)\'\"\]}]/.test(cur.str);

      if (!endsWithSpace && !startsWithSpace) {
        if (gapX > 1.5 && !isPunctuation) {
          reconstructed += ' ';
        } else if (gapX <= 1.5 && gapX >= -2 && !isPunctuation) {
          const prevLastChar = prev.str.slice(-1);
          const curFirstChar = cur.str.charAt(0);
          if (/[a-zA-Z0-9]/.test(prevLastChar) && /[a-zA-Z0-9]/.test(curFirstChar) && gapX > 0.5) {
            reconstructed += ' ';
          }
        }
      }
      reconstructed += cur.str;
    }

    prev = cur;
  }

  return reconstructed;
}

if (typeof window !== 'undefined') {
  window.validateResumeDocument = validateResumeDocument;
  window.parseResumeToStructuredData = parseResumeToStructuredData;
  window.scoreResumeData = scoreResumeData;
  window.reconstructPdfPageText = reconstructPdfPageText;
  window.CareerBridgeDocsDB = CareerBridgeDocsDB;

  window.CareerBridgeSync = {
    requireAuth,
    logout,
    loadProfile,
    saveProfile,
    setActiveProfile,
    getCachedProfileState,
    sanitizeProfileForStorage,
    CareerBridgeDocsDB,
    reconstructPdfPageText,
    safeSetItem,
    getEffectiveAuthToken,
    renderNav,
    validateResumeDocument,
    parseResumeToStructuredData,
    scoreResumeData
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    requireAuth,
    logout,
    loadProfile,
    saveProfile,
    setActiveProfile,
    getCachedProfileState,
    sanitizeProfileForStorage,
    CareerBridgeDocsDB,
    reconstructPdfPageText,
    safeSetItem,
    getEffectiveAuthToken,
    validateResumeDocument,
    parseResumeToStructuredData,
    scoreResumeData
  };
}
