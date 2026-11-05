import { _decorator, Component, Label, Node, UITransform, Vec3 } from 'cc';
import { GuestCheckIn } from './GuestCheckIn';
import { ProximityInteraction } from './ProximityInteraction';

const { ccclass, property } = _decorator;

/** Contextual cat-care actions shared by all configured guest rooms. */
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

    @property(Node)
    petButton: Node | null = null;

    @property(Node)
    cleanButton: Node | null = null;

    // These arrays follow the room order in GuestCheckIn.
    @property([Node])
    roomFloors: Node[] = [];

    @property([Node])
    feedingPoints: Node[] = [];

    @property([Node])
    cleaningPoints: Node[] = [];

    @property([Label])
    hungerLabels: Label[] = [];

    @property([Label])
    happinessLabels: Label[] = [];

    @property([Label])
    cleanlinessLabels: Label[] = [];

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
        if (this.petButton) {
            this.petButton.on(Node.EventType.TOUCH_END, this.pet, this);
            this.petButton.active = false;
        }
        if (this.cleanButton) {
            this.cleanButton.on(Node.EventType.TOUCH_END, this.clean, this);
            this.cleanButton.active = false;
        }
    }

    protected onDisable(): void {
        this.feedButton?.off(Node.EventType.TOUCH_END, this.feed, this);
        this.petButton?.off(Node.EventType.TOUCH_END, this.pet, this);
        this.cleanButton?.off(Node.EventType.TOUCH_END, this.clean, this);
        if (this.feedButton) this.feedButton.active = false;
        if (this.petButton) this.petButton.active = false;
        if (this.cleanButton) this.cleanButton.active = false;
    }

    protected update(): void {
        this.updateCareLabels();
        const eligible = this.eligibleRoom() !== 0;
        if (this.feedButton) this.feedButton.active = eligible;
        if (this.petButton) this.petButton.active = eligible;
        if (this.cleanButton) this.cleanButton.active = this.eligibleRoom(this.cleaningPoints) !== 0;
    }

    private eligibleRoom(points: Node[] = this.feedingPoints): number {
        if (!this.checkIn || !this.caretaker) return 0;
        const world = this.caretaker.worldPosition;
        for (let i = 0; i < this.roomFloors.length; i++) {
            const floor = this.roomFloors[i];
            const point = points[i];
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
        this.updateCareLabels();
        this.feedback?.showMessage(hunger === 0
            ? `Room ${roomId} Cat is Full!`
            : `Room ${roomId} Cat Fed! Hunger: ${hunger}/100`);
    }

    private pet(): void {
        // Reuse the feeding check, including the room boundary and distance.
        const roomId = this.eligibleRoom();
        const needs = roomId && this.checkIn ? this.checkIn.getCatNeeds(roomId) : null;
        if (!needs) return;
        if (needs.happiness === 100) {
            this.feedback?.showMessage('Cat is Already Happy!');
            return;
        }
        const happiness = needs.pet();
        this.updateCareLabels();
        this.feedback?.showMessage(happiness === 100
            ? `Room ${roomId} Cat is Very Happy!`
            : `Room ${roomId} Cat Petted! Happiness: ${happiness}/100`);
    }

    private clean(): void {
        // Check the target again on release so a stale button cannot clean remotely.
        const roomId = this.eligibleRoom(this.cleaningPoints);
        const room = roomId && this.checkIn ? this.checkIn.getRoomCleanliness(roomId) : null;
        if (!room) return;
        if (room.cleanliness === 100) {
            this.feedback?.showMessage('Room is Already Clean!');
            return;
        }
        const cleanliness = room.clean();
        this.updateCareLabels();
        this.feedback?.showMessage(cleanliness === 100
            ? `Room ${roomId} is Spotless!`
            : `Room ${roomId} Cleaned! Cleanliness: ${cleanliness}/100`);
    }

    private updateCareLabels(): void {
        this.hungerLabels.forEach((label, index) => {
            if (!label) return;
            const needs = this.checkIn?.getCatNeeds(index + 1);
            label.node.active = !!needs;
            if (needs) label.string = `Hunger: ${needs.hunger}/100`;
        });
        this.happinessLabels.forEach((label, index) => {
            if (!label) return;
            const needs = this.checkIn?.getCatNeeds(index + 1);
            label.node.active = !!needs;
            if (needs) label.string = `Happiness: ${needs.happiness}/100`;
        });
        this.cleanlinessLabels.forEach((label, index) => {
            if (!label) return;
            const room = this.checkIn?.getRoomCleanliness(index + 1);
            label.node.active = !!room;
            if (room) label.string = `Cleanliness: ${room.cleanliness}/100`;
        });
    }
}
