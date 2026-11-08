import { _decorator, BlockInputEvents, Button, Color, Component, Graphics, instantiate, Label, Node, UITransform, Vec2 } from 'cc';
import { CaretakerMovement } from './CaretakerMovement';
import { CatFeeding } from './CatFeeding';
import type { CareAction } from './CatFeeding';
import { ProximityInteraction } from './ProximityInteraction';

const { ccclass, property } = _decorator;
type Selection = { room: number; stay: number; object: Node; cleaning: boolean };
const CAT_BUTTON_POSITIONS = { feed: [-240, -87], pet: [-70, -87], rest: [-240, -150], close: [-70, -150] };

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
    private panel: Node | null = null;
    private panelArt: Graphics | null = null;
    private panelTitle: Label | null = null;
    private panelStatus: Label | null = null;
    private stats: Label[] = [];
    private lastStats = '';

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
        this.panel?.destroy();
    }

    protected start(): void {
        const care = this.care;
        if (!care) return;
        this.buildPanel();
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
        if (this.selection && !this.selection.cleaning) this.refreshPanel(this.selection);
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
        const hotel = this.care?.checkIn;
        const stay = cleaning ? hotel?.getActiveStayId(index + 1) : hotel?.getRoomStayId(index + 1);
        if (stay == null) { this.reception?.showMessage('That stay is no longer active.'); return; }
        this.selection = { room: index + 1, stay, object: cleaning ? this.markers[index] : this.cats[index], cleaning };
        if (this.care) this.care.contextMenuOpen = true;
        if (cleaning) {
            for (const entry of this.menu) {
                entry.node.active = entry.action === 'close' || entry.action === 'clean';
                if (entry.action === 'close') entry.node.setPosition(-35, 10, 0);
            }
        } else if (this.panel) {
            this.panel.active = true;
            this.refreshPanel(this.selection);
        }
        this.reception?.showMessage(`Room ${index + 1}: Choose an action.`);
    }

    private valid(selection: Selection): boolean {
        return selection.object.activeInHierarchy &&
            this.care?.checkIn?.getRoomStayId(selection.room) === selection.stay;
    }

    private choose(action: CareAction): void {
        const selected = this.selection;
        this.close();
        if (!selected || (action === 'clean') !== selected.cleaning || !this.valid(selected) ||
            this.care?.checkIn?.getActiveStayId(selected.room) !== selected.stay) {
            this.reception?.showMessage('That action is no longer available.');
            return;
        }
        const target = this.care?.actionPoints(action)[selected.room - 1];
        if (!target) { this.reception?.showMessage('No reachable action point.'); return; }
        if (this.care) this.care.contextMenuOpen = true;
        this.movement?.walkTo(target, () => this.valid(selected) && target.activeInHierarchy &&
            this.care?.checkIn?.getActiveStayId(selected.room) === selected.stay, arrived => {
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
        if (this.panel) this.panel.active = false;
    }

    private buildPanel(): void {
        const panel = new Node('Guest Cat Details');
        panel.layer = this.node.layer;
        panel.setParent(this.node);
        panel.setPosition(-155, 0, 0);
        panel.addComponent(UITransform).setContentSize(366, 380);
        panel.addComponent(BlockInputEvents);
        this.panel = panel;
        this.panelArt = panel.addComponent(Graphics);
        this.panelTitle = this.panelText(panel, 154, 24, 338);
        this.panelStatus = this.panelText(panel, 120, 18, 338);
        this.stats = [83, 54, 25, -4].map(y => this.panelText(panel, y, 15, 168, -89));
        panel.active = false;
    }

    private panelText(parent: Node, y: number, size: number, width: number, x = 0): Label {
        const node = new Node('Guest Details Text');
        node.layer = parent.layer;
        node.setParent(parent);
        node.setPosition(x, y, 0);
        node.addComponent(UITransform).setContentSize(width, 29);
        const label = node.addComponent(Label);
        label.fontSize = size;
        label.lineHeight = size + 3;
        label.color = new Color(84, 48, 35);
        label.overflow = Label.Overflow.SHRINK;
        return label;
    }

    private refreshPanel(selected: Selection): void {
        const hotel = this.care?.checkIn;
        const needs = hotel?.getDisplayedCatNeeds(selected.room);
        const cleanliness = hotel?.getDisplayedRoomCleanliness(selected.room);
        if (!hotel || !needs || !cleanliness || !this.panelArt || !this.panelTitle || !this.panelStatus) return;
        const title = `Guest Cat · Room ${selected.room}`;
        const status = hotel.getRoomStatus(selected.room);
        if (this.panelTitle.string !== title) this.panelTitle.string = title;
        if (this.panelStatus.string !== status) this.panelStatus.string = status;
        const active = hotel.getActiveStayId(selected.room) === selected.stay;
        for (const { action, node } of this.menu) {
            if (action === 'clean') continue;
            const [x, y] = CAT_BUTTON_POSITIONS[action];
            if (node.position.x !== x || node.position.y !== y) node.setPosition(x, y, 0);
            node.active = action === 'close' || active;
        }
        const key = `${needs.hunger}:${needs.happiness}:${cleanliness.cleanliness}:${needs.energy}`;
        if (key === this.lastStats) return;
        this.lastStats = key;
        const values = [needs.hunger, needs.happiness, cleanliness.cleanliness, needs.energy];
        const names = ['Hunger ↓', 'Happiness', 'Cleanliness', 'Energy'];
        const colors = [new Color(225, 136, 117), new Color(227, 161, 179), new Color(141, 183, 132), new Color(135, 167, 208)];
        const art = this.panelArt;
        art.clear();
        art.fillColor = new Color(255, 242, 222);
        art.strokeColor = new Color(109, 66, 50);
        art.lineWidth = 3;
        art.roundRect(-183, -190, 366, 380, 16);
        art.fill();
        art.stroke();
        values.forEach((value, i) => {
            this.stats[i].string = `${names[i]}: ${value}/100`;
            const y = 76 - i * 29;
            art.fillColor = new Color(223, 202, 181);
            art.rect(3, y, 154, 12);
            art.fill();
            if (value > 0) {
                art.fillColor = colors[i];
                art.rect(3, y, 154 * value / 100, 12);
                art.fill();
            }
        });
    }
}
