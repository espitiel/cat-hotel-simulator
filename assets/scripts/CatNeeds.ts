/** Runtime needs for one checked-in cat. Empty rooms have no instance. */
export class CatNeeds {
    private hungerValue = 65;

    public get hunger(): number {
        return this.hungerValue;
    }

    /** Returns the new hunger value, clamped to the supported range. */
    public feed(): number {
        this.hungerValue = Math.max(0, Math.min(100, this.hungerValue - 35));
        return this.hungerValue;
    }
}
