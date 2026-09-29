# Hartwell Castle: a path-traced walkthrough

A real-time, progressive **path tracer** in plain WebGL2. It uses no Three.js and no external libraries. The scene is a stone castle whose interior is styled as an *old money farmhouse*. Rooms: great hall, library, kitchen, entrance hall and bedroom, set in formal gardens.

## Run it

Open `index.html` in a recent desktop browser (Chrome, Edge, Firefox or Safari 16+). It needs WebGL2 with `EXT_color_buffer_float`. It works straight from disk, or you can serve the folder:

```
npx http-server castle    # or: python3 -m http.server -d castle
```

The image refines progressively while the camera is still. While you move, paths are shortened so navigation stays fluid.

## Controls

| Input | Action |
|---|---|
| Click canvas | Capture mouse to look around |
| W A S D / arrows | Move |
| Shift | Run |
| F | Toggle walk (collision, gravity, steps) ↔ fly |
| E / Q (fly) | Up / down |
| 1–9 | Jump to viewpoints (exterior, great hall, library, kitchen, entrance, bedroom…) |
| H | Hide the UI |

The panel has time-of-day and weather presets and these sliders:

* **Sun & sky:** time of day, sun azimuth (castle orientation), season.
* **Weather:** cloud cover, cloud drift, rain/wetness (wet stone, slate, lead and gravel puddles), fog/haze, interior dust (sun shafts).
* **Interior lighting:** lamp warmth (Kelvin), lamp and candle intensity, fireplace intensity.
* **Camera & quality:** exposure compensation, field of view, GI bounce depth, render resolution, denoiser strength, bloom, and fire/cloud animation.

## How it works

* **Geometry** (`js/scene.js`): about 3,100 analytic primitives (oriented boxes, rounded boxes, cylinders, cones and ellipsoids), plus sphere lights and window "portals".
* **Acceleration** (`js/bvh.js`): three binned-SAH BVHs, one each for boxes, rounded boxes and quadrics, stored in float textures. Keeping the intersection code per tree lean roughly halves traversal cost on SIMD GPUs.
* **Light transport** (`js/shaders.js`, trace pass):
  * Unidirectional path tracing with a GGX/Smith microfacet + Lambert BRDF, VNDF sampling and Russian roulette.
  * Next-event estimation to the sun (a cone of the real angular size, with cloud shadows).
  * An importance-sampled, room-aware choice among ~40 local lights (lamps, candles, fire).
  * Skylight through the window openings, sampled with portals, which is what keeps daylight interiors low-noise.
  * Thin leaded glass with Fresnel reflection, lamp-shade transmission, volumetric flames and porous tree foliage.
  * Single-scattering dust shafts and aerial perspective.
* **Sky:** a physically based Rayleigh/Mie atmosphere baked to a LUT, blended with a CIE overcast model and a procedural cloud layer.
* **Materials:** all procedural and physically plausible. They include:
  * Coursed rubble stone with pillowed blocks, recessed lime joints, soot, damp and lichen; limewash; dressed ashlar.
  * Wide-plank and chevron oak; flagstones; aged beams.
  * Linen, wool tartan, worn and tufted leather, and Persian rugs.
  * Brass, iron, copper, gilt, slate, glazed ceramics, books and oil paintings.
* **Reconstruction:**
  * Albedo-demodulated, variance-guided à-trous denoiser with outlier rejection.
  * Auto-exposure from the log-average luminance.
  * Local tone mapping (so windows keep detail), cold-cast white balance, ACES filmic curve, bloom, vignette and grain.

## Screenshot tool

`tools/shoot.js` renders fixed viewpoints headlessly with Playwright:

```
node tools/shoot.js <outDir> <spp> <width> <height> "exterior;greathall@night;cam:x,y,z,tx,ty,tz"
```
