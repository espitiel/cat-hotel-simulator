import { _decorator, Component, EventTouch, game, Game, Node, UITransform, Vec2, Vec3 } from 'cc';
import { clearSegment, findWalkingRoute } from './WalkingRoute';
import type { Point } from './WalkingRoute';

const { ccclass, property } = _decorator;

/** Invisible floating joystick for the Floor 1 greybox. */
@ccclass('CaretakerMovement')
export class CaretakerMovement extends Component {
    @property(Node)
    caretaker: Node | null = null;

    // Only these explicitly assigned scene objects are solid; labels are not.
    @property([Node])
    obstacles: Node[] = [];

    // Scene units per second. Bounds account for the 56-unit caretaker placeholder.
    private readonly speed = 200;
    private readonly deadZone = 12;
    private readonly joystickRadius = 80;
    private readonly minX = -295;
    private readonly maxX = 295;
    private readonly minY = -425;
    private readonly maxY = 425;
    private readonly footHalfWidth = 13;
    private readonly footHalfHeight = 10;
    private readonly footOffsetY = -12;

    private activeTouchId: number | null = null;
    private readonly origin = new Vec2();
    private readonly input = new Vec2();
    private readonly corner = new Vec3();
    private dragged = false;
    private touchStarted = 0;
    private walk: { route: Point[]; index: number; valid: () => boolean; finish: (arrived: boolean) => void } | null = null;

