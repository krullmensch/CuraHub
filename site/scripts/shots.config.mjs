// What each screenshot shows. `prepare` brings the app into that state; see capture-screenshots.mjs for the `page` helpers.
// DEMO is the slug of the demo exhibition on the test stack ("Licht und Landschaft", works credited in
// src/assets/screenshots/CREDITS.md); the env var CURAHUB_DEMO_SLUG overrides the default `licht-und-landschaft`.
// The window is 1600 × 1000; canvas points below are in that frame.
//
// Two kinds of shots, each against its own instance. Always pass the shot names: a run without names takes all eleven,
// overwrites the six app PNGs on an instance that is already set up, and then fails at `setup-1-code` (/setup is 404 once set up).
//  - App shots (planer-3d, wandeditor-2d, medien, rahmen, versionen, rundgang) run against the instance that holds the demo exhibition:
//      CURAHUB_SHOT_USER=… CURAHUB_SHOT_PASSWORD=… node scripts/capture-screenshots.mjs http://localhost:3002 planer-3d wandeditor-2d medien rahmen versionen rundgang
//  - Wizard shots (setup-1-code … setup-5-hsbi-admin) run against a fresh instance that is not set up yet, with CURAHUB_SETUP_CODE set
//    (docker compose logs app | grep Setup-Code):
//      CURAHUB_SETUP_CODE=… node scripts/capture-screenshots.mjs http://localhost:3003 setup-1-code setup-2-systemcheck setup-3-adresse setup-4-notfall-admin setup-5-hsbi-admin
const DEMO = process.env.CURAHUB_DEMO_SLUG ?? 'licht-und-landschaft';
const editor = `/exhibition/${DEMO}/edit`;
const META = 4; // CDP modifier bit for ⌘
const CANVAS = { x: 980, y: 560 }; // a point on the 3D canvas between the two sidebars

const titled = (title) => `document.querySelector('[title=${JSON.stringify(title)}]')`;

/** Opens the editor and waits until the room and the artwork textures are on screen. */
async function openEditor(page) {
    await page.goto(editor);
    await page.waitFor(`document.querySelector('canvas')`, 60000);
    await page.waitFor(titled('Wand A im 2D-Wandeditor öffnen'), 60000);
    await page.sleep(10000);
}

/** Orbit camera: turned so the open side of the partitions faces the viewer, then closer to the room. */
async function frameRoom(page) {
    await page.drag(CANVAS.x, CANVAS.y, CANVAS.x - 260, CANVAS.y + 70, 16);
    await page.sleep(600);
    for (let i = 0; i < 14; i++) {
        await page.wheel(CANVAS.x, CANVAS.y, -300);
        await page.sleep(150);
    }
    await page.sleep(2500);
}

/**
 * Headless Chrome has no Pointer Lock ("WrongDocumentError"), so the viewer would stay on its entry screen.
 * This stands in for the API: the page gets the lock it asks for, nothing else changes.
 */
const POINTER_LOCK_STAND_IN = `(() => {
    let locked = null;
    Object.defineProperty(Document.prototype, 'pointerLockElement', { configurable: true, get: () => locked });
    Element.prototype.requestPointerLock = function () {
        locked = this;
        document.dispatchEvent(new Event('pointerlockchange'));
        return Promise.resolve();
    };
    Document.prototype.exitPointerLock = function () {
        locked = null;
        document.dispatchEvent(new Event('pointerlockchange'));
    };
})()`;

// ── Setup wizard (run against a fresh, not yet set-up instance; code in CURAHUB_SETUP_CODE) ──────────────
// The wizard keeps everything in the page until its last step, so nothing is created by these shots.
const WIZARD_CLIP = { x: 350, y: 110, width: 900, height: 760 };
const field = (id) => `document.querySelector('#${id}')`;

async function fill(page, id, text) {
    await page.click(field(id));
    await page.type(text, { replace: true });
}

