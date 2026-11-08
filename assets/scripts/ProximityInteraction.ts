import { _decorator, Component, Label, Node, Vec3 } from 'cc';

const { ccclass, property } = _decorator;

/** A reusable button for an accessible point near an interactive object. */
@ccclass('ProximityInteraction')
export class ProximityInteraction extends Component {
    @property(Node)
    caretaker: Node | null = null;

    @property(Node)
    interactionPoint: Node | null = null;

    @property(Node)
    interactButton: Node | null = null;

    @property(Node)
    messageNode: Node | null = null;

    @property
    interactionRange = 65;

    @property
    messageText = 'Reception ready!';

    @property
    messageDuration = 2;

    protected onEnable(): void {
        if (this.interactButton) {
            // Node touch events also receive mouse clicks in Creator Preview.
            this.interactButton.on(Node.EventType.TOUCH_END, this.interact, this);
            this.interactButton.active = false;
        }
        if (this.messageNode) this.messageNode.active = false;
    }

    protected onDisable(): void {
        this.interactButton?.off(Node.EventType.TOUCH_END, this.interact, this);
        this.unschedule(this.hideMessage);
        if (this.interactButton) this.interactButton.active = false;
        if (this.messageNode) this.messageNode.active = false;
    }

    protected update(): void {
        if (this.interactButton) this.interactButton.active = this.isInRange();
    }

    private isInRange(): boolean {
        if (!this.caretaker || !this.interactionPoint || !this.interactionPoint.activeInHierarchy) return false;
        const distance = Vec3.distance(this.caretaker.worldPosition, this.interactionPoint.worldPosition);
        return distance <= Math.max(0, this.interactionRange);
    }

    public interact(): boolean {
        if (!this.isInRange()) return false;
        this.showMessage(this.messageText);
        // Future hotel objects can listen for this event to perform their own action.
        this.node.emit('interaction', this);
        return true;
    }

    /** Show brief feedback without adding another input-blocking UI element. */
    public showMessage(text: string): void {
        if (this.messageNode) {
            const label = this.messageNode.getComponent(Label);
            if (label) label.string = text;
            this.messageNode.active = true;
            this.unschedule(this.hideMessage);
            this.scheduleOnce(this.hideMessage, Math.max(0, this.messageDuration));
        }
    }

    private hideMessage(): void {
        if (this.messageNode) this.messageNode.active = false;
    }
}
