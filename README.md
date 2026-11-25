# ColorGenius

The paint department in your pocket. Find a paint or stain color in a few taps, see it in a real 3D room or on a house, and know exactly which paint, finish, primer, roller and brush to buy, and how much. It's built to be easy for anyone: a kid, a store employee or a grandparent.

It runs in any browser and installs on Android and iPhone as an app with its own home-screen icon. Once loaded, it works offline.

**Live site:** https://howzit5217.github.io/ColorGenius/ (open it on a phone, then Settings → Get the App)

## Easy to use

- **Four big choices on the home screen:** Paint Colors, Stain Colors, Which Paint to Buy, and Look Up a Color. Each has a 3D product picture (a fanned paint deck and roller, stained oak boards, a paint can with brush and tray, chips under a magnifier) and one line saying what it does. The pictures are rendered ahead of time by the app's own 3D engine and saved in `img/` (`CG.room3d.snapshot('tile-paint', 1080, 510)` makes one again), so they show the moment the app opens, even on phones without 3D. The app icon is the fanned paint deck from the Paint Colors picture (the same seven colors on their brass rivet), rendered the same way and saved in `icons/`; the same picture is the logo in the top bar and on the first-time setup and loading screens: `CG.room3d.snapshot('tile-icon', 1024, 1024, 0.85)` for the icon, `'tile-icon-safe'` (standing back a little) for Android's masked icon, scaled down to 512, 192, 180 and a rounded 64 for the browser tab.
- **One question per screen**, each choice with a picture. Tap your answer, then press the big **Next** button to go on (or press **Enter** on a computer; a small Enter key shows above Next). Nothing moves on by itself, and Next gives a small nudge once an answer is picked so it's clear what to press. Questions you can leave alone start with a sensible answer picked ("Any Style", "Not Sure"), so there is no Skip button to puzzle over.
- **A Back button on every screen**, and the phone's own back button and the browser's back arrow work too. Every screen has its own address.
- **Large text and buttons** in an easy-to-read typeface (Atkinson Hyperlegible, made for people with low vision). Settings → Easy to See → **Bigger text** makes everything larger still.
- **The top bar** has a **Home** button on every screen but home, a **Project** button with how many things are in the open project (once there's something in it), and **Settings** (on a kiosk, a **Staff** lock button instead). On phones these are round icons only (each keeps its name for screen readers), and so is the camera screen's On Paper / On a Wall switch, which says what each means when it's picked. The logo goes home too. Going home starts over, so if there are answers, results or a search on the go it asks first ("Go Back Home?"); anything already added to the project stays.
- Light and dark screens, and **Less motion** for anyone who prefers no sliding.
- **The phone's own bars match the app:** the bar with the clock and the browser's address bar take the app's own background, in whichever light or dark the app is set to (not just the phone's setting), and go black for the camera and full-screen colors. The installed app's bottom bar on Android takes the app's background from `manifest.webmanifest` (with a dark one for phones that support it). An app installed before this keeps its old bottom-bar color until Android refreshes it; removing it from the home screen and adding it again does it right away.

## Paint Colors

The quick questions (about six):

1. **What are you painting?** A room; trim, doors or a ceiling; cabinets, furniture or floors; or outside the house.
2. **Which one?**
   - **Rooms:** living room, bedroom, kitchen, bathroom, powder room, dining room, home office, kids' room, nursery, hallway, stairway, laundry or mudroom, closet or pantry, sunroom, basement, attic, media room, garage, an accent wall.
   - **Trim and more:** ceiling, trim, interior doors, wainscoting, a brick fireplace.
   - **Cabinets and more:** cabinets, built-ins, furniture, concrete or wood floors.
   - **Outside:** siding, exterior trim, front door, shutters, garage door, porch floor, shed or barn.
