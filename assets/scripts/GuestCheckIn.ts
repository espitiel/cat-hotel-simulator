import { _decorator, CCString, Component, game, Game, Label, Node } from 'cc';
import { CustomerArrival } from './CustomerArrival';
import { ProximityInteraction } from './ProximityInteraction';
import { CatNeeds } from './CatNeeds';
import { RoomCleanliness } from './RoomCleanliness';
import { careQuality, HotelWallet, satisfactionRating } from './HotelEconomy';
import type { CareRating } from './HotelEconomy';

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
    readonly basePayment: number;
    readonly hunger: number;
    readonly happiness: number;
    readonly energy: number;
    readonly cleanliness: number;
    readonly trackedDuration: number;
    readonly averageCareQuality: number;
    readonly finalCareQuality: number;
    readonly overallSatisfaction: number;
    readonly satisfactionScore: number;
    readonly rating: CareRating;
    readonly multiplier: number;
}

export interface CheckoutReceipt {
    readonly stayId: number;
    readonly roomId: number;
    readonly score: number;
    readonly rating: CareRating;
    readonly basePayment: number;
    readonly multiplier: number;
    readonly earned: number;
    readonly balance: number;
}

interface GuestStay {
    id: number;
    customerVisitId: number;
    roomId: number;
    catId: string;
    duration: number;
    basePayment: number;
    remaining: number;
    state: StayState;
    checkedOut: boolean;
    snapshot: Readonly<CompletedStaySnapshot> | null;
    weightedQualitySum: number;
    trackedDuration: number;
}

interface GuestRoom {
    id: number;
    upgrades: RoomUpgradeState;
    occupied: boolean;
    assignedCatId: string | null;
    catVisual: Node | null;
    statusLabel: Label;
    needs: CatNeeds | null;
    cleanliness: RoomCleanliness | null;
    stay: GuestStay | null;
}

export interface RoomUpgradeState {
    level: 1 | 2;
    basePayment: number;
    comfortDecoration: boolean;
}

