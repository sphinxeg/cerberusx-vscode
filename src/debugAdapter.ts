import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { spawn, ChildProcess } from 'child_process';

export class CerberusXDebugConfigurationProvider implements vscode.DebugConfigurationProvider {

    resolveDebugConfiguration(
        folder: vscode.WorkspaceFolder | undefined,
        config: vscode.DebugConfiguration,
        token?: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.DebugConfiguration> {

        console.log('CerberusX Debug: resolveDebugConfiguration called');
        console.log('Config received:', JSON.stringify(config));
        console.log('Active editor:', vscode.window.activeTextEditor?.document.uri.fsPath);
        console.log('Language:', vscode.window.activeTextEditor?.document.languageId);

        // Helper to find a CerberusX file
        const findCerberusFile = (): vscode.TextEditor | undefined => {
            console.log(`Searching for CerberusX file. Visible editors: ${vscode.window.visibleTextEditors.length}`);

            // First, check active editor
            const active = vscode.window.activeTextEditor;
            if (active) {
                const fileName = active.document.fileName.toLowerCase();
                console.log(`Active editor: ${active.document.uri.fsPath}, language: ${active.document.languageId}`);
                if (active.document.languageId === 'cerberusx' || fileName.endsWith('.cxs') || fileName.endsWith('.monkey')) {
                    console.log('Active editor is a CerberusX file!');
                    return active;
                }
            }

            // If active editor is not a CerberusX file, search all visible editors
            for (const editor of vscode.window.visibleTextEditors) {
                const fileName = editor.document.fileName.toLowerCase();
                console.log(`Checking visible editor: ${editor.document.uri.fsPath}, language: ${editor.document.languageId}`);
                if (editor.document.languageId === 'cerberusx' || fileName.endsWith('.cxs') || fileName.endsWith('.monkey')) {
                    console.log('Found CerberusX file in visible editors:', editor.document.uri.fsPath);
                    return editor;
                }
            }

            console.log('No CerberusX file found in any visible editor');
            return undefined;
        };

        // If launch.json is missing or empty, or program is not set
        if (!config.type || !config.request || !config.program) {
            console.log('No config.program, searching for CerberusX file...');

            const editor = findCerberusFile();
            console.log('Found editor:', !!editor);

            if (editor) {
                config.type = 'cerberusx';
                config.name = config.name || 'Debug CerberusX';
                config.request = 'launch';
                config.program = editor.document.uri.fsPath;
                config.platform = config.platform || 'glfw';
                console.log('Created/fixed config with file:', JSON.stringify(config));
            } else {
                console.log('No CerberusX file found');
                vscode.window.showErrorMessage('Cannot find a CerberusX program to debug. Open a .cxs file.');
                return undefined;
            }
        }

        // Even if program is set, check if it's a valid CerberusX file
        // This handles the case where ${file} resolves to wrong file
        if (config.program) {
            const programLower = config.program.toLowerCase();
            const isCerberusFile = programLower.endsWith('.cxs') || programLower.endsWith('.monkey');

            if (!isCerberusFile) {
                console.log('WARNING: config.program is not a CerberusX file:', config.program);
                console.log('Searching for CerberusX file in visible editors...');

                const editor = findCerberusFile();
                if (editor) {
                    config.program = editor.document.uri.fsPath;
                    console.log('Replaced with:', config.program);
                } else {
                    vscode.window.showErrorMessage(`Cannot debug "${config.program}" - not a CerberusX file. Open a .cxs file.`);
                    return undefined;
                }
            }
        }

        if (!config.platform) {
            config.platform = 'glfw';
        }

        console.log('Final config:', JSON.stringify(config));
        return config;
    }
}

export class CerberusXDebugAdapterDescriptorFactory implements vscode.DebugAdapterDescriptorFactory {

    createDebugAdapterDescriptor(
        session: vscode.DebugSession,
        executable: vscode.DebugAdapterExecutable | undefined
    ): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {

        console.log('CerberusX Debug: createDebugAdapterDescriptor called');
        console.log('Session:', session.id, session.name);

        // Use inline debug adapter
        const adapter = new CerberusXDebugSession();
        console.log('CerberusX Debug: Created debug session');
        return new vscode.DebugAdapterInlineImplementation(adapter);
    }
}

class CerberusXDebugSession implements vscode.DebugAdapter {
    private sendMessageEmitter = new vscode.EventEmitter<vscode.DebugProtocolMessage>();
    readonly onDidSendMessage: vscode.Event<vscode.DebugProtocolMessage> = this.sendMessageEmitter.event;

