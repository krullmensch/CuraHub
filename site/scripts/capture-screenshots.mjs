// Captures the site's screenshots from a running CuraHub instance. Run by hand:
//   CURAHUB_SHOT_USER=… CURAHUB_SHOT_PASSWORD=… node scripts/capture-screenshots.mjs http://localhost:3002 [shot-name …]
// Needs Google Chrome and Node ≥ 22 (built-in WebSocket). Never run by CI.
// CHROME_PATH picks another Chrome. CURAHUB_SHOT_DEBUG=1 prints page console errors and failed requests to stderr.
// A shot that throws leaves a screenshot of the page in the OS temp dir.
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
const pngSize = (png) => ({ width: png.readUInt32BE(16), height: png.readUInt32BE(20) });

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

/** Starts headless Chrome with a throw-away profile. `stop()` ends it and removes the profile; also runs on exit and Ctrl-C. */
function launchChrome() {
    const userDataDir = mkdtempSync(path.join(tmpdir(), 'curahub-shots-'));
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
        { stdio: ['ignore', 'ignore', 'pipe'] },
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
    const cleanup = () => {
        if (!state.exited) chrome.kill('SIGKILL');
        chrome.stderr.destroy(); // Chrome's helper processes keep the pipe open for a few seconds after the browser itself is gone
        try {
            rmSync(userDataDir, { recursive: true, force: true, maxRetries: 3 });
        } catch {
            // The profile is in the OS temp dir; a leftover is harmless.
        }
    };
    process.on('exit', cleanup);
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => process.exit(130));
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
        if (message.error) waiter.reject(new Error(`${waiter.method}: ${message.error.message}`));
        else waiter.resolve(message.result);
    };
    socket.onclose = () => {
        for (const waiter of pending.values()) waiter.reject(new Error(`Chrome closed the connection during ${waiter.method}.`));
        pending.clear();
    };
    const send = (method, params = {}, timeoutMs = 120000) =>
        new Promise((resolve, reject) => {
            if (socket.readyState !== WebSocket.OPEN) return reject(new Error(`Chrome connection is closed (${method}).`));
            const id = nextId++;
            const timer = setTimeout(() => {
                pending.delete(id);
                reject(new Error(`${method} got no answer within ${timeoutMs / 1000} s.`));
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

/** With CURAHUB_SHOT_DEBUG=1: what the page logs as errors and which requests fail. */
async function traceProblems({ send, on }) {
    const say = (line) => console.error(`  [page] ${line}`);
    const urls = new Map();
    on('Runtime.consoleAPICalled', ({ type, args }) => type === 'error' && say(`console.error ${args.map((arg) => arg.value ?? arg.description ?? arg.type).join(' ')}`));
    on('Runtime.exceptionThrown', ({ exceptionDetails }) => say(`exception ${exceptionDetails.exception?.description ?? exceptionDetails.text}`));
    on('Log.entryAdded', ({ entry }) => entry.level === 'error' && entry.source !== 'network' && say(`${entry.source}: ${entry.text}`));
    on('Network.requestWillBeSent', ({ requestId, request }) => urls.set(requestId, request.url));
    on('Network.loadingFailed', ({ requestId, errorText, canceled }) => !canceled && say(`request failed (${errorText}) ${urls.get(requestId)}`));
    on('Network.responseReceived', ({ response }) => response.status >= 400 && say(`HTTP ${response.status} ${response.url}`));
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
        if (exceptionDetails) {
            const error = new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
            error.className = exceptionDetails.exception?.className;
            throw error;
        }
        return result.value;
    };
    /** Polls `expression` until it is truthy. Errors while the page is loading or navigating count as "not yet". */
    const waitFor = async (expression, timeoutMs = 30000) => {
        const start = Date.now();
        let lastError = null;
        for (;;) {
            try {
                if (await evaluate(`Boolean(${expression})`)) return;
            } catch (error) {
                if (error.className === 'SyntaxError') throw error;
                lastError = error;
            }
            if (Date.now() - start >= timeoutMs) throw new Error(`Timed out waiting for: ${expression}${lastError ? `\n  last error: ${lastError.message.split('\n')[0]}` : ''}`);
            await sleep(200);
        }
    };
    /** Waits until the element exists, has a size and has stopped moving (panels slide in), then returns its centre. */
    const centreOf = async (selector, timeoutMs = 10000) => {
        const sample = `(() => { const el = ${selector}; if (!el) return null; el.scrollIntoViewIfNeeded?.(); const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null; })()`;
        const start = Date.now();
        let previous = null;
        let lastError = null;
        for (;;) {
            let point = null;
            try {
                point = await evaluate(sample);
            } catch (error) {
                if (error.className === 'SyntaxError') throw error;
                lastError = error;
            }
            if (point && previous && Math.abs(point.x - previous.x) < 0.5 && Math.abs(point.y - previous.y) < 0.5) return point;
            previous = point;
            if (Date.now() - start >= timeoutMs) throw new Error(`Not found or not visible: ${selector}${lastError ? `\n  last error: ${lastError.message.split('\n')[0]}` : ''}`);
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
        /** Clicks the element a JS expression returns, e.g. `document.querySelector('[title="Versionen anzeigen"]')`. Waits up to 10 s for it. */
        click: async (selector, extra = {}) => {
            const point = await centreOf(selector);
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
    } catch {
        const said = await page.evaluate(`document.body?.innerText.replace(/\\s+/g, ' ').slice(0, 200)`);
        throw new Error(`Login failed, still on /login. The page says: ${said}`);
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
}

if (!SELF_TEST) {
    const unknown = only.filter((name) => !SHOTS.some((entry) => entry.name === name));
    if (!baseUrl || unknown.length > 0) {
        console.error(unknown.length > 0 ? `Unknown shot: ${unknown.join(', ')}. Known: ${SHOTS.map((entry) => entry.name).join(', ')}` : 'Usage: node scripts/capture-screenshots.mjs <base-url> [shot-name …]');
        process.exit(2);
    }
}

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
                if (leak) throw new Error(`an e-mail address is visible on screen (${leak}) — close the menu or pick another view.`);
                const clip = typeof entry.clip === 'function' ? await entry.clip(page) : entry.clip;
                const png = await page.screenshot(clip);
                writeFileSync(path.join(OUT, `${entry.name}.png`), png);
                const { width, height } = pngSize(png);
                console.log(`✓ ${entry.name} (${width}×${height})${width < 1600 ? ' — narrower than the 1600 px the site tests require' : ''}`);
            } catch (error) {
                try {
                    const file = path.join(tmpdir(), `curahub-shot-failed-${entry.name}.png`);
                    writeFileSync(file, await page.screenshot());
                    console.error(`  The page when ${entry.name} failed: ${file}`);
                } catch {
                    // The page is gone; there is nothing to show.
                }
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
