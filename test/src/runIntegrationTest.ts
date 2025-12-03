const path = require('path');
const { runTests } = require('@vscode/test-electron');

async function main() {
    try {
        const extensionDevelopmentPath = path.resolve(__dirname, '..', '..');
        // Use the adapter which ensures compatibility (exports.run and module.exports)
        const extensionTestsPath = path.resolve(__dirname, 'adapter.js');
        // Provide a workspace so `vscode.workspace.workspaceFolders` is available
        const workspacePath = extensionDevelopmentPath;

        await runTests({ extensionDevelopmentPath, extensionTestsPath, launchArgs: [workspacePath] });
    } catch (err) {
        console.error('Failed to run integration tests:', err);
        process.exit(1);
    }
}

main();
