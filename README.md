# ColorGenius

A paint and stain color finder for the paint counter. Answer a few quick questions about the space, the light and the style, and ColorGenius suggests a handful of colors from the major paint brands. Each color comes with warnings about how it will behave in that room and the closest match in every other brand. For staining, it shows each stain on the actual wood, bare and stained.

It runs in any browser and installs on Android and iPhone as an app with its own home-screen icon. Once loaded, it works offline.

**Live site:** https://howzit5217.github.io/ColorGenius/ (open it on a phone and tap **Get the app**)

## What it does

- **First-launch setup** runs once on each device. It takes about a minute and can be rerun from Settings → Run setup again.
  1. **Who's using it:** paint store staff, a homeowner, or a touch-screen kiosk in the store. This sets the wording and defaults; for example, in-store chip locations are on for staff and kiosks and off for homeowners.
  2. **Brands:** the brands the store carries, or the brands a homeowner would buy, plus an optional main or favorite brand. A search box and All/None buttons for each group make long lists quick.
  3. **What the store carries:** for each chosen brand, the color collections and paint lines on hand (see below). Skipped when no chosen brand has any.
  4. **Screen tuning:** match the screen to white printer paper.
  5. **Done:** a summary, with an option to install the app.

- **Kiosk mode** (Settings → Who's using it → Kiosk):
  - Bigger buttons and text for touch screens.
  - No install prompt, and long-press menus are off.
  - Settings are hidden; hold the ColorGenius logo for 3 seconds to open them.
  - After 2 minutes with no touches it asks "Still there?" and then starts over, clearing saved colors for the next person.

- **Color collections**: brands that split their colors into collections can have each one switched off, in setup or in Settings → Brands & collections. Picks, matches and pairings skip collections that are off.
  - **Benjamin Moore:** Classic Color Collection, Color Preview, Historical Colors (HC), Off-White Collection (OC), Affinity (AF), Color Stories (CSP), Designer Classics (CC), Williamsburg (CW) and exterior stain colors (ES).
  - **Magnolia Home:** main palette, Castle Collection, Lake House Collection.
  - **Clark+Kensington:** fan deck, whites & neutrals card, exterior card, kids' rooms card.
  - **PPG and Glidden:** PPG color system codes and older codes; PPG also has SidingSafe vinyl colors.
  - **Diamond Vogel:** Color Essentials and Interior Whites.

- **Painting or staining?** is the first question. One tap picks the job.

- **Staining** takes three quick questions and shows every pick on real-looking wood, bare and stained:
  1. **What's being stained:**
     - Inside: floors, stairs, cabinets, furniture, tabletops or butcher block, trim and doors.
     - Outside: decks, fences, siding and shakes, outdoor furniture, pergolas, front doors.
  2. **What wood:** each wood is drawn with its own grain, knots, pores and color. There are 15 woods:
     - Red oak, white oak, pine, maple, birch, cherry, walnut, hickory, ash, poplar.
     - Douglas fir, cedar, redwood, pressure-treated pine, mahogany.

     Also "Bare or sanded", "Has a finish on it" or "New pressure-treated".
  3. **What look:** natural, light & airy, golden honey, warm brown, rich brown, dark espresso, reddish, gray & weathered, whitewash or a color. Each look shows a real stain on the chosen wood. Also pick "show the grain" or "hide the grain".

  Each stain is judged by how it will look on that wood. A stain's swatch is how it looks on red oak. Maple, which resists stain, comes out lighter; walnut barely changes; open pores and knots soak up more. Results show each stain on a board, bare on one side and stained on the other.

  The detail shows:
  - A scene for the job: a living room floor, a kitchen of stained cabinets with real frame-and-panel doors, a dining table, trim and doors, a deck with railings, a fence, cedar siding, or a wood front door.
  - A board you drag across to compare bare and stained.
  - The same stain on five other woods.
  - Warnings, products to buy, and prep and topcoat tips.

  The warnings cover:
  - Blotchy woods and dark stains on maple.
  - Gray stains turning muddy on red oak.
  - Cherry darkening with age.
  - Finished wood that can only go darker.
  - New pressure-treated wood that must dry first.
  - Cedar tannin bleed.
  - Solid stain peeling on deck boards.
  - Recoat timing.
  - Dark floors and hot decks.

  Products:
  - **Inside:** Minwax Wood Finish, Water Based Wood Stain, Gel Stain, Pre-Stain Wood Conditioner and the topcoat.
  - **Outside:** the store's exterior stain lines (SuperDeck or Woodscapes, Arborcoat, Behr Premium, Olympic).

  Outdoor solid stains come from the paint colors, since stores tint solid stain to them. Outdoor semi-transparent picks are marked as tone guides, because only Minwax's interior stain colors are in ColorGenius.

- **Previews look like real rooms:**
  - Floors are drawn in perspective as wood planks with real grain, tile with grout, carpet pile or concrete.
  - Rooms have curtains, a rug, a coffee table, throw pillows, a plant and a ceiling light. Crown molding shows when the room has it.
  - Furniture has wood grain and upholstery has a woven texture.
  - Kitchens get stone counters, a sink, pendant lights and a fruit bowl.
  - The wood and stone textures are adapted from the Flowchart Producer house builder's texture recipes.

- **Five quick questions** for painting
  1. What's being painted: a room (including stairways, laundry rooms, sunrooms and garages), a surface or an exterior.
  2. Which way the windows face, using a compass picker, plus how much daylight and what bulbs. Tap every side that has windows: corner rooms often have two. Each side changes the advice, for example a north wall reading cooler in an otherwise sunny room, or opposite windows making walls look different.
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
- **Recommendations** from about 34,700 colors across 19 brands. Results are spread out so you don't get six versions of the same beige. Each comes with reasons it fits and its LRV (light reflectance value).
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
    - A room with a sofa, bed, bathroom vanity, desk, dining table, entry console, washer and dryer, or garage workbench.
    - A kitchen, for kitchen walls or cabinets.
    - The front of a house, for siding, exterior trim or a front door, with lap, shingle, board & batten, brick or stucco siding.
    - One window for each side that has windows (left wall, back wall, right wall), each casting its own patch of sun for that direction and time of day. Rooms with no windows show none. The floor shows as wood, carpet, tile or concrete.
  - Advantages and disadvantages for each color, a side-by-side compare, and a sheen comparison (Flat to Gloss) shown on the color itself.
  - A light switcher: daylight, north light, afternoon sun, golden hour, warm, soft white and daylight bulbs, and a dim corner.
  - Undertone, depth and the recommended finish.
  - Pairings for trim, lighter and deeper versions, and an accent.
  - The closest color in every other brand, with a measured color difference (ΔE 2000).
- **Look up & match**: find any color by name, code or color value (for example `SW 7029`, `OC-17`, `behr swiss coffee`, `#D1CBC1`).
- **Saved colors**: star colors to compare them, show them full screen, or copy the list.
- **Settings**:
  - Who's using it: store staff, homeowner or kiosk.
  - Turn each brand on or off (search by name, or All on / All off for a group), switch off color collections the store doesn't carry, and set a store brand (with "store brand only" if wanted).
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
| Clark+Kensington | 1,390 | Calculated | Ace Hardware color data |
| Magnolia Home | 165 | Calculated | Ace Hardware color data |
| KILZ | 827 | Calculated | Older public list |
| Vista Paint | 2,785 | Calculated | Older public list |
| Hallman Lindsay | 1,469 | Calculated | Older public list |
| Colorhouse | 128 | Calculated | Older public list |
| Resene | 2,041 | Calculated | Resene official swatch file |
| Farrow & Ball | 132 | Calculated | Older public list |
| RAL Classic (color standard) | 213 | Calculated | Public list of the RAL Classic chart |

**Wood stains:** Minwax, 280 stain colors (253 wood tones, 27 whitewash), from the Sherwin-Williams color service. Minwax publishes each stain as several swatches without saying which product or wood each shows, so the middle swatch stands for the color. The lightest and darkest are kept as its range.

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
