import * as path from 'path';
const Mocha = require('mocha');
const glob = require('glob');

const mocha = new Mocha({ ui: 'tdd', timeout: 20000 });

const testsRoot = path.resolve(__dirname);

export async function run(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        try {
            const files = (typeof glob.sync === 'function')
                ? glob.sync('**/*.test.js', { cwd: testsRoot })
                : require('glob').sync('**/*.test.js', { cwd: testsRoot });

            files.forEach((f: string) => mocha.addFile(path.resolve(testsRoot, f)));

            mocha.run((failures: number) => {
                if (failures) {
                    reject(new Error(`${failures} tests failed.`));
                } else {
                    resolve();
                }
            });
        } catch (err) {
            reject(err);
        }
    });
}

// export compatibility for consumers that expect module.exports = function
(module as any).exports = run;
