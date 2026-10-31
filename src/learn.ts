// Lesson cards per fractal

import type { KindId } from './fractals/kinds.ts';
import { SHAPE_DEPTH } from './shapes.ts';

/** decimal strings stay exact */
export interface LessonStage {
    reset(): void;
    flyTo(re: string, im: string, zoom: number): void;
    setAxes(on: boolean): void;
    /** no point = follow the pointer */
    setOrbit(on: boolean, re?: string, im?: string): void;
    setCap(cap: number | null): void;
    setFill(alpha: number): void;
    setJulia(re: string, im: string): void;
    setChaos(on: boolean): void;
}

interface Lesson {
    title: string;
    body: string;
    /** touch vs mouse wording */
    tryIt?: { touch: string; mouse: string };
    setup(stage: LessonStage): void;
    /** step slider */
    build?: { max: number };
}

const FILL = 0.3;

const MANDELBROT: Lesson[] = [
    {
        title: 'WHAT IS A FRACTAL',
        body: 'A fractal is a shape that keeps showing new detail however far you zoom in. This one is the Mandelbrot set. Its edge never smooths out: zoom in and you find spirals, branches and smaller copies of the whole thing.',
        tryIt: {
            touch: 'PINCH ON THE EDGE OF THE SHAPE TO SEE FOR YOURSELF.',
            mouse: 'SCROLL ON THE EDGE OF THE SHAPE TO SEE FOR YOURSELF.',
        },
        setup(s) {
            s.reset();
            s.setAxes(false);
            s.setOrbit(false);
            s.setCap(null);
            s.setFill(FILL);
        },
    },
    {
        title: 'EVERY PIXEL IS A NUMBER',
        body: 'The screen is a map of numbers. Left to right is the real part, bottom to top is the imaginary part, so every pixel stands for one complex number, called c. The filled shape is every c that passes one simple test.',
        setup(s) {
            s.reset();
            s.setAxes(true);
            s.setOrbit(false);
            s.setCap(null);
            s.setFill(FILL);
        },
    },
    {
        title: 'THE TEST: ONE RULE, REPEATED',
        body: 'Start with z = 0. Replace z with z² + c, then do it again with the new z, and again. Each result is a point on the plane, and joining them up gives the path drawn here. For this c the path settles into a loop of three points, so it never gets away.',
        tryIt: {
            touch: 'TAP ANYWHERE TO TEST A DIFFERENT c.',
            mouse: 'CLICK ANYWHERE TO TEST A DIFFERENT c.',
        },
        setup(s) {
            s.reset();
            s.setAxes(true);
            s.setOrbit(true, '-0.123', '0.745');
            s.setCap(null);
            s.setFill(FILL);
        },
    },
    {
        title: 'ESCAPE OR STAY',
        body: 'Once z is outside the dashed circle (more than 2 from zero), squaring flings it further out every time, so it runs off forever. That c is outside the set. If z stays trapped however long you keep going, c is inside. This one escapes after 8 steps.',
        tryIt: {
            touch: 'TAP NEAR THE EDGE: POINTS THERE TAKE THE LONGEST TO DECIDE.',
            mouse: 'CLICK NEAR THE EDGE: POINTS THERE TAKE THE LONGEST TO DECIDE.',
        },
        setup(s) {
            s.reset();
            s.setAxes(true);
            s.setOrbit(true, '0.45', '0.25');
            s.setCap(null);
            s.setFill(FILL);
        },
    },
    {
        title: 'BUILDING IT, STEP BY STEP',
        body: "A computer can't wait forever, so it stops after a set number of steps and treats anything that hasn't escaped yet as inside. After 1 step that's the whole disc. Every extra step carves away the points that have escaped by then, and what's left closes in on the set.",
        tryIt: {
            touch: 'PRESS PLAY, OR DRAG THE SLIDER.',
            mouse: 'PRESS PLAY, OR DRAG THE SLIDER.',
        },
        build: { max: 50 },
        setup(s) {
            s.reset();
            s.setAxes(true);
            s.setOrbit(false);
            s.setCap(1);
            s.setFill(FILL);
        },
    },
    {
        title: 'WHERE THE GLOW COMES FROM',
        body: "Outside points are shaded by how many steps they took to escape. Points right next to the edge hold out the longest, so the glow traces the boundary, which is where all the detail is. This is Seahorse Valley, a crease in the main shape.",
        setup(s) {
            s.setAxes(false);
            s.setOrbit(false);
            s.setCap(null);
            s.setFill(0);
            s.flyTo('-0.7453', '0.1127', 25);
        },
    },
    {
        title: 'SMALLER COPIES',
        body: "Zoom in and you find smaller copies of the whole set, called minibrots. They're never exact copies: each one is wrapped in decoration that depends on where it sits. This one sits on the real line near −1.77.",
        setup(s) {
            s.setAxes(false);
            s.setOrbit(false);
            s.setCap(null);
            s.setFill(0);
            s.flyTo('-1.768', '0', 43);
        },
    },
    {
        title: 'KEEP GOING',
        body: "That's the whole idea: one short rule, repeated, decides every pixel, and all the detail comes from that. This explorer zooms to 10³⁰. At that depth, with a laptop screen showing the view, the whole set at the same scale would be hundreds of times wider than the observable universe.",
        tryIt: {
            touch: 'TURN ON ORBIT TO KEEP TESTING POINTS AS YOU GO.',
            mouse: 'TURN ON ORBIT (O) TO KEEP TESTING POINTS AS YOU GO.',
        },
        setup(s) {
            s.setAxes(false);
            s.setOrbit(false);
            s.setCap(null);
            s.setFill(0);
        },
    },
];

