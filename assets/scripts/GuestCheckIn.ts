import { _decorator, Component, game, Game, Label, Node } from 'cc';
import { CustomerArrival } from './CustomerArrival';
import { ProximityInteraction } from './ProximityInteraction';
import { CatNeeds } from './CatNeeds';
import { RoomCleanliness } from './RoomCleanliness';

const { ccclass, property } = _decorator;

type StayState = 'Active' | 'ReadyForPickup' | 'CheckingOut' | 'Completed';
type Visit = { id: number; kind: 'CheckIn' | 'Pickup'; stayId: number | null };

/** Frozen at the end of the stay for a future economy system. */
export interface CompletedStaySnapshot {
    readonly stayId: number;
    readonly customerVisitId: number;
    readonly roomId: number;
    readonly catId: string;
    readonly duration: number;
    readonly hunger: number;
    readonly happiness: number;
    readonly energy: number;
    readonly cleanliness: number;
}

interface GuestStay {
    id: number;
    customerVisitId: number;
    roomId: number;
    catId: string;
    duration: number;
    remaining: number;
    state: StayState;
    checkedOut: boolean;
    snapshot: Readonly<CompletedStaySnapshot> | null;
}

interface GuestRoom {
    id: number;
    occupied: boolean;
    assignedCatId: string | null;
    catVisual: Node | null;
    statusLabel: Label;
    needs: CatNeeds | null;
    cleanliness: RoomCleanliness | null;
    stay: GuestStay | null;
}

/** Owns rooms, stays, and the single customer's check-in/pickup queue. */
@ccclass('GuestCheckIn')
export class GuestCheckIn extends Component {
    @property(CustomerArrival)
    customer: CustomerArrival | null = null;

    @property(ProximityInteraction)
    reception: ProximityInteraction | null = null;

    @property(Node)
    guestCat: Node | null = null;

    @property([Node])
    additionalGuestCats: Node[] = [];

    @property([String])
    guestCatIds: string[] = [];

    @property([Label])
    roomStatusLabels: Label[] = [];

    private rooms: GuestRoom[] = [];
    private nextStayId = 1;
    private nextVisitId = 2;
    private currentVisit: Visit | null = { id: 1, kind: 'CheckIn', stayId: null };
    private pickupQueue: number[] = [];
    private completedStays: Readonly<CompletedStaySnapshot>[] = [];
    private usedTutorialStay = false;
    private arrivalDelay = 0;
    private gameInactive = false;
    private skipResumeFrame = false;

    protected onLoad(): void {
        const visuals = [this.guestCat, ...this.additionalGuestCats];
        this.rooms = this.roomStatusLabels.map((label, index) => ({
            id: index + 1, occupied: false, assignedCatId: null,
            catVisual: visuals[index] || null, statusLabel: label,
            needs: null, cleanliness: null, stay: null,
        }));
        for (const room of this.rooms) if (room.catVisual) room.catVisual.active = false;
        this.updateRoomLabels();
    }

    protected onEnable(): void {
        this.node.on('interaction', this.interact, this);
        game.on(Game.EVENT_HIDE, this.onGameHide, this);
        game.on(Game.EVENT_SHOW, this.onGameShow, this);
    }

    protected onDisable(): void {
        this.node.off('interaction', this.interact, this);
        game.off(Game.EVENT_HIDE, this.onGameHide, this);
        game.off(Game.EVENT_SHOW, this.onGameShow, this);
    }

    private onGameHide(): void { this.gameInactive = true; }
    private onGameShow(): void { this.gameInactive = false; this.skipResumeFrame = true; }

    protected update(deltaTime: number): void {
        if (this.gameInactive) return;
        if (this.skipResumeFrame) { this.skipResumeFrame = false; return; }
        if (!Number.isFinite(deltaTime) || deltaTime < 0) return;
        this.advanceStays(deltaTime);
        this.arrivalDelay = Math.max(0, this.arrivalDelay - deltaTime);
        this.startNextVisitIfPossible();
        this.updateRoomLabels();
    }

