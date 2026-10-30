import { chromiumArgs, chromiumBinary, decodeCdpChunks, encodeCdp } from '../lib/headlessBrowser';

describe('headlessBrowser', () => {
    const saved = process.env.CHROMIUM_PATH;
    afterEach(() => {
        if (saved === undefined) delete process.env.CHROMIUM_PATH;
        else process.env.CHROMIUM_PATH = saved;
    });

    it('launches headless with the CDP pipe', () => {
        const args = chromiumArgs();
        expect(args).toContain('--remote-debugging-pipe');
        expect(args).toContain('--headless=new');
        expect(args[args.length - 1]).toBe('about:blank');
    });

    it('renders WebGL through Mesa lavapipe (Vulkan), not SwiftShader', () => {
        const args = chromiumArgs('/tmp/profile');
        expect(args).toEqual(expect.arrayContaining(['--use-angle=vulkan', '--enable-features=Vulkan', '--ignore-gpu-blocklist']));
        expect(args.join(' ')).not.toMatch(/swiftshader/i);
    });

    it('gives the browser its own profile directory', () => {
        expect(chromiumArgs('/tmp/profile')).toContain('--user-data-dir=/tmp/profile');
        expect(chromiumArgs().some((a) => a.startsWith('--user-data-dir'))).toBe(false);
    });

    it('honours CHROMIUM_PATH', () => {
        process.env.CHROMIUM_PATH = '/opt/chrome/chrome';
        expect(chromiumBinary()).toBe('/opt/chrome/chrome');
    });

    it('terminates an encoded message with a NUL byte', () => {
        const buf = encodeCdp({ id: 1, method: 'Page.enable' });
        expect(buf.toString().endsWith('\0')).toBe(true);
        expect(JSON.parse(buf.toString().slice(0, -1))).toEqual({ id: 1, method: 'Page.enable' });
    });

    it('keeps a multi-byte character that is split across chunks', () => {
        const bytes = Buffer.from('{"t":"Schönheit"}\0');
        const cut = bytes.indexOf(0xc3) + 1; // between the two bytes of „ö“
        expect(decodeCdpChunks([bytes.subarray(0, cut), bytes.subarray(cut)])).toEqual([{ t: 'Schönheit' }]);
    });

    it('decodes messages split across chunks', () => {
        expect(decodeCdpChunks(['{"id":1}\0{"id"', ':2}\0'])).toEqual([{ id: 1 }, { id: 2 }]);
    });
});
