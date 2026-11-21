# SOURCES for the torch-ship + course-report design

Labels: **read** = I fetched the page and found the quote in the page text (verified by grep on a saved copy in `dl/` unless noted); **measured** = I ran it (`calc.py`, output `calc_out.txt`); **derived** = arithmetic shown; **cited-2nd** = I only saw it through a secondary page; **fan** = not from the authors or the show.
Confidence: H = quote verified on the primary page; M = verified on a reputable secondary page or only via a summariser; L = secondhand or recollection.
Date of retrieval: 2026-11-15. 1 AU = 149,597,870.7 km; g = 9.80665 m/s^2.

---------------------------------------------------------------------------
## 1. The Expanse: how ships travel, accelerations, Epstein drive

### 1a. Flip-and-burn and continuous thrust (what the show/books depict)
- **Atomic Rockets, Torchships.** https://www.projectrho.com/public_html/rocket/torchships.php (read, H)
  - "So for a brachistochrone you accelerate constantly to the midpoint, flip over (Heinlein calls this a "skew flip", The Expanse calls it a "flip-and-burn"), and decelerate to the destination."
  - On the show's first episode (Canterbury): "In order to shed all their delta V they have to do a "flip-and-burn", flipping the ship over so the thrust opposes their vector." The page then says the crew go in acceleration couches and get anti-acceleration drugs.
  - Label: a reputable fan-run physics reference describing the show. It confirms the term "flip-and-burn" is the show's; it is not a quote of the authors.
- **Joseph Shoer (spacecraft engineer), "Spaceships of the Expanse", 2015-06-12.** https://josephshoer.com/blog/2015/06/spaceships-of-the-expanse/ (read, H for the quotes, M as a source for canon)
  - "accelerating constantly for half the trip and then decelerating constantly for the second half" (describing the Epstein Drive).
  - "the engine also provides "thrust gravity" inside the spaceship" (ships are built as decks "in stacks" above the engine).
  - "a drug cocktail that keeps people alive and functioning when exposed to high gee forces" (the "juice").
  - Label: an engineer's description of the series, not the authors.
- **Wikipedia, The Expanse (novel series).** https://en.wikipedia.org/wiki/The_Expanse_(novel_series) (read via summariser, M)
  - The Epstein Drive is "a fusion engine capable of producing continuous acceleration."; Solomon Epstein "died during a test in deep space"; "Drive" is a novella set before Leviathan Wakes, first in the anthology Edge of Infinity.
- **Wikipedia, Space travel using constant acceleration.** https://en.wikipedia.org/wiki/Space_travel_using_constant_acceleration (read via summariser, M)
  - Ships in the series "make use of constant acceleration drives, which also provide artificial gravity for the occupants." Also: "The spacecraft must flip its orientation halfway through the journey" to rendezvous rather than fly past.

### 1b. Accelerations named
| Value | Where it comes from | Label | Conf. |
|---|---|---|---|
| Rocinante runs 0.3 g for about 3 weeks (Alex Kamal, TV series; episode not identified) | https://www.iandrea.co.uk/sf/displays/dyn_notes : "Somewhere in The Expanse TV series (I forget which episode) Alex Kamal says that the Rocinante can run for 0.3 g for about 3 weeks." | show, **recalled by a fan, no episode** | L |
| Same, but "about 4 weeks" | https://www.iandrea.co.uk/wargames/ScienceFiction/TheExpanse/index.html (read: "0.3 g for about 28 days, or 3 g for 2.8 days" is the author's assumption) | fan | L |
| ~0.3 g as the usual cruise ("most of the book references about constant thrust are at a third of a G") | Reddit thread via search summary only; page itself would not load (SSL error) | fan, unverified | L |
| 1 g, 7 g, 12 g as the RPG's four trip speeds | Green Ronin's Expanse RPG, as quoted at https://www.iandrea.co.uk/wargames/ScienceFiction/TheExpanse/index.html : "257 hours at 0.3 g; 141 hours at 1 g; 53 hours at 7 g; 41 hours at 12 g." | licensed tabletop game, not the novels | M |
| "can accelerate at over 12g's"; "reached velocities of 1800km/s while averaging 5g" (Rocinante) | https://toughsf.blogspot.com/2019/10/the-expanses-epstein-drive.html : the blog cites the Expanse fandom wiki for the 1800 km/s / 5 g figure; the 12 g has no citation | fan (the wiki page itself was blocked, HTTP 402, so not checked) | L |
| "Juice" is for high-g burns | Shoer (above); Atomic Rockets (above, "anti-acceleration drugs") | show/books depicted, described by third parties | M |

