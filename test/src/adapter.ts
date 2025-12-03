const runner = require('./integration/index');

// Provide both module.exports = function and module.exports.run = function
if (runner && typeof runner.run === 'function') {
    module.exports = runner.run;
    module.exports.run = runner.run;
} else if (typeof runner === 'function') {
    module.exports = runner;
    module.exports.run = runner;
} else {
    // Fallback: try to export default
    module.exports = function () {
        return Promise.reject(new Error('Test runner not found'));
    };
    module.exports.run = module.exports;
}