    private process: ChildProcess | undefined;
    private outputChannel: vscode.OutputChannel;
    private breakpoints = new Map<string, number[]>();
    private currentLine: number = 0;
    private currentFile: string = '';
    private stopped: boolean = false;
    private debugFilePath: string | undefined;
    private launchArgs: any | undefined; // Store launch config until configurationDone
    private isDisposed: boolean = false; // Track if session is disposed

    constructor() {
        console.log('CerberusXDebugSession constructor called!');
        this.outputChannel = vscode.window.createOutputChannel('CerberusX Debug');
        console.log('Output channel created');
        this.outputChannel.show(true);
        console.log('Output channel shown');
        this.outputChannel.appendLine('=== CerberusX Debug Session Created ===');
        this.outputChannel.appendLine(`Time: ${new Date().toLocaleString()}`);
        console.log('Initialization messages written');
        console.log('=== CerberusX Debug Session Created ===');
    }

    // Helper method to safely write to output channel
    private safeLog(message: string): void {
        if (!this.isDisposed) {
            try {
                this.outputChannel.appendLine(message);
            } catch (err) {
                // Channel already closed, just log to console
                console.log(`[Output Channel Closed] ${message}`);
            }
        } else {
            console.log(`[Session Disposed] ${message}`);
        }
    }

    private async injectBreakpoints(filePath: string): Promise<string> {
        // Normalize path to match how breakpoints are stored
        const normalizedPath = filePath.toLowerCase().replace(/\\/g, '/');

        console.log('\n=== Injecting Breakpoints ===');
        console.log(`File (original): ${filePath}`);
        console.log(`File (normalized): ${normalizedPath}`);
        console.log(`Total breakpoint files: ${this.breakpoints.size}`);

        this.outputChannel.appendLine(`\n=== Injecting Breakpoints ===`);
        this.outputChannel.appendLine(`File: ${filePath}`);
        this.outputChannel.appendLine(`Total breakpoint files: ${this.breakpoints.size}`);

        // Log all breakpoints
        for (const [file, lines] of this.breakpoints.entries()) {
            console.log(`  Breakpoints in ${file}: lines [${lines.join(', ')}]`);
            this.outputChannel.appendLine(`  - ${file}: lines [${lines.join(', ')}]`);
        }

        // Read the source file (use original path for file system operations)
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');

        // Get breakpoints for this file using normalized path
        const bps = this.breakpoints.get(normalizedPath) || [];
        console.log(`Breakpoints for this file: [${bps.join(', ')}]`);
        this.outputChannel.appendLine(`Breakpoints for this file: [${bps.join(', ')}]`);

        if (bps.length === 0) {
            console.log(`No breakpoints found - using original file`);
            this.outputChannel.appendLine(`No breakpoints found - using original file`);
            return filePath; // No breakpoints, use original file
        }

        // Sort breakpoints in descending order to inject from bottom to top
        const sortedBps = [...bps].sort((a, b) => b - a);
        console.log(`Injecting DebugStop at lines: [${sortedBps.join(', ')}]`);
        this.outputChannel.appendLine(`Injecting DebugStop at lines: [${sortedBps.join(', ')}]`);

        // Inject DebugStop at each breakpoint line
        for (const lineNum of sortedBps) {
            if (lineNum > 0 && lineNum <= lines.length) {
                // Insert DebugStop before the line (lineNum is 1-based)
                const idx = lineNum - 1;
                const indent = lines[idx].match(/^\s*/)?.[0] || '';
                lines.splice(idx, 0, `${indent}DebugStop ' Breakpoint`);
                console.log(`  Injected at line ${lineNum}: "${indent}DebugStop ' Breakpoint" (before: "${lines[idx + 1]?.trim()}")`);
                this.outputChannel.appendLine(`  Injected at line ${lineNum}: "${indent}DebugStop ' Breakpoint"`);
            }
        }

        // Write modified content to a temp file
        const dir = path.dirname(filePath);
        const base = path.basename(filePath);
        this.debugFilePath = path.join(dir, '.debug_' + base);

        fs.writeFileSync(this.debugFilePath, lines.join('\n'), 'utf8');
        console.log(`Created debug file with breakpoints: ${this.debugFilePath}`);
        this.outputChannel.appendLine(`Created debug file with breakpoints: ${this.debugFilePath}`);
        this.outputChannel.appendLine(`=== Injection Complete ===\n`);

        return this.debugFilePath;
    }

