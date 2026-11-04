import { _decorator, Component, EventTouch, game, Game, Node, Vec2 } from 'cc';

const { ccclass, property } = _decorator;

/** Invisible floating joystick for the Floor 1 greybox. */
@ccclass('CaretakerMovement')
export class CaretakerMovement extends Component {
    @property(Node)
    caretaker: Node | null = null;

    // Scene units per second. Bounds account for the 56-unit caretaker placeholder.
    private readonly speed = 200;
    private readonly deadZone = 12;
    private readonly joystickRadius = 80;
    private readonly minX = -295;
    private readonly maxX = 295;
    private readonly minY = -425;
    private readonly maxY = 425;

    private activeTouchId: number | null = null;
    private readonly origin = new Vec2();
    private readonly input = new Vec2();

    protected onEnable(): void {
        this.node.on(Node.EventType.TOUCH_START, this.onTouchStart, this);
        this.node.on(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
        this.node.on(Node.EventType.TOUCH_END, this.onTouchEnd, this);
        this.node.on(Node.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
        game.on(Game.EVENT_HIDE, this.stopMovement, this);
    }

    protected onDisable(): void {
        this.node.off(Node.EventType.TOUCH_START, this.onTouchStart, this);
        this.node.off(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
        this.node.off(Node.EventType.TOUCH_END, this.onTouchEnd, this);
        this.node.off(Node.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
        game.off(Game.EVENT_HIDE, this.stopMovement, this);
        this.stopMovement();
    }

    private onTouchStart(event: EventTouch): void {
        // A child that handles the touch is interactive; leave it in control.
        if (this.activeTouchId !== null || event.target !== this.node || !this.caretaker) return;
        this.activeTouchId = event.getID();
        this.origin.set(event.getUILocation());
        this.input.set(0, 0);
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
        this.input.set(dx / distance * magnitude, dy / distance * magnitude);
    }

    private onTouchEnd(event: EventTouch): void {
        if (event.getID() === this.activeTouchId) this.stopMovement();
    }

    private stopMovement(): void {
        this.activeTouchId = null;
        this.input.set(0, 0);
    }

    protected update(deltaTime: number): void {
        if (!this.caretaker || (this.input.x === 0 && this.input.y === 0)) return;
        const position = this.caretaker.position;
        const x = Math.max(this.minX, Math.min(this.maxX, position.x + this.input.x * this.speed * deltaTime));
        const y = Math.max(this.minY, Math.min(this.maxY, position.y + this.input.y * this.speed * deltaTime));
        this.caretaker.setPosition(x, y, position.z);
    }
}