3. **How big is the room?** (rooms) or **What is the siding made of?** (siding).
4. **Who is the room for?** (bedrooms, kids' rooms and nurseries, optional): her room, his room, a couple or a guest room; a girl, a boy, or shared. It leans the picks a little toward the colors usually chosen for that room (soft pinks and lilacs, blues and greens, calm neutrals), and every color is still there.
5. **Which way do the windows face?** Tap the sides on a compass: corner rooms often have two. "Not Sure" and "No Windows" are there too.
6. **How much daylight comes in?**
7. **What style do you like?** Up to two, each shown with its own colors.
8. **Which colors do you like?** Color families, or for ceilings and trim, what kind of white.

**Detailed questions** (Settings → Questions → Detailed) add light bulbs (2700K, 3000K, 4000K, 5000K or not sure), how light or dark, the feeling you want, warm or cool, colors to avoid, what's on the wall now (for the primer), and what's staying in the room (floors, counters, cabinets, furniture, roof). Floors take two taps: the type, then its color.

**The questions work like a guessing game.** Each set starts with what's being done and the easy questions and gets more detailed as it goes, and every answer shapes what comes next. An answer can add a question or take one away (No Windows takes away the daylight question; siding is only asked for the outside of a house), and the answer to a question that's gone is cleared, so it can't quietly change the picks. The question count updates right away. On the style and color questions, each choice is tried with everything answered so far: choices that would come back with cautions for this room say **Harder Here** (cool grays in north light, dark colors in a small dim room, a moody style on vinyl siding), the rest say **Good Fit**, and when everything suits the room nothing is marked.

**Results:** the room picture sits on top, with the colors right under it. Tap a color and the room repaints, rolling the new color across the walls like a paint roller. On phones the colors are one swipeable row so the room stays in view. **Help Me Pick One** plays a few "Which do you like better?" rounds and marks your pick.

Colors come from about 45,000 colors across 23 brands from the US, Canada, Australia and New Zealand, the UK, South Africa and India, spread out so you don't get six versions of the same beige. Each has reasons it fits and its Light Reflectance (LRV: how much light the color bounces back, from 0 for black to 100 for white).

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
- **How much to buy,** worked out from the room's size (or type in the length, width, height, doors and windows), the coats and the coverage: about 350 sq ft a gallon on smooth walls, less on rough ones; about 150 sq ft a quart of interior oil stain; about 200 sq ft a gallon for a first coat of deck stain. It's shown as quarts, gallons and 5-gallon buckets. Walls are 2 × (length + width) × height, less about 20 sq ft a door and 15 a window. Each number box has the app's own up and down arrows (hold to keep going), a size left empty is asked for instead of guessed, the line under the answer shows the area, coats, coverage and exact gallons so it can be checked, and a tenth of a quart over (about 3 oz) doesn't add another can.
- **Safety notes,** like laying oily stain rags flat to dry.

Every paint color's page has the same "What You'll Need" summary, with a button to open the full shopping list.

## Seeing the color

- **Full screen.** On a color's page, tap the color square at the top (it has a small full-screen mark in its corner) and the color fills the whole screen, with its name and code and a light picker. Close or Esc goes back.
- **Set Up the Room.** The **Set Up Room** button on a room's picture puts the windows on the walls they're really on, and in a kitchen puts the fridge on the left or right and the stove on either side of the sink. A window on the kitchen's back wall sits over the sink, and the tile backsplash stops under it. It stays for the rest of the visit and clears with Go Home.
- **Tap any part to change its color.** On any room or house picture (3D turning on or off, in every mode), tap a part and a small panel opens low on the screen, so the picture stays in view and each change shows on it right away, rolled on like paint. The first time, a note in the middle of the picture says "Tap any part to change its color" (on a kiosk, for each shopper).
  - **Walls, ceiling, trim, doors, wainscoting, cabinets, vanity, fireplace** and, on a house, **siding, trim, front door, shutters, garage door and porch steps**: colors from the same brand that go with the color being looked at. Trim and ceilings get whites made to go with it (soft whites for a warm color, clean ones for a cool color) or the same color for one look. Front doors, shutters and cabinets get an accent made for it, a deeper shade and the classics (black, charcoal, navy, deep green, red). Walls and siding get lighter shades and neutrals that go with it.
  - **The color adjuster** (every painted part): the color on the part now sits at the top, and six buttons step it **Lighter, Deeper, Warmer, Cooler, Softer** (less color) or **Richer** (more color). Each button shows the real color it goes to, its swatch and name, before it's tapped, so there's no guessing; tap again to keep going that way. A step is the nearest color of the same brand a small, easy-to-see step away (lighter and deeper keep the hue and the amount of color; warmer, cooler, softer and richer keep how light it is), and a button says "As light as it goes" when the brand has nothing further. **Undo** steps back one change at a time. Switched-off collections and discontinued colors are left out.
  - **Light in the room**, in the same panel: Daytime and the four kinds of bulb by the number on the bulb or its box (Warm 2700K, Soft White 3000K, Bright White 4000K, Daylight 5000K), so the adjusted color can be judged under the room's own bulbs. **More Light** has the rest.
  - A brand color tried on a part can go on the project (named for the part, like "Trim") or be opened on its own page.
  - **Roof and floor** aren't paint: pick the closest to the real one (shingle colors, metal or tile; oak, walnut, tile or carpet) to see the paint with it.
  - **Furniture in its real color**: tap a sofa, chair, bed, rug, table, curtains, counters or backsplash to set the color it really is, and what it's made of (fabric, leather or velvet; wood grain or painted). Each piece changes on its own (the sofa, not the armchair) and carries over to the other scenes.
  - **Put It Back** undoes a part, and Go Home puts everything back. The lawn, plants, walkway and windows say what they are and point to the house.
- **Scenes for every job.** Wall colors can be seen in 16 rooms (living room, bedroom, kitchen, bathroom, dining room, office, nursery, kids' room, entry, stairway, laundry, media room, sunroom, basement, attic, garage). There are also a kitchen island, a fireplace wall, a bookcase wall, a dresser and a dining set for cabinets and furniture. Outside are five house styles (ranch, two-story, farmhouse with a porch, cottage, modern), the front door up close, the front porch, a shed or barn and a log cabin. Stains also get a deck, a deck with a pergola, outdoor chairs, a playset, a dock on a lake, a backyard fence and a picket fence. Pick one from the **Scene** menu under the picture.
- **Real 3D.** Every scene is built in 3D and drawn with WebGL. Sunlight comes in through the actual window openings (the side the windows face decides where the sun falls), casts shadows, and the lamps come on at night.
- **Shadows like a photo.** Sun shadows are crisp where something touches the ground and soften with distance, and outside the sun comes from the side so trees, houses and decks throw shadows you can see. Soft shade from the sky and the room's own light gathers where things meet: under and behind the sofa, around the toilet and tub, under cabinets and the eaves, beneath a deck. This shade is worked out once when a scene opens, so turning the room stays smooth, and open walls still show the exact chip color. The color on the walls matches the chip exactly under "Chip Color", and shifts like the chips do under other light.
- **Turn it in 3D:** tap the **3D** button on the picture (or Settings → Easy to See → Turn rooms in 3D). Then drag to look around the room, pinch or scroll to zoom, double-tap to reset, or use the arrow keys. Zoom out to see the room like a dollhouse.
- **The light picker:** the **Light** button under the picture, or tap a lamp in the 3D room (the porch light on a house). It opens a panel of tiles, so the picture stays in view and changes right away: the light bulbs in the room by the number on the bulb or its box (Warm 2700K, Soft White 3000K, Bright White 4000K, Daylight 5000K), and daylight (daytime, north light, afternoon sun, golden hour, a dim corner, or the chip color with no light at all). The bulbs picked in the questions are marked **Yours**. With bulbs, the room is shown in the evening with the lamps on.
- Devices without WebGL 2 get the flat drawings instead.

## Look Up a Color

**Stains are searched too** (when the store does stain): by name (`early american`), number (`1199`) or brand word (`minwax`, `cabot gray`, `superdeck cedar`), in their own Stains list, first when the name or number matches exactly. A color number also lists the closest stains. Tapping one opens it on a floor, or on a deck for an outdoor stain. Type a color name, a code from a chip (`SW 7029`, `OC-17`, `behr swiss coffee`), a hex value (`#D1CBC1`, `D1CBC1`, `#DCB`) or an RGB value (`209 203 193`, `rgb(209, 203, 193)`), or pick a color to match. **Match With the Camera** reads a color with the phone or tablet camera when the store's color scanner is down. The camera fills the screen with two boxes: lay the chip or sample on plain white paper (or hold the paper against the wall beside the color), put the paper in the **Paper** box and the color in the **Color** box, and tap the round button. The color is read against the paper in the same picture, so the light and the camera's own brightness and warmth cancel out. The phone's light comes on by itself where there is one (it gives both the same steady light, and reads more accurately); the light button turns it off for glossy paint. Shadows only darken and shine only brightens, so the paper is read from its brightest even part and the color from its middle tones: a shadow over up to half the Paper box, or shading and shine on a curved or 3D object, don't change the reading. **Height guide:** up close the phone's light makes a bright spot, so the paper and the color can get different amounts of light, which changes the color. The app measures this all the time: with the chip lying on the paper it reads the paper just outside all four sides of the Color box (the average of opposite sides is the light right where the color is, whatever the light is doing), and otherwise it carries the slope of the light across the Paper box over to the Color box. It uses that to correct the reading, and shows it as a meter on the right (red too close, yellow, green a good height) with a red, yellow or green edge around the picture; on red it asks you to move back and won't read. Phones that report how far away they're focused also show the distance ("about 10 in"). Drag a box to move it or its corner to resize it (it keeps its shape when the screen turns, and stays put for next time); the round arrow puts the boxes back, and **?** shows a few tips. One short line appears only when something needs fixing (too dark, glare, a shadow over most of the paper, a box not on one color). It gets close, not exact, so check against a real chip. You get its exact hex, RGB and LRV (tap to copy), then the closest color in every brand, with brands that are turned off folded away underneath.

**Popular colors** come from the paint companies themselves, not a typed-in list. Every Monday a GitHub job (`.github/workflows/popular.yml`) runs `tools/popular/find.mjs`, which opens each brand's own website, follows its links to this year's and next year's **Color of the Year** pages and to its **most popular colors** page, and reads the colors off them. A color only counts when the page shows its name and its color number together, checked against that brand's own colors (names repeat across brands). The results go in `data/popular.js`, which the app loads at start. A color's page then shows a **2027 Color of the Year** or **Popular** tag with the reason ("On Sherwin-Williams' “Top 50 Colors” list"), and Look Up shows **Colors of the Year** and **Popular Right Now** before you type. The starting page for each brand is in `tools/popular/sources.json`; no colors are listed there. If a site can't be reached one week, what it showed before is kept (a Color of the Year until its year ends, popular lists for 120 days). Some sites turn automated visitors away (Behr and Ace Hardware for Clark+Kensington right now) or load their lists only inside a browser (Valspar's popular colors), so those show nothing until that changes. Run it by hand with `node tools/popular/find.mjs` (or `--dry` to just print what it finds), or from GitHub's Actions tab with **Run workflow**.

**Match With the Camera** (under the search box on Look Up a Color) when the store's color-matching machine is down. A camera can't see true color by itself, so the color is read against plain white copy paper under the same light. Two ways, picked at the top of the camera screen:

- **On Paper** (the usual): lay the chip or sample on the paper and fit the one box inside it. The paper is read all the way around the color, in eight directions, each just past the color's own edge (found by itself, so the box can be smaller than the chip) and at two distances. A smooth surface through those readings gives the paper's light right where the color is, so the phone's light making a bright spot off to one side doesn't throw it off.
- **On a Wall**: hold the paper flat on the wall beside the color; the Paper box goes on the paper and the Color box on the color. The paper's light is carried over with its slope.

What it checks before it will read (the line at the top says what to fix, and turns green with **Ready** when it's good):
- **Too bright:** paper the camera has washed out reads dimmer than it is and makes every color too light (two very different answers for one color came from this). It's refused. Android phones that allow it turn their own exposure down until the paper is safe.
- **Too close:** when the phone's light falls off faster than can be followed (about 4 cm away or closer), it asks to move back. The height guide on the right shows the same.
- **Shine** on the color (circled), **too dark**, **not one color** in the box, and **no paper around it**.
- A reading takes a second of pictures, each worked out on its own; the color is the middle of them, and only if they agree. Otherwise it asks to hold still.
- **Whites, off-whites and very dark colors**, the hardest for a camera:
  - The color's edge is found against how grainy the color itself looks inside the box. A near-white that differs from the paper by a hair is still found in a clean picture, and a dark color's camera noise isn't taken for its edge (which used to make the "paper" the chip itself, so a navy could read nearly white).
  - Whites brighter than copy paper (up to about LRV 95, like the brightest trim whites) are read instead of refused.
  - After reading a white or a dark color, if the camera isn't tuned with that kind of chip yet, the message says so.

**Tune the Camera** (in the camera's **?** tips) makes it more exact for one phone: read a chip whose name is known (any chip in the app), pick it, and the app learns how that phone's camera bends colors. Up to six chips can be used, and **Undo Tuning** clears it. **One white chip and one dark chip is best**, and each does its own job:
- A **white or off-white chip** sets the paper itself. Copy paper isn't exactly neutral: it's often a little blue (which turns off-whites yellow) or a little cream. Near the paper the camera's curve hardly matters, so this chip changes only the paper's tint, and can't bend the dark colors.
- A **dark or middle chip** sets the phone's own curve: its contrast, and lens flare or lifted shadows in dark colors. It's measured from the paper the white chip found, and doesn't move the whites.
- The tips say which kind is still missing.

The math is in `js/cammatch.js`. `tests/cammatch.test.mjs` checks it on made-up camera pictures (`tests/camsim.mjs`): even light, the phone's light at different heights, warm and cool light, brighter and dimmer light on the same chip, washed-out paper, shine, chips bigger than the box and off-whites, whites brighter than copy paper and ones a hair from it, very dark colors with a grainy camera, no paper, a contrasty camera before and after tuning, bluish copy paper fixed by a white chip, lens flare on a contrasty camera fixed by a white and a dark chip, and a wall. At normal heights readings land within about 1.5 Lab units of the chip (hard to see), and the same chip in brighter or dimmer light reads the same.

## Projects

A project keeps everything for one job in one place (one customer, one room, one deck), so it can be printed or emailed all at once.

- **On the home screen:** the open project (with an **Open Project** button), a big **Start a Project** button, and the last three earlier projects to tap back into.
- **Start a Project** asks what it's for ("Smith kitchen", "Mom's porch"); press Enter or **Start Project**. The project that was open is kept under **Earlier Projects**.
- Tap **Add to Project** on any paint, stain, exact color or shopping list (tap again to take it back off).
- On the project page, rename it, add notes for the printout, and type where each item goes.
- **See It All Together** (on the project page) shows every color in the project at once, each where it goes, in pictures that can be tapped and turned like the others:
  - **Inside**: walls, ceiling, trim, doors, cabinets, wainscoting, fireplace and floor (a kitchen when there are cabinets, a dining room for furniture, and so on).
  - **Front of the House**: siding, house trim, front door, shutters, garage door and porch floor (shutters appear when they have a color).
  - **Out Back**: the deck with the back of the house, so the house color and the deck stain are seen side by side.
  - **The Fence**: the fence stain or color.
  - Stains show on their own wood, and several at once (a deck stain and a different fence stain). A paint color put on a deck or fence shows as a solid color.
  - Under each picture is a list of what's in it. **Where Each Color Goes** at the bottom has a **Goes on** choice for every color. The app fills it in from the job the color was picked for, the part it was tried on, or the words typed in "Where it goes" ("deck", "front door", "kitchen cabinets"); anything else goes in the first open spot (whites on trim, other colors on the walls). A change is saved with the project.
- **Print** shows the page at real letter size first, then prints it: black and white, text only, one line per item, with area, brand, color, code, hex, finish, product, primer, amount, roller and brush, and where to find the chip. Columns nothing fills in are left out, and a wide list prints sideways.
- **Email** sits next to every **Print**: on the project page (**Email It**), in the print preview, beside each earlier project, and on a shopping list. Once the site's do-not-reply address is set up (see **Email** below), type their address and press **Send**: it goes straight from "ColorGenius (do not reply)", one line per item, with no email app needed, so it works on a kiosk too. Until then, Email opens the device's own email app with everything written in (on phones, **Share…** can send it by text instead), and a very long project is also copied in case the email app cuts it short. One screen can send up to 12 emails an hour. For the address, just type the name: **@gmail.com** is added (shown in grey after it), buttons switch it to @yahoo.com, @outlook.com, @icloud.com or @hotmail.com, and typing a whole address with an @ uses it as typed. Every email has a **See These Colors in ColorGenius** button and a link to browse every color.
- **More Things to Do:** show the colors full screen, compare them side by side, copy the project as text, copy a link to it, or start a new project.
- **A project in a link.** The link in an email (or from **Copy a Link to It**) carries the whole project inside the link itself, after the `#`, which browsers never send to the web host: no server, no account, nothing stored anywhere else. Opening it shows the project with every color, a tap on any color shows it in a room, **Save to My Projects** keeps it on that phone, and **See More Colors** leads to everything else in the app. Someone opening a link skips the first-time setup. A link that was cut short says so instead of showing half a project.
- **Delete This Project** at the bottom of the project page deletes the open project (after asking once, since it can't be undone) and goes back home.
- **Earlier Projects** (the last 10 on this device) can be opened, printed, emailed or deleted. Kiosks don't keep earlier projects.
- Colors saved in the older Saved Colors list are kept as an earlier project called "Saved Colors".

## Email

The Email buttons can send from the site's own do-not-reply address. It uses [EmailJS](https://www.emailjs.com) (free plan: about 200 emails a month) with a Gmail account made only for this, so nobody's own email is used and customers can't reply into a real inbox.

1. **Make the Gmail account.** Create a new Google account just for this, for example `colorgenius.noreply@gmail.com` (any free name works). Use a strong password and keep it to yourself.
2. **Make the EmailJS account** at emailjs.com (Sign Up, free).
3. **Connect Gmail:** in EmailJS, **Email Services → Add New Service → Gmail → Connect Account**, sign in with the new Gmail account, allow it to send email, then **Create Service**. Copy the **Service ID** (like `service_abc1234`).
4. **Make the template:** **Email Templates → Create New Template**, then fill in:
   - **Subject:** `{{subject}}`
   - **Content** (switch to the code `<>` view and paste):
     ```html
     <div style="font-family:Arial,sans-serif;font-size:15px;color:#222">
     <p><b>{{project_name}}</b></p>
     {{{message_html}}}
     <p style="color:#777;font-size:12px">Sent by ColorGenius from a do-not-reply address. Replies to this email aren't read.</p>
     </div>
     ```
   - **To Email:** `{{to_email}}`
   - **From Name:** `{{from_name}}`
   - **Reply To:** the do-not-reply Gmail address itself.
   - **Save**, and copy the **Template ID** (like `template_abc1234`).
5. **Copy the Public Key** from **Account → General**.
6. Put the three IDs in `js/config.js` (`serviceId`, `templateId`, `publicKey`) and publish the site. They're public IDs, safe to keep in the code. Nothing else changes: the Email boxes now show **Send**.
7. **If emails land in spam:** a brand-new Gmail account sending automated mail has no track record yet, so Gmail is wary of it at first. Ask the first few people to tap **Not spam** (and add the address to their contacts); Gmail learns from that and it usually gets better within a few weeks. The surest fix is sending from your own web address (a domain, about $10–15 a year) through a sending service EmailJS supports, such as Brevo or Mailgun, set up with SPF and DKIM records.
8. If EmailJS offers it under **Account → Security**, limit it to this site's address (`howzit5217.github.io`) so the IDs only work from here.

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
- **No kiosk? Use shoppers' phones:** Settings → **No Kiosk? Use Shoppers' Phones** shows a QR code. Scanning it with a phone's camera opens ColorGenius on that phone in kiosk mode, already set up like this store: its store and store brand, which paint and stain brands and color collections are on, paint and stain on or off, and quick or detailed questions. The whole setup rides inside the link (`#/kiosk/...`), so there's no server or account. **Print a Sign** prints a letter-size sign with a big code and three easy steps; **Copy Link** copies the link. Change the store or brands and the code changes with them, so print a new sign after a change.
  - On a phone, kiosk mode keeps normal-size text and doesn't start over by itself (it's the shopper's own phone). Settings stay locked. The **Staff** button asks for the PIN if that phone has one; otherwise it offers **Press and Hold to Leave** (2 seconds), which puts back the phone's earlier setup (so a staff member testing the sign gets their own settings back) or starts setup.
  - A store's own kiosk ignores the link, so its setup only ever changes behind the PIN.
  - The QR code is made inside the app (`js/qr.js`, no outside service, works offline). When the app runs on a computer at `localhost`, the code points at the public site set in `js/config.js` (`siteUrl`), since a phone can't open the computer's own address.
- **Settings:** who uses it; store, store brand and "only suggest the store brand"; paint and stain on or off; quick or detailed questions and how many colors to show; bigger text, 3D rooms, light or dark, the light picker, less motion; LRV, warnings, matches, chip locations and discontinued colors; screen tuning; paint and stain brands, color collections and paint lines; importing colors from a CSV file; getting the app, running setup again and resetting everything.
- **Brands:** each paint and stain brand in Settings → Brands shows its own icon (from the brand's own website, saved in `img/brands`; RAL and Colorhouse show a few of their colors instead, since neither has a usable icon). The count at the top ("12 of 19 on · 26,878 colors") changes the moment a switch is flipped.
- **Color collections:** brands that split their colors into collections can have each switched off (Benjamin Moore's Classic, Color Preview, Historical, Off-White, Affinity, Color Stories, Designer Classics, Williamsburg and stain colors; Magnolia Home's collections; Clark+Kensington's cards; PPG and Glidden code sets; Diamond Vogel's collections). Picks, matches and pairings skip collections that are off.
- **Screen tuning:** a one-minute calibration matches the screen to white paper and a real chip, then adjusts every swatch and the 3D rooms. Browsers can't read a monitor's brightness, color profile or night-light setting, which is why this exists.
  - **The light here comes first:** tap the bulbs where the screen is, by the number on the bulb or its box (Warm 2700K, Soft White 3000K, Bright White 4000K, Daylight 5000K), or Daytime (window light) or Not Sure. White paper under warm bulbs looks warm, so the screen's white starts warmer to match it: a little less than half way toward the bulbs' color, since eyes count a screen partly as a light of its own. The warmth and brightness sliders then only fine-tune it. Most stores use 4000K or 5000K lights.
  - **Moved to a room with other bulbs?** Settings → Screen Color → **Light where this screen is**: tap them and the tuning moves with them, keeping the fine-tuning, with no need to tune again.
  - **The light picker knows it:** on a screen tuned under, say, 4000K bulbs, Bright White bulbs show the chip just as it looks there, and daylight shows it cooler than that (so warm bulbs aren't counted twice).

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
| Dulux Australia (also New Zealand) | 4,974 | Brand | dulux.com.au Colour Atlas |
| Plascon (South Africa) | 1,775 | Calculated | plascon.co.za colour list |
| Sico (Canada) | 1,707 | Calculated | sico.ca colour families |
| Nerolac (India) | 1,846 | Calculated | nerolac.com colour catalogue |
| RAL Classic (color standard) | 213 | Calculated | Public list of the RAL Classic chart |

Brands from outside the US are in Settings → Brands → International, switched off until a store turns them on. Search also knows every brand by name (`plascon moody blue`, `sico london cab`, `dulux vivid white`).

Also looked at, but not included because their websites don't show the whole palette in a form that can be read (or block automated reading): Jotun, Tikkurila, Little Greene, Asian Paints, Berger, Nippon Paint, Haymes, Taubmans, Wattyl, Comex, Suvinil, and the AkzoNobel sites (Dulux UK, Dulux Valentine, Coral, Flexa, Sikkens), which show only part of each palette on the page.

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

All colors were collected on 2026-11-23, and Dulux Australia, Plascon, Sico and Nerolac on 2026-11-24. "Calculated" LRV comes from the color value and is usually within a couple of points of the printed number; the app marks it with an asterisk. Screen colors are each brand's own digital values. Always confirm with a physical chip.

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

**Updates are yours to start.** The app keeps running the version it has (it works offline the same way). When a new version is published, it downloads in the background and waits:

- When the app opens (or comes back after 20 minutes or more away) with a new version ready, a popup says so. Its only button is **Update**: it can't be closed any other way, and nothing behind it can be used until you press it.
- If a new version arrives while someone is in the middle of something, only an **Update** button appears in the top bar, so nobody is interrupted. The popup shows the next time the app opens. A kiosk shows it when it starts over for the next shopper.
- Settings → The App → **Updates** shows which version is running, with **Check for Updates** (or **Update Now** when one is ready).
- Pressing Update switches to the new version and reloads once. Projects, settings and imported colors stay.

The weekly popular colors (`data/popular.js`) aren't a new version of the app, so they still refresh on their own. To publish a new version, push changes to `main` with `VERSION` in `sw.js` bumped. GitHub Pages publishes within a minute or two, and the app looks for it every time it opens, every half hour while open, and whenever it comes back to the front.

## Browsers

ColorGenius works in Chrome, Edge, Safari (iPhone, iPad and Mac), Firefox, Samsung Internet and Opera, and in versions back to about 2021: Safari 14.1 and iPhones on iOS 14.5, Chrome and Edge 84, Firefox 78, Samsung Internet 14. Newer features only add polish, and each has a fallback written next to it:

- Shared project links are squeezed with the browser's own compression where it has it. Browsers without it (Safari before 16.4, Firefox before 113, Chrome before 103) open them with the app's own decoder (`js/inflate.js`).
- 3D rooms need WebGL 2 (Safari 15 and up); without it the rooms show as flat pictures. Full screen uses Safari's older name for it where needed; iPhones don't allow pages to go full screen, so the colors fill the window instead.
- The camera needs a browser that allows it (any current phone browser); otherwise the button says so.
- Stylesheet: plain colors before every mixed color, a spacer for boxes that keep their shape where `aspect-ratio` is missing, and classes set by the app instead of `:has()`.
- A browser too old to run the app at all (Internet Explorer, or a device not updated since about 2018) shows a clear note asking for an up-to-date browser, instead of a loading screen that never ends.

`tests/compat.test.mjs` checks all of this, so a change that would break an older browser fails the tests.

## Tests

```
npm test
```

The tests check the color math against published reference values. They also check that every brand file is complete and valid, and that search (including hex and RGB values), recommendations for every job, warnings, cross-brand matches, the CSV import and the offline file list all work. The paint department tests check the roller naps and brushes for every job, the supplies, the quart, gallon and bucket math, how much paint a room takes, and that Which Paint to Buy gives the right paint, finish and primer for each kind of job. The QR code test reads every code back with a separate, by-the-book reader: it checks the layout, the format and version bits and every Reed-Solomon block, then decodes the link and compares it.

## Updating the colors

`tools/fetch/` has the scripts used to download each brand's public color list (`world_fetch.mjs` reads Dulux Australia, Plascon, Sico and Nerolac). A brand with no new download keeps the file it has, so one brand can be added or refreshed on its own. `tools/build-data.mjs` turns those downloads into the files in `data/`:

```
node tools/build-data.mjs <folder-with-downloads>
```

Brands change their websites, so a script may need adjusting before the next refresh. If you change any app files, bump `VERSION` in `sw.js` so installed apps pick up the update.

## Notes

Paint color names, numbers and swatch values belong to their brands. This tool is for helping pick colors at the counter. It is not affiliated with any paint company.
