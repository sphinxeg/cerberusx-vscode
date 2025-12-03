import * as vscode from 'vscode';
import { readFile } from 'fs/promises';
import * as fs from 'fs';
import * as cp from 'child_process';
import * as path from 'path';
import { TokenExtractor, parseCerberusDocSymbols, CerbSymbol } from './parser';
import { LanguageClient, TransportKind, LanguageClientOptions, ServerOptions } from 'vscode-languageclient/node';
import { CerberusSidebarProvider } from './sidebar';
import { CerberusXDebugConfigurationProvider, CerberusXDebugAdapterDescriptorFactory } from './debugAdapter';

let tokenExtractor: TokenExtractor;
let tokens = new Set<string>();
let symbolsMap = new Map<string, CerbSymbol[]>(); // Map keyword to symbol info
let scanDebounceTimer: NodeJS.Timeout | undefined;
const OUTPUT_CHANNEL_NAME = 'CerberusX';
let client: LanguageClient | undefined;

export async function activate(context: vscode.ExtensionContext) {
    const output = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
    context.subscriptions.push(output);

    // Log activation for debugging
    console.log('CerberusX extension is now active!');
    output.appendLine('CerberusX extension activated');

    const config = vscode.workspace.getConfiguration();
    tokenExtractor = new TokenExtractor(config.get<string>('cerberusx.tokenExtractionRegex') || '');

    // Start language server (optional - fail gracefully if server not built)
    try {
        await startLanguageServer(context);
        output.appendLine('Language server started successfully');
    } catch (error) {
        output.appendLine(`Language server failed to start (optional): ${error}`);
        console.warn('Language server not available:', error);
    }

    // initial scan
    await scanAllCerberusDocs();

    // fallback completion provider (client also provides completions via LSP; this is a simple local provider)
    const completionProvider = vscode.languages.registerCompletionItemProvider(
        { language: 'cerberusx', scheme: 'file' },
        {
            provideCompletionItems(document: vscode.TextDocument, position: vscode.Position) {
                const line = document.lineAt(position.line).text.substring(0, position.character);
                const match = /[A-Za-z_][A-Za-z0-9_]*$/.exec(line);
                if (!match) {
                    return undefined;
                }
                const items: vscode.CompletionItem[] = [];
                for (const t of Array.from(tokens).sort()) {
                    const it = new vscode.CompletionItem(t, vscode.CompletionItemKind.Function);
                    items.push(it);
                }
                return new vscode.CompletionList(items, true);
            }
        },
        '.', ':'
    );
    context.subscriptions.push(completionProvider);

    // hover provider for showing keyword documentation
    const hoverProvider = vscode.languages.registerHoverProvider(
        { language: 'cerberusx', scheme: 'file' },
        {
            provideHover(document: vscode.TextDocument, position: vscode.Position) {
                console.log(`[HOVER] provideHover called! Language: ${document.languageId}, file: ${document.fileName}`);
                const range = document.getWordRangeAtPosition(position);
                if (!range) {
                    console.log('Hover: no word range at position');
                    return undefined;
                }

                const word = document.getText(range);
                console.log(`Hover: checking word "${word}", symbolsMap size: ${symbolsMap.size}`);
                const symbols = symbolsMap.get(word.toLowerCase());
                console.log(`Hover: found ${symbols ? symbols.length : 0} symbols for "${word}"`);

                if (!symbols || symbols.length === 0) return undefined;

                // Take the first symbol with the most complete information
                const symbol = symbols.reduce((best, current) => {
                    const bestScore = (best.signature ? 2 : 0) + (best.description ? 1 : 0);
                    const currentScore = (current.signature ? 2 : 0) + (current.description ? 1 : 0);
                    return currentScore > bestScore ? current : best;
                }, symbols[0]);

                const md = new vscode.MarkdownString();
                md.isTrusted = true;
                md.supportHtml = true;

                // Add signature/syntax in code block
                if (symbol.signature) {
                    md.appendCodeblock(symbol.signature, 'cerberusx');
                } else {
                    // Show at least the name if no signature
                    md.appendCodeblock(symbol.name, 'cerberusx');
                }

                // Add description
                if (symbol.description && symbol.description.trim().length > 0) {
                    md.appendMarkdown('\n' + symbol.description);
                }

                // Add source file if available (shortened path)
                if (symbol.uri) {
                    const fileName = symbol.uri.split(/[\/\\]/).pop() || symbol.uri;
                    md.appendMarkdown('\n\n---\n');
                    md.appendMarkdown(`*Source: \`${fileName}\`*`);
                }

                return new vscode.Hover(md);
            }
        }
    );
    context.subscriptions.push(hoverProvider);

    // refresh command
    context.subscriptions.push(vscode.commands.registerCommand('cerberusx.refreshKeywords', async () => {
        await scanAllCerberusDocs();
        const symbolCount = Array.from(symbolsMap.values()).reduce((sum, arr) => sum + arr.length, 0);
        vscode.window.showInformationMessage(`CerberusX: refreshed ${tokens.size} keywords, ${symbolCount} symbols with documentation`);
        output.appendLine(`Loaded ${symbolCount} symbols from ${symbolsMap.size} unique keywords`);
        // notify server to refresh (server watches file system, but send notification to be safe)
        client?.sendNotification('cerberusx/refresh');
    }));

    // Command to open HTML documentation for symbol at cursor
    context.subscriptions.push(vscode.commands.registerCommand('cerberusx.openDocumentation', async () => {
        console.log('[OpenDoc] Command triggered!');
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            console.log('[OpenDoc] No active editor');
            vscode.window.showWarningMessage('No active editor');
            return;
        }

        console.log(`[OpenDoc] Active editor language: ${editor.document.languageId}`); const position = editor.selection.active;
        const range = editor.document.getWordRangeAtPosition(position);
        if (!range) {
            vscode.window.showWarningMessage('No word at cursor position');
            return;
        }

        const word = editor.document.getText(range);
        console.log(`[OpenDoc] Word at cursor: "${word}"`);
        const symbols = symbolsMap.get(word.toLowerCase());
        console.log(`[OpenDoc] Found ${symbols ? symbols.length : 0} symbols for "${word}"`);

        if (!symbols || symbols.length === 0) {
            vscode.window.showWarningMessage(`No documentation found for "${word}"`);
            return;
        }

        // Log all available symbols
        symbols.forEach((s, i) => {
            console.log(`[OpenDoc] Symbol ${i}: ${s.name}, URI: ${s.uri}`);
        });

        // Prefer symbols from docs/cerberusdoc/Programming/Keywords over other locations
        const keywordSymbol = symbols.find(s => s.uri && s.uri.includes('Programming') && s.uri.includes('Keywords'));
        const programmingSymbol = symbols.find(s => s.uri && s.uri.includes('Programming'));
        const moduleSymbol = symbols.find(s => s.uri && s.uri.includes('modules'));

        const symbol = keywordSymbol || programmingSymbol || moduleSymbol || symbols[0];
        console.log(`[OpenDoc] Selected symbol URI: ${symbol.uri}`);

        if (!symbol.uri) {
            vscode.window.showWarningMessage(`No source file for "${word}"`);
            return;
        }

        // Convert .cerberusdoc path to .html path
        const config = vscode.workspace.getConfiguration('cerberusx');
        const rootCfg = config.get<string>('PathOfCerberusX') || '';
        if (!rootCfg) {
            vscode.window.showWarningMessage('PathOfCerberusX not configured');
            return;
        }

        let resolvedRoot: string | undefined;
        if (path.isAbsolute(rootCfg)) {
            resolvedRoot = rootCfg;
        } else if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            resolvedRoot = path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, rootCfg);
        }

        if (!resolvedRoot) {
            vscode.window.showWarningMessage('Cannot resolve PathOfCerberusX');
            return;
        }

        // Convert cerberusdoc path to html path
        // Docs: docs/cerberusdoc/Programming/Keywords/For.cerberusdoc -> docs/html/Programming_Keywords_For.html
        // Modules: modules/mojo/cerberusdoc/graphics.cerberusdoc -> docs/html/Modules_mojo.graphics.html
        let htmlPath: string;

        console.log(`[OpenDoc] Symbol URI: ${symbol.uri}`);

        if (symbol.uri.includes('modules') && symbol.uri.includes('cerberusdoc')) {
            // Handle module documentation
            // Extract module path: modules/fantomCX-3.05/cerberusdoc/cftEngine.cerberusdoc
            const modulesIndex = symbol.uri.indexOf('modules');
            const afterModules = symbol.uri.substring(modulesIndex + 8); // Skip "modules/"

            const parts = afterModules.split(/[\/\\]/).filter(p => p && p !== 'cerberusdoc');
            console.log(`[OpenDoc] Module parts: ${JSON.stringify(parts)}`);

            // Remove .cerberusdoc extension and version suffixes (e.g., -3.05)
            const cleanedParts = parts.map(p =>
                p.replace('.cerberusdoc', '').replace(/-[\d.]+$/, '')
            );
            console.log(`[OpenDoc] Cleaned module parts: ${JSON.stringify(cleanedParts)}`);

            // Format: Modules_modulename.filename.html
            const htmlName = 'Modules_' + cleanedParts.join('.') + '.html';
            console.log(`[OpenDoc] Module HTML name: ${htmlName}`);

            htmlPath = path.join(resolvedRoot, 'docs', 'html', htmlName);
        } else if (symbol.uri.includes('cerberusdoc')) {
            // Handle docs/cerberusdoc files
            const relativePath = symbol.uri.split('cerberusdoc')[1];
            console.log(`[OpenDoc] Relative path after cerberusdoc: ${relativePath}`);

            // Split path and filter empty parts, but keep the filename with extension
            let pathParts = relativePath.split(/[\/\\]/).filter(p => p && p.trim().length > 0);
            console.log(`[OpenDoc] Path parts: ${JSON.stringify(pathParts)}`);

            // Remove .cerberusdoc extension from the last part (filename)
            if (pathParts.length > 0) {
                const lastPart = pathParts[pathParts.length - 1];
                if (lastPart.endsWith('.cerberusdoc')) {
                    pathParts[pathParts.length - 1] = lastPart.replace('.cerberusdoc', '');
                }
            }
            console.log(`[OpenDoc] Path parts after extension removal: ${JSON.stringify(pathParts)}`);

            // Join with underscore and add .html
            let htmlName = pathParts.join('_').trim();
            // Remove any trailing dots
            htmlName = htmlName.replace(/\.+$/g, '');
            htmlName += '.html';
            console.log(`[OpenDoc] Final HTML name: ${htmlName}`);

            htmlPath = path.join(resolvedRoot, 'docs', 'html', htmlName);
            console.log(`[OpenDoc] Full HTML path: ${htmlPath}`);
        } else {
            vscode.window.showWarningMessage('Cannot determine HTML path');
            return;
        }

        // Check if HTML folder exists, if not run makedocs
        const htmlDir = path.join(resolvedRoot, 'docs', 'html');
        if (!fs.existsSync(htmlDir)) {
            console.log(`[OpenDoc] HTML folder not found: ${htmlDir}`);

            const result = await vscode.window.showWarningMessage(
                'HTML documentation not found. Generate documentation?',
                'Yes', 'No'
            );

            if (result === 'Yes') {
                // Determine makedocs executable based on OS
                let makedocsExe: string;
                if (process.platform === 'win32') {
                    makedocsExe = 'makedocs_winnt.exe';
                } else if (process.platform === 'darwin') {
                    makedocsExe = 'makedocs_macos';
                } else {
                    makedocsExe = 'makedocs_linux';
                }

                const makedocsPath = path.join(resolvedRoot, 'bin', makedocsExe);
                console.log(`[OpenDoc] Running makedocs: ${makedocsPath}`);

                if (!fs.existsSync(makedocsPath)) {
                    vscode.window.showErrorMessage(`makedocs not found: ${makedocsPath}`);
                    return;
                }

                // Show progress notification
                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: 'Generating CerberusX documentation...',
                    cancellable: false
                }, async (progress) => {
                    return new Promise<void>((resolve, reject) => {
                        const { exec } = require('child_process');

                        // Run makedocs from CerberusX root directory
                        exec(`"${makedocsPath}"`, { cwd: resolvedRoot }, (error: any, stdout: any, stderr: any) => {
                            if (error) {
                                console.error(`[OpenDoc] makedocs error: ${error}`);
                                vscode.window.showErrorMessage(`Failed to generate documentation: ${error.message}`);
                                reject(error);
                                return;
                            }

                            console.log(`[OpenDoc] makedocs output: ${stdout}`);
                            if (stderr) console.error(`[OpenDoc] makedocs stderr: ${stderr}`);

                            vscode.window.showInformationMessage('Documentation generated successfully!');
                            resolve();
                        });
                    });
                });
            } else {
                return;
            }
        }

        if (!fs.existsSync(htmlPath)) {
            // Try to find the file in html directory
            console.log(`[OpenDoc] Searching in: ${htmlDir}`);

            vscode.window.showErrorMessage(`HTML documentation not found: ${htmlPath}\n\nPlease check the console for debug info.`);
            return;
        }

        // Open HTML file in VS Code editor (opens as text/preview)
        const htmlUri = vscode.Uri.file(htmlPath);
        try {
            // Try to open in default external browser
            await vscode.env.openExternal(htmlUri);
        } catch (error) {
            // Fallback: open as text file in VS Code
            await vscode.commands.executeCommand('vscode.open', htmlUri, { preview: true });
        }
    }));

    // watch for .cerberusdoc changes
    const watcher = vscode.workspace.createFileSystemWatcher('**/*.cerberusdoc');
    watcher.onDidCreate(() => scheduleRescan());
    watcher.onDidChange(() => scheduleRescan());
    context.subscriptions.push(watcher);

    // Register sidebar/webview provider
    try {
        const sidebarProvider = new CerberusSidebarProvider(context);
        context.subscriptions.push(
            vscode.window.registerWebviewViewProvider(CerberusSidebarProvider.viewType, sidebarProvider)
        );
        output.appendLine('CerberusX sidebar provider registered successfully');
        console.log('CerberusX sidebar registered with viewType:', CerberusSidebarProvider.viewType);
    } catch (error) {
        output.appendLine(`Failed to register sidebar: ${error}`);
        console.error('Sidebar registration error:', error);
    }

    // Register build commands (use context available in activate)
    context.subscriptions.push(vscode.commands.registerCommand('cerberusx.buildWithTrancc', async (platform?: string, mode?: string) => {
        const file = await pickCxsFile();
        if (!file) return;
        const plat = platform || await vscode.window.showQuickPick(['html5', 'glfw', 'android', 'ios'], { placeHolder: 'Select platform' });
        if (!plat) return;
        const m = mode || await vscode.window.showQuickPick(['debug', 'release'], { placeHolder: 'Select build mode' });
        if (!m) return;
        await runTrancc(file, plat, m, false);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('cerberusx.buildAndRunWithTrancc', async (platform?: string, mode?: string) => {
        const file = await pickCxsFile();
        if (!file) return;
        const plat = platform || await vscode.window.showQuickPick(['html5', 'glfw', 'android', 'ios'], { placeHolder: 'Select platform' });
        if (!plat) return;
        const m = mode || await vscode.window.showQuickPick(['debug', 'release'], { placeHolder: 'Select build mode' });
        if (!m) return;
        await runTrancc(file, plat, m, true);
    }));
    watcher.onDidDelete(() => scheduleRescan());
    context.subscriptions.push(watcher);

    // commands for build mode / platform
    context.subscriptions.push(vscode.commands.registerCommand('cerberusx.selectBuildMode', async () => {
        const choice = await vscode.window.showQuickPick(['debug', 'release'], { placeHolder: 'Select CerberusX build mode' });
        if (!choice) { return; }
        await vscode.workspace.getConfiguration().update('cerberusx.buildMode', choice, vscode.ConfigurationTarget.Workspace);
        vscode.window.showInformationMessage(`CerberusX build mode set to ${choice}`);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('cerberusx.selectTargetPlatform', async () => {
        const platforms = ['html5', 'glfw', 'android', 'ios'];
        const choice = await vscode.window.showQuickPick(platforms, { placeHolder: 'Select CerberusX target platform' });
        if (!choice) { return; }
        await vscode.workspace.getConfiguration().update('cerberusx.targetPlatform', choice, vscode.ConfigurationTarget.Workspace);
        vscode.window.showInformationMessage(`CerberusX target platform set to ${choice}`);
    }));

    // build command
    context.subscriptions.push(vscode.commands.registerCommand('cerberusx.build', async (uri?: vscode.Uri) => {
        const cfg = vscode.workspace.getConfiguration();
        const mode = cfg.get<string>('cerberusx.buildMode') || 'debug';
        const platform = cfg.get<string>('cerberusx.targetPlatform') || 'html5';

        // Resolve working directory: explicit uri, then configured PathOfCerberusX, then workspace folder
        let cwd: string | undefined;
        if (uri && uri.fsPath) {
            cwd = uri.fsPath;
        } else {
            const cfg = vscode.workspace.getConfiguration('cerberusx');
            const rootCfg = cfg.get<string>('PathOfCerberusX') || '';
            if (rootCfg && rootCfg.length > 0) {
                if (path.isAbsolute(rootCfg)) {
                    cwd = rootCfg;
                } else if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
                    cwd = path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, rootCfg);
                }
            }
            if (!cwd && vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
                cwd = vscode.workspace.workspaceFolders[0].uri.fsPath;
            }
        }

        output.clear();
        output.show(true);
        output.appendLine(`Running: cerberusx --mode ${mode} --platform ${platform}`);
        const args = ['--mode', mode, '--platform', platform];

        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document && editor.document.uri.fsPath.endsWith('.cerberusdoc')) {
            args.push(editor.document.uri.fsPath);
        }

        try {
            const proc = cp.spawn('cerberusx', args, { cwd, shell: true });
            proc.stdout.on('data', (data) => output.append(data.toString()));
            proc.stderr.on('data', (data) => output.append(data.toString()));
            proc.on('close', (code) => {
                output.appendLine(`CerberusX exited with code ${code}`);
                if (code === 0) {
                    vscode.window.showInformationMessage(`CerberusX build succeeded (${platform}, ${mode})`);
                } else {
                    vscode.window.showErrorMessage(`CerberusX build failed (exit ${code})`);
                }
            });
        } catch (err: any) {
            vscode.window.showErrorMessage(`Failed to run CerberusX: ${err.message}`);
            output.appendLine(`Failed to run CerberusX: ${err.stack || err}`);
        }
    }));

    // snippets generation command
    context.subscriptions.push(vscode.commands.registerCommand('cerberusx.generateSnippets', async () => {
        const cfg = vscode.workspace.getConfiguration();
        const snippetsFile = cfg.get<string>('cerberusx.snippetsFile') || '.vscode/cerberusx-snippets.code-snippets';
        if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
            vscode.window.showErrorMessage('Open a workspace to generate snippets into .vscode folder.');
            return;
        }
        const wsRoot = vscode.workspace.workspaceFolders[0].uri;
        const targetUri = vscode.Uri.joinPath(wsRoot, snippetsFile);
        // ensure directory exists
        try {
            await generateSnippetsFile(targetUri);
            vscode.window.showInformationMessage(`CerberusX snippets generated at ${snippetsFile}`);
        } catch (e: any) {
            vscode.window.showErrorMessage(`Failed to write snippets: ${e.message}`);
        }
    }));

    // OLD DEBUG PROVIDER - DISABLED (using new debug adapter below)
    // Register a simple DebugConfigurationProvider that launches CerberusX in an integrated terminal.
    // Note: This is a terminal-based debug launcher. Full source-level debugging requires CerberusX
    // to implement a debug protocol. This provider starts the program in a terminal with the selected flags.
    /*
    const debugProvider: vscode.DebugConfigurationProvider = {
        resolveDebugConfiguration: async (folder: vscode.WorkspaceFolder | undefined, config: vscode.DebugConfiguration, token?: vscode.CancellationToken) => {
            const cfg = vscode.workspace.getConfiguration('cerberusx');
            const exe = cfg.get<string>('executablePath') || 'cerberusx';
            const mode = config.mode || cfg.get<string>('buildMode') || 'debug';
            const platform = config.platform || cfg.get<string>('targetPlatform') || 'html5';
            let program = config.program as string | undefined;

            // if no program specified, use active editor
            if (!program && vscode.window.activeTextEditor) {
                program = vscode.window.activeTextEditor.document.uri.fsPath;
            }

            if (!program) {
                vscode.window.showErrorMessage('No program/file specified to debug.');
                return undefined; // cancel launch
            }

            // Build command
            const cmdParts: string[] = [];
            cmdParts.push(exe);
            cmdParts.push('--mode');
            cmdParts.push(mode);
            cmdParts.push('--platform');
            cmdParts.push(platform);
            cmdParts.push(program);

            // Resolve optional PathOfCerberusX for terminal cwd
            const rootCfg = cfg.get<string>('PathOfCerberusX') || '';
            let termCwd: string | undefined;
            if (rootCfg && rootCfg.length > 0) {
                if (path.isAbsolute(rootCfg)) {
                    termCwd = rootCfg;
                } else if (folder) {
                    termCwd = path.join(folder.uri.fsPath, rootCfg);
                } else if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
                    termCwd = path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, rootCfg);
                }
            }

            const terminal = vscode.window.createTerminal({ name: 'CerberusX Debug', cwd: termCwd });
            terminal.show(true);
            terminal.sendText(cmdParts.map(p => p.includes(' ') ? `"${p}"` : p).join(' '));

            // We started the program in a terminal; return null/undefined to cancel the normal debug lifecycle.
            // This means breakpoints/stepping won't be available unless CerberusX exposes a debug protocol.
            return undefined;
        }
    };
    context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('cerberusx', debugProvider));
    */

    // update tokenExtractor when config changes
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('cerberusx.tokenExtractionRegex')) {
            tokenExtractor.updateRegex(vscode.workspace.getConfiguration().get<string>('cerberusx.tokenExtractionRegex') || '');
            scheduleRescan(50);
        }
    }));

    function scheduleRescan(delay = 300) {
        if (scanDebounceTimer) {
            clearTimeout(scanDebounceTimer);
        }
        scanDebounceTimer = setTimeout(() => scanAllCerberusDocs().catch(err => {
            console.error('rescan failed', err);
        }), delay);
    }

    async function scanAllCerberusDocs() {
        tokens.clear();
        symbolsMap.clear();

        // Scan workspace files
        const files = await vscode.workspace.findFiles('**/*.cerberusdoc');
        for (const f of files) {
            try {
                const content = await readFile(f.fsPath, { encoding: 'utf8' });
                const extracted = tokenExtractor.extractFromText(content);
                for (const t of extracted) tokens.add(t);

                // Also extract symbols with documentation
                const symbols = parseCerberusDocSymbols(content, f.toString());
                console.log(`Parsed ${symbols.length} symbols from ${f.fsPath}`);
                for (const symbol of symbols) {
                    console.log(`  - Symbol: ${symbol.name}, sig: ${symbol.signature ? 'yes' : 'no'}, desc: ${symbol.description ? 'yes' : 'no'}`);
                    const key = symbol.name.toLowerCase();
                    if (!symbolsMap.has(key)) {
                        symbolsMap.set(key, []);
                    }
                    symbolsMap.get(key)!.push(symbol);
                }
            } catch (e) {
                console.error('read error', e);
            }
        }

        // Also scan PathOfCerberusX/docs folder if configured
        const config = vscode.workspace.getConfiguration('cerberusx');
        const rootCfg = config.get<string>('PathOfCerberusX') || '';
        if (rootCfg && rootCfg.length > 0) {
            let resolvedRoot: string | undefined;
            if (path.isAbsolute(rootCfg)) {
                resolvedRoot = rootCfg;
            } else if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
                resolvedRoot = path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, rootCfg);
            }

            if (resolvedRoot) {
                const docsPath = path.join(resolvedRoot, 'docs');
                if (fs.existsSync(docsPath)) {
                    try {
                        await scanDirectoryForCerberusDocs(docsPath);
                    } catch (e) {
                        console.error('Error scanning CerberusX docs folder:', e);
                    }
                }

                // Also scan modules folder for module documentation
                const modulesPath = path.join(resolvedRoot, 'modules');
                if (fs.existsSync(modulesPath)) {
                    try {
                        console.log(`Scanning modules folder: ${modulesPath}`);
                        await scanDirectoryForCerberusDocs(modulesPath);
                    } catch (e) {
                        console.error('Error scanning CerberusX modules folder:', e);
                    }
                }
            }
        }

        // also try to extract tokens from open editors
        for (const e of vscode.workspace.textDocuments) {
            if (e.uri.fsPath.endsWith('.cerberusdoc')) {
                const extracted = tokenExtractor.extractFromText(e.getText());
                for (const t of extracted) tokens.add(t);

                const symbols = parseCerberusDocSymbols(e.getText(), e.uri.toString());
                for (const symbol of symbols) {
                    const key = symbol.name.toLowerCase();
                    if (!symbolsMap.has(key)) {
                        symbolsMap.set(key, []);
                    }
                    symbolsMap.get(key)!.push(symbol);
                }
            }
        }
    }

    async function scanDirectoryForCerberusDocs(dir: string) {
        const entries = await fs.promises.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                await scanDirectoryForCerberusDocs(fullPath);
            } else if (entry.isFile() && entry.name.endsWith('.cerberusdoc')) {
                try {
                    console.log(`[Extension] Reading file: ${fullPath}`);
                    const content = await readFile(fullPath, { encoding: 'utf8' });
                    console.log(`[Extension] File content length: ${content.length}, first 200 chars: ${content.substring(0, 200).replace(/\n/g, '\\n')}`);
                    const extracted = tokenExtractor.extractFromText(content);
                    for (const t of extracted) tokens.add(t);

                    // Also extract symbols with documentation
                    console.log(`[Extension] Calling parseCerberusDocSymbols for ${entry.name}`);
                    const symbols = parseCerberusDocSymbols(content, fullPath);
                    console.log(`Parsed ${symbols.length} symbols from ${fullPath}`);
                    for (const symbol of symbols) {
                        console.log(`  - Symbol: ${symbol.name}, sig: ${symbol.signature ? 'yes' : 'no'}, desc: ${symbol.description ? 'yes' : 'no'}`);
                        const key = symbol.name.toLowerCase();
                        if (!symbolsMap.has(key)) {
                            symbolsMap.set(key, []);
                        }
                        symbolsMap.get(key)!.push(symbol);
                    }
                } catch (e) {
                    console.error('read error for', fullPath, e);
                }
            }
        }
    }

    async function generateSnippetsFile(targetUri: vscode.Uri) {
        // collect symbols to turn into snippets
        const files = await vscode.workspace.findFiles('**/*.cerberusdoc');
        const symbols: CerbSymbol[] = [];
        for (const f of files) {
            try {
                const content = await readFile(f.fsPath, { encoding: 'utf8' });
                const syms = parseCerberusDocSymbols(content, f.toString());
                for (const s of syms) symbols.push(s);
            } catch (e) {
                console.error('read error', e);
            }
        }
        // build snippets JSON
        const snippetsObj: any = {};
        for (const s of symbols) {
            const name = s.name;
            const sig = s.signature || '';
            // create placeholder params from signature e.g. (arg1, arg2)
            const params: string[] = [];
            if (sig) {
                const inner = sig.replace(/^\(|\)$/g, '');
                if (inner.trim().length > 0) {
                    const parts = inner.split(',').map(p => p.trim()).filter(Boolean);
                    parts.forEach((p, i) => params.push(`\${${i + 1}:${p}}`));
                }
            }
            const body = `${name}${sig ? '(' + (params.length ? params.join(', ') : '') + ')' : ''}$0`;
            snippetsObj[`${name}`] = {
                prefix: name,
                body: body,
                description: s.description || `CerberusX ${name}`
            };
        }
        const json = JSON.stringify(snippetsObj, null, 2);
        // ensure folder exists
        await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(targetUri, '..'));
        await vscode.workspace.fs.writeFile(targetUri, Buffer.from(json, 'utf8'));
    }

    // Register debug configuration provider
    context.subscriptions.push(
        vscode.debug.registerDebugConfigurationProvider(
            'cerberusx',
            new CerberusXDebugConfigurationProvider()
        )
    );

    // Register debug adapter descriptor factory
    context.subscriptions.push(
        vscode.debug.registerDebugAdapterDescriptorFactory(
            'cerberusx',
            new CerberusXDebugAdapterDescriptorFactory()
        )
    );

    output.appendLine('CerberusX debug adapter registered');
}

