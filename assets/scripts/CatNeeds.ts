/** Runtime needs for one checked-in cat. Empty rooms have no instance. */
export class CatNeeds {
    private hungerValue = 65;
    private happinessValue = 50;

    public get hunger(): number {
        return this.hungerValue;
    }

    public get happiness(): number {
        return this.happinessValue;
    }

    /** Returns the new hunger value, clamped to the supported range. */
    public feed(): number {
        this.hungerValue = Math.max(0, Math.min(100, this.hungerValue - 35));
        return this.hungerValue;
    }

    /** Returns the new happiness value, clamped to the supported range. */
    public pet(): number {
        this.happinessValue = Math.max(0, Math.min(100, this.happinessValue + 25));
        return this.happinessValue;
    }
}
