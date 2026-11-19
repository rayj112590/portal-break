// ============================================================
//  DISTRICT DATA
//  Legend:
//   #  building (solid in both phases)
//   c  crate / cover (blocks walking + bullets)
//   A  holo barrier — solid in CITY, open in BREACH
//   B  breach crystal — solid in BREACH, open in CITY
//   ~  void (nobody walks, drones fly over)
//   b  phase bridge — void in CITY, walkway in BREACH
//   T  city terminal (hack in CITY)    R  rift node (hack in BREACH)
//   X  exit portal    P  player start   L  street lamp
//   v  glass floor — walkway in CITY, void in BREACH (District 02+)
//   d  drone (city)   t  turret (city)  w  wraith (breach)
//   r  rift turret (breach)
//   h  coolant vent — blasts in waves in the CITY, dormant in the BREACH (District 04+)
//   1 2 3  security gate — solid in BOTH worlds until that many locks are hacked (District 03+)
//   o  hypersleep pod (scenery, like a crate)   O  crew pod, numbered by the level's `pods` list
//      (District 01's hypersleep chamber; Pod 01 is Jax's own, he wakes up in it)
//   g  security glass — solid in both worlds; a lock behind it needs Rook's remote hack
//   k  crew ID card for the level's `card` crew member (District 03: Rook, District 04: Crane).
//      Take it to the crew terminal to wake them (no terminal in the level = wakes on pickup)
//   K  crew terminal: a console set into the wall (like "U", floor in front, south side
//      preferred). Stand at it with the ID card and that sleeper's pod thaws.
//   U  revive chamber: a glass tube set into the wall (put it in a wall tile with floor in
//      front, south side preferred so the camera sees it). One per district.
//   +  revive cell: carried between districts (max 3). At a revive chamber it brings back
//      a crew member who went down.
//   m  heavy crate: cover like "c", but Crane can lift and throw it (it smashes, may drop health)
//   $  supply crate (gold straps): Crane throws it and it breaks open with the next item of the
//      level's `loot` list (map order: left to right, top to bottom)
//  Optional level fields: `needs: "rook"` = this district can't be finished without that
//  crew member, so they're brought along and selected when the district starts.
//  `loot: ["scatter", "gift"]` = what the supply crates hold: scatter / rail (pickup weapons),
//  gift, cell (revive cell), hp, energy. Missing entries = a random gift, health or energy.
// ============================================================

