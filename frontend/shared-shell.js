/**
 * JobXApply // shared-shell.js
 * Central shell utilities: auth guard, nav injection, profile fetch, SSE sync.
 * Import this as the FIRST script on every inner page.
 */


// ─── Local Storage Migration ───────────────────────────────────────────────
(function() {
  const legacyKeys = ['token', 'passcode', 'local_profile', 'local_profiles', 'active_profile_id', 'local_state', 'applications', 'role'];
  legacyKeys.forEach(k => {
    const val = localStorage.getItem('ch_' + k);
    if (val && !localStorage.getItem('jxa_' + k)) {
      localStorage.setItem('jxa_' + k, val);
    }
  });
})();

const SYNC_API = 'http://localhost:8787/api';

// ─── Auth ─────────────────────────────────────────────────────────────────

/**
 * Redirect to auth.html if no session token exists.
 * Call this at the top of every inner page.
 */
function requireAuth() {
  if (!localStorage.getItem('jxa_token')) {
    const path = window.location.pathname;
    const page = path.substring(path.lastIndexOf('/') + 1);
    if (page.includes('resume-builder')) {
      window.location.href = 'tools.html#resume-builder';
    } else if (page.includes('ats-checker')) {
      window.location.href = 'tools.html#ats-checker';
    } else if (page.includes('cover-letter')) {
      window.location.href = 'tools.html#cover-letter';
    } else if (page.includes('autofill-lab')) {
      window.location.href = 'tools.html#autofill-lab';
    } else {
      window.location.href = 'auth.html';
    }
  } else {
    // Background pull tracker data from server on startup
    pullApplicationsFromServer().catch(() => {});
  }
}

function logout() {
  const keys = Object.keys(localStorage).filter(k => k.startsWith('jxa_'));
  keys.forEach(k => localStorage.removeItem(k));
  window.location.href = 'auth.html';
}

// ─── Profile ───────────────────────────────────────────────────────────────

/**
/**
 * Load profile from sync server; falls back to localStorage.
 * Returns the normalized state object: { profile, version, updatedAt, origin }
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

/**
 * Load profile from sync server; falls back to localStorage.
 * Returns the normalized state object: { profile, version, updatedAt, origin }
 */
async function loadProfile() {
  const token = localStorage.getItem('jxa_token') || "";
  const passcode = localStorage.getItem('jxa_passcode') || "";
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
            if (!window.location.pathname.endsWith('profile-setup.html') && !window.location.pathname.endsWith('auth.html')) {
              setTimeout(showPasscodeModal, 100);
            }
          }
        } else {
          if (!window.location.pathname.endsWith('profile-setup.html') && !window.location.pathname.endsWith('auth.html')) {
            setTimeout(showPasscodeModal, 100);
          }
        }
        profiles = { "default": state.profile };
        activeId = "default";
        state.profiles = profiles;
        state.activeProfileId = activeId;
      }
      
      // Cache locally for offline fallback
      localStorage.setItem('jxa_local_profile', JSON.stringify(state.profile || {}));
      localStorage.setItem('jxa_local_profiles', JSON.stringify(profiles));
      localStorage.setItem('jxa_active_profile_id', activeId);
      localStorage.setItem('jxa_local_state', JSON.stringify(state));
      return state;
    }
  } catch (_) {}
  
  // Offline fallback
  const localProfile = localStorage.getItem('jxa_local_profile');
  const localState = localStorage.getItem('jxa_local_state');
  if (localProfile) {
    let state = localState ? JSON.parse(localState) : { profile: JSON.parse(localProfile), version: 0, updatedAt: 0, origin: 'local' };
    let profiles = state.profiles || {};
    let activeId = state.activeProfileId || "default";

    if (state.profiles) {
      if (passcode) {
        profiles = await decryptAllProfiles(state.profiles, passcode);
      }
      state.profiles = profiles;
      state.profile = profiles[activeId] || {};
    } else if (state.profile && state.profile.encryptedBlob) {
      if (passcode) {
        try {
          const decryptedProfile = await decryptProfileData(state.profile, passcode);
          state.profile = decryptedProfile;
        } catch (e) {
          if (!window.location.pathname.endsWith('profile-setup.html') && !window.location.pathname.endsWith('auth.html')) {
            setTimeout(showPasscodeModal, 100);
          }
        }
      } else {
        if (!window.location.pathname.endsWith('profile-setup.html') && !window.location.pathname.endsWith('auth.html')) {
          setTimeout(showPasscodeModal, 100);
        }
      }
      profiles = { "default": state.profile };
      activeId = "default";
      state.profiles = profiles;
      state.activeProfileId = activeId;
    }
    return state;
  }
  return { profile: {}, version: 0, updatedAt: 0, origin: 'none' };
}

