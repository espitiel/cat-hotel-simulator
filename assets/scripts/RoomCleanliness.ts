/** Cleanliness for one occupied room during its current stay. */
export class RoomCleanliness {
    private value = 60;
    private locked = false;

    public get cleanliness(): number {
        return this.value;
    }

    public clean(): number {
        if (this.locked) return this.value;
        this.value = Math.max(0, Math.min(100, this.value + 30));
        return this.value;
    }

    public lock(): void {
        this.locked = true;
    }
}