I could not get the novel or episode text itself. The 0.3 g, 12 g and the exact "juice" lines are therefore **not verified against the authors' words**. The Expanse fandom wiki and two Reddit mirrors blocked or errored (HTTP 402, Anubis "Access Denied", SSL error); I did not try to get around that.

### 1c. Stated performance of the Epstein drive (novella "Drive")
- Claim: Epstein's solo test runs a burn of about 37 hours and ends near 5 percent of light speed (fan reading: assumed 7 g instrument limit).
  - https://toughsf.blogspot.com/2019/10/the-expanses-epstein-drive.html (read, H for the sentence): "A small spaceship equipped with this engine could reach 5% of the speed of light in 37 hours, averaging over 11g's of acceleration." The blog says "a short story provides some details", so this is **cited-2nd** (blog summarising the novella). Confidence M. The same figures (about 37 hours, just under 5% of c) came back in two other search summaries that I could not open; a Scribd copy of the text exists but is an unofficial upload and I did not use it.
  - **derived**: 0.05 c / 37 h = 14,990 km/s / 133,200 s = 112.5 m/s^2 = **11.5 g average** (`calc_out.txt`, matches the blog).
- Fan estimate, not canon: toughsf puts the Rocinante's total delta-v near 4,000 km/s = 4.72 g-days (**derived**; iandrea uses 4.7 g-days as its default). A 3-week 0.3 g burn is 6.3 g-days (**derived**, `calc_out.txt`); these two fan numbers do not agree with each other.
- Fable wiki lists thrust "6,370,000 N" for the drive (https://fables.gg/worlds/the-expanse-udgir0xhmn58/lore/epstein-drive, search snippet only, fan platform). Do not use.

### 1d. Separate canon from fan estimates (summary)
- Stated by the show/books and corroborated by two independent descriptions: continuous thrust, flip at the midpoint ("flip-and-burn"), thrust gravity, drug cocktail for high g. (M)
- Stated but only recalled: 0.3 g cruise for weeks; 12 g bursts. (L)
- Stated in the novella per one blog: about 37 h to about 5% of c. (M)
- Fan estimates: the 4,000 km/s delta-v, 0.1 g "cruise", 6.37 MN thrust, the 5 g average and 106-minute boost.

---------------------------------------------------------------------------
## 2. Brachistochrone formulas

- **Atomic Rockets, Torchships.** https://www.projectrho.com/public_html/rocket/torchships.php (read, H)
  - Time: "the Brachistochrone equation is T = 2 * sqrt[ D/A ] (ed note: pay attention, it is D DIVIDED by A) where T = transit time (seconds) D = distance (meters) A = acceleration (m/s 2 )".
  - Warning on the page: "Yes, it is supposed to be 2 * sqrt[ D/A ], NOT sqrt[ 2 * D/A ]".
  - Delta-v: "transitDeltaV = 2 * sqrt[ D * A ]" with the note "(ed note: pay attention, it is D MULTIPLIED by A)".
  - Worked example on the page: "A classic brachistochrone orbit, under power using our full delta v, takes a week and carries us 270 million km, 1.8 AU." with "((1,800,000 / 2)^2) / 3 = D" = 270,000,000 km (a = 3 m/s^2, delta-v 1,800,000 m/s).
  - **measured** (`calc.py`): D = (1.8e6/2)^2/3 = 270.0 million km = 1.805 AU; T = dv/a = 6.94 days. Matches "a week".
  - Derivation: accelerate half the way, d/2 = a (T/2)^2 / 2 gives T = 2 sqrt(D/a); peak speed v = a T/2 = sqrt(D a); delta-v = 2 v = 2 sqrt(D a). (derived)
- **Worked example, 1 AU at 1 g** (**measured**, `calc_out.txt`): T = 2.859 d (68.6 h), delta-v = 2,422 km/s, peak speed 1,211 km/s.
- Secondary check: an open-source calculator page gives "t = 2 × sqrt(d / a)" and peak speed "a × (t / 2)" (https://superglobalcalculator.pages.dev/calculators/physics/brachistochrone-trajectory/, search snippet, L). Not needed.
- Caveat to state in the docs: both formulas are straight-line, static endpoints, no Sun gravity, no body motion, and non-relativistic. Relativistic effects are tiny at the design range: at 10 g over 1 AU, peak speed 3,830 km/s = 1.3 percent of c (**derived** from `calc_out.txt`).

---------------------------------------------------------------------------
## 3. How empty the asteroid belt is; who crossed it; Kuiper belt extent

- **NASA (JPL Dawn FAQ, Marc Rayman), average spacing.** https://science.nasa.gov/mission/dawn/faq/ (read, H)
  - "the average distance between individual asteroids 1 mile in diameter or larger would be about 1.9 million miles. That is nearly 8 times the distance between Earth and the Moon."
  - "the asteroid belt is mostly empty space, and the asteroids orbit the Sun largely in isolation."
  - Convert: 1.9 million miles = 3.06 million km (derived). It is an assumption-based estimate for objects larger than 1 mile.
- **NASA asteroid facts.** https://science.nasa.gov/solar-system/asteroids/facts/ (read via summariser, M): "The belt is estimated to contain between 1.1 and 1.9 million asteroids larger than 1 kilometer"; "The total mass of all the asteroids combined is less than that of Earth's Moon." (the page gives no spacing)
- **Astronomy magazine (Ask Astro, Dec 2024).** https://www.astronomy.com/science/how-do-spacecraft-avoid-collisions-in-the-asteroid-belt/ (read, H): "the average distance between asteroids is about 600,000 miles (965,600 km), though this separation distance is a simple average and does not take into account asteroid families". It says the Voyagers, the Pioneers, Galileo, Cassini-Huygens and New Horizons passed through. Not NASA or ESA; a magazine.
- **Spread of published values (be honest in the docs):** 0.6 to 1.1 million km (Astronomy citing a NASA scientist for a million objects) up to about 3 million km (NASA Dawn, objects of 1 mile+). I found no ESA page stating a spacing; the ESA asteroid page (https://www.esa.int/Science_Exploration/Space_Science/Asteroids) says "over a million asteroids" but gives no spacing.
- **Which spacecraft crossed.** NASA Basics of Space Flight ch. 1: https://science.nasa.gov/learn/basics-of-space-flight/chapter1-3/ (read, H): "Various spacecraft have crossed the main asteroid belt en route to their destinations, including: Pioneer 10 and Pioneer 11, Voyagers 1 and 2, Ulysses, Galileo (crossed twice), Cassini, New Horizons and Juno."
- **First crossing, and any hazard.** NASA history, https://www.nasa.gov/history/50-years-ago-pioneer-10-launches-to-explore-jupiter (read, H): "it completed the first crossing of the Asteroid Belt." and "After seven months, on Feb. 15, 1973, Pioneer 10 emerged from the asteroid belt unscathed." Before the flight it was uncertain it would traverse it safely (summariser, M).
  - Wikipedia, Asteroid belt, https://en.wikipedia.org/wiki/Asteroid_belt (read, H): "it has since been safely traversed by multiple spacecraft without incident"; "the odds of a probe running into an asteroid are estimated at less than 1 in 1 billion." (the Wikipedia date for entry is 16 July 1972, NASA says July 15: sources differ by a day.)
  - **I found no spacecraft that met an asteroid hazard in the main belt.** Cassini measured plasma and fine dust there (Wikipedia). Pioneer micro-meteoroid hits were few (secondhand, Scientific American via a search summary; not opened).
- **Kuiper belt extent.** NASA, https://science.nasa.gov/solar-system/kuiper-belt/facts/ (read, H): "Its inner edge begins at the orbit of Neptune, at about 30 AU from the Sun." and "The inner, main region of the Kuiper Belt ends around 50 AU from the Sun." and the scattered disk "continues outward to nearly 1,000 AU".

---------------------------------------------------------------------------
## 4. Main-belt boundaries

- Wikipedia, Asteroid belt, https://en.wikipedia.org/wiki/Asteroid_belt (read, H): the "core" region "lies between the strong 4:1 and 2:1 Kirkwood gaps at 2.06 and 3.27 AU, and at orbital eccentricities less than roughly 0.33, along with orbital inclinations below about 20°." It adds that, as of 2006, this core held 93 percent of numbered minor planets.
- Wikipedia, Kirkwood gap, https://en.wikipedia.org/wiki/Kirkwood_gap (read via summariser, M): 4:1 at 2.065 AU, 3:1 at 2.502, 5:2 at 2.825, 7:3 at 2.958, 2:1 at **3.279 AU** (so 3.27 vs 3.28 is rounding). The page calls the 4:1 gap the inner boundary of Zone I and shows 3.28 AU for the 2:1 in one table.
- NASA gives only centres: "centered at 2.8 AU" (inner belt) and "centered at 3.2 au" (outer) at https://science.nasa.gov/learn/basics-of-space-flight/chapter1-3/ (summariser, M). **No NASA page with 2.06 and 3.27 was found**; the numbers come from Wikipedia. Conf. H for the numbers, M for them being "the usual" boundaries.
- Also: few asteroids beyond 4.2 AU until Jupiter (Wikipedia), so the outer limit is soft.

---------------------------------------------------------------------------
## 5. Closest approach to the Sun; flux scaling; keep-out distance

- **Guinness World Records.** https://www.guinnessworldrecords.com/world-records/sun-closest-approach-by-spacecraft (read, H): "The closest approach to the Sun by a spacecraft is 6,167,590 km (3,832,362 mi), which was achieved by the Parker Solar Probe at 11:53:48 UTC on 24 December 2024." Speed 192.22 km/s. **This distance is from the solar surface** (NASA/APL: "3.8 million miles (about 6.1 million kilometers) from the solar surface", https://www.jhuapl.edu/news/news-releases/250716-parker-closest-sun-images, summariser, M).
- **Wikipedia, Parker Solar Probe** https://en.wikipedia.org/wiki/Parker_Solar_Probe (summariser, M): infobox "0.046 AU (6.9 million km; 4.3 million mi; 9.86 R☉)"; the lead says the final orbit comes within "9.86 solar radii ... from the center of the Sun". The page gives "6.16 million km (3.83 million miles) from the surface" for the Dec 2024 pass.
- **NASA mission page** https://science.nasa.gov/mission/parker-solar-probe/ (read, H): "At its closest approach, the spacecraft will come within about 3.9 million miles (6.2 million kilometers) of the Sun." and the shield "can withstand temperatures reaching nearly 2,500 degrees Fahrenheit (1,377 Celsius)" (summariser quote, M).
- **Derived, in solar radii and AU** (R_sun = 695,700 km, my assumed constant; `calc_out.txt`):
  - 9.86 R_sun = 6,859,602 km = 0.04585 AU from the Sun's centre.
  - Dec 2024: 6,167,590 km altitude + 695,700 km = 6,863,290 km = 9.865 R_sun = 0.04588 AU from the centre.
- **Flux scaling:** inverse square, S(r) = S_1AU / r^2 (r in AU; derived from spherical spreading, not cited). NASA's value at 1 AU: "1361.6 ± 0.3 Wm-2 for the 2019 solar minimum" (TSIS-1), varying about 0.1 percent over the cycle (https://earth.gsfc.nasa.gov/climate/projects/solar-irradiance/science, summariser, M; the page does not itself say "at 1 AU").
  - Measured table (`calc_out.txt`, S_1AU = 1361 W/m2): 0.387 AU (Mercury mean distance) 9,087 W/m2 = 6.7x; 0.3 AU 11.1x; 0.2 AU 25x; 0.1 AU 100x; 0.05 AU 400x; Parker 0.04588 AU = 475x = about 647 kW/m2. Parker's "475 times" appears as a Wikipedia-mirror statement ("approximately 650 kW/m2, or 475 times the intensity at Earth orbit", search snippet, L); my derived 475.1 reproduces it.
- **Keep-out distance (assumption, label as design choice):** Parker survives 475x only behind a 11.4 cm carbon-composite shield (Spaceflight Now, via search snippet, L), with the spacecraft behind it at about 30 C (NASA, snippet, L). A crewed or unshielded ship has no such protection, so the design default should be well outside 0.046 AU. Suggestion (assumed): default 0.05 AU hard limit = 400x flux (record-setting probe territory), warning below about 0.1 AU (100x). Mercury's mean distance 0.387 AU gives 6.7x flux and is a natural "inner-planet" comparison.

---------------------------------------------------------------------------
## 6. Sustained acceleration crews tolerate

- **NASA OCHMO technical brief OCHMO-TB-024 Rev D (NASA-STD-3001 Vol. 2 Rev D)** https://www.nasa.gov/sites/default/files/atoms/files/acceleration_technical_brief_ochmo.pdf (read from the downloaded PDF text, H):
  - Eyeballs in/out (Ax): "+2g tolerable for at least 24 hours" (19.6 to 29.4 m/s^2, "difficulty in spatial orientation"); "4g tolerable up to at least 60 minutes" (29.4 to 58.8 m/s^2: tightness in chest, loss of peripheral vision, difficulty breathing and speaking).
  - 58.8 to 88.3 m/s^2 (6 to 9 g): arterial oxygen saturation can fall below 85 percent; "body, legs, and arms cannot be lifted at +8g".
  - Eyeballs down (Az): 39.2 to 58.8 m/s^2: "Total loss of vision (blackout) after about 5 seconds"; above 58.8 m/s^2 (6 g): "Protection is needed to preserve health".
  - Requirement [V2 6064]: the system "shall limit the magnitude, direction, and duration of crew exposure to sustained (> 0.5 seconds) translational acceleration by staying below the limits in Figures 6.5-(2-7) and Tables 6.5-(1-6)". Shuttle loads were limited to 3.0 g; ascent loading peaks about 3.8 Gx.
- **NASA/TM-20205008196, Pattarini, "Artemis Sustained Translational Acceleration Limits"** https://www.nasa.gov/wp-content/uploads/2023/03/tm-20205008196.pdf (read, H): Table 1 / Fig. 4 (+Gz, seated or standing): for exposures of 900 s or more the limit is 4.91 m/s^2 (0.5 g) for most postures and **1.57 m/s^2 (0.16 g) for standing without a lower-body compression garment**; short exposures allow up to 9.81 m/s^2 (1 g) for a few minutes (seated with garment up to 19.6 m/s^2 for 0.5 s). Caveat I found while extracting the text: the table has 13 values under 14 column headings, so the long-duration column mapping is my reading. Also: "Current sustained translational acceleration requirements in NASA-STD-3001 are applicable only to crewmembers in a seated posture".
- **Older data, secondhand:** yarchive "g tolerance" https://www.yarchive.net/space/science/g_tolerance.html (read via summariser, L): Spencer citing NASA's Bioastronautics Data Book: "can handle 20G for a few seconds, 10G for a minute, and 5G for many minutes" for a healthy adult lying on the back (a posture, not a cited table).
- **How to use for defaults (assumed):** the 0.01 to 10 g range spans three regimes. Up to about 0.3 g: comfortable (and the books' cruise). To 2 g: tolerable for 24 h (NASA, Ax). 4 g: about an hour. 6 g and up: need protection (the Expanse "juice" is the fiction's answer). A 10 g trip lasts hours (1 AU at 10 g = 21.7 h) which exceeds NASA's 1-hour mark at 4 g and the minutes-scale limits for 6 to 10 g, so crews cannot survive it without the fictional drug (derived from `calc_out.txt` plus NASA text).
- NOT FOUND: an official NASA table of g versus duration for a whole trip. NASA's current limits are requirements for spacecraft design, not a medical tolerance chart.

---------------------------------------------------------------------------
## 7. "Expanse travel time" calculators and example outputs

1. **Ian Andrea, "The Expanse Role Playing Game" travel calculators** https://www.iandrea.co.uk/wargames/ScienceFiction/TheExpanse/index.html and notes https://www.iandrea.co.uk/sf/displays/dyn_notes (read, H; fan, spreadsheet plus online "Burn" and "Solar system 2351" tools).
   - Model (quotes): "Travel times are calculated assuming the same acceleration and burn times for both acceleration and deceleration, with an intermediate coast, if that is necessary to reach the destination." The no-coast version "assumes a burn-flip-burn". "All orbits are assumed circular." Propellant: "inverse relationship between acceleration and burn duration".
   - Example outputs: Earth to Jupiter (4.2 au): "257 hours at 0.3 g; 141 hours at 1 g; 53 hours at 7 g; 41 hours at 12 g." Earth to Pluto (38.53 au): "32.4 days at 0.3 g (35% propellant); 17.7 days at 1 g (63% propellant); 7.6 days at 7 g (100% propellant); 6.8 days at 12 g (100% propellant)."
   - **measured** (`calc_out.txt`): pure T = 2 sqrt(D/a) with D = 4.2 AU gives 256.7 h (0.3 g), 140.6 h (1 g), 53.2 h (7 g), 40.6 h (12 g); with D = 38.53 AU gives 32.40 d (0.3 g) and 17.75 d (1 g). These equal the published values, so the calculator model equals the plain brachistochrone with a static distance, at least when the burn does not use all the propellant. The 7 g and 12 g Pluto rows differ because of the propellant limit and coasting. This is the best published comparison set.
2. **Kon-Tiki (Russian), "The Expanse: космические путешествия 2.0", AtH, 2021-03-09** https://www.pmk.arbinada.com/category/01543.html (read, M; credits fan-forum posts by Steve Swiss and Chris Hardy): constant 1 g (9.80665 m/s^2) with a midpoint flip, closest approach distances, no orbital manoeuvre or fuel time. Mars at closest 65 million km: "1d 7h 58m 5s" without deceleration, "1d 21h 13m 1s" decelerating halfway.
   - **measured/derived**: 2 sqrt(6.5e10 m / 9.80665) = 162,826 s = 1 d 21 h 14 m. Matches the published 1d 21h 13m 1s to within a minute (their no-decel figure is sqrt(2D/a) = 1.33 d).
3. **Omni Calculator, "Space travel"** https://www.omnicalculator.com/physics/space-travel (read, M): not Expanse-specific. Relativistic constant proper acceleration with an optional midpoint flip, and a classical mode with "Stop: d = 1/4 a t^2, max v = 1/2 a t". Example outputs are interstellar (1 g to Andromeda, about 15 yr ship time), so useless for a Mars comparison, but it confirms the formula and gives the relativistic correction.
4. **Not Expanse:** the sksat "solar-line" project (https://sksat.github.io/solar-line/...) is about a Japanese anime, not The Expanse; I excluded it.
- **Reference numbers I computed to compare against later** (all straight-line, static distance, 2 sqrt(D/a), `calc_out.txt`; the endpoint distance is a design choice, so state it):
  - Earth to Mars, distance on 2026-11-12 from the repo's own catalog = 1.3413 AU: 1 g = 3.311 d (79.5 h), delta-v 2,805 km/s; 0.3 g = 6.045 d; 0.1 g = 10.47 d; 3 g = 1.912 d; 10 g = 1.047 d.
  - Earth to Mars at closest 0.3727 AU: 1 g = 1.745 d (41.9 h). At greatest 2.67 AU: 1 g = 4.672 d.
  - 1 AU: 0.1 g 9.04 d; 0.3 g 5.22 d; 1 g 2.859 d; 3 g 1.651 d; 10 g 0.904 d.
  - 30 AU (Neptune scale): 1 g 15.66 d. (Atomic Rockets has no worked table for this; I computed it.)
- Caveat: the real planner must also include Sun gravity and body motion; these numbers are the zero-gravity, static-target floor. A torch trip is not a straight line, and with a = 0.01 g (T = 2 sqrt(D/a)) the Sun's pull (about 6 mm/s^2 = 0.0006 g at 1 AU) is not negligible against the thrust at the low end (0.01 g = 98 mm/s^2): derived, 1.327e20 / (1.496e11)^2 = 5.93e-3 m/s^2.

---------------------------------------------------------------------------
## Could not source / unresolved
- Verbatim novel/episode text for: Rocinante 0.3 g cruise, "12 g" burn, the "juice" lines, Epstein's flight in "Drive" (37 h / 5 percent of c). Fan wiki and mirrors were blocked; only secondary reports. Treat as L to M.
- Any NASA or ESA statement of belt spacing that is the same number twice: sources conflict (0.6 to 3 million km). No ESA spacing page found.
- A NASA page that states 2.06 and 3.27 AU as belt edges (only Wikipedia).
- An official NASA g-versus-duration tolerance chart for multi-hour exposure (the only hour-scale data are the Ax statements in OCHMO-TB-024: 2 g for 24 h, 4 g for 60 min).
- Any published Expanse calculator output for Earth to Mars other than the Kon-Tiki 65 million km table (closest distance only; the repo planner needs a dated one).
- Parker Solar Probe heat-shield figures (2,500 F, 475x) are quoted from NASA and mirrors; I did not open the primary APL/NASA technical papers.
