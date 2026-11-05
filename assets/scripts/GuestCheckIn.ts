import { _decorator, Component, Label, Node } from 'cc';
import { CustomerArrival } from './CustomerArrival';
import { ProximityInteraction } from './ProximityInteraction';

const { ccclass, property } = _decorator;

/** The first check-in: one waiting customer and one guest cat. */
@ccclass('GuestCheckIn')
export class GuestCheckIn extends Component {
    @property(CustomerArrival)
    customer: CustomerArrival | null = null;

    @property(ProximityInteraction)
    reception: ProximityInteraction | null = null;

    @property(Node)
    guestCat: Node | null = null;

    // Room labels are ordered by room number, ready for additional rooms later.
    @property([Label])
    roomStatusLabels: Label[] = [];

    private rooms: boolean[] = [];
    private checkedIn = false;

    protected onLoad(): void {
        this.rooms = this.roomStatusLabels.map(() => false);
        if (this.guestCat) this.guestCat.active = false;
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
        if (this.checkedIn) {
            this.reception.showMessage('Room 1 is already occupied.');
            return;
        }
        if (!this.customer || this.customer.state !== 'Waiting') {
            this.reception.showMessage('Please wait for the customer.');
            return;
        }
        if (!this.guestCat || this.rooms.length === 0 || this.rooms[0]) {
            this.reception.showMessage('Room 1 is unavailable.');
            return;
        }

        this.rooms[0] = true;
        this.checkedIn = true;
        this.guestCat.active = true;
        this.updateRoomLabels();
        this.reception.showMessage('Room 1 check-in complete!');
    }

    private updateRoomLabels(): void {
        this.roomStatusLabels.forEach((label, index) => {
            if (label) label.string = this.rooms[index] ? 'Occupied' : 'Empty';
        });
    }
}
