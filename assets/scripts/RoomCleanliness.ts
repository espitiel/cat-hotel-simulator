/** Cleanliness for one occupied room during its current stay. */
export class RoomCleanliness {
    private value = 60;

    public get cleanliness(): number {
        return this.value;
    }

    public clean(): number {
        this.value = Math.max(0, Math.min(100, this.value + 30));
        return this.value;
    }
}
