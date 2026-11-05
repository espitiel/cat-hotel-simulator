/** Pure calculations shared by all rooms and checkout payments. */
export interface CareValues {
    hunger: number;
    happiness: number;
    cleanliness: number;
    energy: number;
}

export type CareRating = 'Poor' | 'Fair' | 'Good' | 'Excellent';

function clampNeed(value: number): number {
    return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
}

export function careQuality(values: CareValues): number {
    return ((100 - clampNeed(values.hunger)) + clampNeed(values.happiness) +
        clampNeed(values.cleanliness) + clampNeed(values.energy)) / 4;
}

export function satisfactionRating(average: number, finalQuality: number): {
    overall: number; score: number; rating: CareRating; multiplier: number;
} {
    const final = clampNeed(finalQuality);
    const safeAverage = Number.isFinite(average) ? clampNeed(average) : final;
    const overall = safeAverage * 0.7 + final * 0.3;
    const score = Math.round(overall);
    if (score < 40) return { overall, score, rating: 'Poor', multiplier: 0.75 };
    if (score < 60) return { overall, score, rating: 'Fair', multiplier: 0.90 };
    if (score < 80) return { overall, score, rating: 'Good', multiplier: 1.00 };
    return { overall, score, rating: 'Excellent', multiplier: 1.25 };
}

/** One runtime balance, with one credit permitted per stay ID. */
export class HotelWallet {
    private balanceValue = 0;
    private readonly paidStays = new Set<number>();

    public get balance(): number { return this.balanceValue; }
    public hasPaid(stayId: number): boolean { return this.paidStays.has(stayId); }

    public canCreditCheckout(stayId: number, coins: number): boolean {
        return Number.isSafeInteger(stayId) && stayId > 0 && !this.hasPaid(stayId) &&
            Number.isSafeInteger(coins) && coins >= 0 && Number.isSafeInteger(this.balanceValue + coins);
    }

    public creditCheckout(stayId: number, coins: number): boolean {
        if (!this.canCreditCheckout(stayId, coins)) return false;
        this.paidStays.add(stayId);
        this.balanceValue += coins;
        return true;
    }
}
