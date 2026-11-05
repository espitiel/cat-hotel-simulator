CAT HOTEL SIMULATOR — GLOSSY WALL ASSET PACK V2

This pack replaces ONLY the wall visuals. Keep existing scenes, wall collision nodes, and gameplay scripts unchanged.

INSTALL
1. Extract PNG files into: assets/art/environment/walls_v2/
2. Do not delete or overwrite any old wall assets.
3. First test ONE top-left exterior corner with matching horizontal-top and vertical-left sprites.
4. After verifying fit, ask Codex to integrate the remaining wall parts, preserving original collision geometry and doorway gaps.

DIMENSIONS (Cocos 1 sprite pixel = 1 scene unit when testing)
- Straight wall strips: 256x18 or 18x256 — TILE, don't stretch.
- Four rounded 90-degree corners: 36x36 — SIMPLE, do not stretch. Each rounded corner already contains 18px arms entering it.
- Doorway end caps: 36x18 or 18x36 — SIMPLE.
- T and cross junctions: 36x36 — SIMPLE.
- Position strips so their edges TOUCH corner/junction sprites; avoid double-rendering the intersection.
- Horizontal top/bottom and vertical left/right are intentionally different facing variants to keep the caramel highlights consistent around the frame.

IMPORTANT
The rounded corner art is 36x36, not 18x18. Start straight strip visuals after the 36x36 corner footprint so the corner does not overlap them. Do NOT modify the original 18-unit-thick collision wall geometry or hotel layout.
At doorways, preserve existing walkable gaps.
If the corners cannot be integrated without overlaps, stop and report before forcing placement.
