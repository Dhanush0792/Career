/**
 * Pure Vanilla JavaScript ATS-Compliant PDF 1.4 Generator
 * Generates single-page vector PDFs natively without external dependencies, CDN, or eval().
 * Safe for Chrome Extension Manifest V3 (Service Workers, Sidepanels, Popups, Content Scripts).
 */

// Standard 14 Fonts (PDF Built-in, guaranteed supported by all PDF readers without font embedding)
// Helvetica, Helvetica-Bold, Helvetica-Oblique, Times-Roman, Courier, etc.
// Width metrics for Helvetica and Helvetica-Bold (in 1/1000 em units)
const HELVETICA_METRICS = {
  // Common ASCII printable range (32-126)
  32: 278, 33: 278, 34: 355, 35: 556, 36: 556, 37: 889, 38: 667, 39: 191,
  40: 333, 41: 333, 42: 389, 43: 584, 44: 278, 45: 333, 46: 278, 47: 278,
  48: 556, 49: 556, 50: 556, 51: 556, 52: 556, 53: 556, 54: 556, 55: 556,
  56: 556, 57: 556, 58: 278, 59: 278, 60: 584, 61: 584, 62: 584, 63: 556,
  64: 1015, 65: 667, 66: 667, 67: 722, 68: 722, 69: 667, 70: 611, 71: 778,
  72: 722, 73: 278, 74: 500, 75: 667, 76: 556, 77: 833, 78: 722, 79: 778,
  80: 667, 81: 778, 82: 722, 83: 667, 84: 611, 85: 722, 86: 667, 87: 944,
  88: 667, 89: 667, 90: 611, 91: 278, 92: 278, 93: 278, 94: 469, 95: 556,
  96: 333, 97: 556, 98: 556, 99: 500, 100: 556, 101: 556, 102: 278, 103: 556,
  104: 556, 105: 222, 106: 222, 107: 500, 108: 222, 109: 833, 110: 556,
  111: 556, 112: 556, 113: 556, 114: 333, 115: 500, 116: 278, 117: 556,
  118: 500, 119: 722, 120: 500, 121: 500, 122: 500, 123: 334, 124: 260,
  125: 334, 126: 584, default: 556
};

const HELVETICA_BOLD_METRICS = {
  32: 278, 33: 333, 34: 474, 35: 556, 36: 556, 37: 889, 38: 722, 39: 238,
  40: 389, 41: 389, 42: 389, 43: 584, 44: 278, 45: 333, 46: 278, 47: 278,
  48: 556, 49: 556, 50: 556, 51: 556, 52: 556, 53: 556, 54: 556, 55: 556,
  56: 556, 57: 556, 58: 333, 59: 333, 60: 584, 61: 584, 62: 584, 63: 611,
  64: 975, 65: 722, 66: 722, 67: 722, 68: 722, 69: 667, 70: 611, 71: 778,
  72: 722, 73: 278, 74: 556, 75: 722, 76: 611, 77: 833, 78: 722, 79: 778,
  80: 667, 81: 778, 82: 722, 83: 667, 84: 611, 85: 722, 86: 667, 87: 944,
  88: 667, 89: 667, 90: 611, 91: 333, 92: 278, 93: 333, 94: 584, 95: 556,
  96: 333, 97: 556, 98: 611, 99: 556, 100: 611, 101: 556, 102: 333, 103: 611,
  104: 611, 105: 278, 106: 278, 107: 556, 108: 278, 109: 889, 110: 611,
  111: 611, 112: 611, 113: 611, 114: 389, 115: 556, 116: 333, 117: 611,
  118: 556, 119: 778, 120: 556, 121: 556, 122: 500, 123: 389, 124: 280,
  125: 389, 126: 584, default: 575
};

/**
 * Escapes characters for PDF string literals: (, ), \
 * Normalizes unicode quotes, bullets, and dashes to standard ASCII equivalents.
 */
function escapePdfString(str) {
  if (!str) return "";
  return String(str)
    // Replace smart quotes and special typographical symbols with standard ASCII
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[\u2022\u2023\u25E6\u2043\u2219]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[^\x20-\x7E]/g, " ") // Clean any non-ascii glyphs to spaces for standard font safety
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

