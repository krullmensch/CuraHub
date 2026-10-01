// Captures the site's screenshots from a running CuraHub instance. Run by hand:
//   CURAHUB_SHOT_USER=… CURAHUB_SHOT_PASSWORD=… node scripts/capture-screenshots.mjs http://localhost:3002 [shot-name …]
// Needs Google Chrome and Node ≥ 22 (built-in WebSocket). Never run by CI.
// CHROME_PATH picks another Chrome. CURAHUB_SHOT_DEBUG=1 prints page console errors and failed requests to stderr.
// A shot that throws leaves a screenshot of the page in the OS temp dir (none when it shows an e-mail address).
// The credentials stay in this process: Chrome gets an environment without them, and the debug output strips query strings.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHOTS } from './shots.config.mjs';

const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEBUG = process.env.CURAHUB_SHOT_DEBUG === '1';
const OUT = fileURLToPath(new URL('../src/assets/screenshots/', import.meta.url));
const VIEWPORT = { width: 1600, height: 1000, deviceScaleFactor: 2 };
const SHIFT = 8; // CDP modifier bits: alt 1, ctrl 2, meta (⌘) 4, shift 8
const SELF_TEST = process.argv[2] === '--self-test';
const [baseUrl, ...only] = SELF_TEST ? [] : process.argv.slice(2);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/** `kind` tells the retry loops what happened: 'transport' (Chrome gone or silent), 'protocol' (CDP refused), 'exception' (the page threw), 'timeout'. */
const failure = (kind, message) => Object.assign(new Error(message), { kind });
const pngSize = (png) => ({ width: png.readUInt32BE(16), height: png.readUInt32BE(20) });

/** The e-mail check refused the page. The message hides most of the address; the failure screenshot is skipped for it. */
class LeakError extends Error {}
const maskEmail = (email) => email.replace(/^(.).*(@.*)$/, '$1…$2');

/** Failure screenshots of earlier runs: they show the logged-in app, so none is kept beyond the next run. */
function purgeFailureShots() {
    for (const name of readdirSync(tmpdir())) {
        if (!/^curahub-shot-failed-.*\.png$/.test(name)) continue;
        try {
            unlinkSync(path.join(tmpdir(), name));
        } catch {
            // Already gone.
        }
    }
}

/** Runs inside the page: the first e-mail address in the visible text or in a text field, else null. */
function findEmail() {
    const fields = [...document.querySelectorAll('input:not([type=password]), textarea')].map((el) => el.value);
    const text = [document.body?.innerText ?? '', ...fields].join('\n');
    return /[\w.+-]+@[\w-]+\.[\w.]+/.exec(text)?.[0] ?? null;
}

const NAMED_KEYS = {
    Enter: { code: 'Enter', vk: 13, text: '\r' },
    Escape: { code: 'Escape', vk: 27 },
    Tab: { code: 'Tab', vk: 9 },
    Backspace: { code: 'Backspace', vk: 8 },
    Delete: { code: 'Delete', vk: 46 },
    ' ': { code: 'Space', vk: 32, text: ' ' },
    ArrowLeft: { code: 'ArrowLeft', vk: 37 },
    ArrowUp: { code: 'ArrowUp', vk: 38 },
    ArrowRight: { code: 'ArrowRight', vk: 39 },
    ArrowDown: { code: 'ArrowDown', vk: 40 },
    Home: { code: 'Home', vk: 36 },
    End: { code: 'End', vk: 35 },
    PageUp: { code: 'PageUp', vk: 33 },
    PageDown: { code: 'PageDown', vk: 34 },
};

