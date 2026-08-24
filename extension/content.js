let autofillButtonActive = false;
let formAlreadyFilled = false;
let activeIcon = null;
let activeInput = null;

// List of allowed domains for Autofill
const ALLOWED_DOMAINS = [
  "greenhouse.io",
  "lever.co",
  "workday.com",
  "icims.com",
  "taleo.net",
  "smartrecruiters.com",
  "bamboohr.com",
  "linkedin.com",
  "naukri.com",
  "indeed.com",
  "localhost",
  "careerbridge"
];

// List of blacklisted/sensitive domains
const BLACKLISTED_DOMAINS = [
  "chatgpt.com",
  "openai.com",
  "github.com",
  "stripe.com",
  "paypal.com",
  "gmail.com",
  "google.com",
  "facebook.com",
  "instagram.com",
  "twitter.com",
  "x.com"
];

// Government portals and their compliance tiers
// Tier 1: Legally cleared
// Tier 2: Unreviewed (default warning gate)
// Tier 3: Restricted (disabled)
const GOVERNMENT_PORTALS_TIERS = {
  "upsc.gov.in": 2,
  "upsconline.nic.in": 2,
  "ssc.gov.in": 2,
  "ssc.nic.in": 2,
  "ibps.in": 2,
  "ibpsonline.ibps.in": 2,
  "restricted-gov-test.gov.in": 3
};

// Sensitive eligibility & reservation fields to skip on government portals
const SENSITIVE_GOV_KEYS = [
  "category", "reservation", "caste", "religion", "quota", 
  "pwd", "disability", "disabled", "handicap", "challenged",
  "relaxation", "age-relaxation", "ex-serviceman", "tribal",
  "scheduled", "creamy", "minority"
];

// Credentials and payment keywords safety gates
const CREDENTIALS_KEYS = ["password", "username", "passphrase", "login", "signin", "signup"];
const PAYMENT_KEYS = ["card", "cvv", "cvc", "expiry", "expiration", "billing", "checkout", "payment"];

function checkContext() {
  try {
    return !!chrome.runtime.getManifest();
  } catch (e) {
    return false;
  }
}

function getDomain() {
  const host = window.location.hostname.toLowerCase();
  return host.replace(/^www\./, "");
}

function getGovPortalTier() {
  const host = getDomain();
  
  // Check explicit registry
  for (const [domain, tier] of Object.entries(GOVERNMENT_PORTALS_TIERS)) {
    if (host === domain || host.endsWith("." + domain)) {
      return tier;
    }
  }

  // General wildcard check for any government or NIC portal in India
  if (host.endsWith(".gov.in") || host.endsWith(".nic.in") || host.endsWith(".ibps.in") || host === "ibps.in") {
    return 2; // Default starting tier
  }

  return null;
}

function isAllowedDomain() {
  const currentDomain = getDomain();
  
  // Check blacklist first
  if (BLACKLISTED_DOMAINS.some(domain => currentDomain.includes(domain))) {
    return false;
  }

  // Check if it's a government portal
  if (getGovPortalTier() !== null) {
    return true;
  }

  // Check whitelist/allowed list
  return ALLOWED_DOMAINS.some(domain => currentDomain.includes(domain));
}

function isRecognizedPortal() {
  const host = getDomain();
  const isWhitelisted = ALLOWED_DOMAINS.some(domain => host.includes(domain));
  if (isWhitelisted) return true;
  if (getGovPortalTier() !== null) return true;
  return false;
}

function isSensitiveGovField(input) {
  const key = (input.name || input.id || input.placeholder || "").toLowerCase();
  
  // Check associated label texts
  let labelText = "";
  if (input.id) {
    const labels = document.querySelectorAll(`label[for="${input.id}"]`);
    labels.forEach(lbl => labelText += " " + lbl.textContent.toLowerCase());
  }
  
  // Check container context text
  const parent = input.parentElement;
  if (parent) {
    labelText += " " + parent.textContent.toLowerCase();
  }

  const fullText = (key + " " + labelText).toLowerCase();

  return SENSITIVE_GOV_KEYS.some(sensitiveKey => fullText.includes(sensitiveKey));
}

// Load configurations
chrome.storage.local.get(["autofillEnabled"], function(result) {
  if (!checkContext()) return;
  autofillButtonActive = result.autofillEnabled !== false;
  if (autofillButtonActive && isAllowedDomain() && isRecognizedPortal()) {
    initInputListeners();
  }
});

