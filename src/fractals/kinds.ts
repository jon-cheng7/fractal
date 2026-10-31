// Fractal list

import type { Formula } from '../math/orbit.ts';

export type KindId = 'mandelbrot' | 'julia' | 'ship' | 'tricorn' | 'sierpinski' | 'koch';

export interface Kind {
    id: KindId;
    name: string;
    family: 'escape' | 'shape';
    formula: Formula;
    blurb: string;
    rule: string;
    start: string;
    /** centre + plane units across short side */
    fit: { x: number; y: number; span: number };
    /** shapes only repeat; float64 ends ~1e13 */
    maxZoom: number;
    /** -1: ship drawn upside down (traditional) */
    imagSign: 1 | -1;
}

export const KINDS: readonly Kind[] = [
    {
        id: 'mandelbrot',
        name: 'MANDELBROT',
        formula: 0,
        blurb: 'z → z² + c, starting from 0. Every pixel is a c.',
        rule: 'z → z² + c',
        start: 'START AT 0',
        fit: { x: -0.5, y: 0, span: 3 },
        imagSign: 1,
        family: 'escape',
        maxZoom: Infinity,
    },
    {
        id: 'julia',
        name: 'JULIA',
        formula: 1,
        blurb: 'The same rule with c held fixed. Every pixel is a starting z.',
        rule: 'z → z² + c',
        start: 'START AT THE POINT',
        fit: { x: 0, y: 0, span: 3 },
        imagSign: 1,
        family: 'escape',
        maxZoom: Infinity,
    },
    {
        id: 'ship',
        name: 'BURNING SHIP',
        formula: 2,
        blurb: 'Fold z into the positive quarter, then square and add c.',
        rule: 'z → (|Re z| + i|Im z|)² + c',
        start: 'START AT 0',
        fit: { x: -0.5, y: 0.25, span: 3 },
        imagSign: -1,
        family: 'escape',
        maxZoom: Infinity,
    },
    {
        id: 'tricorn',
        name: 'TRICORN',
        formula: 3,
        blurb: 'Flip z across the real axis before squaring.',
        rule: 'z → conj(z)² + c',
        start: 'START AT 0',
        fit: { x: -0.25, y: 0, span: 3.6 },
        imagSign: 1,
        family: 'escape',
        maxZoom: Infinity,
    },
    {
        id: 'sierpinski',
        name: 'SIERPINSKI',
        family: 'shape',
        formula: 0,
        blurb: 'A triangle made of three half-size copies of itself.',
        rule: '',
        start: '',
        fit: { x: 0.5, y: Math.sqrt(3) / 4, span: 1.15 },
        imagSign: 1,
        maxZoom: 1e12,
    },
    {
        id: 'koch',
        name: 'KOCH SNOWFLAKE',
        family: 'shape',
        formula: 0,
        blurb: 'Every straight line grows a bump, forever.',
        rule: '',
        start: '',
        fit: { x: 0.5, y: Math.sqrt(3) / 6, span: 1.45 },
        imagSign: 1,
        maxZoom: 1e12,
    },
];

export function kindById(id: string | undefined): Kind {
    return KINDS.find((k) => k.id === id) ?? (KINDS[0] as Kind);
}

export const JULIA_PRESETS: readonly { name: string; re: string; im: string }[] = [
    { name: 'RABBIT', re: '-0.123', im: '0.745' },
    { name: 'DENDRITE', re: '0', im: '1' },
    { name: 'SAN MARCO', re: '-0.75', im: '0' },
    { name: 'SIEGEL DISK', re: '-0.391', im: '-0.587' },
    { name: 'SPIRALS', re: '-0.8', im: '0.156' },
    { name: 'DUST', re: '0.37', im: '0.1' },
];