/** `e.key`, `e.code` and `e.keyCode` the way a keyboard produces them; `text` only for keys that type a character. */
function describeKey(key) {
    if (NAMED_KEYS[key]) return NAMED_KEYS[key];
    if (/^[a-z]$/i.test(key)) return { code: `Key${key.toUpperCase()}`, vk: key.toUpperCase().charCodeAt(0), text: key };
    if (/^[0-9]$/.test(key)) return { code: `Digit${key}`, vk: key.charCodeAt(0), text: key };
    if (key.length === 1) return { code: '', vk: key.toUpperCase().charCodeAt(0), text: key };
    throw new Error(`Unknown key "${key}" — add it to NAMED_KEYS.`);
}

const SECRET_ENV = ['CURAHUB_SHOT_USER', 'CURAHUB_SHOT_PASSWORD', 'CURAHUB_SETUP_CODE'];
const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** Starts headless Chrome with a throw-away profile. `stop()` ends it and removes the profile; also runs on exit, Ctrl-C and hang-up. */
function launchChrome() {
    const userDataDir = mkdtempSync(path.join(tmpdir(), 'curahub-shots-'));
    const env = { ...process.env };
    for (const key of SECRET_ENV) delete env[key]; // Chrome and its helpers must not carry the login or setup credentials
    const chrome = spawn(
        CHROME,
        [
            '--headless=new',
            '--enable-unsafe-webgpu',
            '--hide-scrollbars',
            '--mute-audio',
            '--force-color-profile=srgb',
            '--autoplay-policy=no-user-gesture-required',
            '--no-first-run',
            '--no-default-browser-check',
            '--remote-debugging-port=0', // a free port; Chrome reports it in <profile>/DevToolsActivePort
            `--user-data-dir=${userDataDir}`,
            'about:blank',
        ],
        { stdio: ['ignore', 'ignore', 'pipe'], env, detached: true }, // detached: Chrome gets its own process group, so cleanup() can end the helpers too
    );
    const state = { exited: false, stderr: '', error: null };
    const exited = new Promise((resolve) => {
        chrome.once('exit', () => {
            state.exited = true;
            resolve();
        });
        chrome.once('error', (error) => {
            state.exited = true;
            state.error = error;
            resolve();
        });
    });
    chrome.stderr.on('data', (chunk) => {
        state.stderr = (state.stderr + chunk).slice(-2000);
    });
    let cleanedUp = false;
    const cleanup = () => {
        if (cleanedUp) return;
        cleanedUp = true;
        try {
            if (chrome.pid) process.kill(-chrome.pid, 'SIGKILL'); // the browser and every helper still writing into the profile
        } catch {
            // No process left in the group.
        }
        chrome.stderr.destroy(); // Chrome's helper processes keep the pipe open for a few seconds after the browser itself is gone
        for (let attempt = 0; attempt < 10; attempt++) {
            try {
                rmSync(userDataDir, { recursive: true, force: true });
            } catch {
                // Retried below; a helper may have been writing into it a moment ago.
            }
            if (!existsSync(userDataDir)) return;
            sleepSync(200);
        }
        console.error(`  Warning: could not remove Chrome's profile ${userDataDir}. It holds the login token (curahub-auth): delete it by hand.`);
    };
    process.on('exit', cleanup);
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => process.exit(130));
    const stop = async () => {
        if (!state.exited) {
            chrome.kill('SIGTERM');
            await new Promise((resolve) => {
                const giveUp = setTimeout(resolve, 5000); // cleanup() then kills it for good
                exited.then(() => (clearTimeout(giveUp), resolve()));
            });
        }
        cleanup();
    };
    return { userDataDir, state, stop };
}