    private checkForDebugStop(output: string): void {
        // CerberusX debug output format when using -run with DebugStop:
        // {{~~<file><line>~~}}
        // +<function>;<file><line>
        const debugStopPattern = /\{\{~~(.+?)<(\d+)>~~\}\}/g; // Added 'g' flag to find all matches

        console.log('Checking for DebugStop in output (length:', output.length, ')');

        // Find the LAST match (most recent DebugStop)
        let lastMatch = null;
        let match;
        while ((match = debugStopPattern.exec(output)) !== null) {
            lastMatch = match;
        }

        if (lastMatch && output.includes('{{~~')) {
            console.log('Found DebugStop marker in output!');
            const file = lastMatch[1];
            const line = parseInt(lastMatch[2], 10);

            // Only trigger if this is a NEW breakpoint (different location or we've continued)
            if (!this.stopped || this.currentFile !== file || this.currentLine !== line) {
                this.stopped = true;
                this.currentFile = file.replace(/\//g, '\\');
                this.currentLine = line;

                console.log(`*** DebugStop hit at ${this.currentFile}:${this.currentLine} ***`);
                this.outputChannel.appendLine(`\n*** DebugStop hit at ${this.currentFile}:${this.currentLine} ***\n`);

                // Send stopped event to VS Code
                this.sendEvent('stopped', {
                    reason: 'breakpoint',
                    threadId: 1,
                    allThreadsStopped: true
                });
            }
        }
    }

    handleMessage(message: vscode.DebugProtocolMessage): void {
        const msg = message as any;
        console.log(`\n>>> DAP Message Received: ${msg.command}`);
        this.outputChannel.appendLine(`\n>>> Received: ${msg.command}`);
        this.outputChannel.appendLine(`    Full message: ${JSON.stringify(message)}`);

        switch (msg.command) {
            case 'initialize':
                this.sendResponse(msg, {
                    supportsConfigurationDoneRequest: true,
                    supportsTerminateRequest: true,
                    supportsBreakpointLocationsRequest: true,
                    supportsSetBreakpointsRequest: true,
                    supportsStepInTargetsRequest: false,
                    supportsStepBack: false,
                    supportsRestartFrame: false,
                    supportsGotoTargetsRequest: false,
                    supportsCompletionsRequest: false,
                    supportsModulesRequest: false,
                    supportsRestartRequest: false,
                    supportsExceptionOptions: false,
                    supportsValueFormattingOptions: false,
                    supportsExceptionInfoRequest: false,
                    supportTerminateDebuggee: true,
                    supportSuspendDebuggee: false,
                    supportsDelayedStackTraceLoading: false,
                    supportsLoadedSourcesRequest: false,
                    supportsLogPoints: false,
                    supportsTerminateThreadsRequest: false,
                    supportsSetExpression: false,
                    supportsDataBreakpoints: false,
                    supportsReadMemoryRequest: false,
                    supportsWriteMemoryRequest: false,
                    supportsDisassembleRequest: false,
                    supportsCancelRequest: false,
                    supportsClipboardContext: false,
                    supportsSteppingGranularity: false,
                    supportsInstructionBreakpoints: false,
                    supportsExceptionFilterOptions: false
                });
                this.sendEvent('initialized', {});
                break;

            case 'setBreakpoints':
                this.setBreakpoints(msg);
                break;

            case 'launch':
                console.log('=== LAUNCH CASE TRIGGERED ===');
                // Store launch args but don't start building yet
                // Wait for configurationDone which comes after setBreakpoints
                this.launchArgs = msg;
                this.sendResponse(msg, {});
                console.log('Launch config stored, waiting for configurationDone...');
                break;

            case 'continue':
                this.continue(msg);
                break;

            case 'next':
                this.next(msg);
                break;

            case 'stepIn':
                this.stepIn(msg);
                break;

            case 'stepOut':
                this.stepOut(msg);
                break;

            case 'threads':
                this.threads(msg);
                break;

            case 'stackTrace':
                this.stackTrace(msg);
                break;

            case 'scopes':
                this.scopes(msg);
                break;

            case 'variables':
                this.variables(msg);
                break;

            case 'disconnect':
                this.disconnect(msg);
                break;

            case 'configurationDone':
                this.sendResponse(msg, {});
                // Now that configuration is done (including setBreakpoints), start the actual build
                if (this.launchArgs) {
                    console.log('Configuration done, starting build with breakpoints...');
                    this.launch(this.launchArgs).catch(err => {
                        console.log(`Launch error: ${err}`);
                        this.outputChannel.appendLine(`Launch error: ${err}`);
                        vscode.window.showErrorMessage(`Debug launch failed: ${err.message || err}`);
                        this.sendEvent('terminated', {});
                    });
                }
                break;

            default:
                this.sendResponse(msg, {});
                break;
        }
    }

    private setBreakpoints(message: any): void {
        const args = message.arguments;
        const filePath = args.source.path;
        const lines = args.breakpoints?.map((bp: any) => bp.line) || [];

        // Normalize path to lowercase and use forward slashes for consistency
        const normalizedPath = filePath.toLowerCase().replace(/\\/g, '/');

        console.log(`\n=== Set Breakpoints ===`);
        console.log(`File (original): ${filePath}`);
        console.log(`File (normalized): ${normalizedPath}`);
        console.log(`Lines: [${lines.join(', ')}]`);

        this.breakpoints.set(normalizedPath, lines);
        this.outputChannel.appendLine(`Set breakpoints in ${path}: ${lines.join(', ')}`);

        const breakpoints = lines.map((line: number) => ({
            verified: true,
            line: line
        }));

        this.sendResponse(message, { breakpoints });
    }

    private threads(message: any): void {
        this.sendResponse(message, {
            threads: [
                { id: 1, name: 'Main Thread' }
            ]
        });
    }

    private stackTrace(message: any): void {
        this.sendResponse(message, {
            stackFrames: [
                {
                    id: 1,
                    name: 'main',
                    source: {
                        path: this.currentFile
                    },
                    line: this.currentLine,
                    column: 0
                }
            ],
            totalFrames: 1
        });
    }

    private scopes(message: any): void {
        this.sendResponse(message, {
            scopes: [
                {
                    name: 'Local',
                    variablesReference: 1,
                    expensive: false
                }
            ]
        });
    }

    private variables(message: any): void {
        this.sendResponse(message, {
            variables: []
        });
    }

    private continue(message: any): void {
        this.outputChannel.appendLine('Continue execution');
        console.log('Sending "c" to continue from DebugStop');
        this.stopped = false;
        this.sendResponse(message, { allThreadsContinued: true });
        // CerberusX DebugStop: 'c' = continue
        if (this.process?.stdin) {
            this.process.stdin.write('c\n');
        }
    }

    private next(message: any): void {
        this.outputChannel.appendLine('Step over (next)');
        console.log('Sending "n" for step over');
        this.stopped = false;
        this.sendResponse(message, {});
        // CerberusX DebugStop: 'n' = next (step over)
        if (this.process?.stdin) {
            this.process.stdin.write('n\n');
        }
    }

    private stepIn(message: any): void {
        this.outputChannel.appendLine('Step in');
        console.log('Sending "s" for step in');
        this.stopped = false;
        this.sendResponse(message, {});
        // CerberusX DebugStop: 's' = step in
        if (this.process?.stdin) {
            this.process.stdin.write('s\n');
        }
    }

    private stepOut(message: any): void {
        this.outputChannel.appendLine('Step out');
        console.log('Sending "o" for step out');
        this.stopped = false;
        this.sendResponse(message, {});
        // CerberusX DebugStop: 'o' = step out
        if (this.process?.stdin) {
            this.process.stdin.write('o\n');
        }
    }

    private async launch(message: any): Promise<void> {
        const args = message.arguments;
        const program = args.program;
        const mode = 'debug'; // Always use debug mode for debugging
        const platform = args.platform || 'html5';

        // Reset state for new debug session
        this.stopped = false;
        this.debugFilePath = undefined;
        this.currentLine = 0;
        this.currentFile = '';

        console.log(`\n=== Launch Debug Session ===`);
        console.log(`Program: ${program}`);
        console.log(`Mode: ${mode}, Platform: ${platform}`);

        this.outputChannel.appendLine(`Launching: ${program}`);
        this.outputChannel.appendLine(`Mode: ${mode}, Platform: ${platform}`);

        try {
            // Resolve program path
            let programPath = program;
            if (programPath.includes('${workspaceFolder}')) {
                programPath = programPath.replace('${workspaceFolder}', vscode.workspace.workspaceFolders?.[0].uri.fsPath || '');
            }
            if (programPath.includes('${file}')) {
                programPath = programPath.replace('${file}', vscode.window.activeTextEditor?.document.uri.fsPath || '');
            }

            this.currentFile = programPath;
            console.log(`Resolved program path: ${programPath}`);

            // Clean up any old debug file from previous session
            const dir = path.dirname(programPath);
            const base = path.basename(programPath);
            const oldDebugFile = path.join(dir, '.debug_' + base);
            if (fs.existsSync(oldDebugFile)) {
                try {
                    fs.unlinkSync(oldDebugFile);
                    console.log(`Cleaned up old debug file: ${oldDebugFile}`);
                } catch (err) {
                    console.log(`Could not delete old debug file: ${err}`);
                }
            }

            console.log(`Breakpoints Map state before injection:`);
            for (const [file, lines] of this.breakpoints.entries()) {
                console.log(`  ${file} -> [${lines.join(', ')}]`);
            }
            this.outputChannel.appendLine(`Resolved program path: ${programPath}`);

            // Inject DebugStop at breakpoint locations
            const buildFile = await this.injectBreakpoints(programPath);
            console.log(`Build file after injection: ${buildFile}`);

            // Get CerberusX configuration
            const config = vscode.workspace.getConfiguration('cerberusx');
            const rootCfg = config.get<string>('PathOfCerberusX') || '';

            if (!rootCfg) {
                vscode.window.showErrorMessage('PathOfCerberusX not configured');
                this.sendResponse(message, { success: false });
                return;
            }

            let resolvedRoot: string;
            if (path.isAbsolute(rootCfg)) {
                resolvedRoot = rootCfg;
            } else if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
                resolvedRoot = path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, rootCfg);
            } else {
                vscode.window.showErrorMessage('Cannot resolve PathOfCerberusX');
                this.sendResponse(message, { success: false });
                return;
            }

            // Determine OS-specific trancc executable
            let tranccExe: string;
            if (process.platform === 'win32') {
                tranccExe = 'transcc_winnt.exe';
            } else if (process.platform === 'darwin') {
                tranccExe = 'transcc_macos';
            } else {
                tranccExe = 'transcc_linux';
            }

            this.safeLog(`[Debug Adapter] Detected OS: ${process.platform}`);
            this.safeLog(`[Debug Adapter] Using trancc executable: ${tranccExe}`);

            // Build with trancc
            const tranccPath = path.join(resolvedRoot, 'bin', tranccExe);

            if (!fs.existsSync(tranccPath)) {
                vscode.window.showErrorMessage(`transcc not found: ${tranccPath}`);
                this.sendResponse(message, { success: false });
                return;
            }

            this.outputChannel.appendLine(`Building with transcc: ${tranccPath}`);
            this.outputChannel.appendLine(`Program: ${buildFile}`);
            this.outputChannel.appendLine(`Platform: ${platform}`);
            this.outputChannel.appendLine(`Mode: ${mode}`);

            // Map platform names to CerberusX target names
            // Use configuration if available
            const targetMap = config.get<any>('tranccTargetMap') || {
                'glfw': 'Desktop_Game',
                'html5': 'Html5_Game',
                'android': 'Android_Game',
                'ios': 'iOS_Game',
                'cpptool': 'C++_Tool'
            };
            const target = targetMap[platform] || platform;
            console.log(`Target mapping: ${platform} -> ${target}`);
            this.outputChannel.appendLine(`Target: ${target}`);

            // Build and run the program with -run flag (required for DebugStop to work)
            const buildArgs = ['-run', '-target=' + target, '-config=' + mode, buildFile];
            const buildCommand = `${tranccPath} ${buildArgs.join(' ')}`;
            console.log(`Build command: ${buildCommand}`);
            this.outputChannel.appendLine(`Command: ${tranccPath} ${buildArgs.join(' ')}`);

            this.process = spawn(tranccPath, buildArgs, {
                cwd: path.dirname(programPath)
            });

            let outputBuffer = '';

            this.process.stdout?.on('data', (data) => {
                const text = data.toString();
                this.safeLog(text);
                this.sendEvent('output', {
                    category: 'stdout',
                    output: text
                });

                // Monitor for DebugStop output
                outputBuffer += text;
                this.checkForDebugStop(outputBuffer);
            });

            this.process.stderr?.on('data', (data) => {
                const text = data.toString();
                this.safeLog(`ERROR: ${text}`);
                this.sendEvent('output', {
                    category: 'stderr',
                    output: text
                });

                // DebugStop output comes from stderr when using -run flag
                outputBuffer += text;
                this.checkForDebugStop(outputBuffer);
            });

            this.process.on('close', (code) => {
                this.safeLog(`Process finished with code ${code}`);
                console.log(`Process exited with code ${code}`);

                // Clean up debug file if it was created
                if (this.debugFilePath && fs.existsSync(this.debugFilePath)) {
                    try {
                        fs.unlinkSync(this.debugFilePath);
                        this.safeLog(`Cleaned up debug file: ${this.debugFilePath}`);
                        console.log(`Cleaned up: ${this.debugFilePath}`);
                    } catch (err) {
                        this.safeLog(`Failed to delete debug file: ${err}`);
                        console.log(`Cleanup failed: ${err}`);
                    }
                }

                // With -run flag, transcc builds and runs automatically
                // No need to call runApplication separately
                this.sendEvent('terminated', {});
            });

            this.sendResponse(message, { success: true });

        } catch (error: any) {
            const errorMsg = error.message || String(error);
            this.outputChannel.appendLine(`Launch error: ${errorMsg}`);
            this.outputChannel.appendLine(`Stack: ${error.stack || 'No stack trace'}`);
            vscode.window.showErrorMessage(`Failed to launch debugger: ${errorMsg}`);
            this.sendResponse(message, { success: false });
            this.sendEvent('terminated', {});
        }
    }

