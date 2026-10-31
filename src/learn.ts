// Guided lessons: a short card sequence that explains what the Mandelbrot set is, each card setting up the view to match.

/** What a lesson can do to the explorer. Points are decimal strings so they stay exact. */
export interface LessonStage {
    reset(): void;
    flyTo(re: string, im: string, zoom: number): void;
    setAxes(on: boolean): void;
    /** Orbit lens on, pinned to a point, or following the pointer when no point is given. */
    setOrbit(on: boolean, re?: string, im?: string): void;
    setCap(cap: number | null): void;
    setFill(alpha: number): void;
}

interface Lesson {
    title: string;
    body: string;
    /** Extra line telling the reader what to try, which differs between touch and mouse. */
    tryIt?: { touch: string; mouse: string };
    setup(stage: LessonStage): void;
    /** A step-limit slider for the lesson about how the set is built. */
    build?: { max: number };
}

const FILL = 0.3;

// Draft copy, to be rewritten in my own voice.
const LESSONS: Lesson[] = [
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

export interface Learn {
    readonly open: boolean;
    toggle(): void;
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

    const dotEls = LESSONS.map((_, i) => {
        const dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'fx-learn-dot';
        dot.setAttribute('aria-label', `Lesson ${i + 1}`);
        dot.addEventListener('click', () => show(i));
        dots.append(dot);
        return dot;
    });

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
            // Early steps change the shape the most, so they get more of the time.
            setSteps(Math.max(1, Math.round(1 + (max - 1) * t * t)));
            playing = t < 1 ? requestAnimationFrame(frame) : 0;
            if (!playing) play.textContent = 'PLAY';
        };
        playing = requestAnimationFrame(frame);
    }

    function show(i: number): void {
        stopPlaying();
        index = Math.max(0, Math.min(LESSONS.length - 1, i));
        const lesson = LESSONS[index];
        if (!lesson) return;
        count.textContent = `LESSON ${index + 1} / ${LESSONS.length}`;
        title.textContent = lesson.title;
        body.textContent = lesson.body;
        tryIt.textContent = lesson.tryIt ? (touch ? lesson.tryIt.touch : lesson.tryIt.mouse) : '';
        tryIt.hidden = !lesson.tryIt;
        prev.disabled = index === 0;
        next.textContent = index === LESSONS.length - 1 ? 'EXPLORE →' : 'NEXT →';
        dotEls.forEach((dot, n) => dot.setAttribute('aria-current', String(n === index)));
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
            // Leave the view where the reader is, but drop the teaching-only drawing modes.
            stage.setCap(null);
            stage.setFill(0);
            stage.setAxes(false);
        }
        onChange(open);
    }

    close.addEventListener('click', () => setOpen(false));
    prev.addEventListener('click', () => show(index - 1));
    next.addEventListener('click', () => {
        if (index === LESSONS.length - 1) setOpen(false);
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
    };
}
