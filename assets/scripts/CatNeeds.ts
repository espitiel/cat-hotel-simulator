/** Runtime needs for one checked-in cat. Empty rooms have no instance. */
export class CatNeeds {
    private hungerValue = 65;
    private happinessValue = 50;
    private energyValue = 70;
    private restRemaining = 0;
    private locked = false;

    public get hunger(): number {
        return this.hungerValue;
    }

    public get happiness(): number {
        return this.happinessValue;
    }

    public get energy(): number {
        return this.energyValue;
    }

    public get resting(): boolean {
        return this.restRemaining > 0;
    }

    public get restSecondsRemaining(): number {
        return this.restRemaining;
    }

    /** End an unfinished activity without awarding energy. */
    public cancelRest(): void {
        this.restRemaining = 0;
    }

    /** Freeze completed-stay needs, including any references retained elsewhere. */
    public lock(): void {
        this.cancelRest();
        this.locked = true;
    }

    /** Start an explicit energy-recovery activity, not a cosmetic nap. */
    public startRest(): boolean {
        if (this.locked || this.resting || this.energyValue >= 100) return false;
        this.restRemaining = 10;
        return true;
    }

    /** Advance active gameplay time; return true exactly once upon completion. */
    public advanceRest(deltaTime: number): boolean {
        if (this.locked || !this.resting || !Number.isFinite(deltaTime) || deltaTime <= 0) return false;
        this.restRemaining = Math.max(0, this.restRemaining - deltaTime);
        if (this.restRemaining > 0) return false;
        this.energyValue = Math.max(0, Math.min(100, this.energyValue + 30));
        return true;
    }

    /** Returns the new hunger value, clamped to the supported range. */
    public feed(): number {
        if (this.locked) return this.hungerValue;
        this.hungerValue = Math.max(0, Math.min(100, this.hungerValue - 35));
        return this.hungerValue;
    }

    /** Returns the new happiness value, clamped to the supported range. */
    public pet(): number {
        if (this.locked) return this.happinessValue;
        this.happinessValue = Math.max(0, Math.min(100, this.happinessValue + 25));
        return this.happinessValue;
    }
}
