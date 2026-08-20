import { encryptProfileData, decryptProfileData, generatePasscodeHash } from "./shared.js";

async function $(id) { return document.getElementById(id); }

async function loadProfile() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["jobxapplyProfile"], (result) => {
      resolve(result.jobxapplyProfile || {});
    });
  });
}

async function loadPasscode() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["jobxapplyPasscode"], (result) => {
      resolve(result.jobxapplyPasscode || "");
    });
  });
}

async function saveProfile(profile, passcodeHash) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "jobxapply:setProfile", profile, passcodeHash }, (res) => {
      resolve(res);
    });
  });
}

(async function init() {
  const profile = await loadProfile();
  const cachedPasscode = await loadPasscode();
  
  const fields = [
    "fullName", "firstName", "lastName", "email", "phone", "dob", "headline", 
    "summary", "education", "experience", "linkedin", "github", "portfolio"
  ];
  
  for (const f of fields) {
    const el = document.getElementById(f);
    if (!el) continue;
    el.value = profile[f] || "";
  }
  
  const passcodeEl = document.getElementById("syncPasscode");
  if (passcodeEl) {
    passcodeEl.value = cachedPasscode;
  }
  
  let pendingLocalProfile = null;
  let currentConflictServer = null;
  
  document.getElementById('save').addEventListener('click', async () => {
    const passcode = document.getElementById("syncPasscode").value.trim();
    if (!passcode) {
      document.getElementById('status').textContent = 'Error: Passcode is required to secure sync';
      return;
    }
    
    // Save passcode locally
    await new Promise((r) => chrome.storage.local.set({ jobxapplyPasscode: passcode }, r));
    const passcodeHash = await generatePasscodeHash(passcode);
    
    const newProfile = {};
    for (const f of fields) newProfile[f] = document.getElementById(f).value || "";
    pendingLocalProfile = newProfile;
    
    document.getElementById('status').textContent = 'Encrypting & saving...';
    try {
      const encryptedProfile = await encryptProfileData(newProfile, passcode);
      const res = await saveProfile(encryptedProfile, passcodeHash);
      if (res?.ok) {
        document.getElementById('status').textContent = 'Saved and synced (Encrypted)';
        document.getElementById('conflictUI').style.display = 'none';
      } else if (res?.conflict && res.current) {
        try {
          currentConflictServer = await decryptProfileData(res.current, passcode);
        } catch (e) {
          currentConflictServer = res.current.profile || {};
        }
        document.getElementById('conflictUI').style.display = 'block';
        document.getElementById('status').textContent = 'Conflict detected — choose how to proceed.';
      } else if (res?.errors) {
        document.getElementById('status').textContent = 'Validation errors: ' + (Array.isArray(res.errors) ? res.errors.join('; ') : String(res.errors));
      } else {
        document.getElementById('status').textContent = 'Saved locally (server offline or access denied)';
      }
    } catch (err) {
      document.getElementById('status').textContent = 'Encryption Error: ' + err.message;
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
    const passcode = document.getElementById("syncPasscode").value.trim();
    if (!passcode) return;
    
    document.getElementById('status').textContent = 'Encrypting & forcing sync...';
    try {
      const passcodeHash = await generatePasscodeHash(passcode);
      const encryptedProfile = await encryptProfileData(pendingLocalProfile, passcode);
      const res = await saveProfile(encryptedProfile, passcodeHash);
      if (res?.ok) {
        document.getElementById('status').textContent = 'Local changes saved (Encrypted)';
        document.getElementById('conflictUI').style.display = 'none';
      } else if (res?.conflict) {
        document.getElementById('status').textContent = 'Another conflict occurred. Choose again.';
      } else {
        document.getElementById('status').textContent = 'Error: ' + (res?.error || 'unknown');
      }
    } catch (err) {
      document.getElementById('status').textContent = 'Error: ' + err.message;
    }
  });
  
  document.getElementById('conflictReload').addEventListener('click', async () => {
    document.getElementById('status').textContent = 'Reloading from server...';
    const passcode = document.getElementById("syncPasscode").value.trim();
    if (!passcode) return;
    
    const serverPayload = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "jobxapply:getProfile" }, (res) => resolve(res?.state || null));
    });
    
    if (serverPayload) {
      try {
        const decryptedServerProfile = await decryptProfileData(serverPayload, passcode);
        for (const f of fields) {
          const el = document.getElementById(f);
          if (!el) continue;
          el.value = decryptedServerProfile[f] || "";
        }
        document.getElementById('status').textContent = 'Reloaded and decrypted from server.';
      } catch (err) {
        document.getElementById('status').textContent = 'Reloaded. Decryption failed (check passcode).';
      }
    } else {
      document.getElementById('status').textContent = 'Error: Reload failed.';
    }
    document.getElementById('conflictUI').style.display = 'none';
  });
  
  document.getElementById('pullCloud').addEventListener('click', async (e) => {
    e.preventDefault();
    const passcode = document.getElementById("syncPasscode").value.trim();
    if (!passcode) {
      document.getElementById('status').textContent = 'Error: Passcode is required to fetch profile';
      return;
    }
    
    document.getElementById('status').textContent = 'Fetching encrypted profile from server...';
    try {
      await new Promise((r) => chrome.storage.local.set({ jobxapplyPasscode: passcode }, r));
      const passcodeHash = await generatePasscodeHash(passcode);
      
      chrome.runtime.sendMessage({ type: "jobxapply:getProfile" }, async (res) => {
        if (res && res.profile && Object.keys(res.profile).length > 0) {
          const p = res.profile;
          for (const f of fields) {
            const el = document.getElementById(f);
            if (el) el.value = p[f] || "";
          }
          document.getElementById('status').textContent = 'Successfully fetched and decrypted profile from cloud!';
        } else {
          document.getElementById('status').textContent = 'No profile found on server or decryption failed. Check your passcode.';
        }
      });
    } catch (err) {
      document.getElementById('status').textContent = 'Fetch Error: ' + err.message;
    }
  });

  document.getElementById('close').addEventListener('click', () => window.close());
})();