export const COMFORT_PRICE = 60;
export const LEVEL_TWO_PRICE = 400;

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

    @property([CCString])
    guestCatIds: string[] = [];

    @property([Label])
    roomStatusLabels: Label[] = [];

    @property(Label)
    coinLabel: Label | null = null;

    @property(Label)
    checkoutSummary: Label | null = null;

    @property(Node)
    checkoutSummaryPanel: Node | null = null;

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
    private readonly wallet = new HotelWallet();
    private hotelRank: 1 | 2 = 1;
    private lastCheckoutReceipt: Readonly<CheckoutReceipt> | null = null;

    protected onLoad(): void {
        const visuals = [this.guestCat, ...this.additionalGuestCats];
        this.rooms = this.roomStatusLabels.map((label, index) => ({
            id: index + 1, occupied: false, assignedCatId: null,
            catVisual: visuals[index] || null, statusLabel: label,
            needs: null, cleanliness: null, stay: null,
            upgrades: { level: 1, basePayment: 100, comfortDecoration: false },
        }));
        for (const room of this.rooms) if (room.catVisual) room.catVisual.active = false;
        this.updateCoinLabel();
        if (this.checkoutSummaryPanel) this.checkoutSummaryPanel.active = false;
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
        this.unschedule(this.hideCheckoutSummary);
        if (this.checkoutSummaryPanel) this.checkoutSummaryPanel.active = false;
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
            const qualityBefore = careQuality({
                hunger: needs.hunger, happiness: needs.happiness,
                cleanliness: room.cleanliness.cleanliness, energy: needs.energy,
            });
            let beforeEnergyChange = elapsed;
            // A rest must finish strictly before the stay deadline to earn energy.
            const expires = deltaTime >= before;
            if (needs.resting && (!expires || needs.restSecondsRemaining < before)) {
                const restTime = needs.restSecondsRemaining;
                if (needs.advanceRest(elapsed)) {
                    beforeEnergyChange = Math.min(elapsed, restTime);
                    changed = true;
                    completedRestCount++;
                    completedRoomIds += (completedRoomIds ? ' & ' : '') + room.id;
                    lastRestMessage = `Room ${room.id} Cat Rested! Energy: ${needs.energy}/100`;
                }
            }
            const qualityAfter = careQuality({
                hunger: needs.hunger, happiness: needs.happiness,
                cleanliness: room.cleanliness.cleanliness, energy: needs.energy,
            });
            stay.weightedQualitySum += qualityBefore * beforeEnergyChange +
                qualityAfter * (elapsed - beforeEnergyChange);
            stay.trackedDuration += elapsed;
            stay.remaining = Math.max(0, before - deltaTime);
            if (!expires) continue;
            needs.lock();
            room.cleanliness.lock();
            stay.state = 'ReadyForPickup';
            changed = true;
            const average = stay.trackedDuration > 0
                ? stay.weightedQualitySum / stay.trackedDuration : qualityAfter;
            const satisfaction = satisfactionRating(average, qualityAfter);
            stay.snapshot = Object.freeze({
                stayId: stay.id, customerVisitId: stay.customerVisitId,
                roomId: stay.roomId, catId: stay.catId, duration: stay.duration, basePayment: stay.basePayment,
                hunger: needs.hunger, happiness: needs.happiness,
                energy: needs.energy, cleanliness: room.cleanliness.cleanliness,
                trackedDuration: stay.trackedDuration,
                averageCareQuality: average, finalCareQuality: qualityAfter,
                overallSatisfaction: satisfaction.overall, satisfactionScore: satisfaction.score,
                rating: satisfaction.rating, multiplier: satisfaction.multiplier,
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
            catId, duration, basePayment: room.upgrades.basePayment,
            remaining: duration, state: 'Active', checkedOut: false, snapshot: null,
            weightedQualitySum: 0, trackedDuration: 0,
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
            stay.snapshot.stayId !== stay.id || stay.snapshot.roomId !== room.id ||
            this.pickupQueue.indexOf(stay.id) < 0) {
            this.reception.showMessage('Pickup is no longer available.');
            return;
        }
        const snapshot = stay.snapshot;
        const earned = Math.round(snapshot.basePayment * snapshot.multiplier);
        if (!this.wallet.canCreditCheckout(stay.id, earned)) {
            this.reception.showMessage('Checkout payment unavailable.');
            return;
        }
        if (!this.customer.completeVisit()) return;
        stay.state = 'CheckingOut';
        stay.checkedOut = true;
        // This is synchronous; the same validated stay cannot be settled twice.
        this.wallet.creditCheckout(stay.id, earned);
        this.lastCheckoutReceipt = Object.freeze({
            stayId: stay.id, roomId: room.id, score: snapshot.satisfactionScore,
            rating: snapshot.rating, basePayment: snapshot.basePayment,
            multiplier: snapshot.multiplier, earned, balance: this.wallet.balance,
        });
        room.needs?.cancelRest();
        stay.state = 'Completed';
        this.completedStays.push(stay.snapshot);
        const progress = this.getRankProgress();
        if (progress.completed >= 5 && progress.average >= 60) this.hotelRank = 2;
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
        this.updateCoinLabel();
        this.showCheckoutSummary(this.lastCheckoutReceipt);
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
                const minutes = Math.floor(seconds / 60);
                const remainder = seconds % 60;
                const minutesText = (minutes < 10 ? '0' : '') + minutes;
                const secondsText = (remainder < 10 ? '0' : '') + remainder;
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

    public getCoinBalance(): number { return this.wallet.balance; }

    public getRankProgress(): { rank: 1 | 2; completed: number; average: number } {
        const recent = this.completedStays.slice(-5);
        const total = recent.reduce((sum, stay) => sum + stay.satisfactionScore, 0);
        return { rank: this.hotelRank, completed: this.completedStays.length,
            average: recent.length ? total / recent.length : 0 };
    }

    public getRoomUpgrade(roomId: number): Readonly<RoomUpgradeState> | null {
        const room = this.rooms.find(entry => entry.id === roomId);
        return room ? { ...room.upgrades } : null;
    }

    public purchaseUpgrade(roomId: number, kind: 'comfort' | 'level'): string {
        const room = this.rooms.find(entry => entry.id === roomId);
        if (!room || (kind === 'comfort' && roomId !== 1)) return 'Upgrade unavailable.';
        const upgrade = room.upgrades;
        if (kind === 'comfort' ? upgrade.comfortDecoration : upgrade.level === 2) return 'Already owned.';
        if (kind === 'level' && this.hotelRank < 2) return 'Requires Hotel Rank 2.';
        if (!this.wallet.trySpend(kind === 'comfort' ? COMFORT_PRICE : LEVEL_TWO_PRICE)) return 'Not enough coins.';
        if (kind === 'comfort') {
            upgrade.comfortDecoration = true;
        } else {
            upgrade.level = 2;
            upgrade.basePayment = 125;
        }
        this.updateCoinLabel();
        this.node.emit('upgrades-changed');
        return kind === 'comfort' ? 'Room 1 comfort decoration purchased!' : `Room ${roomId} upgraded to Level 2!`;
    }
    public hasPaidForStay(stayId: number): boolean { return this.wallet.hasPaid(stayId); }
    public getLastCheckoutReceipt(): Readonly<CheckoutReceipt> | null { return this.lastCheckoutReceipt; }

    private updateCoinLabel(): void {
        if (this.coinLabel) this.coinLabel.string = `Coins: ${this.wallet.balance}`;
    }

    private showCheckoutSummary(receipt: Readonly<CheckoutReceipt>): void {
        if (!this.checkoutSummary || !this.checkoutSummaryPanel) return;
        this.checkoutSummary.string = `Checkout Complete!  Room ${receipt.roomId}\n` +
            `Care: ${receipt.rating} (${receipt.score}/100)\n` +
            `Base: ${receipt.basePayment} Coins  × ${receipt.multiplier.toFixed(2)}\n` +
            `Earned: +${receipt.earned} Coins\nBalance: ${receipt.balance} Coins`;
        this.checkoutSummaryPanel.active = true;
        this.unschedule(this.hideCheckoutSummary);
        this.scheduleOnce(this.hideCheckoutSummary, 5);
    }

    private hideCheckoutSummary(): void {
        if (this.checkoutSummaryPanel) this.checkoutSummaryPanel.active = false;
    }
}
