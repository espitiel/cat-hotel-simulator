import { _decorator, Component, Label, Node, Vec3 } from 'cc';

const { ccclass, property } = _decorator;

/** Moves one customer along an assigned route to a single waiting seat. */
@ccclass('CustomerArrival')
export class CustomerArrival extends Component {
    @property([Node])
    waypoints: Node[] = [];

    @property(Node)
    waitingSeat: Node | null = null;

    @property(Node)
    waitingIndicator: Node | null = null;

    @property
    speed = 100;

    public state: 'Walking' | 'Waiting' | 'Completed' = 'Walking';
    private waypointIndex = 0;
    private readonly destination = new Vec3();
    private readonly entrancePosition = new Vec3();
    private waitingText = 'Waiting';

    /** The seat is occupied once this customer reaches it. */
    public get occupiedSeat(): Node | null {
        return this.state === 'Waiting' ? this.waitingSeat : null;
    }

    protected onLoad(): void {
        this.entrancePosition.set(this.node.position);
        if (this.waitingIndicator) this.waitingIndicator.active = false;
    }

    /** Finish this visit and release the single waiting seat. */
    public completeVisit(): boolean {
        if (this.state !== 'Waiting') return false;
        this.state = 'Completed';
        if (this.waitingIndicator) this.waitingIndicator.active = false;
        this.node.active = false;
        return true;
    }

    /** Reuse the same character and route for a new visit. */
    public startNextVisit(waitingText = 'Waiting'): boolean {
        if (this.state !== 'Completed') return false;
        this.waypointIndex = 0;
        this.waitingText = waitingText;
        this.node.setPosition(this.entrancePosition);
        if (this.waitingIndicator) this.waitingIndicator.active = false;
        this.state = 'Walking';
        this.node.active = true;
        return true;
    }

    protected update(deltaTime: number): void {
        if (this.state !== 'Walking' || !this.waitingSeat || !this.node.parent || this.speed <= 0) return;

        let distanceLeft = this.speed * Math.max(0, deltaTime);
        while (distanceLeft > 0 && this.state === 'Walking') {
            const target = this.waypointIndex < this.waypoints.length
                ? this.waypoints[this.waypointIndex]
                : this.waitingSeat;
            if (!target) return;

            // The route and seat can be positioned anywhere in the scene hierarchy.
            this.node.parent.inverseTransformPoint(this.destination, target.worldPosition);
            const position = this.node.position;
            const dx = this.destination.x - position.x;
            const dy = this.destination.y - position.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance <= distanceLeft) {
                this.node.setPosition(this.destination.x, this.destination.y, position.z);
                distanceLeft -= distance;
                if (this.waypointIndex < this.waypoints.length) {
                    this.waypointIndex++;
                } else {
                    this.state = 'Waiting';
                    if (this.waitingIndicator) {
                        const label = this.waitingIndicator.getComponent(Label);
                        if (label) label.string = this.waitingText;
                        this.waitingIndicator.active = true;
                    }
                }
            } else {
                this.node.setPosition(position.x + dx / distance * distanceLeft, position.y + dy / distance * distanceLeft, position.z);
                distanceLeft = 0;
            }
        }
    }
}
