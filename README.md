# Kanye West — The Disc Archive

A self-contained, static website using all seventeen original GLB compact-disc models supplied for this project. The models remain in their original release order. No AI-generated imagery is used.

## Preview locally

Serve the `dist` folder with any static web server. For example, with Python installed:

```text
cd dist
python -m http.server 5173
```

Open http://localhost:5173 in a modern browser. The site uses JavaScript modules and therefore should be served over HTTP rather than opened as a file.

## Interactions

- Scroll, swipe, or use the arrow keys to move through the albums. Home and End jump to the first and last records.
- Select a side disc to centre it. Select the centred disc to open its album page.
- Hover a disc to tilt that disc alone. Hover the central disc to draw the animated orbit. Pointer movements over blank space leave all discs still.
- Turn the disc on an album page to see the original model’s reverse.
- Move over the large artwork panel to bend its surface.
- Keep scrolling past the end of an album to continue into the next release. The next-record button and Page Down also support this transition.
- Escape returns to the collection. Browser Back and Forward work with album and About routes.

Reduced-motion preferences, keyboard focus, touch navigation, and a WebGL fallback are supported.

The scene renders on demand and stops GPU drawing while idle. Lightweight, single-pass disc materials retain the supplied model geometry and label textures, with darker studio lighting and soft shading across each face. Mobile render resolution is capped to limit GPU work.

Carousel movement uses a damped spring with a bounded speed. Models are prefetched beyond the current viewport, glide and fade in when they arrive, and leave gradually at the screen edges. Opening an album also gives the neighboring discs a brief exit animation. The viewport determines visibility, so wider windows do not cut off visible discs.

The browser keeps a bounded collection of nearby discs and releases distant discs and old artwork. Identical surface images and geometry are shared across albums. The optimized glTF assets preserve the original geometry bytes and encoded image bytes, at their original resolution; lighting, layout, and animation settings are unchanged. The original GLB files remain included.

## Editing

- `dist/albums.js`: supplied titles, dates, descriptions, selected songs, streaming figures, and sales estimates.
- `dist/app.js`: carousel, shared 3D scene, route views, smooth scrolling, shader effects, and About content.
- `dist/style.css`: layout, type, and responsive styles.
- `dist/assets/models/`: the seventeen original, unmodified GLB files.
- `dist/assets/models-shared/`, `textures-shared/`, and `geometry-shared/`: losslessly extracted runtime assets that avoid duplicate decoded images and geometry.
- `dist/assets/covers/`: artwork extracted from the embedded textures of the supplied models.
- `dist/resource-cache.js`: shared texture/geometry ownership and resource cleanup.
- `scripts/share-model-assets.py`: regenerates the shared runtime assets from the supplied GLB files without resizing or recompressing their images.

The About page contains archive information and two high-resolution web photographs by David Shankbone and Bill Ebbesen. Responsive WebP images, lazy loading, and on-page attribution preserve image quality while keeping memory and transfer costs low. Full photo sources and licences are recorded in `dist/assets/about/CREDITS.md`.

## Data notes

The album information and commercial figures were supplied by the client. Spotify figures are stated as of November 5, 2026. Sales are supplied estimates of worldwide pure album purchases, excluding streaming-equivalent units. Unavailable totals remain unverified. Figures from different album editions should not be added together.

## Credits and licences

- Design reference: https://a24.raviklaassens.com/ by Ravi Klaassens. This project is a separately implemented Kanye West adaptation.
- Three.js r170: MIT. Licence included in `dist/assets/vendor/LICENSE-three.txt`.
- Cormorant Garamond: SIL Open Font License. Licence included in `dist/assets/fonts/OFL.txt`.
- Album artwork and disc models: supplied for this project. The concept labels are not replicas of officially manufactured physical CD labels.
- About photographs: David Shankbone and Bill Ebbesen, CC BY 3.0. Source links, original resolutions, and processing notes are included in `dist/assets/about/CREDITS.md`.

This is an independent, unofficial archive, unaffiliated with Kanye West or his record labels.
