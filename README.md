# CareerBridge / CareerHub

Project structure:

- `frontend` - premium landing page and public-facing experience
- `backend` - sync server and profile validation
- `database` - schema and shared state file
- `extension` - browser extension shell for autofill
- `docs` - pending list and build notes

Current operational pieces:

- shared sync server
- profile schema validation
- live profile dashboard on the backend root page
- premium landing page with animation and live status card
- browser extension shell that reads from the shared backend

Run order:

1. Start the backend sync server from `backend/sync-server.js`.
2. Open `frontend/index.html` in a browser.
3. Load the extension from the `extension` folder if you want autofill testing.

Quick start (local development):

1. Start the sync server:

	- Change to the backend folder and run:

	  ```bash
	  cd backend
	  npm install
	  npm start
	  ```

	- The server listens on `http://localhost:8787` by default and serves a live state dashboard at `/`.

2. Open the landing page:

	- Open `frontend/index.html` in your browser (double-click or use a local static server).

3. Load the extension (optional):

	- In Chrome/Edge, go to `chrome://extensions`, enable Developer Mode, and "Load unpacked" pointing to the `extension` folder.

Notes:

- The backend persists state to `database/careerhub-sync-state.json` and validates against `database/profile-schema.json`.
- If `database/careerhub-sync-state.json` is missing the server will create a default init state; this repository now includes an initial state file.
- For any change to the schema or server, restart the backend.

Remaining work:

- conflict-state UI polish
- browser load verification for the extension
- portal-specific maps on real pages
- maintenance workflow for map updates

How to test the extension locally
---------------------------------

- Load in Chrome/Edge:

	1. Open `chrome://extensions`.
	2. Enable Developer Mode.
	3. Click `Load unpacked` and select the `extension` folder.

- Load in Firefox (temporary add-on):

	1. Open `about:debugging#/runtime/this-firefox`.
	2. Click `Load Temporary Add-on...` and select `extension/manifest.json`.
	3. Note: Firefox uses the `applications.gecko.id` field which is already set in the manifest.

- Use the profile editor to prepare data:

	1. Open the extension popup and click `Edit profile`.
	2. Fill required fields and click `Save & Sync` to persist locally and attempt backend sync (if the backend is running).

- Apply autofill on a page:

	1. Focus a form input on the target site.
	2. Click the floating `Autofill` button that appears next to the input, or use the popup `Apply autofill` button.
	3. The extension will prefer portal-specific selector maps (for LinkedIn and Naukri) and fallback to heuristics for unknown sites.

Where portal maps live
----------------------

- Portal maps are defined in `extension/shared.js` as the `PORTAL_MAPS` export. They are selector strings that the content script checks before falling back to heuristics.

Next recommended implementation steps
------------------------------------

1. Implement robust conflict handling and user-facing conflict resolution flows.
2. Move portal maps to a versioned JSON store and add a maintenance UI for reporting broken fields.
3. Expand and test dedicated portal maps for LinkedIn Easy Apply, Naukri, and the major ATS providers.
4. Add automated browser verification scripts and packaging for releases.

Portal maps and maintenance
--------------------------

- The server now exposes `/api/maps` which returns a versioned JSON file of portal selector maps used by the extension.
- The canonical maps file is `database/portal-maps.json`. To update maps, edit that file and increment the `version`.
- The extension background periodically fetches `/api/maps` and caches the maps locally, allowing us to update maps without publishing a new extension build.

Example: `database/portal-maps.json` contains a top-level `version` and a `maps` object keyed by portal name (e.g., `LinkedIn`, `Naukri`).

Developer maps editor
---------------------

- The server includes a small maps editor at `http://localhost:8787/maps-editor` that allows editing the versioned `portal-maps.json` and saving changes directly to the server (development only).