// step-slider lesson
function buildLesson(body: string): Lesson {
    return {
        title: 'BUILDING IT, STEP BY STEP',
        body,
        tryIt: { touch: 'PRESS PLAY, OR DRAG THE SLIDER.', mouse: 'PRESS PLAY, OR DRAG THE SLIDER.' },
        build: { max: 40 },
        setup(s) {
            s.reset();
            s.setAxes(false);
            s.setOrbit(false);
            s.setCap(1);
            s.setFill(FILL);
        },
    };
}

const JULIA: Lesson[] = [
    {
        title: 'SAME RULE, OTHER QUESTION',
        body: 'The Mandelbrot set asks which values of c keep z from escaping when it starts at 0. A Julia set fixes one c and asks the opposite question: which starting points z stay trapped? The rule is the same, z → z² + c, but now every pixel is a starting z. This one uses c = −0.123 + 0.745i, known as the Douady rabbit.',
        setup(s) {
            s.setJulia('-0.123', '0.745');
            s.reset();
            s.setAxes(false);
            s.setOrbit(false);
            s.setCap(null);
            s.setFill(FILL);
        },
    },
    {
        title: 'FOLLOW A STARTING POINT',
        body: 'Here c stays fixed and z starts wherever you pick. Points inside the rabbit get pulled into a loop of three and never leave. Points outside run off past the dashed circle.',
        tryIt: { touch: 'TAP ANYWHERE TO START z THERE.', mouse: 'CLICK ANYWHERE TO START z THERE.' },
        setup(s) {
            s.setJulia('-0.123', '0.745');
            s.reset();
            s.setAxes(true);
            s.setOrbit(true, '0', '0');
            s.setCap(null);
            s.setFill(FILL);
        },
    },
    {
        title: 'ONE PIECE OR DUST',
        body: 'If c is inside the Mandelbrot set, its Julia set is one connected piece. If c is outside, the Julia set shatters into infinitely many separate specks, called Fatou dust, with nothing inside. This c = 0.37 + 0.1i is just outside the Mandelbrot set.',
        setup(s) {
            s.setJulia('0.37', '0.1');
            s.reset();
            s.setAxes(false);
            s.setOrbit(false);
            s.setCap(null);
            s.setFill(0);
        },
    },
    {
        title: 'A MAP OF JULIA SETS',
        body: 'Every point of the Mandelbrot plane stands for a whole Julia set. Pick c near an edge of the Mandelbrot set and zoom in there, and you often find the same shapes as in that Julia set.',
        tryIt: {
            touch: 'TRY THE PRESETS BELOW.',
            mouse: 'TRY THE PRESETS, OR PRESS J ON THE MANDELBROT SET TO OPEN THE JULIA SET UNDER THE CURSOR.',
        },
        setup(s) {
            s.setJulia('-0.75', '0');
            s.reset();
            s.setAxes(false);
            s.setOrbit(false);
            s.setCap(null);
            s.setFill(0);
        },
    },
    buildLesson(
        "Same idea as for the Mandelbrot set: allow only a few steps and treat anything that hasn't escaped yet as inside. With one step that's a rough blob. Each extra step carves away more, closing in on the Julia set.",
    ),
];

