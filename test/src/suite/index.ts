import * as path from 'path';
const Mocha = require('mocha');
const glob = require('glob');

const mocha = new Mocha({ ui: 'bdd', timeout: 10000 });

const testsRoot = path.resolve(__dirname);

export = function () {
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
};
