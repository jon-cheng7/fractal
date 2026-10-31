// On-screen chrome: the title with the lessons button, the control bar, and the zoom readout.

export interface ControlActions {
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

    // Title, top left. The lessons button sits with it so a newcomer finds it first.
    const brand = document.createElement('div');
    brand.className = 'fx-brand';
    brand.dataset.fxUi = '';
    const name = document.createElement('p');
    name.className = 'fx-brand-name';
    name.textContent = 'MANDELBROT';
    const learn = button('LEARN', 'What am I looking at? (L)', actions.toggleLearn);
    learn.classList.add('fx-btn-primary');
    brand.append(name, learn);

    // Everything here ignores pointer input on the fractal; see input.ts.
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

    // Zoom readout and the one-line how-to, bottom left.
    const status = document.createElement('p');
    status.className = 'fx-status';
    const zoomText = document.createElement('span');
    zoomText.className = 'fx-status-zoom';
    const hint = document.createElement('span');
    hint.className = 'fx-status-hint';
    hint.textContent = touch ? 'DRAG · PINCH · DOUBLE-TAP' : 'DRAG · SCROLL · DOUBLE-CLICK';
    status.append(zoomText, hint);

    parent.append(brand, bar, status);

    let shown = '';
    return {
        setPressed(which, on) {
            toggles[which].setAttribute('aria-pressed', String(on));
        },
        setZoom(zoom) {
            const text = formatZoom(zoom);
            if (text !== shown) zoomText.textContent = shown = text;
        },
    };
}