/** Opens /setup and walks to the given step: 1 code, 2 system check, 3 public address, 4 emergency admin, 5 HSBI admin. */
async function wizardStep(page, step) {
    await page.goto('/setup');
    await page.waitFor(field('setup-code'), 30000);
    if (step === 1) return; // shows the empty text field with its placeholder, and needs no code
    const code = process.env.CURAHUB_SETUP_CODE;
    if (!code) throw new Error('Set CURAHUB_SETUP_CODE (docker compose logs app | grep Setup-Code).');
    // The wizard takes the code in a plain text field. Mask it before typing, so that a failure screenshot never shows it.
    await page.evaluate(`${field('setup-code')}.type = 'password'`);
    await fill(page, 'setup-code', code);
    await page.click(page.byText('Weiter'));
    await page.waitFor(`!${field('setup-code')} && ${page.byText('Weiter')}`, 30000);
    await page.sleep(1500);
    if (step === 2) return;
    await page.click(page.byText('Weiter'));
    await page.waitFor(field('public-url'), 15000);
    await fill(page, 'public-url', 'https://curahub.example.org');
    if (step === 3) return;
    await page.click(page.byText('Weiter'));
    await page.waitFor(field('local-user'), 15000);
    const password = crypto.randomUUID();
    await fill(page, 'local-user', 'notfall');
    await fill(page, 'local-pw', password);
    await fill(page, 'local-pw2', password);
    if (step === 4) return;
    await page.click(page.byText('Weiter'));
    await page.waitFor(field('hsbi-user'), 15000);
}

const wizardShot = (name, step) => ({
    name,
    login: false,
    clip: WIZARD_CLIP,
    prepare: async (page) => {
        await wizardStep(page, step);
        // Take the focus ring and the caret out of the picture.
        await page.evaluate(`document.activeElement?.blur()`);
    },
    settleMs: 800,
});

export const SHOTS = [
    {
        name: 'planer-3d',
        login: true,
        // Orbit view of the room, all works selected (⌘A), sidebars open.
        prepare: async (page) => {
            await openEditor(page);
            await frameRoom(page);
            await page.key('a', META);
        },
        settleMs: 2500,
    },
    {
        name: 'wandeditor-2d',
        login: true,
        // Wand A, front face, in the 2D editor: all four works selected; the shot shows the hanging line, the gaps between the works and the guide lines (no floor-distance leaders).
        prepare: async (page) => {
            await openEditor(page);
            await page.click(titled('Wand A im 2D-Wandeditor öffnen'));
            await page.waitFor(titled('Höhen über Boden anzeigen'), 30000);
            await page.sleep(5000);
            await page.click(page.byText('Alle auswählen (4)'));
        },
        settleMs: 2500,
    },
    {
        name: 'medien',
        login: true,
        // Asset library with pictures, a video, a 3D model and a book.
        prepare: async (page) => {
            await page.goto(`/exhibition/${DEMO}/assets`);
            await page.waitFor(`document.querySelectorAll('img').length > 12`, 30000);
            await page.sleep(3000);
        },
    },
    {
        name: 'rahmen',
        login: true,
        // One framed picture with passepartout selected and focused, frame section of the properties panel visible.
        prepare: async (page) => {
            await openEditor(page);
            await page.click(page.byText('Im Raum'));
            await page.sleep(800);
            await page.click(`[...document.querySelectorAll('button, li, [role="option"]')].find((el) => el.textContent.includes('Pistachio Tree'))`);
            await page.sleep(800);
            await page.key('f');
            await page.sleep(3500);
        },
        settleMs: 2500,
    },
    {
        name: 'versionen',
        login: true,
        // Version history with the published version and the working version.
        prepare: async (page) => {
            await openEditor(page);
            await frameRoom(page);
            await page.click(titled('Versionen anzeigen'));
            await page.sleep(2500);
        },
    },
    {
        name: 'rundgang',
        login: false,
        // Public viewer after entering: first person in the room.
        prepare: async (page) => {
            await page.goto(`/exhibition/${DEMO}`);
            await page.waitFor(`document.querySelector('canvas')`, 60000);
            await page.sleep(12000);
            await page.evaluate(POINTER_LOCK_STAND_IN);
            await page.clickAt(800, 430);
            await page.sleep(5000);
        },
        settleMs: 3000,
    },
    wizardShot('setup-1-code', 1),
    wizardShot('setup-2-systemcheck', 2),
    wizardShot('setup-3-adresse', 3),
    wizardShot('setup-4-notfall-admin', 4),
    wizardShot('setup-5-hsbi-admin', 5),
];
