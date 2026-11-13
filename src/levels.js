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
// ============================================================

export const LEVELS = [
  {
    id: "d01",
    name: "DISTRICT 01 // NEON UNDERCITY",
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
      "##............c.............c...##...####...##",
      "##........L...................L.##...####...##",
      "##################~~~~~bbbb~~~~~##..........##",
      "##################~~~~~bbbb~~~~~##.c..w.....##",
      "##################~~~~~bbbb~~~~~##........c.##",
      "##################~~~~~bbbb~~~~~##......d...##",
      "##################L............L##..###.....##",
      "##################.c..........c.##..###....L##",
      "##################.......d......##..........##",
      "##L............L##...##....##...##.........t##",
      "##.....d..cc....##...##....##...##......##..##",
      "##...##.........##......w.......##......##..##",
      "##...##.........AA......AA......##..........##",
      "##.......d...c..AA......AA......BB....w.....##",
      "##..............AA............w.BB..........##",
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
      "##~~~bb~~~~~~~~...##.....bbb..vvvvL.........##",
      "##~~~bb~~~~~~~~......BBB.bbb..vvvv..........##",
      "##~~~bb~~~~~~~~.c......r.~~~~~~~~~...d....c.##",
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
      { speaker: "DR. LENA VOSS", text: "That's the transit levels behind us. Portal Zero is close now. I can feel the station shaking." },
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