/**
 * Estimates text width in points given a font and size.
 */
function getTextWidth(text, fontSize, isBold = false) {
  const metrics = isBold ? HELVETICA_BOLD_METRICS : HELVETICA_METRICS;
  const clean = String(text || "");
  let emUnits = 0;
  for (let i = 0; i < clean.length; i++) {
    const code = clean.charCodeAt(i);
    emUnits += metrics[code] || metrics.default || 556;
  }
  return (emUnits / 1000) * fontSize;
}

/**
 * Word wraps text into lines fitting within maxWidth.
 */
function wrapText(text, fontSize, maxWidth, isBold = false) {
  if (!text) return [];
  const words = String(text).trim().split(/\s+/);
  if (words.length === 0 || (words.length === 1 && words[0] === "")) return [];

  const lines = [];
  let currentLine = words[0];

  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    const candidate = currentLine + " " + word;
    if (getTextWidth(candidate, fontSize, isBold) <= maxWidth) {
      currentLine = candidate;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }
  return lines;
}

/**
 * Parses freeform experience string or array of experience items into structured list
 */
function normalizeExperience(experienceInput) {
  if (!experienceInput) return [];
  if (Array.isArray(experienceInput)) {
    return experienceInput.map(item => {
      const title = item.title || item.role || item.position || "";
      const company = item.company || item.organization || "";
      const date = item.date || item.period || item.duration || item.year || "";
      const location = item.location || "";
      let bullets = [];
      if (Array.isArray(item.bullets)) {
        bullets = item.bullets;
      } else if (typeof item.description === "string") {
        bullets = item.description.split(/\n+/).map(s => s.replace(/^[-•*]\s*/, "").trim()).filter(Boolean);
      }
      return { title, company, date, location, bullets };
    });
  }

  if (typeof experienceInput === "string") {
    // Parse plaintext format like:
    // Senior Software Engineer @ TechMatrix Systems (2022 - Present)
    // - Led frontend...
    // - Reduced latency...
    const blocks = experienceInput.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
    const result = [];

    for (const block of blocks) {
      const lines = block.split("\n").map(l => l.trim()).filter(Boolean);
      if (lines.length === 0) continue;

      const headerLine = lines[0];
      let title = "";
      let company = "";
      let date = "";
      let location = "";

      // Check pattern: "Title @ Company (Date)" or "Title - Company | Date"
      const atMatch = headerLine.match(/^(.+?)\s+[@|–|-]\s+(.+?)(?:\s*\((.*?)\)|\s*\|\s*(.*))?$/);
      if (atMatch) {
        title = atMatch[1].trim();
        company = atMatch[2].trim();
        date = (atMatch[3] || atMatch[4] || "").trim();
      } else {
        title = headerLine;
      }

      const bullets = [];
      for (let j = 1; j < lines.length; j++) {
        const line = lines[j];
        const clean = line.replace(/^[-•*]\s*/, "").trim();
        if (clean) bullets.push(clean);
      }

      result.push({ title, company, date, location, bullets });
    }
    return result;
  }

  return [];
}

/**
 * Parses education input (string or array) into structured list
 */
function normalizeEducation(eduInput, profile) {
  const result = [];
  if (Array.isArray(eduInput)) {
    return eduInput;
  }

  // Check structured fields from profile if available
  if (profile) {
    if (profile.eduPG_college || profile.eduPG_degree || profile.eduMasters_college) {
      result.push({
        degree: profile.eduPG_degree || profile.eduMasters_degree || "Master of Science",
        stream: profile.eduPG_stream || profile.eduMasters_stream || "",
        institution: profile.eduPG_college || profile.eduMasters_college || "Graduate University",
        year: profile.eduPG_year || profile.eduMasters_year || "",
        gpa: profile.eduPG_cgpa || profile.eduMasters_cgpa || ""
      });
    }
    if (profile.eduGrad_college || profile.eduGrad_degree) {
      result.push({
        degree: profile.eduGrad_degree || "Bachelor of Science",
        stream: profile.eduGrad_stream || "",
        institution: profile.eduGrad_college || "University",
        year: profile.eduGrad_year || "",
        gpa: profile.eduGrad_cgpa || ""
      });
    }
  }

  if (result.length > 0) return result;

  if (typeof eduInput === "string" && eduInput.trim()) {
    const parts = eduInput.split(/;|\n/).map(p => p.trim()).filter(Boolean);
    for (const part of parts) {
      result.push({
        degree: part,
        institution: "",
        year: ""
      });
    }
  }

  if (result.length === 0) {
    result.push({
      degree: "Bachelor of Science in Computer Science",
      institution: profile?.college || "Accredited University",
      year: "2020"
    });
  }

  return result;
}