/** Connects to Chrome's first page over CDP. Returns `send(method, params)` and `on(event, handler)`. */
async function connect({ userDataDir, state }) {
    const startFailure = (what) => new Error(`${what}${state.error ? `: ${state.error.message}` : ''}${state.stderr ? `\n${state.stderr}` : ''}`);
    let port = 0;
    for (let attempt = 0; attempt < 100 && !port; attempt++) {
        if (state.exited) throw startFailure('Chrome exited during start-up');
        await sleep(150);
        try {
            port = Number(readFileSync(path.join(userDataDir, 'DevToolsActivePort'), 'utf8').split('\n')[0]);
        } catch {
            // Chrome has not written the file yet.
        }
    }
    if (!port) throw startFailure('Chrome did not start');
    let target;
    for (let attempt = 0; attempt < 50 && !target; attempt++) {
        try {
            const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
            target = targets.find((entry) => entry.type === 'page');
        } catch {
            // The debugging endpoint is not up yet.
        }
        if (!target) await sleep(200);
    }
    if (!target) throw startFailure('Chrome has no page to drive');

    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
        socket.onopen = resolve;
        socket.onerror = () => reject(new Error('Could not connect to Chrome over CDP.'));
    });
    let nextId = 1;
    const pending = new Map();
    const listeners = new Map();
    socket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.method) {
            for (const handler of listeners.get(message.method) ?? []) handler(message.params);
            return;
        }
        const waiter = pending.get(message.id);
        if (!waiter) return;
        pending.delete(message.id);
        if (message.error) waiter.reject(failure('protocol', `${waiter.method}: ${message.error.message}`));
        else waiter.resolve(message.result);
    };
    socket.onclose = () => {
        for (const waiter of pending.values()) waiter.reject(failure('transport', `Chrome closed the connection during ${waiter.method}.`));
        pending.clear();
    };
    const send = (method, params = {}, timeoutMs = 120000) =>
        new Promise((resolve, reject) => {
            if (socket.readyState !== WebSocket.OPEN) return reject(failure('transport', `Chrome connection is closed (${method}).`));
            const id = nextId++;
            const timer = setTimeout(() => {
                pending.delete(id);
                reject(failure('transport', `${method} got no answer within ${timeoutMs / 1000} s.`));
            }, timeoutMs);
            pending.set(id, {
                method,
                resolve: (value) => (clearTimeout(timer), resolve(value)),
                reject: (error) => (clearTimeout(timer), reject(error)),
            });
            socket.send(JSON.stringify({ id, method, params }));
        });
    const on = (method, handler) => listeners.set(method, [...(listeners.get(method) ?? []), handler]);
    return { send, on };
}

/** `origin + pathname`: a query string or fragment can carry a token, the userinfo a password. */
function plainUrl(url) {
    try {
        const parsed = new URL(url);
        return /^(?:https?|wss?):$/.test(parsed.protocol) ? parsed.origin + parsed.pathname : `${parsed.protocol}…`;
    } catch {
        return '(unreadable URL)';
    }
}

/** With CURAHUB_SHOT_DEBUG=1: what the page logs as errors and which requests fail. URLs are printed without query string. */
async function traceProblems({ send, on }) {
    const say = (line) => console.error(`  [page] ${String(line).replace(/\b(?:https?|wss?):\/\/[^\s"'<>)\]]+/g, plainUrl)}`);
    const urls = new Map();
    on('Runtime.consoleAPICalled', ({ type, args }) => type === 'error' && say(`console.error ${args.map((arg) => arg.value ?? arg.description ?? arg.type).join(' ')}`));
    on('Runtime.exceptionThrown', ({ exceptionDetails }) => say(`exception ${exceptionDetails.exception?.description ?? exceptionDetails.text}`));
    on('Log.entryAdded', ({ entry }) => entry.level === 'error' && entry.source !== 'network' && say(`${entry.source}: ${entry.text}`));
    on('Network.requestWillBeSent', ({ requestId, request }) => urls.set(requestId, plainUrl(request.url)));
    on('Network.loadingFailed', ({ requestId, errorText, canceled }) => !canceled && say(`request failed (${errorText}) ${urls.get(requestId)}`));
    on('Network.responseReceived', ({ response }) => response.status >= 400 && say(`HTTP ${response.status} ${plainUrl(response.url)}`));
    await Promise.all([send('Log.enable'), send('Network.enable')]);
}

