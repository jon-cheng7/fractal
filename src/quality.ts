// Render scale from frame times (phones)

const LEVELS = [0.25, 0.35, 0.5, 0.7, 1] as const;

// vs fastest interval seen ≈ refresh
const SLOW_RATIO = 1.5;
const FAST_RATIO = 1.15;
const DROP_COOLDOWN = 8;
const RAISE_COOLDOWN = 60;
// timer noise below this
const MIN_REAL_FRAME_MS = 6;

export class Quality {
    // start sharp
    private index = LEVELS.length - 1;
    private average = 0;
    private refreshMs = Infinity;
    private cooldown = 0;

    get scale(): number {
        return LEVELS[this.index] ?? 1;
    }

    update(frameMs: number): void {
        if (frameMs >= MIN_REAL_FRAME_MS) {
            this.refreshMs = Math.min(this.refreshMs, frameMs);
        }
        this.average =
            this.average === 0 ? frameMs : this.average * 0.8 + frameMs * 0.2;
        this.cooldown -= 1;
        if (this.cooldown > 0) return;

        if (this.average > this.refreshMs * SLOW_RATIO && this.index > 0) {
            this.index -= 1;
            this.settle(DROP_COOLDOWN);
        } else if (
            this.average < this.refreshMs * FAST_RATIO &&
            this.index < LEVELS.length - 1
        ) {
            this.index += 1;
            this.settle(RAISE_COOLDOWN);
        }
    }

    // remeasure at the new res
    private settle(cooldown: number): void {
        this.cooldown = cooldown;
        this.average = 0;
    }
}
