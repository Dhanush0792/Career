import { getPortalRule, PORTAL_MAPS, generatePasscodeHash, decryptProfileData, encryptProfileData } from "./shared.js";

const SYNC_API = "https://jobxapply-backend.onrender.com/api";

async function authenticatedFetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(["jobxapplyToken", "jobxapplyPasscode"], async (result) => {
      const token = result.jobxapplyToken || "";
      const passcode = result.jobxapplyPasscode || "";
      const passcodeHash = passcode ? await generatePasscodeHash(passcode) : "";
      
      if (!options.headers) options.headers = {};
      
      // Prioritize JWT token if present
      if (token) {
        options.headers["Authorization"] = `Bearer ${token}`;
      } else if (passcodeHash) {
        options.headers["Authorization"] = `Bearer ${passcodeHash}`;
      }
      
      try {
        const res = await fetch(url, options);
        resolve(res);
      } catch (e) {
        reject(e);
      }
    });
  });
}

// Fetch maps from backend and cache locally
async function fetchAndCacheMaps() {
  try {
    const res = await fetch(`${SYNC_API}/maps`, { cache: "no-store" });
    if (!res.ok) return;
    const maps = await res.json();
    chrome.storage.local.set({ jobxapplyMaps: maps });
  } catch (e) {
    // ignore
  }
}

// initial fetch and periodic refresh
fetchAndCacheMaps();
setInterval(fetchAndCacheMaps, 1000 * 60 * 30); // refresh every 30 minutes


chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(["careerhubProfiles", "careerhubActiveProfileId", "careerhubProfile", "careerhubState", "careerhubPasscode", "careerhubMaps"], (result) => {
    const migration = {};
    if (result.careerhubProfiles && !result.jobxapplyProfiles) migration.jobxapplyProfiles = result.careerhubProfiles;
    if (result.careerhubActiveProfileId && !result.jobxapplyActiveProfileId) migration.jobxapplyActiveProfileId = result.careerhubActiveProfileId;
    if (result.careerhubProfile && !result.jobxapplyProfile) migration.jobxapplyProfile = result.careerhubProfile;
    if (result.careerhubState && !result.jobxapplyState) migration.jobxapplyState = result.careerhubState;
    if (result.careerhubPasscode && !result.jobxapplyPasscode) migration.jobxapplyPasscode = result.careerhubPasscode;
    if (result.careerhubMaps && !result.jobxapplyMaps) migration.jobxapplyMaps = result.careerhubMaps;
    if (Object.keys(migration).length > 0) {
      chrome.storage.local.set(migration);
    }
  });

  // Inject content.js into all existing open tabs
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      if (!tab.url || tab.url.startsWith("chrome://") || tab.url.startsWith("edge://") || tab.url.startsWith("about:") || tab.url.startsWith("chrome-extension://")) {
        continue;
      }
      chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        files: ["content.js"]
      }).catch(err => {
        console.warn(`Could not inject content script into tab ${tab.id} (${tab.url}):`, err);
      });
    }
  });
});

// Legacy setup
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(["jobxapplyProfiles"], (result) => {
    if (!result.jobxapplyProfiles) {
      const defaultProfile = {
        id: "default",
        profileName: "Default Profile",
        fullName: "",
        firstName: "",
        lastName: "",
        age: 0,
        dob: "",
        fatherName: "",
        motherName: "",
        email: "",
        phone: "",
        address: "",
        city: "",
        state: "",
        country: "",
        zip: "",
        headline: "",
        summary: "",
        education: "",
        college: "",
        experience: "",
        skills: "",
        linkedin: "",
        github: "",
        portfolio: "",
        resumeDraft: "",
        targetRole: ""
      };
      chrome.storage.local.set({
        jobxapplyActiveProfileId: "default",
        jobxapplyProfile: defaultProfile,
        jobxapplyProfiles: {
          "default": defaultProfile
        }
      });
    }
  });
});

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