/** The helpers a shot's `prepare(page)` drives the app with. Selectors are JS expressions that return an element. */
function pageApi({ send, on }) {
    const lifecycle = new Set();
    on('Page.lifecycleEvent', ({ loaderId, name }) => lifecycle.add(`${loaderId}:${name}`));
    // A confirm() or "Leave site?" would freeze the page for good: let navigations through, decline everything else.
    on('Page.javascriptDialogOpening', ({ type, message }) => {
        console.error(`  [page] ${type} dialog: ${message}`);
        send('Page.handleJavaScriptDialog', { accept: type === 'beforeunload' }).catch(() => {});
    });

    const evaluate = async (expression) => {
        const { result, exceptionDetails } = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
        if (exceptionDetails) throw failure('exception', exceptionDetails.exception?.description ?? exceptionDetails.text);
        return result.value;
    };
    /** Retry loops call this with what `evaluate` threw: only what a page throws away while it navigates is waited out. */
    const unlessNavigating = (error, expression) => {
        if (error.kind === 'protocol' && /Cannot find context|context was destroyed|Inspected target navigated/i.test(error.message)) return;
        // Chrome gone or silent, or the expression itself threw (a typo, a null): retrying cannot help.
        throw error.kind === 'exception' ? failure('exception', `${error.message.split('\n')[0]}\n  in: ${expression}`) : error;
    };
    /** Polls `expression` until it is truthy. Only a page that is navigating counts as "not yet". */
    const waitFor = async (expression, timeoutMs = 30000) => {
        const start = Date.now();
        let lastError = null;
        for (;;) {
            try {
                if (await evaluate(`Boolean(${expression})`)) return;
            } catch (error) {
                unlessNavigating(error, expression);
                lastError = error;
            }
            if (Date.now() - start >= timeoutMs) throw failure('timeout', `Timed out waiting for: ${expression}${lastError ? `\n  last error: ${lastError.message.split('\n')[0]}` : ''}`);
            await sleep(200);
        }
    };
    /** Waits until the element exists, has a size, is the topmost thing at its centre and has stopped moving (panels slide in); returns its centre. */
    const centreOf = async (selector, timeoutMs = 10000) => {
        const sample = `(() => {
            const el = ${selector};
            if (!el) return null;
            el.scrollIntoViewIfNeeded?.();
            const r = el.getBoundingClientRect();
            if (!(r.width > 0 && r.height > 0)) return null;
            const x = r.x + r.width / 2;
            const y = r.y + r.height / 2;
            const hit = document.elementFromPoint(x, y);
            const clickable = el.closest('button, a, label, summary, [role="button"], [role="menuitem"], [role="tab"], [role="option"]');
            const free = Boolean(hit) && (hit === el || el.contains(hit) || (clickable !== null && (clickable === hit || clickable.contains(hit))));
            const classes = hit && typeof hit.className === 'string' && hit.className.trim() ? '.' + hit.className.trim().split(/\\s+/).join('.') : '';
            return { x, y, cover: free ? null : (hit ? hit.tagName.toLowerCase() + classes : 'nothing (outside the viewport)').slice(0, 120) };
        })()`;
        const start = Date.now();
        let previous = null;
        let lastError = null;
        let cover = null;
        for (;;) {
            let point = null;
            try {
                point = await evaluate(sample);
            } catch (error) {
                unlessNavigating(error, selector);
                lastError = error;
            }
            cover = point?.cover ?? null;
            if (cover) point = null; // a dialog, toast or overlay is in the way: wait for it to go
            if (point && previous && Math.abs(point.x - previous.x) < 0.5 && Math.abs(point.y - previous.y) < 0.5) return point;
            previous = point;
            if (Date.now() - start >= timeoutMs) {
                const why = cover ? `covered by <${cover}>, a click would miss` : `not found or not visible${lastError ? ` (${lastError.message.split('\n')[0]})` : ''}`;
                throw failure('timeout', `Cannot click ${selector}: ${why}.`);
            }
            await sleep(100);
        }
    };
    const mouse = (type, x, y, params) => send('Input.dispatchMouseEvent', { type, x, y, ...params });
    /** Moves there, then clicks `clickCount` times (2 = double-click). `extra`: `button` ('left' | 'right' | 'middle'), `modifiers`. */
    const clickAt = async (x, y, { clickCount = 1, button = 'left', ...rest } = {}) => {
        const buttons = { left: 1, right: 2, middle: 4 }[button];
        await mouse('mouseMoved', x, y, { button: 'none', buttons: 0, ...rest });
        for (let count = 1; count <= clickCount; count++) {
            await mouse('mousePressed', x, y, { button, buttons, clickCount: count, ...rest });
            await mouse('mouseReleased', x, y, { button, buttons: 0, clickCount: count, ...rest });
        }
    };
    const screenshot = async (clip) => {
        const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, ...(clip ? { clip: { ...clip, scale: 1 } } : {}) });
        return Buffer.from(data, 'base64');
    };

    return {
        evaluate,
        waitFor,
        sleep,
        screenshot,
        /** Navigates (a path on the base URL, or an absolute URL) and returns once the new document has fired `load`. */
        goto: async (target) => {
            const url = new URL(target, baseUrl).href;
            const { loaderId, errorText } = await send('Page.navigate', { url });
            if (errorText) throw new Error(`Navigation to ${url} failed: ${errorText}`);
            const start = Date.now();
            // loaderId identifies the new document, so the old one's "complete" state is never mistaken for it.
            while (loaderId && !lifecycle.has(`${loaderId}:load`)) {
                if (Date.now() - start > 60000) throw new Error(`${url} did not finish loading within 60 s.`);
                await sleep(50);
            }
            await waitFor(`document.readyState === 'complete'`, 60000);
        },
        /** Clicks the element a JS expression returns, e.g. `document.querySelector('[title="Versionen anzeigen"]')`. Waits up to `timeoutMs` (10 s) for it to be there, still and uncovered. */
        click: async (selector, { timeoutMs, ...extra } = {}) => {
            const point = await centreOf(selector, timeoutMs);
            await clickAt(point.x, point.y, extra);
        },
        clickAt,
        /** Press at (fromX, fromY), move to (toX, toY) in `steps` mouse moves with the button held, release. `extra`: `modifiers`. */
        drag: async (fromX, fromY, toX, toY, steps = 12, extra = {}) => {
            await mouse('mouseMoved', fromX, fromY, { button: 'none', buttons: 0, ...extra });
            await mouse('mousePressed', fromX, fromY, { button: 'left', buttons: 1, clickCount: 1, ...extra });
            for (let step = 1; step <= steps; step++) {
                await mouse('mouseMoved', fromX + ((toX - fromX) * step) / steps, fromY + ((toY - fromY) * step) / steps, { button: 'left', buttons: 1, ...extra });
                await sleep(16);
            }
            await mouse('mouseReleased', toX, toY, { button: 'left', buttons: 0, clickCount: 1, ...extra });
        },
        /** Mouse wheel at (x, y); deltaY > 0 scrolls down / zooms an orbit camera out. */
        wheel: (x, y, deltaY, extra = {}) => mouse('mouseWheel', x, y, { deltaX: 0, deltaY, ...extra }),
        /** `document.evaluate`-free text lookup: first visible button/link/menu item/tab/option whose text is exactly `text`. */
        byText: (text) =>
            `[...document.querySelectorAll('button, a, [role="button"], [role="menuitem"], [role="tab"], [role="option"]')].find((el) => el.getClientRects().length > 0 && el.textContent.trim() === ${JSON.stringify(text)})`,
        /** Types into the focused text field (click it first). `replace: true` selects its content first. */
        type: async (text, { replace = false } = {}) => {
            const editable = await evaluate(`(() => {
                const el = document.activeElement;
                const ok = Boolean(el) && (el.matches('textarea, input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit])') || el.isContentEditable);
                if (ok && ${replace}) el.select?.();
                return ok;
            })()`);
            if (!editable) throw new Error('type(): no text field has focus — click it first.');
            await send('Input.insertText', { text });
        },
        /** One key press (down, up) that fires `keydown` with the right `key`, `code`, `keyCode` and modifiers (⌘ = 4, shift = 8). */
        key: async (key, modifiers = 0) => {
            const { code, vk, text } = describeKey(key);
            const typed = text !== undefined && (modifiers & ~SHIFT) === 0; // ⌘/Ctrl/Alt shortcuts must not insert a character
            const params = { key, code, modifiers, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk };
            await send('Input.dispatchKeyEvent', { type: typed ? 'keyDown' : 'rawKeyDown', ...params, ...(typed ? { text, unmodifiedText: text } : {}) });
            await send('Input.dispatchKeyEvent', { type: 'keyUp', ...params });
        },
    };
}

