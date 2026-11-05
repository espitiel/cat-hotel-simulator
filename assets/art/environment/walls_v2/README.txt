CAT HOTEL WALL ARTWORK PATCH v2.1

Place the PNG files in: assets/art/environment/walls_v2/

Four new seamless 36x36 T junctions:
- junction_t_right_smooth_upper.png (right branch, vertical LEFT, horizontal TOP)
- junction_t_left_smooth_upper.png (left branch, vertical RIGHT, horizontal TOP)
- junction_t_right_smooth_lower.png (right branch, vertical LEFT, horizontal BOTTOM)
- junction_t_left_smooth_lower.png (left branch, vertical RIGHT, horizontal BOTTOM)

Two new 36x18 bottom-entrance rounded end caps:
- end_horizontal_bottom_left_rounded_v21.png (FREE end on LEFT; attaches on RIGHT)
- end_horizontal_bottom_right_rounded_v21.png (FREE end on RIGHT; attaches on LEFT)

Use Simple sprite mode, 1 px = 1 scene unit; do NOT stretch.
The T junctions are 36x36 with three 18px-wide arms. Connection edges match the relevant straight wall profiles exactly in RGBA. Bottom cap attachment edges match wall_horizontal_bottom.png exactly.

Do not modify wall colliders, doorway openings, movement controls, floor, or any gameplay scripts. Keep all old assets as backup.
Preview manually in Cocos Creator; this pack only verifies pixel joining, not runtime layering.