export function deactivate(): Thenable<void> | undefined {
    if (client) {
        return client.stop();
    }
    return undefined;
}

async function startLanguageServer(context: vscode.ExtensionContext) {
    // Path to server module
    const serverModule = context.asAbsolutePath(path.join('server', 'out', 'server.js'));

    // Check if server exists
    if (!fs.existsSync(serverModule)) {
        throw new Error(`Server module not found at ${serverModule}. Run 'npm run compile:server' to build it.`);
    }

    // Server runs as a separate Node process
    const debugOptions = { execArgv: ['--nolazy', '--inspect=6009'] };

    const serverOptions: ServerOptions = {
        run: { module: serverModule, transport: TransportKind.ipc },
        debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions }
    };

    const clientOptions: LanguageClientOptions = {
        documentSelector: [{ scheme: 'file', language: 'cerberusx' }],
        synchronize: {
            fileEvents: vscode.workspace.createFileSystemWatcher('**/*.cerberusdoc')
        }
    };

    client = new LanguageClient('cerberusxLanguageServer', 'CerberusX Language Server', serverOptions, clientOptions);
    // `client.start()` returns a Promise; push a disposable wrapper so VS Code can dispose the client on shutdown
    client.start();
    context.subscriptions.push({ dispose: () => client?.stop() });
}

