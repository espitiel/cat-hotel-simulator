import { _decorator, BlockInputEvents, Button, Color, Component, Graphics, Label, Node, Sprite, UITransform } from 'cc';
import { CaretakerMovement } from './CaretakerMovement';
import { COMFORT_PRICE, GuestCheckIn, LEVEL_TWO_PRICE } from './GuestCheckIn';

const { ccclass, property } = _decorator;

@ccclass('RoomUpgradeMenu')
export class RoomUpgradeMenu extends Component {
    @property(GuestCheckIn) hotel: GuestCheckIn | null = null;
    @property(CaretakerMovement) movement: CaretakerMovement | null = null;
    @property([Node]) tabs: Node[] = [];
    @property(Label) hotelHeading: Label | null = null;
    @property([Node]) roomFloors: Node[] = [];

    private overlay: Node | null = null;
    private panels: Node[] = [];
    private activeTab = 0;
    private tabListeners: (() => void)[] = [];
    private status: Label | null = null;
    private feedback: Label | null = null;
    private comfort: Label | null = null;
    private levels: Label[] = [];
    private decorations: { node: Node; room: number; comfort: boolean }[] = [];

    protected start(): void {
        if (!this.hotel) return;
        this.tabs.forEach((tab, index) => {
            tab.getComponent(Button) ?? tab.addComponent(Button);
            const select = () => this.open(index);
            tab.on(Button.EventType.CLICK, select, this);
            this.tabListeners.push(select);
        });

        const overlay = this.createNode(this.node, 'Management Panel Overlay', 720, 1000, 0);
        overlay.addComponent(BlockInputEvents);
        this.overlay = overlay;
        overlay.active = false;
        const panel = this.createNode(overlay, 'Upgrade Menu Panel', 568, 524, 0);
        this.panels.push(panel);
        this.paint(panel, 568, 524, new Color(255, 242, 222));
        this.text(panel, 'Hotel Upgrades', 212, 30);
        this.status = this.text(panel, '', 138, 22, 104);
        this.comfort = this.button(panel, 'Room 1 Comfort Decoration', 48, () => this.buy(1, 'comfort'));
        this.levels = [
            this.button(panel, 'Room 1 Level Upgrade', -18, () => this.buy(1, 'level')),
            this.button(panel, 'Room 2 Level Upgrade', -84, () => this.buy(2, 'level')),
        ];
        this.feedback = this.text(panel, '', -148, 20, 42);
        this.button(panel, 'Close', -210, this.close);
        for (const title of ['Cat Collection', 'Shop']) {
            const page = this.createNode(overlay, title + ' Panel', 568, 294, 0);
            this.paint(page, 568, 294, new Color(255, 242, 222));
            this.text(page, title, 89, 30);
            this.text(page, 'Coming Soon', 22, 23);
            this.button(page, 'Close', -84, this.close);
            this.panels.push(page);
        }
        this.roomFloors.forEach((floor, index) => this.decorate(floor, index + 1));
        this.hotel.node.on('stay-changed', this.refresh, this);
        this.hotel.node.on('upgrades-changed', this.refresh, this);
        this.highlightTab();
        this.refresh();
    }

    protected onDisable(): void { this.close(); }

    protected onDestroy(): void {
        this.tabs.forEach((tab, index) => {
            const listener = this.tabListeners[index];
            if (listener) tab.off(Button.EventType.CLICK, listener, this);
        });
        this.hotel?.node.off('stay-changed', this.refresh, this);
        this.hotel?.node.off('upgrades-changed', this.refresh, this);
        this.overlay?.destroy();
        for (const entry of this.decorations) entry.node.destroy();
    }

    private open(index: number): void {
        if (!this.enabledInHierarchy || !this.overlay) return;
        this.movement?.cancelWalk();
        this.node.emit('caretaker-drag');
        if (index === 0) { this.close(); return; }
        this.activeTab = index;
        this.panels.forEach((panel, i) => { panel.active = i + 1 === index; });
        this.highlightTab();
        if (this.feedback) this.feedback.string = '';
        this.refresh();
        this.overlay.setSiblingIndex(this.node.children.length - 1);
        this.overlay.active = true;
    }

    private close(): void {
        if (this.overlay) this.overlay.active = false;
        this.activeTab = 0;
        this.highlightTab();
    }

    private highlightTab(): void {
        this.tabs.forEach((tab, index) => {
            const inset = tab.children[0]?.getComponent(Sprite);
            if (inset) inset.color = index === this.activeTab ? new Color(244, 183, 138) : new Color(255, 231, 206);
        });
    }