// Listener for runtime messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (!checkContext()) return;
  if (request.action === "toggleFloatingButton") {
    autofillButtonActive = request.enabled;
    if (autofillButtonActive && isAllowedDomain() && isRecognizedPortal()) {
      initInputListeners();
    } else {
      removeInputListeners();
      removeActiveIcon();
    }
  } else if (request.action === "autofillForm") {
    const profile = request.profile;
    fillForm(profile);
  } else if (request.action === "checkPageMode") {
    const govTier = getGovPortalTier();
    const allowed = isAllowedDomain() && isRecognizedPortal();
    sendResponse({ isAllowed: allowed, govTier });
  } else if (request.action === "scanForm") {
    const summary = scanPageInputs();
    sendResponse(summary);
  }
  return true; // Keep message channel open for async response
});

// Input focus/blur management (only active on whitelisted portals)
function initInputListeners() {
  document.addEventListener("focusin", handleInputFocus);
  document.addEventListener("focusout", handleInputBlur);
}

function removeInputListeners() {
  document.removeEventListener("focusin", handleInputFocus);
  document.removeEventListener("focusout", handleInputBlur);
}

function handleInputFocus(e) {
  if (formAlreadyFilled) return;
  const target = e.target;
  
  // Target visible text/email/tel inputs and textareas
  if (
    target.tagName === "INPUT" && 
    ["text", "email", "tel", "url"].includes(target.type) && 
    !target.disabled && 
    !target.readOnly
  ) {
    activeInput = target;
    showInputIcon(target);
  } else if (target.tagName === "TEXTAREA" && !target.disabled && !target.readOnly) {
    activeInput = target;
    showInputIcon(target);
  }
}

let blurTimeout = null;
function handleInputBlur(e) {
  // Use a small timeout to let click events on the icon fire first
  blurTimeout = setTimeout(() => {
    removeActiveIcon();
  }, 200);
}

function showInputIcon(input) {
  removeActiveIcon();
  if (blurTimeout) clearTimeout(blurTimeout);

  const govTier = getGovPortalTier();
  const icon = document.createElement("div");
  icon.id = "jxa-input-icon";
  
  let iconBg = "#00f3ff";
  let iconBorder = "none";
  let cursor = "pointer";
  let titleText = "Autofill form with JobXApply";

  if (govTier === 3) {
    iconBg = "#475569";
    iconBorder = "1px solid #64748b";
    cursor = "not-allowed";
    titleText = "Autofill disabled (restricted)";
  } else if (govTier === 2) {
    iconBg = "#f59e0b"; // Warning amber
    titleText = "Autofill (unreviewed government portal)";
  }

  icon.title = titleText;
  icon.style.cssText = `
    position: absolute;
    z-index: 10000;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: ${iconBg};
    border: ${iconBorder};
    cursor: ${cursor};
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 6px rgba(0,0,0,0.3);
    transition: transform 0.2s ease;
  `;

  icon.innerHTML = `
    <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="#020617" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
  `;

  const updatePosition = () => {
    const rect = input.getBoundingClientRect();
    icon.style.top = `${rect.top + window.scrollY + (rect.height - 18) / 2}px`;
    icon.style.left = `${rect.left + window.scrollX + rect.width - 24}px`;
  };

  updatePosition();
  
  window.addEventListener("resize", updatePosition);
  window.addEventListener("scroll", updatePosition);

  if (govTier !== 3) {
    icon.addEventListener("mouseenter", () => {
      icon.style.transform = "scale(1.2)";
    });
    icon.addEventListener("mouseleave", () => {
      icon.style.transform = "scale(1.0)";
    });
  }

  icon.addEventListener("mousedown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (blurTimeout) clearTimeout(blurTimeout);

    if (govTier === 3) {
      alert("Autofill is disabled on this portal because its Terms of Use explicitly prohibit automated form entry.");
      return;
    }

    if (govTier === 2) {
      const message = "WARNING: This government portal's Terms of Use have not been fully reviewed yet.\n\nAutomated form entry may violate portal terms. Do you want to proceed manually at your own risk?";
      if (!confirm(message)) {
        return;
      }
    }

    chrome.runtime.sendMessage({ action: "requestAutofill" });
  });

  document.body.appendChild(icon);
  activeIcon = icon;
}

function removeActiveIcon() {
  if (activeIcon) {
    activeIcon.remove();
    activeIcon = null;
  }
}

