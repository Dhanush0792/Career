document.addEventListener("DOMContentLoaded", () => {
  const panelRecognized = document.getElementById("panel-recognized");
  const panelUniversal = document.getElementById("panel-universal");
  const panelBlocked = document.getElementById("panel-blocked");
  
  const autofillToggle = document.getElementById("autofill-toggle");
  const saveSettingsBtn = document.getElementById("save-settings");
  
  const btnStartScan = document.getElementById("btn-start-scan");
  const btnConfirmFill = document.getElementById("btn-confirm-fill");
  const btnCancelScan = document.getElementById("btn-cancel-scan");
  
  const universalSetup = document.getElementById("universal-setup");
  const universalResults = document.getElementById("universal-results");
  
  const scanSummaryCard = document.getElementById("scan-summary-card");
  const universalStatus = document.getElementById("universal-status");
  const portalBadge = document.getElementById("portal-badge");

  let activeTabId = null;
  let activeTabUrl = "";

  // Safety list containing payment processing, gateways, and checkout indicators
  const UNSAFE_DOMAINS = [
    "paypal", "stripe", "razorpay", "paytm", "hdfc", "sbi", 
    "icici", "checkout", "billing", "payment", "bank", "card"
  ];

  function showPanel(panel) {
    [panelRecognized, panelUniversal, panelBlocked].forEach(p => p.classList.remove("active"));
    panel.classList.add("active");
  }

  // Query tab information
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) return;
    const activeTab = tabs[0];
    activeTabId = activeTab.id;
    activeTabUrl = activeTab.url || "";
    
    let host = "";
    try {
      host = new URL(activeTabUrl).hostname.toLowerCase();
    } catch(e) {}

    // 1. Safety domain patterns check
    const isUnsafe = UNSAFE_DOMAINS.some(pattern => host.includes(pattern));
    if (isUnsafe || activeTabUrl.startsWith("chrome://") || activeTabUrl.startsWith("edge://")) {
      showPanel(panelBlocked);
      return;
    }

    // 2. Message tab to check page eligibility
    chrome.tabs.sendMessage(activeTabId, { action: "checkPageMode" }, (response) => {
      if (chrome.runtime.lastError || !response || !response.isAllowed) {
        showPanel(panelUniversal);
      } else {
        showPanel(panelRecognized);
        if (response.govTier) {
          portalBadge.textContent = `Gov Portal (Tier ${response.govTier})`;
          portalBadge.className = "badge badge-warning";
        } else {
          portalBadge.textContent = "Recognized Portal";
          portalBadge.className = "badge badge-info";
        }
        
        // Load autofill state
        chrome.storage.local.get(["autofillEnabled"], (result) => {
          autofillToggle.checked = result.autofillEnabled !== false;
        });
      }
    });
  });

  // Save Settings for Recognized Portal Mode
  saveSettingsBtn.addEventListener("click", () => {
    const isEnabled = autofillToggle.checked;
    chrome.storage.local.set({ autofillEnabled: isEnabled }, () => {
      chrome.tabs.sendMessage(activeTabId, {
        action: "toggleFloatingButton",
        enabled: isEnabled
      });
      window.close();
    });
  });

  // Universal Mode - Step 1: Scan fields
  btnStartScan.addEventListener("click", () => {
    universalStatus.textContent = "Scanning fields...";
    chrome.tabs.sendMessage(activeTabId, { action: "scanForm" }, (response) => {
      if (chrome.runtime.lastError || !response) {
        universalStatus.textContent = "Error scanning. Try reloading the tab.";
        return;
      }
      
      const { detectedCount, fillableCount, reviewRequiredCount } = response;
      scanSummaryCard.innerHTML = `
        <strong>Scan Report:</strong><br>
        • Fields detected: ${detectedCount}<br>
        • Profile matches: ${fillableCount}<br>
        • Manual check fields: ${reviewRequiredCount}<br><br>
        <em>Note: Credentials and payment fields are strictly ignored.</em>
      `;
      
      universalSetup.style.display = "none";
      universalResults.style.display = "block";
      universalStatus.textContent = "";
    });
  });

  // Universal Mode - Step 2: Fill fields
  btnConfirmFill.addEventListener("click", () => {
    universalStatus.textContent = "Triggering fill...";
    chrome.runtime.sendMessage({ action: "requestAutofillUniversal", tabId: activeTabId });
    setTimeout(() => {
      window.close();
    }, 500);
  });

  // Cancel Universal scan
  btnCancelScan.addEventListener("click", () => {
    universalSetup.style.display = "block";
    universalResults.style.display = "none";
    universalStatus.textContent = "";
  });
});