/**
 * Save profile to sync server AND localStorage.
 * Returns { ok, state, errors }.
 */
async function saveProfile(profileData) {
  const localState = localStorage.getItem('jxa_local_state');
  const knownVersion = localState ? (JSON.parse(localState).version || 0) : 0;
  
  const passcode = localStorage.getItem('jxa_passcode') || "";
  const passcodeHash = passcode ? await generatePasscodeHash(passcode) : "";

  let activeId = localStorage.getItem('jxa_active_profile_id') || "default";
  
  let localProfilesRaw = localStorage.getItem('jxa_local_profiles');
  let localProfiles = {};
  try {
    localProfiles = localProfilesRaw ? JSON.parse(localProfilesRaw) : {};
  } catch(e) {}
  
  profileData.id = activeId;
  localProfiles[activeId] = profileData;

  const encryptedProfiles = {};
  for (const key of Object.keys(localProfiles)) {
    const p = localProfiles[key];
    if (passcode) {
      try {
        encryptedProfiles[key] = await encryptProfileData(p, passcode);
      } catch (e) {
        console.error("Encryption failed for profile:", key, e);
        return { ok: false, errors: ["Encryption failed: " + e.message] };
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
      localStorage.setItem('jxa_local_profile', JSON.stringify(profileData));
      localStorage.setItem('jxa_local_profiles', JSON.stringify(localProfiles));
      localStorage.setItem('jxa_active_profile_id', activeId);
      
      const serverState = result.state || {};
      const decryptedServerState = {
        ...serverState,
        profiles: localProfiles,
        profile: profileData
      };
      localStorage.setItem('jxa_local_state', JSON.stringify(decryptedServerState));
      
      return { ok: true, state: decryptedServerState };
    }
    if (res.status === 409 && result.current) {
      let serverProfiles = result.current.profiles || {};
      let serverActiveId = result.current.activeProfileId || "default";
      if (passcode) {
        serverProfiles = await decryptAllProfiles(serverProfiles, passcode);
      }
      const serverProfile = serverProfiles[serverActiveId] || {};
      
      localStorage.setItem('jxa_local_profile', JSON.stringify(serverProfile));
      localStorage.setItem('jxa_local_profiles', JSON.stringify(serverProfiles));
      localStorage.setItem('jxa_active_profile_id', serverActiveId);
      
      const decryptedCurrent = {
        ...result.current,
        profiles: serverProfiles,
        profile: serverProfile
      };
      localStorage.setItem('jxa_local_state', JSON.stringify(decryptedCurrent));
    }
    return { ok: false, errors: result.errors || [result.error || 'Save failed'] };
  } catch (e) {
    localStorage.setItem('jxa_local_profile', JSON.stringify(profileData));
    localStorage.setItem('jxa_local_profiles', JSON.stringify(localProfiles));
    return { ok: true, offline: true, state: { profile: profileData, profiles: localProfiles, activeProfileId: activeId, version: 0, updatedAt: Date.now(), origin: 'local' } };
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
    const passcodeHash = passcode ? await generatePasscodeHash(passcode) : "";
    const queryToken = token || passcodeHash;
    const url = `${SYNC_API}/events` + (queryToken ? `?token=${encodeURIComponent(queryToken)}` : "");
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
    });
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
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    company: String(app.company || '').trim(),
    role: String(app.role || '').trim(),
    portal: String(app.portal || '').trim(),
    url: String(app.url || '').trim(),
    date: app.date || new Date().toISOString().slice(0, 10),
    status: app.status || 'applied'
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
  { label: 'ATS',          href: 'ats-checker.html' },
  { label: 'Cover Letter', href: 'cover-letter.html' },
  { label: 'Tracker',      href: 'tracker.html' },
  { label: 'Autofill',     href: 'autofill-lab.html' },
  { label: 'Extension',    href: 'extension-setup.html' },
  { label: 'Settings',     href: 'settings.html' },
];

