# ColorGenius

The paint department in your pocket. Find a paint or stain color in a few taps, see it in a real 3D room or on a house, and know exactly which paint, finish, primer, roller and brush to buy, and how much. It's built to be easy for anyone: a kid, a store employee or a grandparent.

It runs in any browser and installs on Android and iPhone as an app with its own home-screen icon. Once loaded, it works offline.

**Live site:** https://howzit5217.github.io/ColorGenius/ (open it on a phone, then Settings → Get the App)

## Easy to use

- **Four big choices on the home screen:** Paint Colors, Stain Colors, Which Paint to Buy, and Look Up a Color. Each has a 3D product picture (a fanned paint deck and roller, stained oak boards, a paint can with brush and tray, chips under a magnifier) and one line saying what it does. The pictures are rendered ahead of time by the app's own 3D engine and saved in `img/` (`CG.room3d.snapshot('tile-paint', 1080, 510)` makes one again), so they show the moment the app opens, even on phones without 3D.
- **One question per screen**, each choice with a picture. Tap your answer, then press the big **Next** button to go on (or press **Enter** on a computer; a small Enter key shows above Next). Nothing moves on by itself, and Next gives a small nudge once an answer is picked so it's clear what to press. Questions you can leave alone start with a sensible answer picked ("Any Style", "Not Sure"), so there is no Skip button to puzzle over.
- **A Back button on every screen**, and the phone's own back button and the browser's back arrow work too. Every screen has its own address.
- **Large text and buttons** in an easy-to-read typeface (Atkinson Hyperlegible, made for people with low vision). Settings → Easy to See → **Bigger text** makes everything larger still.
- **The top bar** has a **Home** button on every screen but home, a **Project** button with how many things are in the open project (once there's something in it), and **Settings** (on a kiosk, a **Staff** lock button instead). The logo goes home too.
- Light and dark screens, and **Less motion** for anyone who prefers no sliding.

## Paint Colors

The quick questions (about six):

1. **What are you painting?** A room; trim, doors or a ceiling; cabinets, furniture or floors; or outside the house.
2. **Which one?**
   - **Rooms:** living room, bedroom, kitchen, bathroom, powder room, dining room, home office, kids' room, nursery, hallway, stairway, laundry or mudroom, closet or pantry, sunroom, basement, attic, media room, garage, an accent wall.
   - **Trim and more:** ceiling, trim, interior doors, wainscoting, a brick fireplace.
   - **Cabinets and more:** cabinets, built-ins, furniture, concrete or wood floors.
   - **Outside:** siding, exterior trim, front door, shutters, garage door, porch floor, shed or barn.
3. **How big is the room?** (rooms) or **What is the siding made of?** (siding).
4. **Which way do the windows face?** Tap the sides on a compass: corner rooms often have two. "Not Sure" and "No Windows" are there too.
5. **How much daylight comes in?**
6. **What style do you like?** Up to two, each shown with its own colors.
7. **Which colors do you like?** Color families, or for ceilings and trim, what kind of white.

**Detailed questions** (Settings → Questions → Detailed) add light bulbs, what's on the wall now (for the primer), the feeling you want, warm or cool, colors to avoid, how light or dark, and what's staying in the room (floors, counters, cabinets, furniture, roof). Floors take two taps: the type, then its color.

**Results:** the room picture sits on top, with the colors right under it. Tap a color and the room repaints, rolling the new color across the walls like a paint roller. On phones the colors are one swipeable row so the room stays in view. **Help Me Pick One** plays a few "Which do you like better?" rounds and marks your pick.

Colors come from about 34,700 colors across 19 brands, spread out so you don't get six versions of the same beige. Each has reasons it fits and its Light Reflectance (LRV: how much light the color bounces back, from 0 for black to 100 for white).

## Stain Colors

1. **Inside or outside?**
2. **What are you staining?** Inside: floors, stairs, cabinets, furniture, tabletops, trim and doors, interior doors, paneling, built-ins. Outside: decks, fences, siding, outdoor furniture, pergolas, front doors, wood garage doors, shutters, sheds, log homes, playsets, docks.
3. **What kind of wood?** 15 woods, each drawn with its own grain, knots, pores and color (red and white oak, pine, maple, birch, cherry, walnut, hickory, ash, poplar, Douglas fir, cedar, redwood, pressure-treated pine, mahogany), or "Not Sure" for the usual one.
4. **What shape is it in?** Bare, already finished, or new pressure-treated.
5. **What look?** Natural, light, golden, warm or rich brown, espresso, reddish, gray, whitewash or a color, each shown with a real stain on your wood.
6. **Show the grain or hide it?**

Each stain is judged by how it will look on that wood (maple takes stain lighter, walnut barely changes). The stain's page has a before-and-after board to drag across, the same stain on five other woods, paint colors that go with it (tap one to see it on the walls), warnings, and what to buy.

## Which Paint to Buy

A short questionnaire for the paint itself, not the color: what you're painting, what it's made of now (already painted, new drywall, bare wood, laminate, metal, brick...), how smooth it is, anything wrong with it (stains, shiny paint, old oil paint, knots, mildew, dents), the color it is now and the color it's going, kids or pets, what matters most (best price, good balance, best quality) and how big it is.

The answer is a shopping list:

- **The paint:** the right kind (wall paint, enamel for trim and cabinets, porch & floor paint, exterior paint) and the line to buy from the store's brands at the chosen price level, with good / better / best options.
- **The finish,** nudged by the job: kids and pets move a flat or matte wall up to eggshell, rough or patched walls go flatter.
- **The primer,** if one is needed, with products to try and how many coats to plan on.
- **The roller and brush:** nap length, roller width and cover, brush shape, size and bristle, with a picture of the roller cover at its real nap. Naps follow the paint brands' own guides: about 3/8 inch for most smooth walls, 1/2 inch for light texture, 3/4 inch for rough ceilings, 1 to 1¼ inch for brick and stucco, and short foam or microfiber covers for cabinets and doors. Water-based products get synthetic brushes, oil-based ones natural bristle.
- **What else to grab,** as a checklist (tape, drop cloths, caulk, sanding sponges, cleaners, conditioner, topcoat and more).
- **How much to buy,** worked out from the room's size (or type in the length, width, height, doors and windows), the coats and the coverage: about 350 sq ft a gallon on smooth walls, less on rough ones; about 150 sq ft a quart of interior oil stain; about 200 sq ft a gallon for a first coat of deck stain. It's shown as quarts, gallons and 5-gallon buckets.
- **Safety notes,** like laying oily stain rags flat to dry.

Every paint color's page has the same "What You'll Need" summary, with a button to open the full shopping list.

## Seeing the color

- **Full screen.** On a color's page, tap **Full Screen** (or the big color square) and the color fills the whole screen, with its name and code and a light picker. Close or Esc goes back.
- **Scenes for every job.** Wall colors can be seen in 16 rooms (living room, bedroom, kitchen, bathroom, dining room, office, nursery, kids' room, entry, stairway, laundry, media room, sunroom, basement, attic, garage). There are also a kitchen island, a fireplace wall, a bookcase wall, a dresser and a dining set for cabinets and furniture. Outside are five house styles (ranch, two-story, farmhouse with a porch, cottage, modern), the front door up close, the front porch, a shed or barn and a log cabin. Stains also get a deck, a deck with a pergola, outdoor chairs, a playset, a dock on a lake, a backyard fence and a picket fence. Pick one from the **Scene** menu under the picture.
- **Real 3D.** Every scene is built in 3D and drawn with WebGL. Sunlight comes in through the actual window openings (the side the windows face decides where the sun falls), casts shadows, and the lamps come on at night.
- **Shadows like a photo.** Sun shadows are crisp where something touches the ground and soften with distance, and outside the sun comes from the side so trees, houses and decks throw shadows you can see. Soft shade from the sky and the room's own light gathers where things meet: under and behind the sofa, around the toilet and tub, under cabinets and the eaves, beneath a deck. This shade is worked out once when a scene opens, so turning the room stays smooth, and open walls still show the exact chip color. The color on the walls matches the chip exactly under "Chip Color", and shifts like the chips do under other light.
- **Turn it in 3D:** tap the **3D** button on the picture (or Settings → Easy to See → Turn rooms in 3D). Then drag to look around the room, pinch or scroll to zoom, double-tap to reset, or use the arrow keys. Zoom out to see the room like a dollhouse.
- **The light picker:** chip color, daylight, north light, afternoon sun, golden hour, warm, soft white and daylight bulbs, and a dim corner.
- Devices without WebGL 2 get the flat drawings instead.

## Look Up a Color

Type a color name, a code from a chip (`SW 7029`, `OC-17`, `behr swiss coffee`), a hex value (`#D1CBC1`, `D1CBC1`, `#DCB`) or an RGB value (`209 203 193`, `rgb(209, 203, 193)`), or pick a color to match. You get its exact hex, RGB and LRV (tap to copy), then the closest color in every brand, with brands that are turned off folded away underneath.

## Projects

A project keeps everything for one job in one place (one customer, one room, one deck), so it can be printed or emailed all at once.

- **On the home screen:** the open project (with an **Open Project** button), a big **Start a Project** button, and the last three earlier projects to tap back into.
- **Start a Project** asks what it's for ("Smith kitchen", "Mom's porch"); press Enter or **Start Project**. The project that was open is kept under **Earlier Projects**.
- Tap **Add to Project** on any paint, stain, exact color or shopping list (tap again to take it back off).
- On the project page, rename it, add notes for the printout, and type where each item goes.
- **Print** shows the page at real letter size first, then prints it: black and white, text only, one line per item, with area, brand, color, code, hex, finish, product, primer, amount, roller and brush, and where to find the chip. Columns nothing fills in are left out, and a wide list prints sideways.
- **Email It** opens the device's email app with the whole project written in, one line per item. Type their address in the box (or in the email), check it, and press Send. On phones, **Share…** can send it by text or another app instead. A very long project is also copied, in case the email app cuts it short.
- **More Things to Do:** show the colors full screen, compare them side by side, copy the project as text, or start a new project.
- **Delete This Project** at the bottom of the project page deletes the open project (after asking once, since it can't be undone) and goes back home.
- **Earlier Projects** (the last 10 on this device) can be opened, printed or deleted. Kiosks don't keep earlier projects.
- Colors saved in the older Saved Colors list are kept as an earlier project called "Saved Colors".

## Setup, kiosks and settings

- **First-time setup** asks two things, each with a Next button: who uses the device (paint store staff, me for my home, or a store kiosk) and which store. Picking a store turns on the brands it usually carries:

  | Store | Paint | Stain |
  | --- | --- | --- |
  | The Home Depot | Behr, Glidden, PPG, KILZ | Minwax, Varathane, Olympic |
  | Lowe's | Valspar, HGTV Home | Cabot, Minwax |
  | Ace Hardware | Benjamin Moore, Clark+Kensington, Magnolia Home | Minwax, Varathane, Cabot |
  | Menards | Dutch Boy | Minwax, Varathane |
  | Walmart | Glidden, KILZ | Minwax, Varathane |
  | Sherwin-Williams | Sherwin-Williams | SuperDeck, Minwax |
  | Benjamin Moore store | Benjamin Moore | Minwax |
  | PPG Paints store | PPG, Glidden | Olympic |
  | Dunn-Edwards / Diamond Vogel | Their own brand | — |

  "Another store" lets you pick the brands yourself. Paint or stain can be switched off if the store only does one.
- **Kiosk mode:** bigger text and buttons, no Settings button, and after 2 minutes with nobody using it, it asks "Still there?" and starts over with an empty project.
- **Kiosk PIN:** kiosk mode can't be turned on until a PIN of 4 to 8 numbers is made (and typed twice to make sure). On the kiosk, the **Staff** lock button at the top asks for it, then offers **Leave Kiosk Mode** or **Open Settings** (settings lock again as soon as you leave them). Five wrong tries locks the keypad for 30 seconds. In normal store mode, Settings → Who Uses This → **Change PIN** makes a new one. The PIN is stored on the device only as a salted hash.
  - A kiosk turned on before PINs were added has none: the **Staff** button asks for a new PIN, then unlocks.
  - **Forgot the PIN?** under the keypad: press and hold **Reset** for 4 seconds to reset the settings and PIN and run setup again. Projects and imported colors stay. Anyone at the kiosk can do this too, so it's a way back in, not extra security.
- **Settings:** who uses it; store, store brand and "only suggest the store brand"; paint and stain on or off; quick or detailed questions and how many colors to show; bigger text, 3D rooms, light or dark, the light picker, less motion; LRV, warnings, matches, chip locations and discontinued colors; screen tuning; paint and stain brands, color collections and paint lines; importing colors from a CSV file; getting the app, running setup again and resetting everything.
- **Color collections:** brands that split their colors into collections can have each switched off (Benjamin Moore's Classic, Color Preview, Historical, Off-White, Affinity, Color Stories, Designer Classics, Williamsburg and stain colors; Magnolia Home's collections; Clark+Kensington's cards; PPG and Glidden code sets; Diamond Vogel's collections). Picks, matches and pairings skip collections that are off.
- **Screen tuning:** a one-minute calibration matches the screen to white paper and a real chip, then adjusts every swatch and the 3D rooms. Browsers can't read a monitor's brightness, color profile or night-light setting, which is why this exists.

## The advice behind the picks

- **Warnings** in plain language: colors that will read too dark or light in that light, north light turning cool grays icy, sun turning creams yellow, undertones that lean green, pink or purple, clashes with wood, tile or brick, bulb effects, bold colors on full walls, ceilings that will feel lower, dark colors on vinyl siding, fading outdoors, and coverage and primer needs. Stains add blotchy woods, gray stains on red oak, cherry darkening, finished wood that can only go darker, new pressure-treated wood, cedar tannin bleed, solid stain on decks, recoat timing, and dark floors and hot decks.
- **Primer:** stain-blocking, bonding, drywall, high-hiding, wood, oil-based for cedar and knots, masonry or metal, with products (the store's own brand first) and whether to tint it.
- **Paint lines** for Benjamin Moore, Sherwin-Williams, Behr, Valspar, HGTV Home, Dutch Boy, PPG, Glidden and Dunn-Edwards, matched to the job (bath paint for bathrooms, enamel for cabinets and trim, scuff-resistant for kids' rooms, porch & floor paint for floors). Each line can be switched off to match what the store carries.
- **Pairings** for trim, lighter and deeper versions and an accent, and the **closest color in every other brand** by measured color difference (ΔE 2000).

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

**Wood stains** (753 stain colors; each brand can be switched off in setup or Settings):

| Brand | Stains | Kinds | Source |
| --- | ---: | --- | --- |
| Minwax | 280 | Wood tones and whitewash (interior) | Sherwin-Williams color service |
| Cabot | 196 | Semi-transparent and semi-solid (exterior) | cabotstain.com color pages |
| Olympic | 99 | Solid and semi-transparent (exterior) | olympic.com color page, averaged swatch photos |
| Varathane | 79 | Fast Dry, Premium, Water-Based and Gel stains (interior) | rustoleum.com product pages, averaged color chip photos |
| Sherwin-Williams SuperDeck | 99 | Semi-transparent, plus solid Deck & Dock coatings (exterior) | sherwin-williams.com stain color pages, averaged swatch photos |

Minwax publishes each stain as several swatches without saying which product or wood each shows, so the middle swatch stands for the color. The lightest and darkest are kept as its range. Olympic and SuperDeck show their stains only as photos (on cedar or treated pine), so each color is the average of its own photo (`tools/fetch/average_swatches.js`). Cabot's solid colors show no value on its site, so only its semi-transparent and semi-solid colors are included.

Inside jobs use Minwax and Varathane. Outside jobs use the outdoor brands that are on. With none on, Minwax tones are shown as tone guides. Outdoor solid stains come from the stain brands' solid colors, or from paint colors when no solid stain colors are on.

Varathane's chip photos can't be read by a browser, so they're averaged with Windows' built-in image library (`tools/fetch/average_chips.ps1`).

Not included, because the brands don't publish color values in a form that can be read: Behr stains (behr.com blocks automated access), Valspar stains (loaded only through a third-party search service; the PDF color card has no readable names), Thompson's, Ready Seal and Benjamin Moore Arborcoat/Woodluxe (beyond the handful of exterior stain colors in its paint data).

All colors were collected on 2026-11-23. "Calculated" LRV comes from the color value and is usually within a couple of points of the printed number; the app marks it with an asterisk. Screen colors are each brand's own digital values. Always confirm with a physical chip.

## Run it

Open `index.html` in a browser, or start the small local server:

```
npm start
```

Then open http://localhost:5173. Other devices on the same network can use the computer's address and port 5173.

## Install it on a phone

The site must be online at an `https://` address. GitHub Pages works and is free. Open that address on the phone, then go to Settings → The App → **Get the App**:

- **Android**: the install prompt opens. Tap **Install**.
- **iPhone / iPad**: follow the steps shown. Tap Share, then **Add to Home Screen**, then Add.

The installed app opens full screen without browser bars and works offline. On iPhone it keeps its own settings and lists, separate from Safari.

**Updates are automatic.** Every time the app opens online, it loads the newest version of the app and the color data. If the app was left open in the background, it refreshes itself when it comes back, as long as nothing is in progress. Push changes to `main` and GitHub Pages publishes them within a minute or two.

## Tests

```
npm test
```

The tests check the color math against published reference values. They also check that every brand file is complete and valid, and that search (including hex and RGB values), recommendations for every job, warnings, cross-brand matches, the CSV import and the offline file list all work. The paint department tests check the roller naps and brushes for every job, the supplies, the quart, gallon and bucket math, how much paint a room takes, and that Which Paint to Buy gives the right paint, finish and primer for each kind of job.

## Updating the colors

`tools/fetch/` has the scripts used to download each brand's public color list. `tools/build-data.mjs` turns those downloads into the files in `data/`:

```
node tools/build-data.mjs <folder-with-downloads>
```

Brands change their websites, so a script may need adjusting before the next refresh. If you change any app files, bump `VERSION` in `sw.js` so installed apps pick up the update.

## Notes

Paint color names, numbers and swatch values belong to their brands. This tool is for helping pick colors at the counter. It is not affiliated with any paint company.
