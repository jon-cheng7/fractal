// Small mono readout of zoom, resolution, frame rate and iterations, plus the key hints. Toggled from the keyboard.

export interface HudStats {
    zoom: number;
    width: number;
    height: number;
    fps: number | null;
    detail: string;
}

export interface Hud {
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
        toggle() {
            el.hidden = !el.hidden;
            write();
        },
        // Throttled with a trailing write, so the last frame after an interaction always lands.
        update(stats) {
            latest = stats;
            if (timer === 0 && !el.hidden) timer = window.setTimeout(write, REFRESH_MS);
        },
    };
}

export function createHint(parent: HTMLElement): void {
    const el = document.createElement('p');
    el.className = 'fx-hint';
    // Static markup, no user input involved.
    el.innerHTML = matchMedia('(pointer: coarse)').matches
        ? 'DRAG TO PAN · PINCH TO ZOOM · TAP A POINT'
        : 'DRAG TO PAN · SCROLL TO ZOOM · <kbd>O</kbd> ORBIT · <kbd>H</kbd> STATS · <kbd>0</kbd> RESET';
    parent.append(el);
}