    private runApplication(programPath: string, platform: string): void {
        console.log('\n=== Running Application ===');
        console.log(`Program: ${programPath}`);
        console.log(`Platform: ${platform}`);

        this.outputChannel.appendLine(`\n=== Running Application ===`);
        this.outputChannel.appendLine(`Program: ${programPath}`);
        this.outputChannel.appendLine(`Platform: ${platform}`);

        // Get the build output directory
        const programDir = path.dirname(programPath);
        const programName = path.basename(programPath, '.cxs');
        console.log(`Program dir: ${programDir}`);
        console.log(`Program name: ${programName}`);
        this.outputChannel.appendLine(`Program dir: ${programDir}`);
        this.outputChannel.appendLine(`Program name: ${programName}`);

        let appPath: string;
        let outputBuffer = '';

        switch (platform) {
            case 'html5':
                // Open in browser
                const htmlPath = path.join(programDir, programName + '.build', 'html5', 'MonkeyGame.html');
                console.log(`HTML path: ${htmlPath}, exists: ${fs.existsSync(htmlPath)}`);
                this.outputChannel.appendLine(`HTML path: ${htmlPath}`);
                this.outputChannel.appendLine(`HTML exists: ${fs.existsSync(htmlPath)}`);
                if (fs.existsSync(htmlPath)) {
                    this.outputChannel.appendLine(`Opening HTML in browser: ${htmlPath}`);
                    vscode.env.openExternal(vscode.Uri.file(htmlPath));
                }
                break;

            case 'cpptool':
            case 'glfw':
                // Desktop executable - platform specific
                let possiblePaths: string[] = [];

                if (process.platform === 'win32') {
                    // Windows paths
                    possiblePaths = [
                        path.join(programDir, programName + '.build', 'glfw', 'windows', programName + '.exe'),
                        path.join(programDir, programName + '.buildv2024-08-06', 'glfw3', 'gcc_winnt', 'Debug64', 'CerberusGame.exe'),
                        path.join(programDir, '.debug_' + programName + '.buildv2024-08-06', 'glfw3', 'gcc_winnt', 'Debug64', 'CerberusGame.exe')
                    ];
                } else if (process.platform === 'darwin') {
                    // macOS paths - look for .app bundle or unix executable
                    possiblePaths = [
                        path.join(programDir, programName + '.build', 'glfw', 'macos', programName + '.app', 'Contents', 'MacOS', programName),
                        path.join(programDir, programName + '.buildv2024-08-06', 'glfw3', 'clang_macos', 'Debug', 'CerberusGame.app', 'Contents', 'MacOS', 'CerberusGame'),
                        path.join(programDir, '.debug_' + programName + '.buildv2024-08-06', 'glfw3', 'clang_macos', 'Debug', 'CerberusGame.app', 'Contents', 'MacOS', 'CerberusGame'),
                        path.join(programDir, programName + '.build', 'glfw', 'macos', programName),
                        path.join(programDir, '.debug_' + programName + '.build', 'glfw', 'macos', programName)
                    ];
                } else {
                    // Linux paths
                    possiblePaths = [
                        path.join(programDir, programName + '.build', 'glfw', 'linux', programName),
                        path.join(programDir, programName + '.buildv2024-08-06', 'glfw3', 'gcc_linux', 'Debug', 'CerberusGame'),
                        path.join(programDir, '.debug_' + programName + '.buildv2024-08-06', 'glfw3', 'gcc_linux', 'Debug', 'CerberusGame'),
                        path.join(programDir, '.debug_' + programName + '.build', 'glfw', 'linux', programName)
                    ];
                }

                appPath = '';
                for (const tryPath of possiblePaths) {
                    console.log(`Checking path: ${tryPath}, exists: ${fs.existsSync(tryPath)}`);
                    if (fs.existsSync(tryPath)) {
                        appPath = tryPath;
                        console.log(`Found executable at: ${appPath}`);
                        break;
                    }
                }

                console.log(`Final executable path: ${appPath}, exists: ${fs.existsSync(appPath)}`);
                this.outputChannel.appendLine(`Executable path: ${appPath}`);
                this.outputChannel.appendLine(`EXE exists: ${fs.existsSync(appPath)}`);
                if (fs.existsSync(appPath)) {
                    console.log(`Launching application: ${appPath}`);
                    this.outputChannel.appendLine(`Executing: ${appPath}`);
                    this.process = spawn(appPath, [], {
                        cwd: path.dirname(appPath)
                    });

                    console.log('Application process started, monitoring stdout/stderr...');

                    // Monitor application output for DebugStop
                    this.process.stdout?.on('data', (data) => {
                        const text = data.toString();
                        console.log('APP STDOUT:', text);
                        this.outputChannel.appendLine(text);
                        this.sendEvent('output', {
                            category: 'stdout',
                            output: text
                        });

                        outputBuffer += text;
                        this.checkForDebugStop(outputBuffer);
                    });

                    this.process.stderr?.on('data', (data) => {
                        const text = data.toString();
                        console.log('APP STDERR:', text);
                        this.outputChannel.appendLine(`ERROR: ${text}`);
                        this.sendEvent('output', {
                            category: 'stderr',
                            output: text
                        });
                    });

                    this.process.on('close', (code) => {
                        console.log(`Application exited with code ${code}`);
                    });
                }
                break;

            default:
                this.outputChannel.appendLine(`Running platform ${platform} not yet implemented`);
                break;
        }
    }

    private disconnect(message: any): void {
        this.isDisposed = true; // Mark session as disposed
        if (this.process) {
            this.process.kill();
        }
        this.sendResponse(message, {});
        this.sendEvent('terminated', {});
    }

    private sendResponse(message: any, body: any): void {
        const response = {
            type: 'response',
            request_seq: message.seq,
            success: body.success !== false,
            command: message.command,
            body: body
        };
        this.sendMessageEmitter.fire(response);
    }

    private sendEvent(event: string, body: any): void {
        const message = {
            type: 'event',
            event: event,
            body: body
        };
        this.sendMessageEmitter.fire(message);
    }

    dispose(): void {
        this.isDisposed = true; // Mark session as disposed
        if (this.process) {
            this.process.kill();
            this.process = undefined;
        }
        try {
            this.outputChannel.dispose();
        } catch (err) {
            console.log('Error disposing output channel:', err);
        }
        this.sendMessageEmitter.dispose();
    }
}
