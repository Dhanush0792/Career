async function $(id) { return document.getElementById(id); }

async function loadProfile() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["careerhubProfile"], (result) => {
      resolve(result.careerhubProfile || {});
    });
  });
}

async function saveProfile(profile) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "careerhub:setProfile", profile }, (res) => {
      resolve(res);
    });
  });
}

async function loadServerProfile() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "careerhub:getProfile" }, (res) => {
      resolve(res?.profile || {});
    });
  });
}

(async function init() {
  const profile = await loadProfile();
  const fields = ["fullName","firstName","lastName","email","phone","dob","headline","summary","education","experience","linkedin","github","portfolio"];
  for (const f of fields) {
    const el = document.getElementById(f);
    if (!el) continue;
    el.value = profile[f] || "";
  }
  
  let pendingLocalProfile = null;
  let currentConflictServer = null;
  
  document.getElementById('save').addEventListener('click', async () => {
    const newProfile = {};
    for (const f of fields) newProfile[f] = document.getElementById(f).value || "";
    pendingLocalProfile = newProfile;
    document.getElementById('status').textContent = 'Saving...';
    const res = await saveProfile(newProfile);
    if (res?.ok) {
      document.getElementById('status').textContent = 'Saved and synced';
      document.getElementById('conflictUI').style.display = 'none';
    } else if (res?.conflict && res.current) {
      currentConflictServer = res.current.profile || {};
      document.getElementById('conflictUI').style.display = 'block';
      document.getElementById('status').textContent = 'Conflict detected — choose how to proceed.';
    } else if (res?.errors) {
      document.getElementById('status').textContent = 'Validation errors: ' + (Array.isArray(res.errors) ? res.errors.join('; ') : String(res.errors));
    } else {
      document.getElementById('status').textContent = 'Saved locally (offline or server error)';
    }
  });
  
  document.getElementById('conflictUseServer').addEventListener('click', async () => {
    if (!currentConflictServer) return;
    for (const f of fields) {
      const el = document.getElementById(f);
      if (!el) continue;
      el.value = currentConflictServer[f] || "";
    }
    document.getElementById('conflictUI').style.display = 'none';
    document.getElementById('status').textContent = 'Loaded server state. Edit and save again to apply changes.';
  });
  
  document.getElementById('conflictKeepLocal').addEventListener('click', async () => {
    if (!pendingLocalProfile) return;
    document.getElementById('status').textContent = 'Saving local changes (force overwrite)...';
    const res = await saveProfile(pendingLocalProfile);
    if (res?.ok) {
      document.getElementById('status').textContent = 'Local changes saved';
      document.getElementById('conflictUI').style.display = 'none';
    } else if (res?.conflict) {
      document.getElementById('status').textContent = 'Another conflict occurred. Choose again.';
    } else {
      document.getElementById('status').textContent = 'Error: ' + (res?.error || 'unknown');
    }
  });
  
  document.getElementById('conflictReload').addEventListener('click', async () => {
    document.getElementById('status').textContent = 'Reloading from server...';
    const serverProfile = await loadServerProfile();
    for (const f of fields) {
      const el = document.getElementById(f);
      if (!el) continue;
      el.value = serverProfile[f] || "";
    }
    document.getElementById('conflictUI').style.display = 'none';
    document.getElementById('status').textContent = 'Reloaded from server.';
  });
  
  document.getElementById('close').addEventListener('click', () => window.close());
})();