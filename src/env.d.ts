// Ambient types for Vite's CSS and ?raw shader imports, and the one import.meta.env flag we read.
declare module '*.css';

declare module '*.glsl?raw' {
    const source: string;
    export default source;
}

interface ImportMeta {
    readonly env: { readonly DEV: boolean };
}
