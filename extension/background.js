const API_BASE = "http://localhost:8787/api";

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "requestAutofill" || request.action === "requestAutofillUniversal") {
    const targetTabId = request.tabId || sender.tab?.id;
    if (!targetTabId) return;

    // 1. Fetch profile credentials
    chrome.storage.local.get(["email", "passcode"], async (result) => {
      const { email, passcode } = result;
      if (!email || !passcode) {
        chrome.tabs.sendMessage(targetTabId, {
          action: "showAuthRequired"
        });
        return;
      }

      // 2. Fetch profile from cloud
      try {
        const response = await fetch(`${API_BASE}/profile/fetch`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ email, passcode })
        });

        if (!response.ok) throw new Error("Fetch failed");
        
        const profile = await response.json();
        // 3. Send profile data to tab content script
        chrome.tabs.sendMessage(targetTabId, {
          action: "autofillForm",
          profile
        });
      } catch (e) {
        console.error(e);
        // Fallback to local cache if present
        chrome.storage.local.get(["cachedProfile"], (localRes) => {
          if (localRes.cachedProfile) {
            chrome.tabs.sendMessage(targetTabId, {
              action: "autofillForm",
              profile: localRes.cachedProfile
            });
          }
        });
      }
    });
  }
});