// Helper: pick a .cxs file (active editor or workspace quick pick)
async function pickCxsFile(): Promise<string | undefined> {
    const active = vscode.window.activeTextEditor;
    if (active && active.document) {
        const fsPath = active.document.uri.fsPath;
        if (active.document.languageId === 'cerberusx' || fsPath.toLowerCase().endsWith('.cxs')) {
            return fsPath;
        }
    }

    // If no workspace folder, and no active .cxs file, show error
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('No .cxs file is currently open. Please open a .cxs file first.');
        return undefined;
    }

    const files = await vscode.workspace.findFiles('**/*.cxs');
    if (files.length === 0) {
        vscode.window.showErrorMessage('No .cxs files found in workspace. Open a .cxs file first.');
        return undefined;
    }

    const picks = files.map(f => ({ label: vscode.workspace.asRelativePath(f), description: f.fsPath }));
    const sel = await vscode.window.showQuickPick(picks, { placeHolder: 'Select .cxs file to build' });
    return sel?.description;
}

// Run trancc in an integrated terminal using configured templates
async function runTrancc(file: string, platform: string, mode: string, run: boolean) {
    const config = vscode.workspace.getConfiguration('cerberusx');
    const tranccPath = config.get<string>('tranccPath') || 'trancc';
    const template = run ? (config.get<string>('tranccRunArgs') || '') : (config.get<string>('tranccBuildArgs') || '');

    // Check if PathOfCerberusX is configured
    const rootCfg = config.get<string>('PathOfCerberusX') || '';
    if (!rootCfg || rootCfg.length === 0) {
        vscode.window.showErrorMessage('CerberusX: PathOfCerberusX is not configured. Please set it in settings to point to your CerberusX installation folder.');
        return;
    }

    // Resolve target name from mapping (default fallbacks)
    const targetMap = config.get<any>('tranccTargetMap') || {};
    const targetName = targetMap[platform] || platform;

    // Resolve OS-specific executable if configured
    const execMap = config.get<any>('tranccExecutableMap') || {};
    const execForOs = execMap[process.platform];
    let executable = execForOs || tranccPath;

    // Resolve configured CerberusX root and use it as cwd; also make executable absolute if found under that folder
    let resolvedCwd: string | undefined;
    if (path.isAbsolute(rootCfg)) {
        resolvedCwd = rootCfg;
    } else if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
        resolvedCwd = path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, rootCfg);
    }

    // If executable is relative and exists under resolvedCwd/bin, use that absolute path
    let tranccFound = false;
    if (resolvedCwd && !path.isAbsolute(executable)) {
        try {
            // First try bin\ subdirectory (standard CerberusX structure)
            const binCandidate = path.join(resolvedCwd, 'bin', executable);
            if (fs.existsSync(binCandidate)) {
                executable = binCandidate;
                tranccFound = true;
            } else {
                // Fallback to direct path under resolvedCwd
                const candidate = path.join(resolvedCwd, executable);
                if (fs.existsSync(candidate)) {
                    executable = candidate;
                    tranccFound = true;
                }
            }
        } catch (e) { }
    } else if (path.isAbsolute(executable)) {
        // Check if absolute path exists
        tranccFound = fs.existsSync(executable);
    }

    // If trancc still not found, show error
    if (!tranccFound && resolvedCwd) {
        vscode.window.showErrorMessage(`CerberusX: trancc executable not found at ${path.join(resolvedCwd, 'bin', tranccPath)} or ${path.join(resolvedCwd, tranccPath)}. Please verify your PathOfCerberusX setting.`);
        return;
    }

    // Replace placeholders. If template contains ${file}, respect its position; otherwise append the file at the end.
    let args = template.replace(/\$\{platform\}/g, platform).replace(/\$\{mode\}/g, mode).replace(/\$\{target\}/g, targetName);
    const containsFilePlaceholder = /\$\{file\}/.test(args);
    if (containsFilePlaceholder) {
        args = args.replace(/\$\{file\}/g, `"${file}"`);
        // Do not append file again
    } else {
        args = `${args} "${file}"`.trim();
    }
    const cmd = `${executable} ${args}`;

    const outputMode = config.get<string>('tranccOutput') || 'terminal';
    const testing = config.get<boolean>('testing') || false;
    if (testing) {
        // In testing mode, record the constructed command to workspace settings so tests can assert it.
        // Write under the 'cerberusx' section so tests reading `getConfiguration('cerberusx').get('lastCommand')` see it reliably.
        await vscode.workspace.getConfiguration('cerberusx').update('lastCommand', cmd, vscode.ConfigurationTarget.Workspace);
        // Emit debug traces to the extension Output channel and stdout so the test host logs show the write.
        try {
            vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME).appendLine(`[testing] wrote cerberusx.lastCommand = ${cmd}`);
        } catch (e) { /* ignore if output channel unavailable */ }
        try {
            // Console.log appears in the test runner logs
            console.log(`[testing] cerberusx.lastCommand => ${cmd}`);
        } catch (e) { }
        return;
    }
    if (outputMode === 'output') {
        // run in background and stream to OutputChannel
        const outputChannel = vscode.window.createOutputChannel('CerberusX');
        outputChannel.show(true);

        // spawn the process
        const parts = [executable].concat(parseArgs(args));
        const spawnCwd = resolvedCwd || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const proc = cp.spawn(parts[0], parts.slice(1), { cwd: spawnCwd, shell: false });

        proc.stdout.on('data', (chunk: Buffer) => {
            outputChannel.append(chunk.toString());
        });
        proc.stderr.on('data', (chunk: Buffer) => {
            outputChannel.append(chunk.toString());
        });
        proc.on('close', (code) => {
            outputChannel.appendLine(`\ntrancc exited with code ${code}`);
        });
    } else {
        const term = vscode.window.createTerminal({ name: 'CerberusX Build' });
        term.show(true);
        term.sendText(cmd);
    }
}

// Simple arg parser: split a string into argv respecting quoted substrings
function parseArgs(str: string): string[] {
    const re = /("[^"]*"|'[^']*'|[^\s"]+)/g;
    const res: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(str)) !== null) {
        let s = m[0];
        if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
            s = s.slice(1, -1);
        }
        res.push(s);
    }
    return res;
}

