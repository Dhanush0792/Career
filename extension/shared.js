export const DEFAULT_PROFILE_FIELDS = [
  "fullName",
  "firstName",
  "lastName",
  "age",
  "dob",
  "fatherName",
  "motherName",
  "email",
  "phone",
  "address",
  "city",
  "state",
  "country",
  "zip",
  "headline",
  "summary",
  "education",
  "college",
  "experience",
  "skills",
  "linkedin",
  "github",
  "portfolio",
  "resumeDraft",
  "targetRole",
  "phoneCode"
];

export const FIELD_ALIASES = {
  fullName: ["fullname", "full name", "name"],
  firstName: ["first", "firstname", "given name"],
  lastName: ["last", "lastname", "surname", "family name"],
  age: ["age"],
  dob: ["dob", "date of birth", "birthdate", "birthday"],
  fatherName: ["father's name", "father name", "guardian name", "father"],
  motherName: ["mother's name", "mother name", "mother"],
  email: ["email", "email address", "e-mail"],
  phone: ["phone", "phone number", "mobile", "mobile number", "telephone"],
  phoneCode: ["phone code", "country code", "country/region code", "dial code", "calling code", "phone prefix"],
  address: ["address", "street", "address1"],
  city: ["city", "town"],
  state: ["state", "province", "region"],
  country: ["country"],
  zip: ["zip", "postal", "postal code", "zipcode"],
  headline: ["headline", "title"],
  summary: ["summary", "about", "about me", "bio", "description"],
  education: ["education", "qualifications", "degree"],
  college: ["college", "university", "institution"],
  experience: ["experience", "work experience", "employment"],
  skills: ["skills", "skillset"],
  linkedin: ["linkedin", "linked in"],
  github: ["github", "git hub"],
  portfolio: ["portfolio", "website", "site"],
  resumeDraft: ["resume", "cv"],
  targetRole: ["role", "target role", "position", "designation"]
};

export const PORTAL_RULES = [
  {
    match: /naukri\.com/i,
    tier: "Tier 1 - Dedicated field-map",
    portal: "Naukri",
    notes: "Multi-step wizard, tag inputs, and bucketed salary fields."
  },
  {
    match: /linkedin\.com/i,
    tier: "Tier 1 - Dedicated field-map",
    portal: "LinkedIn",
    notes: "Easy Apply and profile forms need separate step handling."
  },
  {
    match: /wellfound\.com|angel\.co/i,
    tier: "Tier 1 - Dedicated field-map",
    portal: "Wellfound",
    notes: "Rich-text bio sections, selector overrides."
  },
  {
    match: /indeed\.com/i,
    tier: "Tier 1 - Dedicated field-map",
    portal: "Indeed",
    notes: "Form-level check overrides and redirection triggers."
  },
  {
    match: /myworkdayjobs\.com/i,
    tier: "Tier 2 - ATS-pattern map",
    portal: "Workday",
    notes: "Persistent wizard with strict validation and combobox widgets."
  },
  {
    match: /boards\.greenhouse\.io|job-boards\.greenhouse\.io/i,
    tier: "Tier 2 - ATS-pattern map",
    portal: "Greenhouse",
    notes: "Clean semantic HTML, strong core field mapping."
  },
  {
    match: /jobs\.lever\.co/i,
    tier: "Tier 2 - ATS-pattern map",
    portal: "Lever",
    notes: "Single-page form with some auto-parsed fields that must be verified."
  },
  {
    match: /icims\.com/i,
    tier: "Tier 2 - ATS-pattern map",
    portal: "iCIMS",
    notes: "Strict formatting and rigid multi-page validation."
  },
  {
    match: /smartrecruiters\.com/i,
    tier: "Tier 2 - ATS-pattern map",
    portal: "SmartRecruiters",
    notes: "Modern single-page form with conversational screening questions."
  }
];

export function getPortalRule(url) {
  const target = String(url || "");
  return PORTAL_RULES.find((rule) => rule.match.test(target)) || {
    tier: "Tier 3 - Default heuristic engine",
    portal: "Unknown",
    notes: "Fallback confidence-scoring engine with manual review flags."
  };
}

