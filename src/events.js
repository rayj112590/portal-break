// ============================================================
//  EVENTS — seasonal content that ships in the files but stays out of the game until its event
//  is switched on here. While an event is off, nothing in the game references it and its models
//  are never even downloaded (models.js only loads eventModels()).
//
//  To launch an event: set `live: true`, build whatever uses it, and deploy.
// ============================================================

export const EVENTS = {
  christmas: {
    name: "CHRISTMAS",
    live: false,          // on hold (the user's call, Nov 17). Flip when the Christmas event launches.
    // assets/models/<name>.glb, loaded only while the event is live
    //   santa    Rodin 3f9e6271, rigged by art/rodin-work/scripts/rig_unarmed.py (Jax's skeleton with
    //            his arm bones moved onto Santa's hanging arms; Gun bone on handR = launcher attach point)
    //   snowman  Rodin 6b0ebb6a, an armored robot snowman, split by split_enemy.py (kind "snowman"):
    //            Snowman > Base (bottom snowball, rolls around X) and Head (turns) > SnowmanBody, HandL,
    //            HandR (floating gauntlets that bob and swipe); 1.8 m, faces +Z, material RodinSnowman
    //   rook_xmas  Rodin 45d18c2c, Iris's Christmas outfit (the CANDY CANE skin in crew.js, which only
    //            exists while this event is live). Rigged by rig_unarmed.py like Santa. Came WITHOUT her
    //            gun and in an A-pose (arms 43 deg out), and Rodin gave it no emissive map (no glow lines):
    //            before launch, pose the arms to hold a weapon and give her one on the Gun bone (handR)
    //   weapon_present  Rodin 5e36083d, the present launcher, made by weapon_prep.py: root WeaponPresent
    //            with its origin at the right-hand grip, Foregrip (left hand) 0.43 m ahead, Muzzle at the
    //            bell; barrel along +Z (glTF), handles down; 0.85 m long; keeps its own red/gold colours
    //   crane_xmas  Rodin b489f5e7, Boulder's Christmas outfit (the YULETIDE skin in crew.js), rigged by
    //            rig_unarmed.py: arms hanging, no gun, so like rook_xmas it needs a weapon on handR before launch
    //   weapon_snowball  Rodin 791e3631, the snowball launcher (weapon_prep.py "snowball"): same contract as
    //            weapon_present, 0.9 m long, Foregrip 0.53 m ahead of the grip, keeps its frosty blue colours
    //   weapon_scythe  Rodin 31baa80d, the Candy Cane scythe, a MELEE weapon (melee_prep.py): root
    //            WeaponScythe with its origin at the lower (right) hand, stored upright (shaft along +Y in
    //            glTF, blade reaching forward +Z), Foregrip 0.43 m up the shaft, Tip at the blade's point;
    //            1.3 m tall. Melee attacks don't exist yet
    //   winter_warden  Rodin 1afe67e6, the Winter Warden (rig_winter_warden.py): the crew's skeleton (arm
    //            bones, Gun on handR, Muzzle), rigged at 1.851 m (scale it up in code), cape rides on the
    //            pelvis (keep the stride short), and a floating crystal "Shard" node on the handR bone.
    //            Keeps its own ice-blue/violet glow. Its fight isn't designed yet
    models: ["santa", "snowman", "rook_xmas", "weapon_present", "crane_xmas", "weapon_snowball", "weapon_scythe", "winter_warden"],
  },
};

export const eventLive = id => !!EVENTS[id]?.live;

export const eventModels = () => Object.values(EVENTS).filter(e => e.live).flatMap(e => e.models);
