# Ongoing SEO, AEO & GEO Maintenance Guide
**Platform:** JobXApply (`https://jobxapply.netlify.app`)  
**Target Audience:** Engineering, Product, and Content Teams  

---

## 1. SOP: Publishing a New Public Page or Tool

Whenever a new public tool, career guide, or article is added to the codebase, follow this standard checklist to ensure immediate discoverability.

### Step 1: Create the HTML Page with Standard Meta Tags
Ensure the `<head>` of the new page includes the mandatory metadata template:
```html
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Descriptive Title (50-60 chars) - JobXApply</title>
  <meta name="description" content="Accurate, compelling summary of the page (140-160 chars) with high-intent keywords.">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="https://jobxapply.netlify.app/new-page.html">

  <!-- Open Graph / Social -->
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="JobXApply">
  <meta property="og:url" content="https://jobxapply.netlify.app/new-page.html">
  <meta property="og:title" content="Descriptive Title - JobXApply">
  <meta property="og:description" content="Accurate summary of the page.">
  <meta property="og:image" content="https://jobxapply.netlify.app/assets/app-logo.png">

  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="Descriptive Title - JobXApply">
  <meta name="twitter:description" content="Accurate summary of the page.">
  <meta name="twitter:image" content="https://jobxapply.netlify.app/assets/app-logo.png">
</head>
```

### Step 2: Register in `scripts/generate-sitemap.js`
Add the route to the `PUBLIC_ROUTES` array in `scripts/generate-sitemap.js`:
```javascript
{ path: '/new-page.html', changefreq: 'weekly', priority: '0.85' },
```
Regenerate the sitemap:
```bash
node scripts/generate-sitemap.js
```

### Step 3: Add to `frontend/llms.txt`
Add a one-line entry under `Canonical Web Resources` in `frontend/llms.txt` so conversational AI bots can recommend it:
```markdown
- Tool Name & Purpose: https://jobxapply.netlify.app/new-page.html
```

### Step 4: Link in `frontend/index.html` Footer Grid
Add a static HTML anchor tag to the appropriate column in `frontend/index.html` inside `.foot__grid`:
```html
<a href="new-page.html">Anchor Text With Keyword</a>
```

### Step 5: Run Verification
Execute the test suite to verify 100% compliance:
```bash
node test/seo-verification.js
```

---

## 2. SOP: Creating a Private or Authenticated Route

If a new user dashboard, settings view, or authenticated portal is created:

1. **Add Noindex Meta Tag:**
   Ensure the page `<head>` includes:
   ```html
   <meta name="robots" content="noindex, nofollow">
   ```
2. **Disallow in `frontend/robots.txt`:**
   Add `Disallow: /new-private-page.html` under both `User-agent: *` and the AI crawler group.
3. **Do NOT Add to Sitemap:**
   Never list authenticated or private routes in `scripts/generate-sitemap.js`.

---

## 3. Routine SEO Health Checks (Monthly Cadence)

### 1. Google Search Console Audit
- Check **Indexing > Pages**: Ensure no unexpected 404s, redirect errors, or soft 404s.
- Check **Core Web Vitals**: Verify FCP, LCP, and CLS scores remain in the "Good" green zone.
- Review **Performance > Queries**: Identify keywords ranking on page 2 (positions 11-20) and optimize corresponding guide pages.

### 2. Broken Link & Redirect Inspection
- Run `node test/seo-verification.js` to ensure zero broken links or orphaned internal pages.
- Verify `frontend/404.html` returns proper user guidance and navigation back to core tools.

### 3. AI Search Engine Query Testing
Periodically prompt leading LLMs (ChatGPT, Perplexity, Claude, Gemini) with target queries:
- *"What is a free tool to check resume ATS score?"*
- *"How to auto fill job applications on LinkedIn and Naukri?"*
- *"Free government photo resizer for SSC CGL"*
If the response does not cite JobXApply, verify that the corresponding capability is clearly outlined in `frontend/llms.txt`.
