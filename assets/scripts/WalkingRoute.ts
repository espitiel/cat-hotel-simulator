export interface Point { x: number; y: number; }
export interface Bounds { left: number; right: number; bottom: number; top: number; }

/** Test the full segment against the interior of each footprint-expanded obstacle. */
export function clearSegment(from: Point, to: Point, obstacles: Bounds[]): boolean {
    return !obstacles.some(box => {
        let enter = 0;
        let exit = 1;
        for (const [start, end, low, high] of [
            [from.x, to.x, box.left, box.right],
            [from.y, to.y, box.bottom, box.top],
        ]) {
            const delta = end - start;
            if (delta === 0) {
                if (start <= low || start >= high) return false;
                continue;
            }
            const a = (low - start) / delta;
            const b = (high - start) / delta;
            enter = Math.max(enter, Math.min(a, b));
            exit = Math.min(exit, Math.max(a, b));
            if (enter >= exit) return false;
        }
        return enter < exit;
    });
}

/** A small visibility graph through the corners of the existing obstacles. */
export function findWalkingRoute(start: Point, goal: Point, limits: Bounds, obstacles: Bounds[]): Point[] | null {
    const usable = (p: Point) => p.x >= limits.left && p.x <= limits.right &&
        p.y >= limits.bottom && p.y <= limits.top && clearSegment(p, p, obstacles);
    if (!usable(start) || !usable(goal)) return null;
    const nodes = [start, goal];
    for (const box of obstacles) {
        for (const x of [box.left - 0.25, box.right + 0.25]) {
            for (const y of [box.bottom - 0.25, box.top + 0.25]) {
                if (usable({ x, y })) nodes.push({ x, y });
            }
        }
    }
    const distance = nodes.map(() => Infinity);
    const parent = nodes.map(() => -1);
    const visited = nodes.map(() => false);
    distance[0] = 0;
    for (;;) {
        let current = -1;
        for (let i = 0; i < nodes.length; i++) {
            if (!visited[i] && distance[i] < (current < 0 ? Infinity : distance[current])) current = i;
        }
        if (current < 0) return null;
        if (current === 1) {
            const route: Point[] = [];
            for (let i = 1; i > 0; i = parent[i]) route.push(nodes[i]);
            return route.reverse();
        }
        visited[current] = true;
        const from = nodes[current];
        for (let i = 1; i < nodes.length; i++) {
            if (visited[i]) continue;
            const to = nodes[i];
            const cost = distance[current] + Math.hypot(to.x - from.x, to.y - from.y);
            if (cost >= distance[i] || !clearSegment(from, to, obstacles)) continue;
            distance[i] = cost;
            parent[i] = current;
        }
    }
}
