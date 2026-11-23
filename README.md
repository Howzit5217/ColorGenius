# ColorGenius

A paint color finder for the paint counter. Answer a few quick questions about the space, the light and the style, and ColorGenius suggests a handful of colors from the major paint brands. Each color comes with warnings about how it will behave in that room and the closest match in every other brand.

It runs in any browser and installs on Android and iPhone as an app with its own home-screen icon. Once loaded, it works offline.

**Live site:** https://howzit5217.github.io/ColorGenius/ (open it on a phone and tap **Get the app**)

## What it does

- **Five quick questions**
  1. What's being painted: a room, a surface or an exterior.
  2. Which way the windows face, using a compass picker, plus how much daylight and what bulbs.
  3. Style, with up to two picks shown as real color previews.
  4. Color families and how light or dark.
  5. What's staying. Only the rows that fit the job appear, mostly one tap each:
     - **Bedrooms:** floor, trim and bedding.
     - **Kitchens:** cabinets, countertops, floor and hardware.
     - **Bathrooms:** vanity, countertop, floor and faucets.
     - **Ceilings and trim:** the walls staying.
     - **Front doors:** the siding and trim colors the door has to stand out from.
     - **Other exteriors:** roof, brick or stone, trim and windows.

     Floors take two taps: the type first (wood or LVP, carpet with five colors, tile or stone, concrete), then its color. Rooms also ask about trim, baseboards and crown molding (bright white, cream, stained wood or black, plus "Painting the trim too" and "Has crown molding"). Anything else can be added with a name and the in-house color picker.

     Each paint color is checked against all of this. The checks catch undertone clashes (carpet and walls count as large surfaces), too much yellow with orange oak, pink next to cherry or brick, creamy or stark whites next to existing trim, doors that won't stand out from the siding, low contrast and complementary pairings. The preview shows the chosen floor, counters, cabinets, sofa and roof.

  Ceilings and trim replace question 4 with one quick choice:
  - **Ceilings:** crisp white, soft warm white, a light tint of the walls, or something bold.
  - **Trim:** crisp white, soft warm white, match the walls, or black.
- **Recommendations** from about 31,000 colors. Results are spread out so you don't get six versions of the same beige. Each comes with reasons it fits and its LRV (light reflectance value).
- **Warnings** written in plain language. They cover:
  - Colors that will read too dark or too light in that light.
  - North light turning cool grays icy.
  - Sun turning creams yellow.
  - Undertones that lean green, pink or purple.
  - Clashes with wood, tile or brick.
  - Bulb effects.
  - Bold colors intensifying on full walls.
  - Ceilings that will feel lower.
  - Dark colors on vinyl siding.
  - Fading outdoors.
  - Coverage and primer needs.
- **Paint to use**: suggests the right product line for the job. For example, Benjamin Moore Aura Bath & Spa for a bathroom, Advance for cabinets or Scuff-X for a kids' room. Each suggestion comes with Good / Better / Best options. Lines are listed for Benjamin Moore, Sherwin-Williams, Behr, Valspar, HGTV Home, Dutch Boy, PPG, Glidden and Dunn-Edwards. Every line can be switched off in settings to match what the store carries. With a store brand set, colors from any brand are matched into the store's own paint.
- **Color details**:
  - A preview that matches the job:
    - A room with a sofa, bed, bathroom vanity or desk.
    - A kitchen, for kitchen walls or cabinets.
    - The front of a house, for siding, exterior trim or a front door.
  - Advantages and disadvantages for each color, a side-by-side compare, and a sheen comparison (Flat to Gloss) shown on the color itself.
  - A light switcher: daylight, north light, afternoon sun, golden hour, warm, soft white and daylight bulbs, and a dim corner.
  - Undertone, depth and the recommended finish.
  - Pairings for trim, lighter and deeper versions, and an accent.
  - The closest color in every other brand, with a measured color difference (ΔE 2000).
