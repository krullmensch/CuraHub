// What each screenshot shows. `prepare` brings the app into that state; see capture-screenshots.mjs for the `page` helpers.
// DEMO is the slug of the demo exhibition on the test stack (Task 9).
const DEMO = process.env.CURAHUB_DEMO_SLUG ?? 'demo-ausstellung';
const editor = `/exhibition/${DEMO}/edit`;
const canvasReady = `document.querySelector('canvas') && !document.querySelector('[data-loading]')`;
const META = 4; // CDP modifier bit for ⌘

export const SHOTS = [
    {
        name: 'planer-3d',
        login: true,
        // Orbit view of the whole room, all works selected (⌘A), sidebars open.
        prepare: async (page) => {
            await page.goto(editor);
            await page.waitFor(canvasReady, 60000);
            await page.sleep(4000);
            await page.clickAt(800, 500);
            await page.key('a', META);
        },
    },
    {
        name: 'wandeditor-2d',
        login: true,
        // Wall A front in the 2D editor, measures on, the three works of one row selected.
        prepare: async (page) => {
            await page.goto(editor);
            await page.waitFor(canvasReady, 60000);
            await page.sleep(4000);
            await page.click(page.byText('Wand öffnen'));
            await page.waitFor(`document.querySelector('[title="Hilfslinien"]')`);
            await page.click(`document.querySelector('[title="Alle Werke dieser Fläche auswählen"]')`);
        },
    },
    {
        name: 'medien',
        login: true,
        // Asset library page with mixed media.
        prepare: async (page) => {
            await page.goto(`/exhibition/${DEMO}/assets`);
            await page.waitFor(`document.querySelectorAll('img').length > 8`);
        },
    },
    {
        name: 'rahmen',
        login: true,
        // One framed picture with passepartout selected, frame section of the properties panel visible.
        prepare: async (page) => {
            await page.goto(editor);
            await page.waitFor(canvasReady, 60000);
            await page.sleep(4000);
            await page.click(`[...document.querySelectorAll('button')].find((el) => el.closest('aside') && el.querySelector('img'))`);
            await page.key('f');
        },
    },
    {
        name: 'versionen',
        login: true,
        prepare: async (page) => {
            await page.goto(editor);
            await page.waitFor(canvasReady, 60000);
            await page.click(`document.querySelector('[title="Versionen anzeigen"]')`);
        },
    },
    {
        name: 'rundgang',
        login: false,
        // Public viewer, first person, looking along Wall A.
        prepare: async (page) => {
            await page.goto(`/exhibition/${DEMO}`);
            await page.waitFor(canvasReady, 60000);
            await page.sleep(5000);
        },
        settleMs: 3000,
    },
];
