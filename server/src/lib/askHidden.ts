import readline from 'readline';
import type { Readable, Writable } from 'stream';

/**
 * Asks several questions on one readline interface without echoing the answers — for the
 * password prompts of the shell scripts. One interface for all questions, so piped input
 * (`printf 'pw\npw\n' | … exec -T …`) works as well as a terminal.
 */
export function askHiddenLines(questions: string[], input: Readable, output: Writable): Promise<string[]> {
    return new Promise((resolve, reject) => {
        const isTty = Boolean((input as Readable & { isTTY?: boolean }).isTTY);
        const rl = readline.createInterface({ input, output, terminal: isTty });
        // Typed characters are echoed through this hook in terminal mode; drop them.
        (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = () => {};

        const answers: string[] = [];
        const askNext = () => {
            if (answers.length === questions.length) {
                rl.close();
                return;
            }
            output.write(questions[answers.length]);
        };

        rl.on('line', (line) => {
            if (answers.length >= questions.length) return;
            answers.push(line);
            if (isTty) output.write('\n');
            askNext();
        });
        rl.on('close', () => {
            if (answers.length === questions.length) resolve(answers);
            else reject(new Error('Eingabe beendet, bevor alle Fragen beantwortet waren.'));
        });

        askNext();
    });
}