    protected onEnable(): void {
        this.node.on(Node.EventType.TOUCH_START, this.onTouchStart, this);
        this.node.on(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
        this.node.on(Node.EventType.TOUCH_END, this.onTouchEnd, this);
        this.node.on(Node.EventType.TOUCH_CANCEL, this.onTouchCancel, this);
        game.on(Game.EVENT_HIDE, this.resetControls, this);
    }

    protected onDisable(): void {
        this.node.off(Node.EventType.TOUCH_START, this.onTouchStart, this);
        this.node.off(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
        this.node.off(Node.EventType.TOUCH_END, this.onTouchEnd, this);
        this.node.off(Node.EventType.TOUCH_CANCEL, this.onTouchCancel, this);
        game.off(Game.EVENT_HIDE, this.resetControls, this);
        this.resetControls();
    }

    private onTouchStart(event: EventTouch): void {
        // A child that handles the touch is interactive; leave it in control.
        if (this.activeTouchId !== null || event.target !== this.node || !this.caretaker) return;
        this.activeTouchId = event.getID();
        this.origin.set(event.getUILocation());
        this.input.set(0, 0);
        this.dragged = false;
        this.touchStarted = Date.now();
    }

    private onTouchMove(event: EventTouch): void {
        if (event.getID() !== this.activeTouchId) return;
        const point = event.getUILocation();
        const dx = point.x - this.origin.x;
        const dy = point.y - this.origin.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance <= this.deadZone) {
            this.input.set(0, 0);
            return;
        }

        // Unit direction with a smoothly increasing magnitude, clamped to one.
        const magnitude = Math.min(1, (distance - this.deadZone) / (this.joystickRadius - this.deadZone));
        if (!this.dragged) {
            this.dragged = true;
            this.cancelWalk();
            this.node.emit('caretaker-drag');
        }
        this.input.set(dx / distance * magnitude, dy / distance * magnitude);
    }

    private onTouchEnd(event: EventTouch): void {
        if (event.getID() !== this.activeTouchId) return;
        const tap = !this.dragged && Date.now() - this.touchStarted <= 450 &&
            Vec2.distance(event.getUILocation(), this.origin) <= this.deadZone;
        this.stopMovement();
        if (tap) this.node.emit('caretaker-tap', event.getLocation(), event.windowId);
    }

    private onTouchCancel(event: EventTouch): void {
        if (event.getID() === this.activeTouchId) this.stopMovement();
    }

    private resetControls(): void {
        this.stopMovement();
        this.cancelWalk();
        this.node.emit('caretaker-drag');
    }

    public cancelWalk(): void { this.walk = null; }

    public walkTo(target: Node, valid: () => boolean, finish: (arrived: boolean) => void): void {
        this.cancelWalk();
        const parent = this.caretaker?.parent;
        if (!parent || !this.caretaker || this.activeTouchId !== null || !valid()) {
            finish(false);
            return;
        }
        const goal = parent.inverseTransformPoint(new Vec3(), target.worldPosition);
        const route = findWalkingRoute(this.caretaker.position, goal, {
            left: this.minX, right: this.maxX, bottom: this.minY, top: this.maxY,
        }, this.navigationBounds(parent));
        if (route) this.walk = { route, index: 0, valid, finish };
        else finish(false);
    }

    private navigationBounds(parent: Node) {
        return this.obstacles.filter(node => node?.activeInHierarchy)
            .map(node => this.obstacleBounds(node, parent))
            .filter(box => box !== null)
            .map(box => ({ ...box, bottom: box.bottom - this.footOffsetY, top: box.top - this.footOffsetY }));
    }

    private advanceWalk(deltaTime: number): void {
        const walk = this.walk;
        const caretaker = this.caretaker;
        if (!walk || this.activeTouchId !== null) return;
        if (!caretaker?.parent || !walk.valid()) {
            this.cancelWalk();
            walk.finish(false);
            return;
        }
        const obstacles = this.navigationBounds(caretaker.parent);
        let budget = this.speed * deltaTime;
        while (budget > 0 && walk.index < walk.route.length) {
            const from = caretaker.position;
            const to = walk.route[walk.index];
            const distance = Math.hypot(to.x - from.x, to.y - from.y);
            const fraction = distance > budget ? budget / distance : 1;
            const next = { x: from.x + (to.x - from.x) * fraction, y: from.y + (to.y - from.y) * fraction };
            if (!clearSegment(from, next, obstacles)) {
                this.cancelWalk();
                walk.finish(false);
                return;
            }
            caretaker.setPosition(next.x, next.y, from.z);
            budget -= Math.min(distance, budget);
            if (fraction === 1) walk.index++;
        }
        if (walk.index === walk.route.length) {
            this.cancelWalk();
            walk.finish(walk.valid());
        }
    }

    private stopMovement(): void {
        this.activeTouchId = null;
        this.input.set(0, 0);
    }

    protected update(deltaTime: number): void {
        if (this.walk) {
            this.advanceWalk(deltaTime);
            return;
        }
        if (!this.caretaker || !this.caretaker.parent || (this.input.x === 0 && this.input.y === 0)) return;
        const position = this.caretaker.position;
        const startX = position.x;
        const startY = position.y + this.footOffsetY;
        let x = Math.max(this.minX, Math.min(this.maxX, startX + this.input.x * this.speed * deltaTime));
        let footY = Math.max(this.minY, Math.min(this.maxY, position.y + this.input.y * this.speed * deltaTime)) + this.footOffsetY;

        // Expand each obstacle by the foot footprint, then sweep each axis.
        // Checking the whole distance avoids passing through thin walls on slow frames.
        const bounds = this.obstacles.filter((obstacle) => obstacle && obstacle.activeInHierarchy)
            .map((obstacle) => this.obstacleBounds(obstacle, this.caretaker!.parent!))
            .filter((bounds): bounds is { left: number; right: number; bottom: number; top: number } => bounds !== null);

        for (const box of bounds) {
            if (startY <= box.bottom || startY >= box.top) continue;
            if (x > startX && startX <= box.left && x > box.left) x = box.left;
            if (x < startX && startX >= box.right && x < box.right) x = box.right;
        }
        for (const box of bounds) {
            if (x <= box.left || x >= box.right) continue;
            if (footY > startY && startY <= box.bottom && footY > box.bottom) footY = box.bottom;
            if (footY < startY && startY >= box.top && footY < box.top) footY = box.top;
        }

        const y = footY - this.footOffsetY;
        this.caretaker.setPosition(x, y, position.z);
    }

    private obstacleBounds(obstacle: Node, parent: Node): { left: number; right: number; bottom: number; top: number } | null {
        const transform = obstacle.getComponent(UITransform);
        if (!transform) return null;
        const box = transform.getBoundingBoxToWorld();
        let left = Infinity;
        let right = -Infinity;
        let bottom = Infinity;
        let top = -Infinity;
        for (let i = 0; i < 4; i++) {
            this.corner.set(i % 2 ? box.xMax : box.xMin, i < 2 ? box.yMin : box.yMax, 0);
            parent.inverseTransformPoint(this.corner, this.corner);
            left = Math.min(left, this.corner.x);
            right = Math.max(right, this.corner.x);
            bottom = Math.min(bottom, this.corner.y);
            top = Math.max(top, this.corner.y);
        }
        return {
            left: left - this.footHalfWidth,
            right: right + this.footHalfWidth,
            bottom: bottom - this.footHalfHeight,
            top: top + this.footHalfHeight,
        };
    }
}