    private advanceStays(deltaTime: number): void {
        let completedRestCount = 0;
        let completedRoomIds = '';
        let lastRestMessage = '';
        let changed = false;
        for (const room of this.rooms) {
            const stay = room.stay;
            const needs = room.needs;
            if (!stay || stay.state !== 'Active' || !needs || !room.cleanliness) continue;
            const before = stay.remaining;
            const elapsed = Math.min(deltaTime, before);
            // A rest must finish strictly before the stay deadline to earn energy.
            const expires = deltaTime >= before;
            if (needs.resting && (!expires || needs.restSecondsRemaining < before)) {
                if (needs.advanceRest(elapsed)) {
                    changed = true;
                    completedRestCount++;
                    completedRoomIds += (completedRoomIds ? ' & ' : '') + room.id;
                    lastRestMessage = `Room ${room.id} Cat Rested! Energy: ${needs.energy}/100`;
                }
            }
            stay.remaining = Math.max(0, before - deltaTime);
            if (!expires) continue;
            needs.lock();
            room.cleanliness.lock();
            stay.state = 'ReadyForPickup';
            changed = true;
            stay.snapshot = Object.freeze({
                stayId: stay.id, customerVisitId: stay.customerVisitId,
                roomId: stay.roomId, catId: stay.catId, duration: stay.duration,
                hunger: needs.hunger, happiness: needs.happiness,
                energy: needs.energy, cleanliness: room.cleanliness.cleanliness,
            });
            this.pickupQueue.push(stay.id);
        }
        if (completedRestCount === 1) this.reception?.showMessage(lastRestMessage);
        else if (completedRestCount > 1) this.reception?.showMessage(`Rooms ${completedRoomIds} Cats Rested!`);
        if (changed) this.node.emit('stay-changed');
    }

    private interact(): void {
        if (!this.reception || this.gameInactive) return;
        if (!this.customer || !this.currentVisit || this.customer.state !== 'Waiting') {
            const fullWithoutPickup = this.rooms.length > 0 &&
                this.rooms.every((room) => room.occupied) && this.pickupQueue.length === 0;
            this.reception.showMessage(fullWithoutPickup
                ? 'Hotel Full! No Rooms Available.' : 'Please wait for the customer.');
            return;
        }
        if (this.currentVisit.kind === 'Pickup') {
            this.checkout(this.currentVisit);
            return;
        }
        this.checkIn(this.currentVisit);
    }

    private checkIn(visit: Visit): void {
        if (!this.reception || !this.customer || this.currentVisit !== visit) return;
        const room = this.rooms.find((entry) => !entry.occupied);
        if (!room) { this.reception.showMessage('Hotel Full! No Rooms Available.'); return; }
        // Each room's pre-positioned cat visual determines its identity.
        const catId = this.guestCatIds[room.id - 1];
        if (!room.catVisual || !catId) { this.reception.showMessage('Guest cat is unavailable.'); return; }
        if (!this.customer.completeVisit()) return;
        const duration = this.usedTutorialStay ? 150 : 75;
        this.usedTutorialStay = true;
        room.occupied = true;
        room.assignedCatId = catId;
        room.needs = new CatNeeds();
        room.cleanliness = new RoomCleanliness();
        room.stay = {
            id: this.nextStayId++, customerVisitId: visit.id, roomId: room.id,
            catId, duration, remaining: duration, state: 'Active', checkedOut: false, snapshot: null,
        };
        room.catVisual.active = true;
        this.currentVisit = null;
        this.arrivalDelay = 1.5;
        this.updateRoomLabels();
        this.node.emit('stay-changed');
        this.reception.showMessage(`Check-in Complete! Room ${room.id} Occupied.`);
    }

