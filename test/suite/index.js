const path = require('path');
const Mocha = require('mocha');
const glob = require('glob');

const mocha = new Mocha({ ui: 'bdd', timeout: 10000 });

const testsRoot = path.resolve(__dirname);

// Use sync API for compatibility with different glob versions and ESM/exports shapes
module.exports = function ()
{
    return new Promise((resolve, reject) =>
    {
        try
        {
            const files = (typeof glob.sync === 'function')
                ? glob.sync('**/*.test.js', { cwd: testsRoot })
                : require('glob').sync('**/*.test.js', { cwd: testsRoot });

            files.forEach(f => mocha.addFile(path.resolve(testsRoot, f)));

            mocha.run(failures =>
            {
                if (failures)
                {
                    reject(new Error(`${failures} tests failed.`));
                } else
                {
                    resolve();
                }
            });
        } catch (err)
        {
            reject(err);
        }
    });
};
