import { _decorator, Button, Color, Component, instantiate, Label, Node, UITransform, Vec2 } from 'cc';
import { CaretakerMovement } from './CaretakerMovement';
import { CatFeeding } from './CatFeeding';
import type { CareAction } from './CatFeeding';
import { ProximityInteraction } from './ProximityInteraction';

const { ccclass, property } = _decorator;
type Selection = { room: number; stay: number; object: Node; cleaning: boolean };

@ccclass('CaretakerInteraction')
export class CaretakerInteraction extends Component {
    @property(CaretakerMovement) movement: CaretakerMovement | null = null;
    @property(CatFeeding) care: CatFeeding | null = null;
    @property(ProximityInteraction) reception: ProximityInteraction | null = null;
    @property(Node) desk: Node | null = null;
    @property([Node]) cats: Node[] = [];

    private selection: Selection | null = null;
    private markers: Node[] = [];
    private menu: { action: CareAction | 'close'; node: Node }[] = [];

    protected onEnable(): void {
        this.node.on('caretaker-tap', this.tap, this);
        this.node.on('caretaker-drag', this.close, this);
        this.reception?.node.on('interaction', this.stopAuto, this);
    }

    protected onDisable(): void {
        this.node.off('caretaker-tap', this.tap, this);
        this.node.off('caretaker-drag', this.close, this);
        this.reception?.node.off('interaction', this.stopAuto, this);
        this.movement?.cancelWalk();
        this.close();
        for (const marker of this.markers) marker.active = false;
    }

    protected onDestroy(): void {
        for (const entry of this.menu) entry.node.destroy();
        for (const marker of this.markers) marker.destroy();
    }

    protected start(): void {
        const care = this.care;
        if (!care) return;
        const buttons = [
            { action: 'feed', source: care.feedButton },
            { action: 'pet', source: care.petButton },
            { action: 'rest', source: care.restButton },
            { action: 'clean', source: care.cleanButton },
            { action: 'close', source: care.restButton },
        ] as const;
        for (const { action, source } of buttons) {
            if (!source) continue;
            const node = instantiate(source);
            node.name = `Autowalk ${action}`;
            node.active = false;
            node.setParent(this.node);
            if (action === 'close') {
                const label = node.getComponentInChildren(Label);
                if (label) label.string = 'CLOSE';
            }
            node.on(Button.EventType.CLICK, () => {
                if (action === 'close') this.close();
                else this.choose(action);
            });
            this.menu.push({ action, node });
        }
        for (const point of care.cleaningPoints) {
            const marker = new Node('Cleaning Target');
            marker.layer = point.layer;
            marker.active = false;
            marker.setParent(point);
            const label = marker.addComponent(Label);
            label.string = 'Clean spot';
            label.fontSize = 16;
            label.lineHeight = 20;
            label.isBold = true;
            label.color = new Color(90, 54, 39);
            label.overflow = Label.Overflow.CLAMP;
            marker.getComponent(UITransform)?.setContentSize(90, 30);
            this.markers.push(marker);
        }
    }

    protected update(): void {
        this.markers.forEach((marker, index) => {
            marker.active = this.care?.checkIn?.getActiveStayId(index + 1) != null;
        });
        if (this.selection && !this.valid(this.selection)) this.close();
    }

    private hit(node: Node | null, screenPoint: Vec2, windowId: number): boolean {
        return !!node?.activeInHierarchy && !!node.getComponent(UITransform)?.hitTest(screenPoint, windowId);
    }

    private tap(screenPoint: Vec2, windowId: number): void {
        if (this.hit(this.desk, screenPoint, windowId)) {
            this.close();
            const reception = this.reception;
            if (reception?.interactionPoint) {
                const point = reception.interactionPoint;
                this.movement?.walkTo(point, () => point.activeInHierarchy && !!this.desk?.activeInHierarchy,
                    arrived => {
                        if (!arrived || !reception.interact()) reception.showMessage('Cannot reach reception.');
                    });
            }
            return;
        }
        const cat = this.cats.findIndex(node => this.hit(node, screenPoint, windowId));
        const cleaning = cat < 0;
        const index = cleaning ? this.markers.findIndex(node => this.hit(node, screenPoint, windowId)) : cat;
        if (index < 0) { this.close(); return; }
        this.movement?.cancelWalk();
        this.close();
        const stay = this.care?.checkIn?.getActiveStayId(index + 1);
        if (stay == null) { this.reception?.showMessage('That stay is no longer active.'); return; }
        this.selection = { room: index + 1, stay, object: cleaning ? this.markers[index] : this.cats[index], cleaning };
        if (this.care) this.care.contextMenuOpen = true;
        for (const entry of this.menu) {
            entry.node.active = entry.action === 'close' || (entry.action === 'clean') === cleaning;
            if (entry.action === 'close') entry.node.setPosition(cleaning ? -35 : -205, 10, 0);
        }
        this.reception?.showMessage(`Room ${index + 1}: Choose an action.`);
    }

    private valid(selection: Selection): boolean {
        return selection.object.activeInHierarchy &&
            this.care?.checkIn?.getActiveStayId(selection.room) === selection.stay;
    }

    private choose(action: CareAction): void {
        const selected = this.selection;
        this.close();
        if (!selected || (action === 'clean') !== selected.cleaning || !this.valid(selected)) {
            this.reception?.showMessage('That action is no longer available.');
            return;
        }
        const target = this.care?.actionPoints(action)[selected.room - 1];
        if (!target) { this.reception?.showMessage('No reachable action point.'); return; }
        if (this.care) this.care.contextMenuOpen = true;
        this.movement?.walkTo(target, () => this.valid(selected) && target.activeInHierarchy, arrived => {
            this.close();
            if (!arrived || !this.care?.performCare(action, selected.room, selected.stay)) {
                this.reception?.showMessage('Action unavailable or unreachable.');
            }
        });
    }

    private stopAuto(): void {
        this.movement?.cancelWalk();
        this.close();
    }

    private close(): void {
        this.selection = null;
        if (this.care) this.care.contextMenuOpen = false;
        for (const entry of this.menu) entry.node.active = false;
    }
}