    private checkout(visit: Visit): void {
        if (!this.reception || !this.customer || this.currentVisit !== visit || visit.stayId === null) return;
        const room = this.rooms.find((entry) => entry.stay?.id === visit.stayId);
        const stay = room?.stay;
        if (!room || !stay || stay.state !== 'ReadyForPickup' || stay.checkedOut || !stay.snapshot ||
            !this.pickupQueue.includes(stay.id)) {
            this.reception.showMessage('Pickup is no longer available.');
            return;
        }
        if (!this.customer.completeVisit()) return;
        stay.state = 'CheckingOut';
        stay.checkedOut = true;
        room.needs?.cancelRest();
        stay.state = 'Completed';
        this.completedStays.push(stay.snapshot);
        this.pickupQueue = this.pickupQueue.filter((id) => id !== stay.id);
        if (room.catVisual) room.catVisual.active = false;
        room.occupied = false;
        room.assignedCatId = null;
        room.needs = null;
        room.cleanliness = null;
        room.stay = null;
        this.currentVisit = null;
        this.arrivalDelay = 1.5;
        this.updateRoomLabels();
        this.node.emit('stay-changed');
        this.reception.showMessage(`Checkout Complete! Room ${room.id} Available.`);
    }

    private startNextVisitIfPossible(): void {
        if (!this.customer || this.currentVisit || this.customer.state !== 'Completed' || this.arrivalDelay > 0) return;
        // Remove only stale requests; a displayed pickup remains in the queue until checkout.
        while (this.pickupQueue.length && !this.rooms.some((room) =>
            room.stay?.id === this.pickupQueue[0] && room.stay.state === 'ReadyForPickup')) {
            this.pickupQueue.shift();
        }
        const pickupId = this.pickupQueue.length ? this.pickupQueue[0] : null;
        if (pickupId !== null) {
            const room = this.rooms.find((entry) => entry.stay?.id === pickupId);
            if (room && this.customer.startNextVisit(`Pickup — Room ${room.id}`)) {
                this.currentVisit = { id: this.nextVisitId++, kind: 'Pickup', stayId: pickupId };
            }
        } else if (this.rooms.some((room) => !room.occupied) && this.customer.startNextVisit('Waiting')) {
            this.currentVisit = { id: this.nextVisitId++, kind: 'CheckIn', stayId: null };
        }
    }

    private updateRoomLabels(): void {
        for (const room of this.rooms) {
            if (!room.statusLabel) continue;
            let text = 'Empty';
            if (room.stay?.state === 'Active') {
                const seconds = Math.ceil(room.stay.remaining);
                const minutesText = Math.floor(seconds / 60).toString().padStart(2, '0');
                const secondsText = (seconds % 60).toString().padStart(2, '0');
                text = `Occupied ${minutesText}:${secondsText}`;
            } else if (room.stay?.state === 'ReadyForPickup') {
                text = 'Ready for Pickup';
            }
            if (room.statusLabel.string !== text) room.statusLabel.string = text;
        }
    }

    /** Only active stays allow care or further rest progress. */
    public getCatNeeds(roomId: number): CatNeeds | null {
        const room = this.rooms.find((entry) => entry.id === roomId);
        return room?.stay?.state === 'Active' ? room.needs : null;
    }

    public getActiveStayId(roomId: number): number | null {
        const room = this.rooms.find((entry) => entry.id === roomId);
        return room?.stay?.state === 'Active' ? room.stay.id : null;
    }

    public getRoomCleanliness(roomId: number): RoomCleanliness | null {
        const room = this.rooms.find((entry) => entry.id === roomId);
        return room?.stay?.state === 'Active' ? room.cleanliness : null;
    }

    /** Read-only display remains visible until pickup and checkout. */
    public getDisplayedCatNeeds(roomId: number): CatNeeds | null {
        const room = this.rooms.find((entry) => entry.id === roomId);
        return room?.occupied ? room.needs : null;
    }

    public getDisplayedRoomCleanliness(roomId: number): RoomCleanliness | null {
        const room = this.rooms.find((entry) => entry.id === roomId);
        return room?.occupied ? room.cleanliness : null;
    }

    public getCompletedStays(): ReadonlyArray<Readonly<CompletedStaySnapshot>> {
        return this.completedStays.slice();
    }
}