export const LEVELS = [
  {
    id: "d01",
    name: "DISTRICT 01 // NEON UNDERCITY",
    pods: ["03", "07", "11", "01"],
    briefing: [
      "The emergency portal is sealed behind four security locks.",
      "Two terminals live in the city. Two rift nodes only exist in the Breach.",
      "Press SHIFT to phase between worlds. Walls in one world are doorways in the other.",
    ],
    map: [
      "##############################################",
      "##############################################",
      "##L............................L##L........L##",
      "##..T.......c.......d.....c..t..##......X...##",
      "##......##......##..............BB..........##",
      "##......##......##..............BB.......d..##",
      "##......##..B...................BB..........##",
      "##..........B.........###.......##..........##",
      "##...d............w...###.......##...####...##",
      "##.+..........c.............c...##...####...##",
      "##........L...................L.##...####...##",
      "##################~~~~~bbbb~~~~~##..........##",
      "##################~~~~~bbbb~~~~~##.c..w.....##",
      "##################~~~~~bbbb~~~~~##........c.##",
      "##################~~~~~bbbb~~~~~##......d...##",
      "##################L............L##..###.....##",
      "##################.c..........c.##..###....L##",
      "########U#########.......d......##..........##",
      "##L............L##...##....##...##.........t##",
      "##.o.o.o.o.o.o..##...##....##...##......##..##",
      "##..............##......w.......##......##..##",
      "##...O...O...O..AA......AA......##..........##",
      "##........d.....AA......AA......BB....w.....##",
      "##..O...........AA............w.BB..........##",
      "##..P.....###...##...##....##...BB..c.......##",
      "##........###...##...##....##...##......R...##",
      "##..c........T..##.w............##........w.##",
      "##.......L......##L.....c....R.t##L.........##",
      "##############################################",
      "##############################################",
    ],
    storyAfter: [
      { speaker: "DR. LENA VOSS", text: "You made it through. The portal dropped you into the old transit levels. Nobody's been down here since the breach." },
      { speaker: "DR. LENA VOSS", text: "Careful, Calder. Half these platforms only exist in one world. Glass walkways in the City, rift bridges in the Breach. Never shift standing on something that isn't there." },
      { speaker: "UNKNOWN TRANSMISSION", text: "Turn back, Calder. What's waiting at Portal Zero remembers you." },
    ],
  },
  {
    id: "d02",
    name: "DISTRICT 02 // DROWNED TRANSIT",
    briefing: [
      "Broken transit platforms float over the abyss. Four locks again: two terminals, two rift nodes.",
      "NEW: glass walkways exist only in the CITY. Rift bridges exist only in the BREACH.",
      "Cross on glass, stop on solid ground, SHIFT, cross the bridge. Red rift turrets guard the Breach.",
    ],
    legendExtra: "<i class='sw glass'></i> NEW: glass walkways exist only in the CITY &nbsp;·&nbsp; <i class='sw breach'></i> rift turrets",
    map: [
      "##############################################",
      "##############################################",
      "##.........L~~~~~~~~.......c.L~~~~.........L##",
      "##.R..##....~~~~~~~~..d.......~~~~.c........##",
      "##....##.w..~~~~~~~~....##....~~~~.......X..##",
      "##..........vvv..bbb....##....~~~~...##.....##",
      "##..........vvv..bbb........T.~~~~...##.....##",
      "##.c........~~~~~~~~..t.......~~~~..........##",
      "##........r.~~~~~~~~..........~~~~.....d....##",
      "##L.........~~~~~~~~~bb~~~~~~~~~~~........c.##",
      "##~~~bb~~~~~~~~~~~~~~bb~~~~~~~~~~~L.........##",
      "##~~~bb~~~~~~~~L.........~~~~~~~~~~~~~bb~~~~##",
      "##~~~bb~~~~~~~~.w....d.c.~~~~~~~~~~~~~bb~~~~##",
      "##~~~bb~~~~~~~~...##.....~~~~~~~~~~~~~bb~~~~##",
      "##~~~bb~~~~~~~~...U#.....bbb..vvvvL.........##",
      "##~~~bb~~~~~~~~......BBB.bbb..vvvv..........##",
      "##~~~bb~~~~~~~~.c......r.~~~~~~~~~...d....c+##",
      "##~~~bb~~~~~~~~.........L~~~~~~~~~..........##",
      "##~~~bb~~~~~~~~~~~~~vv~~~~~~~~~~~~....###...##",
      "##~~~bb~~~~~~~~~~~~~vv~~~~~~~~~~~~....###...##",
      "##L.........~~~~~~L.......t.~~~~~~.w........##",
      "##.......c..~~~~~~.....d.c..~~~~~~.......R..##",
      "##...##.....~~~~~~....A.....~~~~~~..........##",
      "##...##.....vvvvvv....A.....~~~~~~..........##",
      "##..........vvvvvv.......T..~~~~~~......AA..##",
      "##.P........~~~~~~..........vvvvvv......AA..##",
      "##.......c..~~~~~~..c.......vvvvvv....w...r.##",
      "##.........L~~~~~~.........L~~~~~~..c......L##",
      "##############################################",
      "##############################################",
    ],
    storyAfter: [
      { speaker: "DR. LENA VOSS", text: "That's the transit levels behind us. Next is cryo administration. Station security is still running there." },
      { speaker: "DR. LENA VOSS", text: "Laser gates, Calder. Phasing won't get you through them. They're wired to the locks. Crack a lock and it reroutes power away from a gate." },
    ],
  },
  {
    id: "d03",
    name: "DISTRICT 03 // CRYO ADMIN",
    briefing: [
      "Station security still guards the cryo wing. Four locks, four sealed zones.",
      "NEW: orange laser gates block BOTH worlds. Each lock you crack drops the next gate: 1, then 2, then 3.",
      "One terminal is sealed inside a holo-barrier box. Phase in through the wall, then shift back to hack it.",
    ],
    card: "rook",
    legendExtra: "<i class='sw gate'></i> NEW: security gates open as you crack locks (gate 1 after 1 lock, gate 2 after 2...) &nbsp;·&nbsp; <i class='sw card'></i> a crew ID card is somewhere in here: take it to the crew terminal",
    map: [
      "##############################################",
      "##################################K#U#########",
      "##L......L~~~~~......L##L...A...A........k.L##",
      "##..X.....~~~~~.......##....A.T.A.........r.##",
      "##........vvvvv..d.c..##....A...A........c..##",
      "##.....w..vvvvv.......33....A...A.....d.....##",
      "##........~~~~~.......33....AAAAA...........##",
      "##.##.....~~~~~.##....33...w....L....c......##",
      "##.##.w...~~~~~.##....##..........##........##",
      "##.....c..~~~~~.......##..B.......##......t.##",
      "##........bbbbb....t..##..B...w.........##..##",
      "##...R....bbbbb.w.....##..B......c......##..##",
      "##......r.~~~~~...c...##..B...c......d......##",
      "##Lc......~~~~~......L##L..................L##",
      "#####################################222######",
      "#####################################222######",
      "##L.................L.##L.....~~~~L........L##",
      "##..........c.......t.##...c..~~~~.......r..##",
      "##....T........##.....##......vvvv..........##",
      "##.............##.d...##......vvvv..........##",
      "##.....c..............##...d..~~~~.c........##",
      "##.......##..L........11......~~~~......R...##",
      "##.......##...........11......~~~~..c.....w.##",
      "##....d............c..11..##..~~~~..........##",
      "##.............c......##..##..bbbb..........##",
      "##..P............w....##......bbbb....w.....##",
      "##.........c..........##....t.~~~~.......c+.##",
      "##L.................L.##L.....~~~~.........L##",
      "##############################################",
      "##############################################",
    ],
    storyAfter: [
      { speaker: "DR. LENA VOSS", text: "Security's down. Next is the coolant works, the plant that keeps every pod on this station frozen. Including the one you climbed out of." },
      { speaker: "DR. LENA VOSS", text: "The vents fire in waves. In the Breach they're dead, but the Breach is eating you too." },
    ],
  },
  {
    id: "d04",
    name: "DISTRICT 04 // COOLANT WORKS",
    briefing: [
      "The plant that keeps the station's hypersleep pods frozen. Four locks: two terminals, two rift nodes.",
      "NEW: coolant vents blast in waves in the CITY. Watch the grates glow, then cross in the gap, or DASH through.",
      "In the BREACH the vents are dead, but your phase energy drains. Shift across, then shift back before you run dry.",
    ],
    card: "crane",
    loot: ["scatter", "gift"],
    legendExtra: "<i class='sw vent'></i> NEW: coolant vents fire in the CITY only (glowing grate = about to blast) &nbsp;·&nbsp; <i class='sw card'></i> a crew ID card is somewhere in here: take it to the crew terminal",
    map: [
      "##############################################",
      "##############################################",
      "##L......##L..######m.k.$#####.L~~~~.hh....L##",
      "##.....c.##...######...d.#####..bbbb.hh.....##",
      "##..T....##...######.....#####..bbbb.hh..R..##",
      "##.....d.##...######....m#####..~~~~.hh...r.##",
      "##.......##...##U##K..........d.~~~~.hh.....##",
      "##.c............................vvvv.hh.....##",
      "##...........L..........L.......vvvv.hh..X..##",
      "##...##......hhhhhhhhhhhhhhhhhhh~~~~.hht....##",
      "##...##......hhhhhhhthhhhhhhhhhhhh..........##",
      "##...........hhh+chhhhhhhhhhh..hhh.....##...##",
      "##......c....hhh..hhhhhhrhhhh.chhh.....##...##",
      "##L..........hhhhhhhh...hhhhhhhhhh.......w..##",
      "##....w......hhhhhhhh.R.hhhhhhhhhh.........L##",
      "##...........hhhhhhhh...hh.chhhhhh..........##",
      "##...........hhhhhhhhhhhhh..hhhhhw..........##",
      "##hhhhhhhhhh.hhhhhhhhhhhhhhhhhh..h..........##",
      "##hhhhhhhhhh.hhhhh..hhhhhhhdhhh..h..........##",
      "##...........hwhhh.chhhhhhhhhhhhhh..........##",
      "##.....##....hhhhhhhhhhhhhhhhhhhhh......d..L##",
      "##.....##...............L.........L.AAAAAAA.##",
      "##...c...d..$..####...........hhhhh.A.....A.##",
      "##.........c...####.......####hhhhh.A.....A.##",
      "##.......##..m.####.hhhhhh####...t..A.....A.##",
      "##..P....##....####.hhhhhh####......A..T..A.##",
      "##......c...w..####.hhwhhh####......A.....A.##",
      "##L..........L.####.hhhhhh####.....LA.....A.##",
      "##############################################",
      "##############################################",
    ],
    storyAfter: [
      { speaker: "DR. LENA VOSS", text: "Coolant's stable. Portal Zero is just ahead, Calder. The last working portal on this station, and our way out." },
      { speaker: "UNKNOWN TRANSMISSION", text: "Portal Zero is sealed, Calder. Whatever opens it won't be you." },
    ],
  },
  {
    id: "d05",
    name: "DISTRICT 05 // PORTAL ZERO",
    needs: "rook",
    thumbFocus: [6, 9],
    // Boss stage: all 3 locks open the portal room (gate 3), where the Warden waits in front of the
    // portal. The exit only powers up once he's down. at = his spawn [row, col]; arena = the room he
    // stays in [row0, col0, row1, col1]; checkpoint = where you respawn if the whole crew goes down.
    boss: { type: "warden", at: [4, 23], arena: [2, 12, 8, 34], checkpoint: [10, 31.5] },
    briefing: [
      "The last working portal on the station. Three locks power the portal room.",
      "One lock sits in a sealed glass vault. Not even the Breach gets you in there: Iris Rook's REMOTE HACK reaches through the glass.",
      "Something big is guarding the portal. Station security calls it the WARDEN.",
    ],
    loot: ["rail", "cell"],
    legendExtra: "<i class='sw glass2'></i> sealed glass vault (remote hack only) &nbsp; <i class='sw boss'></i> THE WARDEN: phase out to hide, hack him, throw crates at him",
    map: [
      "##############################################",
      "##############################################",
      "##L...+...L#L..........X..........L#L......L##",
      "##.ggggggg.#...m.................m.#.c$...d.##",
      "##.g.....g.#......#.........#......#.mc...R.##",
      "##.g..T..g.#.AA.................AA.#........##",
      "##.g.....g.#........m.....m........#....t...##",
      "##.ggggggg.#....c.............c....#.....r..##",
      "##.........#.m...................m.#........##",
      "##.........#############U######33######11#####",
      "##L........#L....................L#........L##",
      "##.........#......................#.........##",
      "##....d....#....................t.#.........##",
      "##...c.....#......................#........+##",
      "##.........#...m.............m....#.....w...##",
      "##..........................................##",
      "##......................d...................##",
      "##..w......#.......m.....c........#....c....##",
      "##.........#......................#.........##",
      "##L........#L..t.................L#........L##",
      "##.........##########....##########.........##",
      "##..................L....L..................##",
      "##..........##...d........c...##............##",
      "##....T.....##................##............##",
      "##.c....dc..................w...............##",
      "##.......c............P............c........##",
      "##.......c......$.....................d.....##",
      "##L..........L..................L..........L##",
      "##############################################",
      "##############################################",
    ],
    storyAfter: [
      { speaker: "IRIS ROOK", text: "There's one pod in that chamber nobody's opened, Calder. Pod 03. Its card was pulled, and whoever took it went through this portal." },
      { speaker: "DR. LENA VOSS", text: "Then we follow it. Every card you bring back is another pair of hands. Pod 03 is reading something... bright." },
      { speaker: "NARRATOR", text: "To be continued in the next build." },
    ],
  },
];

export const STORY = [
  { speaker: "STATION COMPUTER", text: "Wake up, explorer. Life support failing. Your identity could not be verified." },
  { speaker: "UNKNOWN TRANSMISSION", text: "Personnel record found: JAX CALDER. Status: TERMINATED. ...You should be dead." },
  { speaker: "DR. LENA VOSS", text: "Ignore that, Calder. The station is tearing between two realities. Your suit can ride the tear. Use it." },
  { speaker: "DR. LENA VOSS", text: "Phase into the Breach and the city's walls fall away. Just don't stay too long. It eats you." },
];