const SHIP: Lesson[] = [
    {
        title: 'ONE SMALL CHANGE',
        body: 'The Burning Ship uses nearly the same rule as the Mandelbrot set, but makes both parts of z positive before squaring: z → (|Re z| + i|Im z|)² + c, starting from 0. That fold breaks the smooth curves into sharp, angular shapes. It is drawn upside down, as is traditional, so the imaginary axis points down.',
        setup(s) {
            s.reset();
            s.setAxes(true);
            s.setOrbit(false);
            s.setCap(null);
            s.setFill(FILL);
        },
    },
    {
        title: 'THE SHIP',
        body: 'Out along the left antenna sits the shape it is named after: a hull with masts rising out of it. Keep zooming along the antenna and you find smaller copies.',
        setup(s) {
            s.setAxes(false);
            s.setOrbit(false);
            s.setCap(null);
            s.setFill(0);
            s.flyTo('-1.762', '0.03', 35);
        },
    },
    buildLesson(
        "Allow only a few steps and treat anything that hasn't escaped yet as inside. The fold shows up straight away: the shape is cut by straight lines that a plain z² + c never makes.",
    ),
];

const TRICORN: Lesson[] = [
    {
        title: 'A MIRROR IN THE RULE',
        body: 'The Tricorn, also called the Mandelbar set, flips z across the real axis before squaring: z → conj(z)² + c, starting from 0. Flipping every step makes the shape turn three ways instead of one, so it has three-fold symmetry where the Mandelbrot set has a single cardioid.',
        setup(s) {
            s.reset();
            s.setAxes(true);
            s.setOrbit(false);
            s.setCap(null);
            s.setFill(FILL);
        },
    },
    buildLesson(
        "Allow only a few steps and treat anything that hasn't escaped yet as inside. Watch the three arms appear as the step count grows.",
    ),
];

// shapes: slider = recursion depth
function shapeLesson(
    title: string,
    body: string,
    opts: { depth?: number; chaos?: boolean; tryIt?: Lesson['tryIt'] } = {},
): Lesson {
    return {
        title,
        body,
        tryIt: opts.tryIt,
        build: opts.depth ? { max: opts.depth } : undefined,
        setup(s) {
            s.reset();
            s.setAxes(false);
            s.setOrbit(false);
            s.setFill(0);
            s.setCap(opts.depth ? 1 : null);
            s.setChaos(opts.chaos ?? false);
        },
    };
}

const STEPS_TRY = { touch: 'PRESS PLAY, OR DRAG THE SLIDER.', mouse: 'PRESS PLAY, OR DRAG THE SLIDER.' };

