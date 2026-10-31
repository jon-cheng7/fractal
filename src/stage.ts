// Canvas sizing from the container, DPR-aware

import type { Size } from './view.ts';

// >2x costs more than it shows
const MAX_DPR = 2;

export interface Stage {
    readonly css: Size;
    readonly buffer: Size;
    /** resizing clears the buffer: draw right after */
    setRenderScale(scale: number): void;
}

export function createStage(
    container: HTMLElement,
    canvas: HTMLCanvasElement,
    onChange: () => void,
): Stage {
    let css: Size = {
        w: Math.max(1, container.clientWidth),
        h: Math.max(1, container.clientHeight),
    };
    let dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    let renderScale = 1;
    let buffer: Size = { w: 1, h: 1 };

    function apply(): void {
        const w = Math.max(1, Math.round(css.w * dpr * renderScale));
        const h = Math.max(1, Math.round(css.h * dpr * renderScale));
        if (w !== buffer.w || h !== buffer.h) {
            canvas.width = w;
            canvas.height = h;
            buffer = { w, h };
        }
    }

    new ResizeObserver((entries) => {
        const box = entries[entries.length - 1]?.contentRect;
        if (!box) return;
        css = { w: Math.max(1, box.width), h: Math.max(1, box.height) };
        apply();
        onChange();
    }).observe(container);

    // fires once per change, re-arm
    function watchDpr(): void {
        const query = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
        query.addEventListener(
            'change',
            () => {
                dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
                apply();
                onChange();
                watchDpr();
            },
            { once: true },
        );
    }
    watchDpr();
    apply();

    return {
        get css() {
            return css;
        },
        get buffer() {
            return buffer;
        },
        setRenderScale(scale: number) {
            renderScale = scale;
            apply();
        },
    };
}