async function login(page) {
    const user = process.env.CURAHUB_SHOT_USER;
    const password = process.env.CURAHUB_SHOT_PASSWORD;
    if (!user || !password) throw new Error('Set CURAHUB_SHOT_USER and CURAHUB_SHOT_PASSWORD.');
    await page.goto('/login');
    await page.click(page.byText('Notfall-Login'));
    await page.click(`document.querySelector('#username')`);
    await page.type(user);
    await page.click(`document.querySelector('#password')`);
    await page.type(password);
    await page.click(`document.querySelector('button[type="submit"]')`);
    try {
        await page.waitFor(`location.pathname !== '/login'`, 15000);
    } catch (error) {
        if (error.kind !== 'timeout') throw error;
        const said = await page.evaluate(`document.body?.innerText.replace(/\\s+/g, ' ').slice(0, 200)`);
        throw new Error(`Login failed, still on /login. The page says: ${said.replaceAll(password, '…')}`);
    }
}

/** Plumbing check without a CuraHub: `node scripts/capture-screenshots.mjs --self-test`. */
async function selfTest(page) {
    const html = encodeURI(`data:text/html,<h1>ok</h1><input id="i"><button onclick="this.textContent='Done'">Go</button><script>
        addEventListener('keydown', (e) => (window.keys = (window.keys ?? []).concat([[e.key, e.code, e.keyCode, e.metaKey].join()])));
        addEventListener('mousemove', (e) => e.buttons === 1 && (window.moves = (window.moves ?? 0) + 1));</script>`);
    await page.goto(encodeURI('data:text/html,<h1>old</h1>'));
    await page.goto(html);
    await page.click(`document.querySelector('#i')`);
    await page.type('hallo');
    for (const [key, modifiers] of [['a', 4], ['Escape', 0], ['f', 0]]) await page.key(key, modifiers);
    await page.click(page.byText('Go'));
    await page.drag(100, 300, 300, 400);
    console.log(await page.evaluate(`JSON.stringify({ heading: document.querySelector('h1').textContent, value: document.querySelector('#i').value, keys: window.keys, button: document.querySelector('button').textContent, dragMoves: window.moves })`));
    const full = await page.screenshot();
    const clipped = await page.screenshot({ x: 350, y: 120, width: 900, height: 760 });
    writeFileSync(path.join(tmpdir(), 'curahub-shots-selftest.png'), full);
    console.log(`full ${JSON.stringify(pngSize(full))}, clip 900x760 ${JSON.stringify(pngSize(clipped))}, file ${path.join(tmpdir(), 'curahub-shots-selftest.png')}`);
    // A click must not land on an overlay, and a broken selector must fail at once, not after the timeout.
    const refused = async (promise) => {
        const started = Date.now();
        return promise.then(() => 'did not throw', (error) => `${error.message.split('\n')[0]} (after ${Date.now() - started} ms)`);
    };
    await page.goto(encodeURI('data:text/html,<button>Hi</button><div class="overlay" style="position:fixed;inset:0"></div>'));
    console.log('covered:', await refused(page.click(page.byText('Hi'), { timeoutMs: 1500 })));
    console.log('selector TypeError:', await refused(page.click(`document.querySelector('#none').x.y`)));
    console.log('waitFor TypeError:', await refused(page.waitFor(`document.querySelector('#none').x`)));
}