function scanPageInputs() {
  const inputs = Array.from(document.querySelectorAll("input, textarea"));
  let detectedCount = 0;
  let fillableCount = 0;
  let reviewRequiredCount = 0;

  const mappings = [
    "name", "first_name", "last_name", "email", "phone", 
    "phone_number", "mobile", "headline", "summary", "github", "portfolio"
  ];

  inputs.forEach(input => {
    if (input.type === "hidden" || input.style.display === "none" || input.disabled || input.readOnly) return;
    
    const key = (input.name || input.id || input.placeholder || "").toLowerCase();
    
    // Check associated label texts
    let labelText = "";
    if (input.id) {
      const labels = document.querySelectorAll(`label[for="${input.id}"]`);
      labels.forEach(lbl => labelText += " " + lbl.textContent.toLowerCase());
    }
    const parent = input.parentElement;
    if (parent) {
      labelText += " " + parent.textContent.toLowerCase();
    }
    const fullText = (key + " " + labelText).toLowerCase();

    // 1. Exclude credential and payment fields
    const isCredential = CREDENTIALS_KEYS.some(k => fullText.includes(k)) || input.type === "password";
    const isPayment = PAYMENT_KEYS.some(k => fullText.includes(k));
    if (isCredential || isPayment) {
      return;
    }

    detectedCount++;

    // 2. Check if reservation/eligibility
    const isSensitive = SENSITIVE_GOV_KEYS.some(k => fullText.includes(k));
    if (isSensitive) {
      reviewRequiredCount++;
      return;
    }

    // 3. Match mappings
    const isMatch = mappings.some(mapVal => fullText.includes(mapVal));
    if (isMatch) {
      fillableCount++;
    } else {
      reviewRequiredCount++;
    }
  });

  return { detectedCount, fillableCount, reviewRequiredCount };
}

async function fillForm(profile) {
  const basics = profile.basics || {};
  const prof = profile.professional || {};
  
  const mappings = {
    "name": basics.name,
    "first_name": basics.firstName || basics.name?.split(" ")[0],
    "last_name": basics.lastName || basics.name?.split(" ").slice(1).join(" "),
    "email": basics.email,
    "phone": basics.phone,
    "phone_number": basics.phone,
    "mobile": basics.phone,
    "headline": prof.headline,
    "summary": prof.summary,
    "github": prof.github,
    "portfolio": prof.portfolio
  };

  const govTier = getGovPortalTier();
  const isGov = govTier !== null;

  // Find all inputs to fill
  const inputs = Array.from(document.querySelectorAll("input, textarea"));
  const fillTasks = [];

  inputs.forEach(input => {
    if (input.type === "hidden" || input.style.display === "none" || input.disabled || input.readOnly) return;
    
    const key = (input.name || input.id || input.placeholder || "").toLowerCase();
    
    // Check associated labels
    let labelText = "";
    if (input.id) {
      const labels = document.querySelectorAll(`label[for="${input.id}"]`);
      labels.forEach(lbl => labelText += " " + lbl.textContent.toLowerCase());
    }
    const parent = input.parentElement;
    if (parent) {
      labelText += " " + parent.textContent.toLowerCase();
    }
    const fullText = (key + " " + labelText).toLowerCase();

    // Safety checks: Skip login credentials and payments
    const isCredential = CREDENTIALS_KEYS.some(k => fullText.includes(k)) || input.type === "password";
    const isPayment = PAYMENT_KEYS.some(k => fullText.includes(k));
    if (isCredential || isPayment) {
      return;
    }

    // Safety checks: Skip sensitive categories
    const isSensitive = SENSITIVE_GOV_KEYS.some(k => fullText.includes(k));
    if (isSensitive) {
      if (isGov) {
        input.style.border = "2px dashed #f59e0b";
        input.title = "This sensitive field must be filled manually for compliance.";
      }
      return;
    }

    // Standard profile maps
    for (const [mapVal, value] of Object.entries(mappings)) {
      if (fullText.includes(mapVal) && value) {
        fillTasks.push({ input, value });
        break;
      }
    }
  });

  // Lock popup triggering
  formAlreadyFilled = true;
  removeActiveIcon();

  // Execute fill tasks sequentially (with 100ms delay per field on Gov/Universal pages)
  const isUniversal = !isRecognizedPortal();
  const isPaced = isGov || isUniversal;

  for (let i = 0; i < fillTasks.length; i++) {
    const { input, value } = fillTasks[i];
    
    if (isPaced) {
      input.focus();
      await new Promise(resolve => setTimeout(resolve, 100)); // staggered human-like delay
    }

    input.value = value;
    
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    
    if (isPaced) {
      input.blur();
    }
  }
}