const SIERPINSKI: Lesson[] = [
    shapeLesson(
        'TAKE A TRIANGLE, REMOVE THE MIDDLE',
        'Start with a filled triangle. Join the midpoints of its sides and cut out the middle, leaving three smaller triangles. Do the same to each of those, and keep going.',
        { depth: SHAPE_DEPTH.sierpinski, tryIt: STEPS_TRY },
    ),
    shapeLesson(
        'THREE HALF-SIZE COPIES',
        'The finished shape is exactly three copies of itself, each half as wide. Zoom into any corner and you find the whole triangle again, at every scale.',
        { tryIt: { touch: 'PINCH INTO A CORNER.', mouse: 'SCROLL INTO A CORNER.' } },
    ),
    shapeLesson(
        'THE CHAOS GAME',
        "Every dot here marks where one single point has been. It starts on a corner. Then, over and over, it picks one of the three corners at random and jumps exactly halfway towards it, and a dot is left where it lands. About 1,500 jumps are drawn every frame. You might expect a random smudge, yet no dot ever lands in the empty middle or any smaller gap: they only ever fill in the Sierpinski triangle.",
        { chaos: true },
    ),
    shapeLesson(
        'WHY THE CHAOS GAME WORKS',
        'Jumping halfway to a corner does exactly what one of the three half-size copies does: it shrinks the whole triangle towards that corner. So a point on the triangle always lands somewhere else on the triangle, and with random corners it eventually visits every part of it.',
        { chaos: true },
    ),
    shapeLesson(
        'NEITHER LINE NOR AREA',
        'Each step keeps three quarters of the area, so the area shrinks towards zero. Yet it is much more than a line: halve the size and you get a third of the shape. That gives it a dimension of log 3 / log 2, about 1.585.',
    ),
];

const KOCH: Lesson[] = [
    shapeLesson(
        'GROW A BUMP',
        'Start with a triangle. Split every side into thirds and replace the middle third with two sides of a smaller triangle pointing outward. Then do the same to every new side.',
        { depth: SHAPE_DEPTH.koch, tryIt: STEPS_TRY },
    ),
    shapeLesson(
        'ENDLESS EDGE, FIXED SIZE',
        'Each step makes the outline 4/3 as long, so in the end it is infinitely long. Yet it never grows past a circle around the first triangle: its area settles at exactly 8/5 of the starting triangle.',
    ),
    shapeLesson(
        'NEVER SMOOTH',
        'Zoom far into a circle and its edge looks straighter and straighter. The snowflake never does that. Zoom into any piece of its edge and you find the same bumpy line as one whole side: four smaller copies of itself, each a third as long, all the way down.',
        { tryIt: { touch: 'PINCH INTO THE EDGE.', mouse: 'SCROLL INTO THE EDGE.' } },
    ),
];

const LESSONS: Record<KindId, Lesson[]> = {
    mandelbrot: MANDELBROT,
    julia: JULIA,
    ship: SHIP,
    tricorn: TRICORN,
    sierpinski: SIERPINSKI,
    koch: KOCH,
};

export interface Learn {
    readonly open: boolean;
    toggle(): void;
    setKind(id: KindId): void;
}

const PLAY_MS = 5000;