/**
 * Main PDF Builder: creates a PDF 1.4 Uint8Array conforming to ATS standard rules:
 * - Single-page US Letter (612 x 792 pt) or A4 (595 x 842 pt)
 * - Single-column linear layout
 * - Clean standard font hierarchy (Helvetica / Helvetica-Bold)
 * - ATS-parseable text stream (BT / ET operators with standard encoding)
 * - Standard section delimiters (SUMMARY, CORE SKILLS, EXPERIENCE, EDUCATION)
 */
export function buildResumePdf(profile = {}, options = {}) {
  // Page Dimensions: US Letter standard (8.5 x 11 inches in points: 612 x 792 pt)
  const pageWidth = options.pageWidth || 612;
  const pageHeight = options.pageHeight || 792;
  const marginLeft = options.marginLeft || 40;
  const marginRight = options.marginRight || 40;
  const marginTop = options.marginTop || 40;
  const marginBottom = options.marginBottom || 36;
  const contentWidth = pageWidth - marginLeft - marginRight;

  // Stream commands accumulator
  const streamLines = [];

  // Current drawing cursor (PDF coordinate system: 0,0 is bottom-left)
  let curY = pageHeight - marginTop;

  function addText(text, x, y, font, size, r = 0, g = 0, b = 0) {
    if (!text) return;
    const escaped = escapePdfString(text);
    streamLines.push(
      "BT",
      `/${font} ${size} Tf`,
      `${r} ${g} ${b} rg`,
      `1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm`,
      `(${escaped}) Tj`,
      "ET"
    );
  }

  function addLine(x1, y1, x2, y2, lineWidth = 0.5, r = 0.2, g = 0.2, b = 0.2) {
    streamLines.push(
      `${lineWidth} w`,
      `${r} ${g} ${b} RG`,
      `${x1.toFixed(2)} ${y1.toFixed(2)} m`,
      `${x2.toFixed(2)} ${y2.toFixed(2)} l`,
      "S"
    );
  }

  function addSectionHeader(title) {
    curY -= 14;
    addText(title.toUpperCase(), marginLeft, curY, "F2", 10.5, 0.1, 0.2, 0.35); // Accent dark slate/navy
    curY -= 3;
    addLine(marginLeft, curY, pageWidth - marginRight, curY, 0.75, 0.7, 0.75, 0.8);
    curY -= 8;
  }

  // 1. Header: Full Name
  const fullName = (profile.fullName || profile.name || "Candidate Name").trim();
  const title = (profile.targetRole || profile.headline || profile.targetRoles || "").trim();
  
  // Name
  addText(fullName.toUpperCase(), marginLeft, curY, "F2", 17, 0.08, 0.12, 0.2);
  curY -= 14;

  // Professional Title / Headline if present
  if (title) {
    const cleanTitle = title.split("|")[0].trim();
    addText(cleanTitle, marginLeft, curY, "F2", 10, 0.25, 0.35, 0.45);
    curY -= 12;
  }

  // Contact Info Line: Email | Phone | City, State | Links
  const contactParts = [];
  if (profile.email) contactParts.push(profile.email);
  if (profile.phone) contactParts.push(profile.phone);
  const location = [profile.city, profile.state || profile.country].filter(Boolean).join(", ");
  if (location) contactParts.push(location);
  if (profile.linkedin) contactParts.push(profile.linkedin.replace(/^https?:\/\/(www\.)?/, ""));
  if (profile.github) contactParts.push(profile.github.replace(/^https?:\/\/(www\.)?/, ""));
  if (profile.portfolio) contactParts.push(profile.portfolio.replace(/^https?:\/\/(www\.)?/, ""));

  const contactLine = contactParts.slice(0, 5).join("  |  ");
  if (contactLine) {
    addText(contactLine, marginLeft, curY, "F1", 8.5, 0.3, 0.3, 0.3);
    curY -= 6;
  }

  // 2. Professional Summary
  const summary = (profile.summary || profile.about || "").trim();
  if (summary) {
    addSectionHeader("Professional Summary");
    const summaryLines = wrapText(summary, 9, contentWidth, false);
    // Limit to max 4 lines to preserve single-page fit
    const linesToPrint = summaryLines.slice(0, 4);
    for (const sLine of linesToPrint) {
      addText(sLine, marginLeft, curY, "F1", 9, 0.15, 0.15, 0.15);
      curY -= 11.5;
    }
  }

  // 3. Technical & Core Skills
  let skills = profile.skills;
  if (Array.isArray(skills)) {
    skills = skills.join(", ");
  }
  if (skills && typeof skills === "string" && skills.trim()) {
    addSectionHeader("Core Skills & Competencies");
    const skillLines = wrapText(skills.trim(), 8.8, contentWidth, false);
    for (const sLine of skillLines.slice(0, 3)) {
      addText(sLine, marginLeft, curY, "F1", 8.8, 0.15, 0.15, 0.15);
      curY -= 11;
    }
  }

  // 4. Work Experience
  const experiences = normalizeExperience(profile.experience || profile.workExperience);
  if (experiences.length > 0) {
    addSectionHeader("Professional Experience");

    // Print up to 2-3 most relevant experiences
    const maxExperiences = Math.min(experiences.length, 3);
    for (let i = 0; i < maxExperiences; i++) {
      if (curY < marginBottom + 90) break; // Ensure room for education

      const exp = experiences[i];
      const jobHeaderLeft = [exp.title, exp.company].filter(Boolean).join(" - ");
      const jobHeaderRight = exp.date || "";

      // Title & Company
      addText(jobHeaderLeft, marginLeft, curY, "F2", 9.5, 0.1, 0.1, 0.1);

      // Date right-aligned if present
      if (jobHeaderRight) {
        const rightWidth = getTextWidth(jobHeaderRight, 9, false);
        addText(jobHeaderRight, pageWidth - marginRight - rightWidth, curY, "F1", 9, 0.35, 0.35, 0.35);
      }
      curY -= 11.5;

      // Bullet points
      const bullets = exp.bullets || [];
      const maxBullets = Math.min(bullets.length, 3);
      for (let b = 0; b < maxBullets; b++) {
        if (curY < marginBottom + 70) break;
        const bText = bullets[b];
        const wrappedBullets = wrapText(bText, 8.5, contentWidth - 14, false);
        for (let l = 0; l < wrappedBullets.length; l++) {
          if (l === 0) {
            // Bullet symbol (hyphen / dash for maximum standard font ATS compatibility)
            addText("-", marginLeft + 3, curY, "F2", 8.5, 0.25, 0.25, 0.25);
          }
          addText(wrappedBullets[l], marginLeft + 12, curY, "F1", 8.5, 0.2, 0.2, 0.2);
          curY -= 10.5;
        }
      }
      curY -= 4; // gap between roles
    }
  }

  // 5. Education
  const educations = normalizeEducation(profile.education, profile);
  if (educations.length > 0 && curY > marginBottom + 30) {
    addSectionHeader("Education");
    for (const edu of educations.slice(0, 2)) {
      if (curY < marginBottom + 15) break;
      const degText = [edu.degree, edu.stream].filter(Boolean).join(" - ");
      const instText = edu.institution || "";
      const dateText = [edu.year, edu.gpa].filter(Boolean).join(" | ");

      const fullEduLeft = [degText, instText].filter(Boolean).join(" | ");
      addText(fullEduLeft, marginLeft, curY, "F2", 9, 0.1, 0.1, 0.1);

      if (dateText) {
        const dWidth = getTextWidth(dateText, 8.5, false);
        addText(dateText, pageWidth - marginRight - dWidth, curY, "F1", 8.5, 0.35, 0.35, 0.35);
      }
      curY -= 11.5;
    }
  }

  // 6. Certifications or Additional Notes if remaining vertical space allows
  if (profile.otherDocuments && curY > marginBottom + 25) {
    addSectionHeader("Certifications & Key Qualifications");
    const certLines = wrapText(profile.otherDocuments, 8.5, contentWidth, false);
    for (const cLine of certLines.slice(0, 2)) {
      if (curY < marginBottom + 10) break;
      addText(cLine, marginLeft, curY, "F1", 8.5, 0.2, 0.2, 0.2);
      curY -= 10.5;
    }
  }

  // Assemble Complete PDF 1.4 Structure
  const contentStream = streamLines.join("\n") + "\n";
  const streamLength = contentStream.length;

  const objects = [];
  
  // Object 1: Catalog
  objects.push("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");

  // Object 2: Pages
  objects.push("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");

  // Object 3: Page (Letter / MediaBox)
  objects.push(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] ` +
    `/Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>\nendobj\n`
  );

  // Object 4: Content Stream
  objects.push(
    `4 0 obj\n<< /Length ${streamLength} >>\nstream\n${contentStream}endstream\nendobj\n`
  );

  // Object 5: Font F1 (Helvetica - Regular)
  objects.push(
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n"
  );

  // Object 6: Font F2 (Helvetica-Bold)
  objects.push(
    "6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n"
  );

  // Object 7: Info dictionary for metadata & ATS parser recognition
  const creationDate = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14) + "Z";
  const docTitle = escapePdfString(`${fullName} - Resume`);
  const docAuthor = escapePdfString(fullName);
  objects.push(
    `7 0 obj\n<< /Title (${docTitle}) /Author (${docAuthor}) /Creator (JobXApply Resume Builder) /CreationDate (D:${creationDate}) >>\nendobj\n`
  );

  // Calculate Byte Offsets for Cross-Reference Table (xref)
  const header = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n"; // Standard binary comment indicating 8-bit binary stream
  let currentOffset = header.length;
  const offsets = [0]; // object 0 offset is always 0

  for (let i = 0; i < objects.length; i++) {
    offsets.push(currentOffset);
    currentOffset += objects[i].length;
  }

  // Cross-reference table
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    const offStr = String(offsets[i]).padStart(10, "0");
    xref += `${offStr} 00000 n \n`;
  }

  // Trailer
  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 7 0 R >>\nstartxref\n${currentOffset}\n%%EOF\n`;

  const fullPdfString = header + objects.join("") + xref + trailer;

  // Convert string to Uint8Array binary buffer
  const buffer = new Uint8Array(fullPdfString.length);
  for (let i = 0; i < fullPdfString.length; i++) {
    buffer[i] = fullPdfString.charCodeAt(i) & 0xff;
  }

  return buffer;
}

