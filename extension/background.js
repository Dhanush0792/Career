import { getPortalRule, PORTAL_MAPS } from "./shared.js";

const SYNC_API = "http://localhost:8787/api";

// Fetch maps from backend and cache locally
async function fetchAndCacheMaps() {
  try {
    const res = await fetch(`${SYNC_API}/maps`, { cache: "no-store" });
    if (!res.ok) return;
    const maps = await res.json();
    chrome.storage.local.set({ careerhubMaps: maps });
  } catch (e) {
    // ignore
  }
}

// initial fetch and periodic refresh
fetchAndCacheMaps();
setInterval(fetchAndCacheMaps, 1000 * 60 * 30); // refresh every 30 minutes

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(["careerhubProfile"], (result) => {
    if (!result.careerhubProfile) {
      chrome.storage.local.set({
        careerhubProfile: {
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
        }
      });
    }
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "careerhub:getPortalRule") {
    const rule = getPortalRule(message.url || sender?.url || "");
    sendResponse({ rule });
    return true;
  }
  if (message?.type === "careerhub:getPortalMap") {
    const rule = getPortalRule(message.url || sender?.url || "");
    chrome.storage.local.get(["careerhubMaps"], (result) => {
      const cached = result.careerhubMaps || null;
      let map = null;
      if (cached && cached.maps && cached.maps[rule.portal]) {
        map = cached.maps[rule.portal];
      } else if (cached && cached[rule.portal]) {
        map = cached[rule.portal];
      } else {
        map = PORTAL_MAPS[rule.portal] || null;
      }
      sendResponse({ map });
    });
    return true;
  }
  if (message?.type === "careerhub:getProfile") {
    // Return cached profile immediately when available, then refresh from server in background
    chrome.storage.local.get(["careerhubState", "careerhubProfile"], (result) => {
      if (result.careerhubProfile && Object.keys(result.careerhubProfile).length) {
        // background refresh
        fetch(`${SYNC_API}/profile`)
          .then((res) => res.json())
          .then((state) => {
            chrome.storage.local.set({ careerhubState: state, careerhubProfile: state.profile || {} });
          })
          .catch(() => {});
        sendResponse({ profile: result.careerhubProfile, state: result.careerhubState || null });
        return;
      }
      fetch(`${SYNC_API}/profile`)
        .then((res) => res.json())
        .then((state) => {
          chrome.storage.local.set({ careerhubState: state, careerhubProfile: state.profile || {} }, () => {
            sendResponse({ profile: state.profile || {}, state });
          });
        })
        .catch(() => {
          sendResponse({ profile: {} });
        });
    });
    return true;
  }
  if (message?.type === "careerhub:setProfile") {
    // include known server version to enable conflict detection
    chrome.storage.local.get(["careerhubState", "careerhubProfile"], (result) => {
      const knownVersion = result.careerhubState?.version || 0;
      const payload = { profile: message.profile || {}, origin: "extension", version: knownVersion };
      fetch(`${SYNC_API}/profile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
        .then(async (res) => {
          const resultJson = await res.json().catch(() => ({}));
          if (!res.ok) {
            if (res.status === 409 && resultJson?.current) {
              // conflict: update local cache with server state and inform caller
              chrome.storage.local.set({ careerhubState: resultJson.current, careerhubProfile: resultJson.current.profile || {} }, () => {
                sendResponse({ ok: false, conflict: true, current: resultJson.current });
              });
              return;
            }
            // surface validation errors if present
            chrome.storage.local.set({ careerhubProfile: payload.profile }, () => {
              sendResponse({ ok: false, error: resultJson.error || null, errors: resultJson.errors || null });
            });
            return;
          }
          // success: persist returned state
          chrome.storage.local.set({ careerhubState: resultJson.state || {}, careerhubProfile: resultJson.state?.profile || payload.profile }, () => {
            sendResponse({ ok: true, state: resultJson.state || null });
          });
        })
        .catch((error) => {
          chrome.storage.local.set({ careerhubProfile: payload.profile }, () => {
            sendResponse({ ok: false, error: error.message });
          });
        });
    });
    return true;
  }
  if (message?.type === "careerhub:reportMapIssue") {
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