export function createLearn(
    parent: HTMLElement,
    stage: LessonStage,
    onChange: (open: boolean) => void,
): Learn {
    const touch = matchMedia('(pointer: coarse)').matches;

    const panel = document.createElement('section');
    panel.className = 'fx-learn';
    panel.dataset.fxUi = '';
    panel.hidden = true;
    panel.setAttribute('aria-label', 'Lessons');

    const head = document.createElement('div');
    head.className = 'fx-learn-head';
    const count = document.createElement('span');
    count.className = 'fx-learn-count';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'fx-btn fx-btn-quiet';
    close.textContent = 'CLOSE';
    head.append(count, close);

    const title = document.createElement('h2');
    title.className = 'fx-learn-title';
    const body = document.createElement('p');
    body.className = 'fx-learn-body';
    const tryIt = document.createElement('p');
    tryIt.className = 'fx-learn-try';

    const build = document.createElement('div');
    build.className = 'fx-learn-build';
    const play = document.createElement('button');
    play.type = 'button';
    play.className = 'fx-btn';
    play.textContent = 'PLAY';
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '1';
    slider.step = '1';
    slider.className = 'fx-slider';
    slider.setAttribute('aria-label', 'Step limit');
    const steps = document.createElement('output');
    steps.className = 'fx-learn-steps';
    build.append(play, slider, steps);

    const nav = document.createElement('div');
    nav.className = 'fx-learn-nav';
    const prev = document.createElement('button');
    prev.type = 'button';
    prev.className = 'fx-btn';
    prev.textContent = '← BACK';
    const dots = document.createElement('div');
    dots.className = 'fx-learn-dots';
    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'fx-btn fx-btn-primary';
    nav.append(prev, dots, next);

    let lessons = MANDELBROT;
    let dotEls: HTMLButtonElement[] = [];

    function makeDots(): void {
        dots.replaceChildren();
        dotEls = lessons.map((_, i) => {
            const dot = document.createElement('button');
            dot.type = 'button';
            dot.className = 'fx-learn-dot';
            dot.setAttribute('aria-label', `Lesson ${i + 1}`);
            dot.addEventListener('click', () => show(i));
            dots.append(dot);
            return dot;
        });
    }
    makeDots();

    panel.append(head, title, body, tryIt, build, nav);
    parent.append(panel);

    let index = 0;
    let open = false;
    let playing = 0;

    function setSteps(n: number): void {
        slider.value = String(n);
        steps.textContent = `${n} STEP${n === 1 ? '' : 'S'}`;
        stage.setCap(n);
    }

    function stopPlaying(): void {
        if (playing) cancelAnimationFrame(playing);
        playing = 0;
        play.textContent = 'PLAY';
    }

    function startPlaying(max: number): void {
        stopPlaying();
        play.textContent = 'STOP';
        const start = performance.now();
        const frame = (now: number): void => {
            const t = Math.min(1, (now - start) / PLAY_MS);
            // early steps change most, give them more time
            setSteps(Math.max(1, Math.round(1 + (max - 1) * t * t)));
            playing = t < 1 ? requestAnimationFrame(frame) : 0;
            if (!playing) play.textContent = 'PLAY';
        };
        playing = requestAnimationFrame(frame);
    }

    function show(i: number): void {
        stopPlaying();
        index = Math.max(0, Math.min(lessons.length - 1, i));
        const lesson = lessons[index];
        if (!lesson) return;
        count.textContent = `${index + 1} / ${lessons.length}`;
        title.textContent = lesson.title;
        body.textContent = lesson.body;
        tryIt.textContent = lesson.tryIt ? (touch ? lesson.tryIt.touch : lesson.tryIt.mouse) : '';
        tryIt.hidden = !lesson.tryIt;
        prev.disabled = index === 0;
        next.textContent = index === lessons.length - 1 ? 'EXPLORE →' : 'NEXT →';
        dotEls.forEach((dot, n) => dot.setAttribute('aria-current', String(n === index)));
        stage.setChaos(false);
        lesson.setup(stage);
        build.hidden = !lesson.build;
        if (lesson.build) {
            slider.max = String(lesson.build.max);
            setSteps(1);
        }
    }

    function setOpen(next: boolean): void {
        if (next === open) return;
        open = next;
        panel.hidden = !open;
        if (open) {
            show(index);
        } else {
            stopPlaying();
            // keep the view, drop teaching modes
            stage.setCap(null);
            stage.setFill(0);
            stage.setAxes(false);
            stage.setChaos(false);
        }
        onChange(open);
    }

    close.addEventListener('click', () => setOpen(false));
    prev.addEventListener('click', () => show(index - 1));
    next.addEventListener('click', () => {
        if (index === lessons.length - 1) setOpen(false);
        else show(index + 1);
    });
    play.addEventListener('click', () => {
        if (playing) stopPlaying();
        else startPlaying(Number(slider.max));
    });
    slider.addEventListener('input', () => {
        stopPlaying();
        setSteps(Number(slider.value));
    });

    return {
        get open() {
            return open;
        },
        toggle() {
            setOpen(!open);
        },
        setKind(id) {
            lessons = LESSONS[id];
            index = 0;
            makeDots();
            if (open) show(0);
        },
    };
}