- **Look up & match**: find any color by name, code or color value (for example `SW 7029`, `OC-17`, `behr swiss coffee`, `#D1CBC1`).
- **Saved colors**: star colors to compare them, show them full screen, or copy the list.
- **Settings**:
  - Turn each brand on or off, and set a store brand (with "store brand only" if wanted).
  - In-store samples: shows chip strip locations for Sherwin-Williams, Valspar and HGTV Home, and Behr's rack colors.
  - Include discontinued colors, and choose how many colors each search shows.
  - Turn individual questions on or off, plus warnings, LRV, matches and the light preview.
  - Import your own colors from a CSV file.
  - Theme and reduced motion.
- **Screen accuracy**:
  - Detects whether the screen is standard (sRGB) or wide color (Display P3), and whether it supports HDR.
  - A one-minute calibration matches the screen to white paper and a real paint chip, then adjusts every swatch.
  - Browsers can't read a monitor's brightness, color profile or night-light setting, which is why calibration exists.

## Colors included

| Brand | Colors | LRV | Source |
| --- | ---: | --- | --- |
| Sherwin-Williams | 1,948 (1,728 current) | Brand | Sherwin-Williams color service |
| Benjamin Moore | 4,022 | Brand | benjaminmoore.com collections |
| Behr | 5,698 | Calculated | behr.com color data |
| Valspar | 1,596 | Brand | Sherwin-Williams color service |
| PPG / Pittsburgh Paints | 3,255 | Brand | pittsburghpaints.com |
| Glidden | 3,185 | Brand (via PPG codes) | glidden.com |
| HGTV Home by Sherwin-Williams | 900 | Brand | Sherwin-Williams color service |
| Dutch Boy | 1,340 | Brand | Sherwin-Williams color service |
| Dunn-Edwards | 2,275 | Brand | dunnedwards.com |
| Diamond Vogel | 1,324 | Calculated | diamondvogel.com |
| KILZ | 827 | Calculated | Older public list |
| Vista Paint | 2,785 | Calculated | Older public list |
| Resene | 2,041 | Calculated | Resene official swatch file |
| Farrow & Ball | 132 | Calculated | Older public list |

All colors were collected on 2026-11-23. "Calculated" LRV comes from the color value and is usually within a couple of points of the printed number; the app marks it with an asterisk. Screen colors are each brand's own digital values. Always confirm with a physical chip.

## Run it

Open `index.html` in a browser, or start the small local server:

```
npm start
```

Then open http://localhost:5173. Other devices on the same network can use the computer's address and port 5173.

## Install it on a phone

The site must be online at an `https://` address. GitHub Pages works and is free. Open that address on the phone, then tap **Get the app** (the download icon in the top bar, or Settings → Phone app):

- **Android**: the install prompt opens. Tap **Install**.
- **iPhone / iPad**: follow the steps shown. Tap Share, then **Add to Home Screen**, then Add.

The installed app opens full screen without browser bars and works offline. On iPhone it keeps its own settings and saved colors, separate from Safari.

**Updates are automatic.** Every time the app opens online, it loads the newest version of the app and the color data. If the app was left open in the background, it refreshes itself when it comes back, as long as nothing is in progress. Push changes to `main` and GitHub Pages publishes them within a minute or two.

## Tests

```
npm test
```

The tests check the color math against published reference values. They also check that every brand file is complete and valid, and that search, recommendations, warnings, cross-brand matches, the CSV import and the offline file list all work.

## Updating the colors

`tools/fetch/` has the scripts used to download each brand's public color list. `tools/build-data.mjs` turns those downloads into the files in `data/`:

```
node tools/build-data.mjs <folder-with-downloads>
```

Brands change their websites, so a script may need adjusting before the next refresh. If you change any app files, bump `VERSION` in `sw.js` so installed apps pick up the update.

## Notes

Paint color names, numbers and swatch values belong to their brands. This tool is for helping pick colors at the counter. It is not affiliated with any paint company.
