import { _decorator, Component, EventTouch, game, Game, Label, Node, UITransform, Vec3 } from 'cc';
import { GuestCheckIn } from './GuestCheckIn';
import { ProximityInteraction } from './ProximityInteraction';

const { ccclass, property } = _decorator;

export type CareAction = 'feed' | 'pet' | 'clean' | 'rest';

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

    @property(Node)
    restButton: Node | null = null;

    // These arrays follow the room order in GuestCheckIn.
    @property([Node])
    roomFloors: Node[] = [];

    @property([Node])
    feedingPoints: Node[] = [];

    @property([Node])
    cleaningPoints: Node[] = [];

    @property([Node])
    restPoints: Node[] = [];

    @property([Label])
    hungerLabels: Label[] = [];

    @property([Label])
    happinessLabels: Label[] = [];

    @property([Label])
    cleanlinessLabels: Label[] = [];

    @property([Label])
    energyLabels: Label[] = [];

    @property([Node])
    restingIndicators: Node[] = [];

    @property
    interactionRange = 48;

    // Keep the caretaker inside the wall boundary, including at doorways.
    @property
    roomInset = 14;

    private readonly localPosition = new Vec3();
    private gameInactive = false;
    public contextMenuOpen = false;
    private pressed: { [action: string]: { stayId: number; pointerId: number } | null } = {};

    protected onEnable(): void {
        this.checkIn?.node.on('stay-changed', this.refreshCare, this);
        if (this.feedButton) {
            this.feedButton.on(Node.EventType.TOUCH_START, this.captureFeed, this);
            this.feedButton.on(Node.EventType.TOUCH_CANCEL, this.cancelPointer, this);
            this.feedButton.on(Node.EventType.TOUCH_END, this.feed, this);
            this.feedButton.active = false;
        }
        if (this.petButton) {
            this.petButton.on(Node.EventType.TOUCH_START, this.capturePet, this);
            this.petButton.on(Node.EventType.TOUCH_CANCEL, this.cancelPointer, this);
            this.petButton.on(Node.EventType.TOUCH_END, this.pet, this);
            this.petButton.active = false;
        }
        if (this.cleanButton) {
            this.cleanButton.on(Node.EventType.TOUCH_START, this.captureClean, this);
            this.cleanButton.on(Node.EventType.TOUCH_CANCEL, this.cancelPointer, this);
            this.cleanButton.on(Node.EventType.TOUCH_END, this.clean, this);
            this.cleanButton.active = false;
        }
        if (this.restButton) {
            this.restButton.on(Node.EventType.TOUCH_START, this.captureRest, this);
            this.restButton.on(Node.EventType.TOUCH_CANCEL, this.cancelPointer, this);
            this.restButton.on(Node.EventType.TOUCH_END, this.rest, this);
            this.restButton.active = false;
        }
        game.on(Game.EVENT_HIDE, this.onGameHide, this);
        game.on(Game.EVENT_SHOW, this.onGameShow, this);
    }

    protected onDisable(): void {
        this.checkIn?.node.off('stay-changed', this.refreshCare, this);
        this.feedButton?.off(Node.EventType.TOUCH_START, this.captureFeed, this);
        this.petButton?.off(Node.EventType.TOUCH_START, this.capturePet, this);
        this.cleanButton?.off(Node.EventType.TOUCH_START, this.captureClean, this);
        this.restButton?.off(Node.EventType.TOUCH_START, this.captureRest, this);
        this.feedButton?.off(Node.EventType.TOUCH_CANCEL, this.cancelPointer, this);
        this.petButton?.off(Node.EventType.TOUCH_CANCEL, this.cancelPointer, this);
        this.cleanButton?.off(Node.EventType.TOUCH_CANCEL, this.cancelPointer, this);
        this.restButton?.off(Node.EventType.TOUCH_CANCEL, this.cancelPointer, this);
        this.pressed = {};
        this.feedButton?.off(Node.EventType.TOUCH_END, this.feed, this);
        this.petButton?.off(Node.EventType.TOUCH_END, this.pet, this);
        this.cleanButton?.off(Node.EventType.TOUCH_END, this.clean, this);
        this.restButton?.off(Node.EventType.TOUCH_END, this.rest, this);
        game.off(Game.EVENT_HIDE, this.onGameHide, this);
        game.off(Game.EVENT_SHOW, this.onGameShow, this);
        if (this.feedButton) this.feedButton.active = false;
        if (this.petButton) this.petButton.active = false;
        if (this.cleanButton) this.cleanButton.active = false;
        if (this.restButton) this.restButton.active = false;
    }

    private onGameHide(): void {
        this.gameInactive = true;
        this.pressed = {};
    }

    private onGameShow(): void {
        this.gameInactive = false;
    }

    protected update(): void {
        this.refreshCare();
    }

    private refreshCare(): void {
        this.updateCareLabels();
        const eligible = !this.contextMenuOpen && this.eligibleRoom() !== 0;
        if (this.feedButton) this.feedButton.active = eligible;
        if (this.petButton) this.petButton.active = eligible;
        if (this.cleanButton) this.cleanButton.active = !this.contextMenuOpen && this.eligibleRoom(this.cleaningPoints) !== 0;
        if (this.restButton) this.restButton.active = !this.contextMenuOpen && this.eligibleRoom(this.restPoints) !== 0;
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

    private captureFeed(event: EventTouch): void { this.capture('feed', this.feedingPoints, event); }
    private capturePet(event: EventTouch): void { this.capture('pet', this.feedingPoints, event); }
    private captureClean(event: EventTouch): void { this.capture('clean', this.cleaningPoints, event); }
    private captureRest(event: EventTouch): void { this.capture('rest', this.restPoints, event); }

    private capture(action: string, points: Node[], event: EventTouch): void {
        const roomId = this.eligibleRoom(points);
        const stayId = roomId && this.checkIn ? this.checkIn.getActiveStayId(roomId) : null;
        this.pressed[action] = stayId === null ? null : { stayId, pointerId: event.getID() };
    }

    private cancelPointer(event: EventTouch): void {
        for (const action of Object.keys(this.pressed)) {
            if (this.pressed[action]?.pointerId === event.getID()) this.pressed[action] = null;
        }
    }

    private matchingRoom(action: string, points: Node[], event: EventTouch): number {
        const previous = this.pressed[action];
        if (!previous || previous.pointerId !== event.getID()) return 0;
        this.pressed[action] = null;
        const roomId = this.eligibleRoom(points);
        return roomId && this.checkIn?.getActiveStayId(roomId) === previous.stayId ? roomId : 0;
    }

    private feed(event: EventTouch): void {
        const roomId = this.matchingRoom('feed', this.feedingPoints, event);
        if (roomId) this.applyFeed(roomId);
    }

    private applyFeed(roomId: number): void {
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

    private pet(event: EventTouch): void {
        const roomId = this.matchingRoom('pet', this.feedingPoints, event);
        if (roomId) this.applyPet(roomId);
    }

    private applyPet(roomId: number): void {
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

    private clean(event: EventTouch): void {
        const roomId = this.matchingRoom('clean', this.cleaningPoints, event);
        if (roomId) this.applyClean(roomId);
    }

    private applyClean(roomId: number): void {
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

    private rest(event: EventTouch): void {
        const roomId = this.matchingRoom('rest', this.restPoints, event);
        if (roomId) this.applyRest(roomId);
    }

    private applyRest(roomId: number): void {
        if (this.gameInactive) return;
        const needs = roomId && this.checkIn ? this.checkIn.getCatNeeds(roomId) : null;
        if (!needs) return;
        if (needs.resting) {
            this.feedback?.showMessage('Cat is Already Resting!');
            return;
        }
        if (needs.energy >= 100) {
            this.feedback?.showMessage('Cat is Fully Rested!');
            return;
        }
        if (!needs.startRest()) return;
        this.updateCareLabels();
        this.feedback?.showMessage(`Room ${roomId} Cat is Resting...`);
    }

    public actionPoints(action: CareAction): Node[] {
        if (action === 'clean') return this.cleaningPoints;
        if (action === 'rest') return this.restPoints;
        return this.feedingPoints;
    }

    public performCare(action: CareAction, roomId: number, stayId: number): boolean {
        if (this.gameInactive || this.checkIn?.getActiveStayId(roomId) !== stayId ||
            this.eligibleRoom(this.actionPoints(action)) !== roomId) return false;
        switch (action) {
        case 'feed': this.applyFeed(roomId); break;
        case 'pet': this.applyPet(roomId); break;
        case 'clean': this.applyClean(roomId); break;
        case 'rest': this.applyRest(roomId); break;
        }
        return true;
    }

    private updateCareLabels(): void {
        this.hungerLabels.forEach((label, index) => {
            if (!label) return;
            const needs = this.checkIn?.getDisplayedCatNeeds(index + 1);
            label.node.active = !!needs;
            if (needs) label.string = `Hunger: ${needs.hunger}/100`;
        });
        this.happinessLabels.forEach((label, index) => {
            if (!label) return;
            const needs = this.checkIn?.getDisplayedCatNeeds(index + 1);
            label.node.active = !!needs;
            if (needs) label.string = `Happiness: ${needs.happiness}/100`;
        });
        this.cleanlinessLabels.forEach((label, index) => {
            if (!label) return;
            const room = this.checkIn?.getDisplayedRoomCleanliness(index + 1);
            label.node.active = !!room;
            if (room) label.string = `Cleanliness: ${room.cleanliness}/100`;
        });
        this.energyLabels.forEach((label, index) => {
            if (!label) return;
            const needs = this.checkIn?.getDisplayedCatNeeds(index + 1);
            label.node.active = !!needs;
            if (needs) label.string = `Energy: ${needs.energy}/100`;
        });
        this.restingIndicators.forEach((indicator, index) => {
            if (indicator) indicator.active = !!this.checkIn?.getCatNeeds(index + 1)?.resting;
        });
    }
}