function getBaseDomain(hostname) {
  const parts = hostname.replace("www.", "").split(".");
  if (parts.length > 2) {
    const pen = parts[parts.length - 2];
    if (["co", "com", "net", "org", "gov", "edu"].includes(pen) && parts.length > 2) {
      return parts.slice(-3).join(".");
    }
    return parts.slice(-2).join(".");
  }
  return parts.join(".");
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "jobxapply:getPortalRule") {
    const rule = getPortalRule(message.url || sender?.url || "");
    sendResponse({ rule });
    return true;
  }
  if (message?.type === "jobxapply:saveAuth") {
    const { token, passcode, email } = message;
    chrome.storage.local.set({
      jobxapplyToken: token || "",
      jobxapplyPasscode: passcode || "",
      jobxapplyEmail: email || ""
    }, () => {
      sendResponse({ ok: true });
    });
    return true;
  }
  if (message?.type === "jobxapply:getPortalMap") {
    const rule = getPortalRule(message.url || sender?.url || "");
    chrome.storage.local.get(["jobxapplyMaps", "jobxapplyCustomMaps"], (result) => {
      const cached = result.jobxapplyMaps || null;
      let map = {};
      if (cached && cached.maps && cached.maps[rule.portal]) {
        map = { ...cached.maps[rule.portal] };
      } else if (cached && cached[rule.portal]) {
        map = { ...cached[rule.portal] };
      } else {
        map = { ...(PORTAL_MAPS[rule.portal] || {}) };
      }
      
      const customMaps = result.jobxapplyCustomMaps || {};
      try {
        const hostname = new URL(message.url || sender?.url || "").hostname;
        const domain = getBaseDomain(hostname);
        if (customMaps[domain]) {
          map = { ...map, ...customMaps[domain] };
        }
      } catch (e) {
        console.error("Failed to parse URL domain for custom maps:", e);
      }
      sendResponse({ map });
    });
    return true;
  }
  if (message?.type === "jobxapply:saveCustomMap") {
    const { domain, field, selector } = message;
    chrome.storage.local.get(["jobxapplyCustomMaps"], (result) => {
      const customMaps = result.jobxapplyCustomMaps || {};
      if (!customMaps[domain]) {
        customMaps[domain] = {};
      }
      customMaps[domain][field] = selector;
      chrome.storage.local.set({ jobxapplyCustomMaps: customMaps }, () => {
        sendResponse({ ok: true });
      });
    });
    return true;
  }
  if (message?.type === "jobxapply:deleteCustomMap") {
    const { domain, field } = message;
    chrome.storage.local.get(["jobxapplyCustomMaps"], (result) => {
      const customMaps = result.jobxapplyCustomMaps || {};
      if (customMaps[domain]) {
        if (field) {
          delete customMaps[domain][field];
        } else {
          delete customMaps[domain];
        }
        chrome.storage.local.set({ jobxapplyCustomMaps: customMaps }, () => {
          sendResponse({ ok: true });
        });
      } else {
        sendResponse({ ok: true });
      }
    });
    return true;
  }
  if (message?.type === "jobxapply:captureTab") {
    chrome.tabs.captureVisibleTab(null, { format: "png" }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ ok: true, dataUrl });
      }
    });
    return true;
  }
  if (message?.type === "jobxapply:logApplication") {
    const { company, role, portal, snapshot } = message;
    chrome.storage.local.get(["jobxapplyPasscode"], async (result) => {
      const passcode = result.jobxapplyPasscode || "";
      const hash = passcode ? await generatePasscodeHash(passcode) : "";
      if (!hash) {
        sendResponse({ ok: false, error: "Not authenticated: No passcode hash found in extension storage" });
        return;
      }
      try {
        const getRes = await fetch(`${SYNC_API}/tracker`, {
          headers: { "Authorization": `Bearer ${hash}` }
        });
        let apps = [];
        if (getRes.ok) {
          const data = await getRes.json();
          apps = data.applications || [];
        }
        const newApp = {
          id: Date.now(),
          company: company || "Unknown Company",
          role: role || "Software Engineer",
          portal: portal || "Direct",
          status: "applied",
          dateApplied: new Date().toLocaleDateString(),
          followUp: new Date(Date.now() + 7*24*60*60*1000).toLocaleDateString(),
          snapshot: snapshot || null
        };
        apps.unshift(newApp);
        const postRes = await fetch(`${SYNC_API}/tracker`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${hash}`
          },
          body: JSON.stringify({ applications: apps })
        });
        if (postRes.ok) {
          sendResponse({ ok: true, app: newApp });
        } else {
          const errData = await postRes.json();
          sendResponse({ ok: false, error: errData.error || "Failed to push application to server" });
        }
      } catch (e) {
        sendResponse({ ok: false, error: e.message });
      }
    });
    return true;
  }
  if (message?.type === "jobxapply:getProfile") {
    chrome.storage.local.get(["jobxapplyState", "jobxapplyProfiles", "jobxapplyActiveProfileId", "jobxapplyProfile", "jobxapplyPasscode"], (result) => {
      const passcode = result.jobxapplyPasscode || "";
      
      const processProfileState = async (state) => {
        let profiles = state.profiles || {};
        let activeProfileId = state.activeProfileId || "default";

        if (state.profiles && passcode) {
          profiles = await decryptAllProfiles(state.profiles, passcode);
        } else if (state.profile) {
          let decryptedProfile = state.profile;
          if (state.profile.encryptedBlob && passcode) {
            try {
              decryptedProfile = await decryptProfileData(state.profile, passcode);
            } catch (e) {
              console.error("Failed to decrypt legacy get:", e);
            }
          }
          profiles = { "default": decryptedProfile };
          activeProfileId = "default";
        }
        return { profiles, activeProfileId };
      };

      if (result.jobxapplyProfiles && Object.keys(result.jobxapplyProfiles).length) {
        authenticatedFetch(`${SYNC_API}/profile`)
          .then((res) => res.json())
          .then(async (state) => {
            const { profiles, activeProfileId } = await processProfileState(state);
            const activeProfile = profiles[activeProfileId] || {};
            const decryptedState = { ...state, profiles };
            chrome.storage.local.set({
              jobxapplyState: decryptedState,
              jobxapplyProfiles: profiles,
              jobxapplyActiveProfileId: activeProfileId,
              jobxapplyProfile: activeProfile
            });
          })
          .catch(() => {});

        const activeProfile = result.jobxapplyProfiles[result.jobxapplyActiveProfileId] || result.jobxapplyProfile || {};
        sendResponse({ 
          profile: activeProfile, 
          profiles: result.jobxapplyProfiles,
          activeProfileId: result.jobxapplyActiveProfileId,
          state: result.jobxapplyState || null 
        });
        return;
      }

      authenticatedFetch(`${SYNC_API}/profile`)
        .then((res) => res.json())
        .then(async (state) => {
          const { profiles, activeProfileId } = await processProfileState(state);
          const activeProfile = profiles[activeProfileId] || {};
          const decryptedState = { ...state, profiles };
          chrome.storage.local.set({
            jobxapplyState: decryptedState,
            jobxapplyProfiles: profiles,
            jobxapplyActiveProfileId: activeProfileId,
            jobxapplyProfile: activeProfile
          }, () => {
            sendResponse({ 
              profile: activeProfile, 
              profiles,
              activeProfileId,
              state: decryptedState 
            });
          });
        })
        .catch(() => {
          sendResponse({ profile: {} });
        });
    });
    return true;
  }
  if (message?.type === "jobxapply:setProfile") {
    chrome.storage.local.get(["jobxapplyState", "jobxapplyPasscode"], (result) => {
      const knownVersion = result.jobxapplyState?.version || 0;
      const passcode = result.jobxapplyPasscode || "";
      
      let payloadProfiles = message.profiles;
      let activeProfileId = message.activeProfileId || "default";

      if (!payloadProfiles && message.profile) {
        payloadProfiles = { "default": message.profile };
        activeProfileId = "default";
      }

      const payload = { 
        profiles: payloadProfiles, 
        activeProfileId: activeProfileId,
        passcodeHash: message.passcodeHash || "", 
        origin: "extension", 
        version: knownVersion 
      };
      
      const headers = { "Content-Type": "application/json" };
      if (message.passcodeHash) {
        headers["Authorization"] = `Bearer ${message.passcodeHash}`;
      }
      
      fetch(`${SYNC_API}/profile`, {
        method: "POST",
        headers: headers,
        body: JSON.stringify(payload)
      })
        .then(async (res) => {
          const resultJson = await res.json().catch(() => ({}));
          if (!res.ok) {
            if (res.status === 409 && resultJson?.current) {
              let currentProfiles = resultJson.current.profiles || {};
              if (passcode) {
                currentProfiles = await decryptAllProfiles(currentProfiles, passcode);
              }
              const decryptedCurrent = {
                ...resultJson.current,
                profiles: currentProfiles
              };
              const activeProfile = currentProfiles[decryptedCurrent.activeProfileId] || {};
              chrome.storage.local.set({ 
                jobxapplyState: decryptedCurrent, 
                jobxapplyProfiles: currentProfiles,
                jobxapplyActiveProfileId: decryptedCurrent.activeProfileId,
                jobxapplyProfile: activeProfile
              }, () => {
                sendResponse({ ok: false, conflict: true, current: decryptedCurrent });
              });
              return;
            }
            chrome.storage.local.set({ jobxapplyProfiles: payloadProfiles }, () => {
              sendResponse({ ok: false, error: resultJson.error || null, errors: resultJson.errors || null });
            });
            return;
          }
          
          chrome.storage.local.get(["jobxapplyPasscode"], async (storageResult) => {
            const pc = storageResult.jobxapplyPasscode || "";
            let serverProfiles = resultJson.state?.profiles || payloadProfiles;
            let serverActiveId = resultJson.state?.activeProfileId || activeProfileId;
            if (pc) {
              serverProfiles = await decryptAllProfiles(serverProfiles, pc);
            }
            const activeProfile = serverProfiles[serverActiveId] || {};
            const decryptedState = {
              ...resultJson.state,
              profiles: serverProfiles
            };
            chrome.storage.local.set({ 
              jobxapplyState: decryptedState, 
              jobxapplyProfiles: serverProfiles,
              jobxapplyActiveProfileId: serverActiveId,
              jobxapplyProfile: activeProfile
            }, () => {
              sendResponse({ ok: true, state: decryptedState });
            });
          });
        })
        .catch((error) => {
          chrome.storage.local.set({ jobxapplyProfiles: payloadProfiles }, () => {
            sendResponse({ ok: false, error: error.message });
          });
        });
    });
    return true;
  }
  if (message?.type === "jobxapply:setActiveProfile") {
    const newActiveId = message.activeProfileId;
    chrome.storage.local.get(["jobxapplyProfiles", "jobxapplyPasscode", "jobxapplyState"], (result) => {
      const profiles = result.jobxapplyProfiles || {};
      if (!profiles[newActiveId]) {
        sendResponse({ ok: false, error: `Profile '${newActiveId}' does not exist` });
        return;
      }
      
      const activeProfile = profiles[newActiveId];
      chrome.storage.local.set({
        jobxapplyActiveProfileId: newActiveId,
        jobxapplyProfile: activeProfile
      }, async () => {
        const passcode = result.jobxapplyPasscode || "";
        const passcodeHash = passcode ? await generatePasscodeHash(passcode) : "";
        
        try {
          const encryptedProfiles = {};
          for (const key of Object.keys(profiles)) {
            const p = profiles[key];
            if (passcode) {
              encryptedProfiles[key] = await encryptProfileData(p, passcode);
            } else {
              encryptedProfiles[key] = p;
            }
          }
          
          const knownVersion = result.jobxapplyState?.version || 0;
          const payload = {
            profiles: encryptedProfiles,
            activeProfileId: newActiveId,
            passcodeHash: passcodeHash,
            origin: "extension",
            version: knownVersion
          };
          
          const headers = { "Content-Type": "application/json" };
          if (passcodeHash) {
            headers["Authorization"] = `Bearer ${passcodeHash}`;
          }
          
          const res = await fetch(`${SYNC_API}/profile`, {
            method: "POST",
            headers,
            body: JSON.stringify(payload)
          });
          const resultJson = await res.json();
          if (res.ok && resultJson.ok) {
            const decryptedState = { ...resultJson.state, profiles };
            chrome.storage.local.set({ jobxapplyState: decryptedState });
            sendResponse({ ok: true, activeProfileId: newActiveId });
          } else {
            sendResponse({ ok: false, error: resultJson.error || "Sync failed" });
          }
        } catch (e) {
          sendResponse({ ok: false, error: e.message });
        }
      });
    });
    return true;
  }
  if (message?.type === "jobxapply:reportMapIssue") {
    const payload = { report: message.report || {}, origin: "extension" };
    fetch(`${SYNC_API}/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload.report || payload)
    })
      .then((res) => res.json())
      .then((result) => {
        sendResponse({ ok: true, result });
      })
      .catch((err) => {
        sendResponse({ ok: false, error: err.message });
      });
    return true;
  }
});