/** The page as it was when a shot failed, in the OS temp dir (owner-only). Not when it shows an e-mail address, nor when that cannot be checked. */
async function saveFailureShot(page, name) {
    try {
        if (await page.evaluate(`(${findEmail.toString()})()`)) return console.error('  No screenshot of the failed page: it shows an e-mail address.');
        const file = path.join(tmpdir(), `curahub-shot-failed-${name}.png`);
        writeFileSync(file, await page.screenshot(), { mode: 0o600 });
        console.error(`  The page when ${name} failed: ${file} (deleted by the next run)`);
    } catch {
        // The page is gone; there is nothing to show.
    }
}

if (!SELF_TEST) {
    const unknown = only.filter((name) => !SHOTS.some((entry) => entry.name === name));
    if (!baseUrl || unknown.length > 0) {
        console.error(unknown.length > 0 ? `Unknown shot: ${unknown.join(', ')}. Known: ${SHOTS.map((entry) => entry.name).join(', ')}` : 'Usage: node scripts/capture-screenshots.mjs <base-url> [shot-name …]');
        process.exit(2);
    }
}

purgeFailureShots();
const chrome = launchChrome();
try {
    const cdp = await connect(chrome);
    const { send } = cdp;
    await Promise.all([send('Page.enable'), send('Runtime.enable')]);
    await send('Page.setLifecycleEventsEnabled', { enabled: true });
    await send('Emulation.setFocusEmulationEnabled', { enabled: true }); // the page counts as focused: key events, rAF, :focus
    await send('Emulation.setDeviceMetricsOverride', { ...VIEWPORT, mobile: false });
    if (DEBUG) await traceProblems(cdp);
    const page = pageApi(cdp);
    if (SELF_TEST) {
        await selfTest(page);
    } else {
        mkdirSync(OUT, { recursive: true });
        let loggedIn = false;
        for (const entry of SHOTS.filter((shot) => only.length === 0 || only.includes(shot.name))) {
            try {
                if (entry.login && !loggedIn) await login(page);
                // A public shot must not be taken with the session of the last one: drop the stored token (the next goto reloads without it).
                if (!entry.login && loggedIn) await page.evaluate(`localStorage.removeItem('curahub-auth')`);
                loggedIn = entry.login;
                await entry.prepare(page);
                await page.sleep(entry.settleMs ?? 1500);
                const leak = await page.evaluate(`(${findEmail.toString()})()`);
                if (leak) throw new LeakError(`an e-mail address is visible on screen (${maskEmail(leak)}) — close the menu or pick another view.`);
                const clip = typeof entry.clip === 'function' ? await entry.clip(page) : entry.clip;
                const png = await page.screenshot(clip);
                writeFileSync(path.join(OUT, `${entry.name}.png`), png);
                const { width, height } = pngSize(png);
                console.log(`✓ ${entry.name} (${width}×${height})${width < 1600 ? ' — narrower than the 1600 px the site tests require' : ''}`);
            } catch (error) {
                if (!(error instanceof LeakError)) await saveFailureShot(page, entry.name);
                error.message = `${entry.name}: ${error.message}`;
                throw error;
            }
        }
    }
} catch (error) {
    console.error(`✗ ${error.message}`);
    process.exitCode = 1;
} finally {
    await chrome.stop();
}
