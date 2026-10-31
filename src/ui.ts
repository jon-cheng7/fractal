// Chrome: fractal menu, controls, zoom readout, Julia c

import { JULIA_PRESETS, KINDS } from './fractals/kinds.ts';
import type { Kind, KindId } from './fractals/kinds.ts';

export interface ControlActions {
    pickKind(id: KindId): void;
    pickJulia(re: string, im: string): void;
    zoomIn(): void;
    zoomOut(): void;
    reset(): void;
    toggleLearn(): void;
    toggleOrbit(): void;
    toggleAxes(): void;
    toggleStats(): void;
    copyLink(): Promise<boolean>;
}

export type Toggle = 'learn' | 'orbit' | 'axes' | 'stats';

export interface Controls {
    setPressed(name: Toggle, on: boolean): void;
    setZoom(zoom: number): void;
    setKind(kind: Kind): void;
    /** null hides it */
    setJulia(text: string | null): void;
}

function button(label: string, title: string, onClick: () => void): HTMLButtonElement {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'fx-btn';
    el.textContent = label;
    el.title = title;
    el.addEventListener('click', onClick);
    return el;
}

function formatZoom(zoom: number): string {
    if (zoom < 10) return `${zoom.toFixed(1)}×`;
    if (zoom < 1e5) return `${Math.round(zoom).toLocaleString('en')}×`;
    const power = Math.floor(Math.log10(zoom));
    return `${(zoom / 10 ** power).toFixed(1)} × 10^${power}`;
}

export function createControls(parent: HTMLElement, actions: ControlActions): Controls {
    const touch = matchMedia('(pointer: coarse)').matches;

    // title + learn, top left
    const brand = document.createElement('div');
    brand.className = 'fx-brand';
    brand.dataset.fxUi = '';
    // name opens the fractal menu
    const name = document.createElement('button');
    name.type = 'button';
    name.className = 'fx-brand-name';
    name.setAttribute('aria-haspopup', 'true');
    name.setAttribute('aria-expanded', 'false');
    const menu = document.createElement('div');
    menu.className = 'fx-menu';
    menu.hidden = true;
    const items = KINDS.map((kind) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'fx-menu-item';
        const title = document.createElement('span');
        title.className = 'fx-menu-title';
        title.textContent = kind.name;
        const blurb = document.createElement('span');
        blurb.className = 'fx-menu-blurb';
        blurb.textContent = kind.blurb;
        item.append(title, blurb);
        item.addEventListener('click', () => {
            setMenu(false);
            actions.pickKind(kind.id);
        });
        menu.append(item);
        return { kind, item };
    });
    function setMenu(open: boolean): void {
        menu.hidden = !open;
        name.setAttribute('aria-expanded', String(open));
    }
    name.addEventListener('click', () => setMenu(name.getAttribute('aria-expanded') !== 'true'));
    // close on outside press
    document.addEventListener('pointerdown', (e) => {
        if (!menu.hidden && e.target instanceof Node && !brand.contains(e.target)) setMenu(false);
    });
    const learn = button('LEARN', 'What am I looking at? (L)', actions.toggleLearn);
    learn.classList.add('fx-btn-primary');
    brand.append(name, learn, menu);

    // data-fx-ui: input ignores these
    const bar = document.createElement('div');
    bar.className = 'fx-controls';
    bar.dataset.fxUi = '';
    const body = document.createElement('div');
    body.className = 'fx-controls-body';

    const zoomOut = button('−', 'Zoom out (-)', actions.zoomOut);
    const zoomIn = button('+', 'Zoom in (+)', actions.zoomIn);
    zoomOut.classList.add('fx-btn-zoom');
    zoomIn.classList.add('fx-btn-zoom');
    const reset = button('RESET', 'Back to the whole set (0)', actions.reset);
    const orbit = button('ORBIT', 'Trace z → z² + c for a point (O)', actions.toggleOrbit);
    const axes = button('AXES', 'Show the number grid (A)', actions.toggleAxes);
    const stats = button('STATS', 'Frame stats (H)', actions.toggleStats);
    const link = button('LINK', 'Copy a link to this view', () => {
        void actions.copyLink().then((ok) => {
            link.textContent = ok ? 'COPIED' : 'FAILED';
            window.setTimeout(() => {
                link.textContent = 'LINK';
            }, 1400);
        });
    });
    const toggles: Record<Toggle, HTMLButtonElement> = { learn, orbit, axes, stats };
    for (const el of Object.values(toggles)) el.setAttribute('aria-pressed', 'false');

    const hide = button('HIDE', 'Hide the controls', () => {
        const opening = body.hidden;
        body.hidden = !opening;
        hide.textContent = opening ? 'HIDE' : 'CONTROLS';
        hide.setAttribute('aria-expanded', String(opening));
    });
    hide.classList.add('fx-controls-hide');
    hide.setAttribute('aria-expanded', 'true');

    body.append(zoomOut, zoomIn, reset, orbit, axes, stats, link);
    bar.append(body, hide);

    // zoom readout + how-to
    const status = document.createElement('p');
    status.className = 'fx-status';
    const zoomText = document.createElement('span');
    zoomText.className = 'fx-status-zoom';
    const hint = document.createElement('span');
    hint.className = 'fx-status-hint';
    hint.textContent = touch ? 'DRAG · PINCH · DOUBLE-TAP' : 'DRAG · SCROLL · DOUBLE-CLICK';
    status.append(zoomText, hint);

    // Julia c presets
    const julia = document.createElement('div');
    julia.className = 'fx-julia';
    julia.dataset.fxUi = '';
    julia.hidden = true;
    const juliaValue = document.createElement('p');
    juliaValue.className = 'fx-julia-value';
    const presets = document.createElement('div');
    presets.className = 'fx-julia-presets';
    for (const preset of JULIA_PRESETS) {
        const chip = button(preset.name, `c = ${preset.re} + ${preset.im}i`, () =>
            actions.pickJulia(preset.re, preset.im),
        );
        presets.append(chip);
    }
    julia.append(juliaValue, presets);

    parent.append(brand, bar, status, julia);

    let shown = '';
    return {
        setPressed(which, on) {
            toggles[which].setAttribute('aria-pressed', String(on));
        },
        setKind(kind) {
            name.textContent = `${kind.name} ▾`;
            // no orbit for shapes
            orbit.hidden = kind.family === 'shape';
            for (const { kind: k, item } of items) item.setAttribute('aria-current', String(k.id === kind.id));
        },
        setJulia(text) {
            julia.hidden = text === null;
            if (text !== null) juliaValue.textContent = text;
        },
        setZoom(zoom) {
            const text = formatZoom(zoom);
            if (text !== shown) zoomText.textContent = shown = text;
        },
    };
}
