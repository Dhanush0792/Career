# CareerHub Pending List

This list is derived from the master build prompt and the supporting PDFs:
`CareerHub_Idea_Document`, `CareerHub_Design_System`, `CareerHub_Profile_Schema`, `CareerHub_Autofill_Engine_Spec`, `CareerHub_Portal_Playbooks`, and `CareerHub_Website_Flow_Sync`.

## Already in place

- Local profile editor UI.
- Encrypted profile storage in the browser.
- Local tab-to-tab sync.
- Resume draft generation and a basic ATS score.
- Autofill payload builder.
- Tracker dashboard.
- Portal flow sync panel.
- Portal coverage registry.
- Browser-extension shell with popup, background worker, content script, and shared portal rules.

## Pending work, in priority order

1. Real sync backend

- Completed locally with a Node HTTP/SSE service at `work/careerhub-sync-server.js`.
- Still needs packaging, deployment, and browser-side load verification.

2. Real conflict handling

- Move last-write-wins from the browser-only prototype into the shared sync layer.
- Record version, timestamp, and origin on every write.
- Reject stale writes cleanly and show a clear conflict state.

3. Profile schema enforcement

- Validate the profile against the schema before save.
- Enforce required fields, date formats, and list constraints.
- Keep profile setup as the single writer for profile data.

4. Extension-to-site autofill flow

- Have the extension consume the live shared profile instead of only the prototype snapshot.
- Apply portal-specific field maps from the playbook.
- Support safe review for fields that cannot be confidently filled.

5. Dedicated portal maps

- Implement first-class maps for Naukri and LinkedIn Easy Apply.
- Add ATS-level maps for Workday, Greenhouse, Lever, iCIMS, and SmartRecruiters.
- Preserve the fallback heuristic engine for unknown sites.

6. Field-map maintenance workflow

- Store maps as versioned JSON.
- Add report-a-broken-field flow.
- Add map refresh behavior so updates reach users without a browser-store release.

7. Portal-specific quirks

- Handle multi-step wizard forms.
- Handle tag inputs, contenteditable fields, cascading dropdowns, searchable dropdowns, and strict validation forms.
- Always verify prefilled values before trusting them.

8. Resume and ATS upgrade

- Replace the simple keyword scorer with a more complete resume readiness model.
- Add richer section scoring and structural checks.
- Keep the resume builder as a real artifact, not a mock display.

9. Dashboard and flow sync hardening

- Connect tracker notes to the real sync layer.
- Record meaningful timeline events.
- Make the portal flow view reflect actual application state.

10. Browser-extension packaging

- Add a browser-load verification path.
- Confirm the manifest, popup, and content scripts load in a real browser.
- Fix any site-specific injection failures.

11. Operational delivery

- Add a reproducible local run path.
- Add verification scripts or checks.
- Capture the real loading and sync steps in the handoff notes.

## Remaining source-of-truth gaps

- The current prototype still treats sync as local-first.
- The extension shell is not yet verified in a real browser session.
- Portal maps are structured, but not yet exercised against live pages.
- The autofill engine still needs live site validation.

## Recommended next implementation sequence

1. Real sync backend.
2. Profile schema validation tied to that backend.
3. Extension reading and writing through the shared sync path.
4. Portal maps for the highest-priority sites.
5. Field-map maintenance workflow.
6. Browser verification.

## Done in this pass

- Shared sync backend started and responding on `http://localhost:8787`.
- Prototype now reads from and writes to the shared sync API.
- Extension background script now uses the same sync API.
- The backend now validates profile payloads before accepting writes.
- Shared state is stored under the project `database` folder.
- The public landing page now shows live backend state.
- A root project README now explains the folder layout and run order.
