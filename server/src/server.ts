import {
    createConnection,
    TextDocuments,
    ProposedFeatures,
    InitializeParams,
    CompletionItem,
    CompletionItemKind,
    Hover,
    MarkupKind,
    Location,
    Position,
    Range,
    TextDocumentSyncKind,
    TextDocumentPositionParams,
    SignatureHelp,
    SignatureInformation,
    SymbolInformation,
    SymbolKind,
    DocumentSymbol,
    Diagnostic,
    DiagnosticSeverity,
    WorkspaceSymbolParams
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { parseCerberusDocSymbols, CerbSymbol } from '../../src/parser';
import * as fs from 'fs';
import * as path from 'path';

// Create a connection for the server.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let workspaceRoot: string | null = null;
let allSymbols: Map<string, CerbSymbol[]> = new Map();

// Initialize
connection.onInitialize((params: InitializeParams) => {
    workspaceRoot = params.rootUri ? urlToPath(params.rootUri) : null;
    return {
        capabilities: {
            textDocumentSync: TextDocumentSyncKind.Full,
            completionProvider: {
                resolveProvider: false
            },
            hoverProvider: true,
            definitionProvider: true,
            signatureHelpProvider: {
                triggerCharacters: ['(', ',']
            },
            documentSymbolProvider: true,
            workspaceSymbolProvider: true
        }
    };
});

// Utility to convert file:/// to path
function urlToPath(uri: string): string {
    if (uri.startsWith('file://')) {
        // handle file:///C:/... windows vs unix
        if (process.platform === 'win32') {
            // file:///C:/path -> C:/path
            return decodeURI(uri.replace('file:///', ''));
        } else {
            return decodeURI(uri.replace('file://', ''));
        }
    }
    return uri;
}

// Scan workspace for .cerberusdoc files and parse them
async function indexWorkspace() {
    if (!workspaceRoot) return;
    allSymbols.clear();
    const files = await walkForFiles(workspaceRoot, '.cerberusdoc');
    for (const f of files) {
        try {
            const content = fs.readFileSync(f, 'utf8');
            const syms = parseCerberusDocSymbols(content, toUri(f));
            for (const s of syms) {
                const arr = allSymbols.get(s.name) || [];
                arr.push(s);
                allSymbols.set(s.name, arr);
            }
            // validate document and publish diagnostics
            validateAndPublishDiagnostics(toUri(f), content);
        } catch (e) {
            connection.console.error(`Failed to read ${f}: ${e}`);
        }
    }
}

// simple recursive walk
async function walkForFiles(dir: string, ext: string): Promise<string[]> {
    const result: string[] = [];
    const stack = [dir];
    while (stack.length) {
        const current = stack.pop()!;
        let entries: string[];
        try {
            entries = fs.readdirSync(current);
        } catch {
            continue;
        }
        for (const e of entries) {
            const full = path.join(current, e);
            let stat;
            try {
                stat = fs.statSync(full);
            } catch {
                continue;
            }
            if (stat.isDirectory()) stack.push(full);
            else if (stat.isFile() && full.endsWith(ext)) result.push(full);
        }
    }
    return result;
}

function toUri(fsPath: string) {
    if (process.platform === 'win32') {
        return 'file:///' + fsPath.replace(/\\/g, '/');
    } else {
        return 'file://' + fsPath;
    }
}

// handle refresh notification
connection.onNotification('cerberusx/refresh', async () => {
    await indexWorkspace();
});

// initial indexing
indexWorkspace().catch(err => connection.console.error('index error ' + err));

// watch documents changes (if a .cerberusdoc is opened/changed)
documents.onDidChangeContent(change => {
    // reindex the single document
    const doc = change.document;
    if (doc.uri.endsWith('.cerberusdoc')) {
        const syms = parseCerberusDocSymbols(doc.getText(), doc.uri);
        // update global map entries for these symbols: remove old occurrences with same uri then add new
        for (const [name, arr] of Array.from(allSymbols.entries())) {
            const filtered = arr.filter(a => a.uri !== doc.uri);
            if (filtered.length) allSymbols.set(name, filtered);
            else allSymbols.delete(name);
        }
        for (const s of syms) {
            const existing = allSymbols.get(s.name) || [];
            existing.push(s);
            allSymbols.set(s.name, existing);
        }
        // validate and publish diagnostics for changed doc
        validateAndPublishDiagnostics(doc.uri, doc.getText());
    }
});

// when a document is opened, publish diagnostics
documents.onDidOpen(e => {
    const doc = e.document;
    if (doc.uri.endsWith('.cerberusdoc')) {
        validateAndPublishDiagnostics(doc.uri, doc.getText());
    }
});

// completion provider
connection.onCompletion((_textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
    const items: CompletionItem[] = [];
    for (const [name, arr] of allSymbols.entries()) {
        // choose first occurrence description/signature if any
        const s = arr[0];
        const item: CompletionItem = {
            label: name,
            kind: CompletionItemKind.Function,
            detail: s.signature || '',
            documentation: s.description || ''
        };
        items.push(item);
    }
    return items;
});

// hover provider
connection.onHover((params) => {
    const word = getWordAtPosition(params.textDocument.uri, params.position);
    if (!word) return null;
    const arr = allSymbols.get(word);
    if (!arr || arr.length === 0) return null;
    const s = arr[0];
    const contents = [];
    if (s.signature) contents.push({ language: 'cerberusx', value: `${s.name}${s.signature}` });
    if (s.description) contents.push({ language: 'text', value: s.description });
    const hover: Hover = {
        contents: {
            kind: MarkupKind.Markdown,
            value: contents.map(c => (typeof c === 'string' ? c : '```' + (c.language || '') + '\n' + c.value + '\n```')).join('\n\n')
        }
    };
    return hover;
});

// definition provider (go to def)
connection.onDefinition((params) => {
    const word = getWordAtPosition(params.textDocument.uri, params.position);
    if (!word) return null;
    const arr = allSymbols.get(word);
    if (!arr || arr.length === 0) return null;
    const s = arr[0];
    if (!s.uri || !s.range) return null;
    // convert char offsets to ranges -- best-effort: open file and compute line/char
    try {
        const fsPath = urlToPath(s.uri);
        const text = fs.readFileSync(fsPath, 'utf8');
        const start = offsetToPosition(text, s.range.start);
        const end = offsetToPosition(text, s.range.end);
        const loc: Location = {
            uri: s.uri,
            range: Range.create(Position.create(start.line, start.character), Position.create(end.line, end.character))
        };
        return loc;
    } catch (e) {
        connection.console.error('definition error: ' + e);
        return null;
    }
});

// signature help provider
connection.onSignatureHelp((params) => {
    // find function name token before '('
    const doc = documents.get(params.textDocument.uri);
    if (!doc) return null;
    const offset = positionToOffset(doc.getText(), params.position);
    // scan backwards for word
    const text = doc.getText().slice(0, offset);
    const m = /([A-Za-z_][A-Za-z0-9_]*)\s*\($/.exec(text);
    if (!m) return null;
    const name = m[1];
    const arr = allSymbols.get(name);
    if (!arr || arr.length === 0) return null;
    const s = arr[0];
    const sig = s.signature || '';
    const sigInfo: SignatureInformation = {
        label: `${name}${sig}`,
        documentation: s.description || ''
    };
    const sigHelp: SignatureHelp = {
        signatures: [sigInfo],
        activeSignature: 0,
        activeParameter: 0
    };
    return sigHelp;
});

// Document symbols provider
connection.onDocumentSymbol((params) => {
    const doc = documents.get(params.textDocument.uri);
    if (!doc) return [];
    const syms = parseCerberusDocSymbols(doc.getText(), doc.uri);
    const docSymbols: DocumentSymbol[] = syms.map(s => {
        const start = offsetToPosition(doc.getText(), s.range ? s.range.start : 0);
        const end = offsetToPosition(doc.getText(), s.range ? s.range.end : doc.getText().length);
        return DocumentSymbol.create(
            s.name,
            s.description || '',
            SymbolKind.Function,
            Range.create(Position.create(start.line, start.character), Position.create(end.line, end.character)),
            Range.create(Position.create(start.line, start.character), Position.create(end.line, end.character))
        );
    });
    return docSymbols;
});

// Workspace symbols provider (simple name query)
connection.onWorkspaceSymbol((params: WorkspaceSymbolParams) => {
    const query = params.query.toLowerCase();
    const results: SymbolInformation[] = [];
    for (const [name, arr] of allSymbols.entries()) {
        if (!query || name.toLowerCase().includes(query)) {
            const s = arr[0];
            if (!s.uri || !s.range) continue;
            try {
                const fsPath = urlToPath(s.uri);
                const text = fs.readFileSync(fsPath, 'utf8');
                const start = offsetToPosition(text, s.range.start);
                const end = offsetToPosition(text, s.range.end);
                const location: Location = {
                    uri: s.uri,
                    range: Range.create(Position.create(start.line, start.character), Position.create(end.line, end.character))
                };
                // Construct SymbolInformation manually to match current API
                const sym: SymbolInformation = {
                    name: name,
                    kind: SymbolKind.Function,
                    location: location
                } as SymbolInformation;
                results.push(sym);
            } catch (e) {
                connection.console.error('workspaceSymbol error: ' + e);
            }
        }
    }
    return results;
});

// helper: find word under position by reading document text
function getWordAtPosition(uri: string, position: Position): string | null {
    const doc = documents.get(uri);
    if (!doc) return null;
    const line = doc.getText({
        start: Position.create(position.line, 0),
        end: Position.create(position.line, Number.MAX_SAFE_INTEGER)
    });
    const before = line.slice(0, position.character);
    const m = /([A-Za-z_][A-Za-z0-9_]*)$/.exec(before);
    return m ? m[1] : null;
}

function offsetToPosition(text: string, offset: number) {
    const lines = text.slice(0, offset).split(/\r?\n/);
    const line = lines.length - 1;
    const character = lines[lines.length - 1].length;
    return { line, character };
}

function positionToOffset(text: string, position: Position) {
    const lines = text.split(/\r?\n/);
    let offset = 0;
    for (let i = 0; i < position.line; i++) offset += lines[i].length + 1;
    offset += position.character;
    return offset;
}

// Validate document for simple usage/structure diagnostics and publish them
function validateAndPublishDiagnostics(uri: string, text: string) {
    const diagnostics: Diagnostic[] = [];

    // Simple checks:
    // - For/Next balance: ensure each For has a corresponding Next/End/End For in same document.
    // - 'Next' without matching 'For'
    // We'll scan code-fenced blocks first (```cerberusx ... ```), otherwise whole file.

    const blocks: { content: string; startOffset: number }[] = [];
    const codeFenceRegex = /```(?:cerberusx)?\s*([\s\S]*?)```/gi;
    let m;
    let foundFence = false;
    while ((m = codeFenceRegex.exec(text)) !== null) {
        foundFence = true;
        blocks.push({ content: m[1], startOffset: m.index });
    }
    if (!foundFence) {
        blocks.push({ content: text, startOffset: 0 });
    }

    for (const b of blocks) {
        const lines = b.content.split(/\r?\n/);
        const stack: { keyword: string; line: number; offset: number }[] = [];
        let offset = b.startOffset;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();
            // Match For (start of loop)
            if (/^For\b/i.test(trimmed)) {
                stack.push({ keyword: 'For', line: i, offset });
            } else if (/^(Next|End\s+For|End)\b/i.test(trimmed)) {
                if (stack.length === 0) {
                    // Next without For -> diagnostic
                    const startPos = offsetToPosition(b.content, offsetOfLineInBlock(b.content, i));
                    const diag: Diagnostic = {
                        severity: DiagnosticSeverity.Warning,
                        range: Range.create(Position.create(startPos.line, 0), Position.create(startPos.line, Math.min(line.length, 200))),
                        message: `Closing '${trimmed.split(/\s+/)[0]}' found without matching 'For'`,
                        source: 'cerberusx'
                    };
                    diagnostics.push(diag);
                } else {
                    // pop a For
                    stack.pop();
                }
            }
            offset += line.length + 1;
        }
        // Any remaining For without Next
        for (const unclosed of stack) {
            const startPos = offsetToPosition(b.content, offsetOfLineInBlock(b.content, unclosed.line));
            const diag: Diagnostic = {
                severity: DiagnosticSeverity.Warning,
                range: Range.create(Position.create(startPos.line, 0), Position.create(startPos.line, 80)),
                message: `Missing closing 'Next' (or 'End' / 'End For') for 'For' started here`,
                source: 'cerberusx'
            };
            diagnostics.push(diag);
        }
    }

    // Publish diagnostics for this document URI
    connection.sendDiagnostics({ uri, diagnostics });
}

// get offset to start of a specific line inside the block content
function offsetOfLineInBlock(block: string, lineNumber: number) {
    const lines = block.split(/\r?\n/);
    let offset = 0;
    for (let i = 0; i < lineNumber; i++) offset += lines[i].length + 1;
    return offset;
}

// documents listen
documents.listen(connection);

// Listen on the connection
connection.listen();