// Stats readout (H)

export interface HudStats {
    zoom: number;
    width: number;
    height: number;
    fps: number | null;
    detail: string;
}

export interface Hud {
    readonly visible: boolean;
    toggle(): void;
    update(stats: HudStats): void;
}

const REFRESH_MS = 250;

function formatZoom(zoom: number): string {
    if (zoom < 10) return `${zoom.toFixed(2)}×`;
    if (zoom < 10000) return `${Math.round(zoom)}×`;
    return `${zoom.toExponential(2)}×`;
}

function row(label: string): { root: HTMLElement; value: HTMLElement } {
    const root = document.createElement('div');
    root.className = 'fx-hud-row';
    const term = document.createElement('dt');
    term.textContent = label;
    const value = document.createElement('dd');
    root.append(term, value);
    return { root, value };
}

export function createHud(parent: HTMLElement, visible: boolean): Hud {
    const el = document.createElement('dl');
    el.className = 'fx-hud';
    el.hidden = !visible;

    const zoom = row('ZOOM');
    const res = row('RES');
    const fps = row('FPS');
    const detail = row('ITER');
    zoom.value.classList.add('fx-hud-accent');
    el.append(zoom.root, res.root, fps.root, detail.root);
    parent.append(el);

    let latest: HudStats | null = null;
    let timer = 0;

    function write(): void {
        timer = 0;
        if (!latest || el.hidden) return;
        zoom.value.textContent = formatZoom(latest.zoom);
        res.value.textContent = `${latest.width}×${latest.height}`;
        fps.value.textContent = latest.fps === null ? '—' : String(Math.round(latest.fps));
        detail.value.textContent = latest.detail;
    }

    return {
        get visible() {
            return !el.hidden;
        },
        toggle() {
            el.hidden = !el.hidden;
            write();
        },
        // throttled, trailing write
        update(stats) {
            latest = stats;
            if (timer === 0 && !el.hidden) timer = window.setTimeout(write, REFRESH_MS);
        },
    };
}
