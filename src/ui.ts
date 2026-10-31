// Button bar for zoom, reset, the orbit and stats toggles and a copy-link button. Collapsible so it can get out of the way.

export interface ControlActions {
    zoomIn(): void;
    zoomOut(): void;
    reset(): void;
    toggleOrbit(): void;
    toggleStats(): void;
    copyLink(): Promise<boolean>;
}

export type Toggle = 'orbit' | 'stats';

export interface Controls {
    setPressed(name: Toggle, on: boolean): void;
}

function button(label: string, title: string, onClick: () => void): HTMLButtonElement {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'fx-btn';
    el.textContent = label;
    el.title = title;
    el.setAttribute('aria-label', title);
    el.addEventListener('click', onClick);
    return el;
}

export function createControls(parent: HTMLElement, actions: ControlActions): Controls {
    const bar = document.createElement('div');
    bar.className = 'fx-controls';
    // Input ignores events that start inside anything carrying this attribute.
    bar.dataset.fxUi = '';

    const body = document.createElement('div');
    body.className = 'fx-controls-body';

    const zoomOut = button('−', 'Zoom out', actions.zoomOut);
    const zoomIn = button('+', 'Zoom in', actions.zoomIn);
    zoomOut.classList.add('fx-btn-zoom');
    zoomIn.classList.add('fx-btn-zoom');
    const reset = button('RESET', 'Back to the whole set (0)', actions.reset);
    const orbit = button('ORBIT', 'Trace the point under the cursor (O)', actions.toggleOrbit);
    const stats = button('STATS', 'Show frame stats (H)', actions.toggleStats);
    orbit.setAttribute('aria-pressed', 'false');
    stats.setAttribute('aria-pressed', 'false');

    const link = button('LINK', 'Copy a link to this view', () => {
        void actions.copyLink().then((ok) => {
            link.textContent = ok ? 'COPIED' : 'FAILED';
            window.setTimeout(() => {
                link.textContent = 'LINK';
            }, 1400);
        });
    });

    const toggle = button('HIDE', 'Hide the controls', () => {
        const open = body.hidden;
        body.hidden = !open;
        toggle.textContent = open ? 'HIDE' : 'CONTROLS';
        toggle.setAttribute('aria-expanded', String(open));
    });
    toggle.setAttribute('aria-expanded', 'true');

    body.append(zoomOut, zoomIn, reset, orbit, stats, link);
    bar.append(body, toggle);
    parent.append(bar);

    const toggles: Record<Toggle, HTMLButtonElement> = { orbit, stats };
    return {
        setPressed(name, on) {
            toggles[name].setAttribute('aria-pressed', String(on));
        },
    };
}