    private buy(room: number, kind: 'comfort' | 'level'): void {
        if (!this.overlay?.activeInHierarchy || this.activeTab !== 1 || !this.hotel || !this.feedback) return;
        this.feedback.string = this.hotel.purchaseUpgrade(room, kind);
    }

    private refresh(): void {
        const hotel = this.hotel;
        if (!hotel || !this.status || !this.comfort) return;
        const progress = hotel.getRankProgress();
        const balance = hotel.getCoinBalance();
        if (this.hotelHeading) {
            const progressText = progress.rank === 2 ? 'Rank 2 · Max rank'
                : `Rank 1 · ${Math.min(progress.completed, 5)}/5 stays · ${progress.average.toFixed(1)}/60 avg`;
            const heading = `CAT HOTEL\n${progressText}`;
            if (this.hotelHeading.string !== heading) this.hotelHeading.string = heading;
        }
        const rankLine = progress.rank === 2 ? 'Rank 2 unlocked' : 'Unlock Rank 2 with 5 stays and a 60/100 average';
        this.status.string = `Coins: ${balance}    •    Hotel Rank ${progress.rank}\n` +
            `Completed: ${progress.completed}    •    Recent average: ${progress.average.toFixed(1)}/100\n${rankLine}`;
        const comfort = hotel.getRoomUpgrade(1)?.comfortDecoration;
        this.comfort.string = `Room 1 Comfort Decoration · ${COMFORT_PRICE} coins\n` +
            (comfort ? 'Owned' : balance >= COMFORT_PRICE ? 'Available' : 'Not enough coins');
        this.levels.forEach((label, index) => {
            const room = hotel.getRoomUpgrade(index + 1);
            if (!room) return;
            const state = room.level === 2 ? 'Owned' : progress.rank < 2 ? 'Locked until Rank 2'
                : balance >= LEVEL_TWO_PRICE ? 'Available' : 'Not enough coins';
            label.string = `Room ${index + 1} · Level ${room.level} · Base ${room.basePayment}\nLevel 2 · ${LEVEL_TWO_PRICE} coins · ${state}`;
        });
        for (const entry of this.decorations) {
            const room = hotel.getRoomUpgrade(entry.room);
            entry.node.active = entry.comfort ? !!room?.comfortDecoration : room?.level === 2;
        }
    }

    private createNode(parent: Node, name: string, width: number, height: number, y: number): Node {
        const node = new Node(name);
        node.layer = parent.layer;
        node.setParent(parent);
        node.setPosition(0, y, 0);
        node.addComponent(UITransform).setContentSize(width, height);
        return node;
    }

    private text(parent: Node, value: string, y: number, size: number, height = 38, width = 516): Label {
        const node = this.createNode(parent, 'Text', width, height, y);
        const label = node.addComponent(Label);
        label.string = value;
        label.fontSize = size;
        label.lineHeight = size + 4;
        label.color = new Color(84, 48, 35);
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        label.overflow = Label.Overflow.SHRINK;
        return label;
    }

    private button(panel: Node, title: string, y: number, click: () => void): Label {
        const node = this.createNode(panel, title, 510, 56, y);
        this.paint(node, 510, 56, new Color(244, 208, 191));
        node.addComponent(Button);
        node.on(Button.EventType.CLICK, click, this);
        return this.text(node, title, 0, 19, 50, 490);
    }

    private paint(node: Node, width: number, height: number, fill: Color): void {
        const graphics = node.addComponent(Graphics);
        graphics.lineWidth = 3;
        graphics.strokeColor = new Color(109, 66, 50);
        graphics.fillColor = fill;
        graphics.roundRect(-width / 2, -height / 2, width, height, 14);
        graphics.fill();
        graphics.stroke();
    }

    private decorate(floor: Node, room: number): void {
        const badge = this.createNode(floor, `Room ${room} Level 2 Badge`, 46, 26, 114);
        badge.setPosition(-64, 114, 0);
        this.paint(badge, 46, 26, new Color(255, 222, 143));
        this.text(badge, 'Lv 2', 0, 14, 22, 42);
        this.decorations.push({ node: badge, room, comfort: false });
        if (room !== 1) return;
        const mat = this.createNode(floor, 'Room 1 Comfort Mat', 46, 36, 67);
        mat.setPosition(-63, 67, 0);
        this.paint(mat, 46, 36, new Color(255, 191, 188));
        const paw = this.createNode(mat, 'Paw Detail', 30, 24, 0).addComponent(Graphics);
        paw.fillColor = new Color(158, 84, 76);
        paw.ellipse(0, -5, 8, 5);
        for (const x of [-9, 0, 9]) paw.circle(x, 5, 3);
        paw.fill();
        this.decorations.push({ node: mat, room, comfort: true });
    }
}
