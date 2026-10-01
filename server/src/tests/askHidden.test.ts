import { PassThrough } from 'stream';
import { askHiddenLines } from '../lib/askHidden';

describe('askHiddenLines', () => {
    it('reads one answer per question from piped input (both lines arrive at once)', async () => {
        const input = new PassThrough();
        const output = new PassThrough();
        input.end('erstes-passwort\nzweites-passwort\n');
        await expect(askHiddenLines(['Neues Passwort: ', 'Wiederholen: '], input, output))
            .resolves.toEqual(['erstes-passwort', 'zweites-passwort']);
    });
    it('never echoes the answers', async () => {
        const input = new PassThrough();
        const output = new PassThrough();
        let written = '';
        output.on('data', (chunk) => { written += String(chunk); });
        input.end('geheim-123456\ngeheim-123456\n');
        await askHiddenLines(['A: ', 'B: '], input, output);
        expect(written).toContain('A: ');
        expect(written).not.toContain('geheim');
    });
    it('rejects when the input ends before every question is answered', async () => {
        const input = new PassThrough();
        input.end('nur-eine-zeile\n');
        await expect(askHiddenLines(['A: ', 'B: '], input, new PassThrough())).rejects.toThrow(/Eingabe/);
    });
});