/**
 * Creates a standard DOM File object from the generated Uint8Array buffer.
 * Compatible with HTML5 File API and input[type="file"].
 */
export function createResumeFile(profile = {}, filename = null) {
  const buffer = buildResumePdf(profile);
  const safeName = (profile.fullName || profile.name || "Resume")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/_+/g, "_");
  const finalFilename = filename || `${safeName}_Resume.pdf`;

  const blob = new Blob([buffer], { type: "application/pdf" });
  return new File([blob], finalFilename, {
    type: "application/pdf",
    lastModified: Date.now()
  });
}

/**
 * Helper to inject the generated PDF directly into an <input type="file"> element
 * using the HTML5 DataTransfer API and dispatches change/input events so reactive
 * frameworks (React, Vue, Angular) and portal validation scripts detect the upload.
 */
export function injectPdfToFileInput(fileInput, profile = {}, filename = null) {
  if (!fileInput || fileInput.type !== "file") {
    throw new Error("Target element is not an <input type='file'>");
  }

  const file = createResumeFile(profile, filename);
  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(file);
  fileInput.files = dataTransfer.files;

  // Dispatch standard events to trigger ATS portal upload handlers
  fileInput.dispatchEvent(new Event("change", { bubbles: true }));
  fileInput.dispatchEvent(new Event("input", { bubbles: true }));

  return file;
}

/**
 * Helper to download the generated PDF in browser / extension contexts
 */
export function downloadResumePdf(profile = {}, filename = null) {
  const file = createResumeFile(profile, filename);
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
