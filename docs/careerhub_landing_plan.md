# CareerHub Landing Page Plan

Goal: rebuild the homepage into a premium, cinematic, motion-heavy experience that feels like a real product launch page instead of a generic AI-generated site.

## Visual direction

- Dark void base with layered glow fields.
- Glass cards with soft borders, blur, and reflected highlights.
- Indigo, teal, magenta, and amber accents.
- Large Syne-style headline treatment, with clean Inter body text.
- Custom cursor, scroll progress bar, and noise texture.

## Motion direction

- Pinned scrollytelling hero.
- Three.js particle morph sequence:
  - scattered dots
  - student silhouette
  - profile / document shape
  - ring / platform form
- Zoom and parallax on scroll.
- Floating and tilt interactions on cards.
- Flip cards for features and pages.
- Live journey animation showing a student with a bag turning into an employee with a briefcase.

## Section order

1. Hero story
2. Platform capabilities
3. Journey / how it works
4. Product pages overview
5. Feature toolkit
6. Extension demo
7. Security / trust
8. Pricing / access model
9. Final CTA

## Content requirements

- Make CareerHub feel like one system with several connected pages.
- Include profile, resume, autofill, tracker, portal coverage, and extension flows.
- Show how the student journey evolves into employment.
- Avoid flat brochure sections and repeated generic cards.

## Implementation notes

- Build locally in `D:\\Projects\\CareerBridge\\frontend\\index.html`.
- Keep the page self-contained, but allow a Three.js CDN if needed for the hero scene.
- Preserve the live backend status card only if it fits the new composition.
- Use scroll reveals, tilt, and hover effects sparingly but purposefully.

