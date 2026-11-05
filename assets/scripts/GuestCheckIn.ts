import { _decorator, Component, Label, Node } from 'cc';
import { CustomerArrival } from './CustomerArrival';
import { ProximityInteraction } from './ProximityInteraction';

const { ccclass, property } = _decorator;

interface GuestRoom {
    id: number;
    occupied: boolean;
    assignedCatId: string | null;
    catVisual: Node | null;
    statusLabel: Label;
}

/** Assigns sequential customer visits to the first available room. */
@ccclass('GuestCheckIn')
export class GuestCheckIn extends Component {
    @property(CustomerArrival)
    customer: CustomerArrival | null = null;

    @property(ProximityInteraction)
    reception: ProximityInteraction | null = null;

    // Retain the original Room 1 reference from the first prototype.
    @property(Node)
    guestCat: Node | null = null;

    @property([Node])
    additionalGuestCats: Node[] = [];

    @property([String])
    guestCatIds: string[] = [];

    @property([Label])
    roomStatusLabels: Label[] = [];

    private rooms: GuestRoom[] = [];
    private visitIndex = 0;
    private visitCheckedIn = false;

    protected onLoad(): void {
        const visuals = [this.guestCat, ...this.additionalGuestCats];
        this.rooms = this.roomStatusLabels.map((label, index) => ({
            id: index + 1,
            occupied: false,
            assignedCatId: null,
            catVisual: visuals[index] || null,
            statusLabel: label,
        }));
        for (const room of this.rooms) {
            if (room.catVisual) room.catVisual.active = false;
        }
        this.updateRoomLabels();
    }

    protected onEnable(): void {
        this.node.on('interaction', this.checkIn, this);
    }

    protected onDisable(): void {
        this.node.off('interaction', this.checkIn, this);
    }

    private checkIn(): void {
        if (!this.reception) return;
        const room = this.rooms.find((entry) => !entry.occupied);
        if (!room) {
            this.reception.showMessage('Hotel Full! No Rooms Available.');
            return;
        }
        if (this.visitCheckedIn) {
            this.reception.showMessage('Customer Already Checked In.');
            return;
        }
        if (!this.customer || this.customer.state !== 'Waiting') {
            this.reception.showMessage('Please wait for the customer.');
            return;
        }
        const catId = this.guestCatIds[this.visitIndex];
        if (!room.catVisual || !catId) {
            this.reception.showMessage('Guest cat is unavailable.');
            return;
        }

        // Complete the visit before scheduling the next, so the seat is released.
        if (!this.customer.completeVisit()) return;
        this.visitCheckedIn = true;
        room.occupied = true;
        room.assignedCatId = catId;
        room.catVisual.active = true;
        this.updateRoomLabels();
        this.reception.showMessage(`Check-in Complete! Room ${room.id} Occupied.`);

        if (this.rooms.some((entry) => !entry.occupied) && this.visitIndex + 1 < this.guestCatIds.length) {
            this.scheduleOnce(this.startNextVisit, 1.5);
        }
    }

    private startNextVisit(): void {
        if (!this.customer || !this.visitCheckedIn || !this.customer.startNextVisit()) return;
        this.visitIndex++;
        this.visitCheckedIn = false;
    }

    private updateRoomLabels(): void {
        for (const room of this.rooms) {
            if (room.statusLabel) room.statusLabel.string = room.occupied ? 'Occupied' : 'Empty';
        }
    }
}
