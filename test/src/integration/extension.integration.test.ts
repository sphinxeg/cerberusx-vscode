import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

suite('CerberusX Integration Tests', () => {
    test('buildWithTrancc records expected command in testing mode', async () => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            assert.fail('No workspace folder available for integration test');
            return;
        }

        const wsRoot = workspaceFolders[0].uri.fsPath;
        const testFilePath = path.join(wsRoot, 'test-source.cerberusdoc');
        fs.writeFileSync(testFilePath, 'rem test source');

        // Open the document so pickCxsFile will select it
        const doc = await vscode.workspace.openTextDocument(testFilePath);
        // Ensure the language is set so the extension activation event fires
        await vscode.languages.setTextDocumentLanguage(doc, 'cerberusx');
        await vscode.window.showTextDocument(doc);

        // Enable testing mode and clear lastCommand
        const config = vscode.workspace.getConfiguration('cerberusx');
        await config.update('testing', true, vscode.ConfigurationTarget.Workspace);
        await config.update('lastCommand', undefined, vscode.ConfigurationTarget.Workspace);

        // Set a target map that matches expected target
        await config.update('tranccTargetMap', { html5: 'Html5_Game', glfw: 'Desktop_Game', android: 'android', ios: 'ios' }, vscode.ConfigurationTarget.Workspace);

        // Ensure the extension is activated and then execute the build command for html5 + release
        await vscode.extensions.getExtension('your-publisher.cerberusx')?.activate();
        await vscode.commands.executeCommand('cerberusx.buildWithTrancc', 'html5', 'release');

        // Read lastCommand with brief polling to avoid flakiness due to async settings persistence
        let last: string | undefined;
        const deadline = Date.now() + 2000; // up to 2s
        do {
            last = vscode.workspace.getConfiguration('cerberusx').get<string>('lastCommand');
            if (last) break;
            await new Promise(r => setTimeout(r, 100));
        } while (Date.now() < deadline);

        assert.ok(last, 'lastCommand should be set in testing mode');
        assert.ok(last!.includes('-build'), 'should include -build');
        assert.ok(last!.includes('-config=release'), 'should include correct config');
        assert.ok(last!.includes('-target=Html5_Game'), 'should include resolved target');
        assert.ok(last!.includes('test-source.cerberusdoc'), 'should include test file name');

        // cleanup
        await config.update('testing', false, vscode.ConfigurationTarget.Workspace);
        await config.update('lastCommand', undefined, vscode.ConfigurationTarget.Workspace);
        try { fs.unlinkSync(testFilePath); } catch (e) { }
    });
});