/**
 * Inject the standard top-nav into a given container element.
 * @param {HTMLElement} container - The nav element to fill.
 * @param {string} activePage - The current page filename (e.g. 'dashboard.html').
 */
function renderNav(container, activePage) {
  const links = NAV_ITEMS.map(item => {
    const isActive = item.href === activePage;
    return `<a href="${item.href}" class="nav__link${isActive ? ' nav__link--active' : ''}">${item.label}</a>`;
  }).join('');

  container.innerHTML = `
    <div class="nav__inner">
      <a href="dashboard.html" class="nav__logo">
        <span class="nav__logo-bracket">[</span>&nbsp;CH&nbsp;<span class="nav__logo-bracket">]</span>
      </a>
      <div class="nav__links">${links}</div>
      <button class="nav__logout" onclick="logout()">LOGOUT</button>
    </div>`;
}

// ─── Admin Auth Guard ─────────────────────────────────────────────────────

/**
 * Redirect to dashboard.html if user is not logged in as admin.
 * Call this at the top of every admin page.
 */
function requireAdmin() {
  if (!localStorage.getItem('jxa_token')) {
    window.location.href = '../auth.html';
    return;
  }
  if (localStorage.getItem('jxa_role') !== 'admin') {
    window.location.href = '../dashboard.html';
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
  { label: 'Portal Maps',  href: 'portal-maps.html' },
  { label: 'Reports',      href: 'reports.html' },
  { label: 'Analytics',    href: 'analytics.html' },
];

/**
 * Inject the admin navigation bar into a given container element.
 * @param {HTMLElement} container - The nav element to fill.
 * @param {string} activePage - The current admin page filename (e.g. 'index.html').
 */
function renderAdminNav(container, activePage) {
  const links = ADMIN_NAV_ITEMS.map(item => {
    const isActive = item.href === activePage;
    return `<a href="${item.href}" class="nav__link${isActive ? ' nav__link--active' : ''}" style="${isActive ? 'color:#F5A623;' : ''}">${item.label}</a>`;
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
  "email", "phone", "address", "city", "state", "country", "zip", "headline",
  "summary", "education", "college", "experience", "skills", "linkedin", "github",
  "portfolio", "resumeDraft", "targetRole", "answers"
];

function uint8ToBase64(uint8) {
  let bin = "";
  const len = uint8.byteLength;
  for (let i = 0; i < len; i++) {
    bin += String.fromCharCode(uint8[i]);
  }
  return btoa(bin);
}

function base64ToUint8(base64) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function generatePasscodeHash(passcode) {
  if (!passcode) return "";
  const encoder = new TextEncoder();
  const data = encoder.encode(passcode);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
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

  const publicMetadata = {
    fullName: profile.fullName || "",
    headline: profile.headline || "",
    targetRole: profile.targetRole || ""
  };

  const privateDetails = {};
  for (const field of DEFAULT_PROFILE_FIELDS) {
    if (field !== "fullName" && field !== "headline" && field !== "targetRole") {
      privateDetails[field] = profile[field] || "";
    }
  }

  const plaintext = JSON.stringify(privateDetails);
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
    ...publicMetadata,
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
  const privateDetails = JSON.parse(privateJson);

  const fullProfile = {};
  for (const field of DEFAULT_PROFILE_FIELDS) {
    if (field === "fullName" || field === "headline" || field === "targetRole") {
      fullProfile[field] = encryptedProfile[field] || "";
    } else {
      fullProfile[field] = privateDetails[field] || "";
    }
  }

  return fullProfile;
}

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
