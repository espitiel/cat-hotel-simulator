import { _decorator, Component, Label, Node, UITransform, Vec3 } from 'cc';
import { GuestCheckIn } from './GuestCheckIn';
import { ProximityInteraction } from './ProximityInteraction';

const { ccclass, property } = _decorator;

/** One contextual Feed button shared by all configured guest rooms. */
@ccclass('CatFeeding')
export class CatFeeding extends Component {
    @property(GuestCheckIn)
    checkIn: GuestCheckIn | null = null;

    @property(ProximityInteraction)
    feedback: ProximityInteraction | null = null;

    @property(Node)
    caretaker: Node | null = null;

    @property(Node)
    feedButton: Node | null = null;

    // These arrays follow the room order in GuestCheckIn.
    @property([Node])
    roomFloors: Node[] = [];

    @property([Node])
    feedingPoints: Node[] = [];

    @property([Label])
    hungerLabels: Label[] = [];

    @property
    interactionRange = 48;

    // Keep the caretaker inside the wall boundary, including at doorways.
    @property
    roomInset = 14;

    private readonly localPosition = new Vec3();

    protected onEnable(): void {
        if (this.feedButton) {
            this.feedButton.on(Node.EventType.TOUCH_END, this.feed, this);
            this.feedButton.active = false;
        }
    }

    protected onDisable(): void {
        this.feedButton?.off(Node.EventType.TOUCH_END, this.feed, this);
        if (this.feedButton) this.feedButton.active = false;
    }

    protected update(): void {
        this.updateHungerLabels();
        if (this.feedButton) this.feedButton.active = this.eligibleRoom() !== 0;
    }

    private eligibleRoom(): number {
        if (!this.checkIn || !this.caretaker) return 0;
        const world = this.caretaker.worldPosition;
        for (let i = 0; i < this.roomFloors.length; i++) {
            const floor = this.roomFloors[i];
            const point = this.feedingPoints[i];
            const transform = floor?.getComponent(UITransform);
            if (!floor || !point || !transform || !this.checkIn.getCatNeeds(i + 1)) continue;
            floor.inverseTransformPoint(this.localPosition, world);
            const size = transform.contentSize;
            const anchor = transform.anchorPoint;
            const inset = Math.max(0, this.roomInset);
            const x = this.localPosition.x;
            const y = this.localPosition.y;
            if (x < -size.width * anchor.x + inset || x > size.width * (1 - anchor.x) - inset ||
                y < -size.height * anchor.y + inset || y > size.height * (1 - anchor.y) - inset) continue;
            if (Vec3.distance(world, point.worldPosition) <= Math.max(0, this.interactionRange)) return i + 1;
        }
        return 0;
    }

    private feed(): void {
        // Recheck at release in case the caretaker moved or the room changed.
        const roomId = this.eligibleRoom();
        const needs = roomId && this.checkIn ? this.checkIn.getCatNeeds(roomId) : null;
        if (!needs) return;
        if (needs.hunger === 0) {
            this.feedback?.showMessage('Cat is Not Hungry!');
            return;
        }
        const hunger = needs.feed();
        this.updateHungerLabels();
        this.feedback?.showMessage(hunger === 0
            ? `Room ${roomId} Cat is Full!`
            : `Room ${roomId} Cat Fed! Hunger: ${hunger}/100`);
    }

    private updateHungerLabels(): void {
        this.hungerLabels.forEach((label, index) => {
            if (!label) return;
            const needs = this.checkIn?.getCatNeeds(index + 1);
            label.node.active = !!needs;
            if (needs) label.string = `Hunger: ${needs.hunger}/100`;
        });
    }
}
