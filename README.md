# Fractal

A place to explore and play with fractals, running at fractal.joncheng.ca and framed inside the Code lab on joncheng.ca.

## Run it

```bash
pnpm add -D typescript vite prettier @types/node   # first time only; writes the versions and lockfile
pnpm dev        # http://localhost:5173
pnpm test       # Node's built-in test runner, needs Node 22.18 or newer
pnpm build      # type-checks, then builds to dist/
```

Controls: drag to pan, scroll or pinch to zoom, arrow keys to pan, `+` / `-` to zoom, `0` to reset, `H` to toggle the stats panel (on by default in dev).

## How it's laid out

```
src/main.ts            wires everything together
src/view.ts            pan/zoom model; the only place screen and plane coordinates convert
src/stage.ts           canvas sizing from its container, device pixel ratio
src/loop.ts            on-demand animation loop
src/quality.ts         picks render resolution while interacting
src/input.ts           pointer, wheel and keyboard to pan/zoom calls
src/gl.ts              WebGL2 helpers and the fullscreen pass
src/hud.ts             stats panel and key hints
src/fractals/          one file per fractal, all implementing types.ts
```

A fractal is a factory that returns `{ draw, detail, dispose }`. To add one, write the module and register it in `main.ts`.

## Performance notes

- Nothing redraws while idle, and nothing runs while the frame is scrolled out of view.
- While you drag or zoom it renders at a reduced resolution that adapts to measured frame times, then draws one full-resolution frame when input settles.
- Pixel ratio is capped at 2.
- Zoom stops at 1e-6 plane units per pixel. That is where 32-bit shader floats stop resolving neighbouring pixels. Going deeper needs emulated double precision in the shader.

## Embedding

The app is built for the root path and sends no frame-blocking headers. If a header is ever needed, use `frame-ancestors 'self' https://joncheng.ca https://*.joncheng.ca`.