export const PORTAL_MAPS = {
  LinkedIn: {
    fullName: "input[aria-label*='Full name'], input[placeholder*='Full name'], input[name*='fullName']",
    firstName: "input[aria-label*='First name'], input[placeholder*='First name'], input[name*='firstName']",
    lastName: "input[aria-label*='Last name'], input[placeholder*='Last name'], input[name*='lastName']",
    email: "input[aria-label*='Email'], input[placeholder*='Email'], input[type='email']",
    phone: "input[aria-label*='Phone'], input[placeholder*='Phone'], input[name*='phone']",
    linkedin: "input[aria-label*='LinkedIn'], input[placeholder*='LinkedIn']",
    resume: "input[type='file'], input[accept*='pdf'], input[accept*='doc']"
  },
  Naukri: {
    fullName: "input[placeholder*='Name'], input[name*='name'], input[aria-label*='Name']",
    email: "input[placeholder*='Email'], input[name*='email'], input[type='email']",
    phone: "input[placeholder*='Mobile'], input[name*='mobile'], input[name*='phone']",
    resume: "input[type='file'][name*='resume'], input[type='file']",
    college: "input[placeholder*='College'], input[name*='college']"
  },
  Wellfound: {
    fullName: "input[name*='name'], input[placeholder*='name'], input[aria-label*='name']",
    email: "input[name*='email'], input[type='email']",
    phone: "input[name*='phone'], input[name*='mobile']",
    resume: "input[type='file']",
    linkedin: "input[name*='linkedin'], input[placeholder*='linkedin']",
    portfolio: "input[name*='portfolio'], input[placeholder*='portfolio']"
  },
  Indeed: {
    fullName: "input[id*='name'], input[name*='name'], input[placeholder*='name']",
    email: "input[type='email'], input[id*='email'], input[name*='email']",
    phone: "input[type='tel'], input[id*='phone'], input[name*='phone']",
    resume: "input[type='file']",
    city: "input[id*='city'], input[name*='city']",
    country: "input[id*='country'], input[name*='country']"
  },
  Greenhouse: {
    fullName: "#first_name, #last_name, #name, input[name*='name'], input[name*='first_name']",
    email: "#email, input[name*='email']",
    phone: "#phone, input[name*='phone']",
    resume: "#resume_file, input[type='file']",
    linkedin: "input[placeholder*='LinkedIn'], input[name*='linkedin']"
  },
  Lever: {
    fullName: "input[name*='name']",
    email: "input[name*='email']",
    phone: "input[name*='phone']",
    resume: "input[type='file']",
    linkedin: "input[name*='linkedin'], input[placeholder*='linkedin']"
  }
};

export function getPhoneCode(profile) {
  const phone = String(profile.phone || "");
  if (phone.startsWith("+")) {
    const match = phone.match(/^\+(\d+)/);
    if (match) return match[1]; // e.g. "91"
  }
  const country = String(profile.country || "").toLowerCase();
  const address = String(profile.address || "").toLowerCase();
  if (country.includes("india") || address.includes("india")) return "91";
  if (country.includes("united states") || country.includes("usa") || country.includes("us")) return "1";
  if (country.includes("united kingdom") || country.includes("uk")) return "44";
  return "";
}

export function buildAutofillPayload(profile, requestedFields) {
  const fields = requestedFields.length ? requestedFields : DEFAULT_PROFILE_FIELDS;
  const payload = {};
  const profileLower = {};
  for (const [k, v] of Object.entries(profile || {})) {
    profileLower[k.toLowerCase()] = v;
  }
  for (const field of fields) {
    const key = field.toLowerCase();
    if (key === "resume") {
      payload[field] = profileLower["resumedraft"] || profileLower["resume"] || "";
    } else if (key === "phonecode") {
      payload[field] = getPhoneCode(profile);
    } else if (profileLower[key] !== undefined) {
      payload[field] = profileLower[key];
    } else {
      payload[field] = "";
    }
  }
  return {
    createdAt: new Date().toISOString(),
    source: "jobxapply-profile",
    fields,
    payload
  };
}

export function summarizeProfile(profile = {}) {
  const lines = [];
  for (const key of DEFAULT_PROFILE_FIELDS) {
    lines.push(`${key}: ${profile[key] || ""}`);
  }
  return lines.join("\n");
}

export function uint8ToBase64(uint8) {
  let bin = "";
  const len = uint8.byteLength;
  for (let i = 0; i < len; i++) {
    bin += String.fromCharCode(uint8[i]);
  }
  return btoa(bin);
}

export function base64ToUint8(base64) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export async function generatePasscodeHash(passcode) {
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

export async function encryptProfileData(profile, passcode) {
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

export async function decryptProfileData(encryptedProfile, passcode) {
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

export function cloneProfile(profile = {}, newName) {
  const cloned = { ...profile };
  cloned.id = newName.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!cloned.id) {
    cloned.id = "profile-" + Date.now().toString(36);
  }
  cloned.profileName = newName;
  return cloned;
}

