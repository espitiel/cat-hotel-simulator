import { _decorator, Component, ResolutionPolicy, view } from 'cc';

const { ccclass, executionOrder } = _decorator;

/** Fit the entire portrait layout without changing gameplay coordinates. */
@ccclass('ScreenAdaptation')
@executionOrder(-10000)
export class ScreenAdaptation extends Component {
    protected onLoad(): void {
        view.setDesignResolutionSize(720, 1280, ResolutionPolicy.SHOW_ALL);
    }
}
