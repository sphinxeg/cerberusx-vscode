"use strict";
// Shared parser used by extension and language server.
// It extracts commands/keywords and, when possible, signatures and descriptions
// from .cerberusdoc files. Supports:
//  - YAML front-matter blocks (--- ... ---) with keys: name, signature, description
//  - Code fences: ```cerberusx ... ``` lines like "command foo(arg1,arg2) - description"
//  - Inline lines like: command: foo(arg) - description
//
// Returns symbols with { name, signature, description, rangeStart, rangeEnd }
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseCerberusDocSymbols = exports.TokenExtractor = void 0;
class TokenExtractor {
    constructor(regexSource) {
        this.regexSource = regexSource && regexSource.length > 0 ? regexSource : '\\b[A-Za-z_][A-Za-z0-9_]{2,}\\b';
        this.regex = new RegExp(this.regexSource, 'g');
    }
    updateRegex(newSource) {
        if (!newSource || newSource.length === 0) {
            newSource = '\\b[A-Za-z_][A-Za-z0-9_]{2,}\\b';
        }
        this.regexSource = newSource;
        try {
            this.regex = new RegExp(this.regexSource, 'g');
        }
        catch (e) {
            console.error('Invalid token extraction regex, keeping previous:', e);
        }
    }
    extractFromText(text) {
        const results = new Set();
        // Prefer code fences with cerberusx hint
        const codeFenceRegex = /```(?:cerberusx)?\s*([\s\S]*?)```/gi;
        let m;
        let foundFence = false;
        while ((m = codeFenceRegex.exec(text)) !== null) {
            foundFence = true;
            const block = m[1];
            this.collectFromString(block, results);
        }
        if (!foundFence) {
            this.collectFromString(text, results);
        }
        return Array.from(results);
    }
    collectFromString(s, set) {
        let m;
        while ((m = this.regex.exec(s)) !== null) {
            const token = m[0];
            if (/^[0-9]+$/.test(token))
                continue;
            set.add(token);
        }
    }
}
exports.TokenExtractor = TokenExtractor;
function parseCerberusDocSymbols(text, uri) {
    const symbols = [];
    const seenNames = new Set(); // Prevent duplicates
    // Debug: show first 200 chars of text
    console.log(`[Parser] Processing text (first 200 chars): ${text.substring(0, 200).replace(/\n/g, '\\n')}`);
    // Parse multiple formats:
    // Format 1: "Language: \n> Keyword Name" (workspace docs)
    // Format 2: "> Keyword Name" (CerberusX installation keyword docs)
    // Format 3: "# Function Name:ReturnType(...)" (module docs - markdown headers)
    // Try Format 3 first: Markdown module docs with # Function/Method/Class etc.
    const markdownPattern = /^#+\s*(Function|Method|Class|Interface|Property|Const|Global|Field)\s+([A-Za-z_][A-Za-z0-9_]*)\s*([:\(].*?)$/gim;
    let mdMatch;
    while ((mdMatch = markdownPattern.exec(text)) !== null) {
        const keywordType = mdMatch[1];
        const name = mdMatch[2];
        const signature = mdMatch[3] ? (name + mdMatch[3]) : undefined;
        if (seenNames.has(name.toLowerCase()))
            continue;
        console.log(`[Parser] MATCHED Format 3 (Markdown)! Type: ${keywordType}, Name: ${name}`);
        // Extract description (text after the header until next header or blank lines)
        const startIdx = mdMatch.index + mdMatch[0].length;
        const remainingText = text.substring(startIdx);
        const descMatch = /^\s*\n((?:(?!^#)[\s\S])*?)(?:\n\n|^#|$)/m.exec(remainingText);
        const description = descMatch ? descMatch[1].trim().split('\n').slice(0, 3).join('\n') : undefined;
        symbols.push({
            name,
            signature,
            description: description ? `**${keywordType}**\n\n${description}` : `**${keywordType}**`,
            uri
        });
        seenNames.add(name.toLowerCase());
    }
    // If we found markdown symbols, return them
    if (symbols.length > 0) {
        console.log(`[Parser] Returning ${symbols.length} markdown symbols`);
        return symbols;
    }
    // Try Format 1 & 2: CerberusX keyword docs
    let langKeywordMatch = /Language:\s*[\r\n]+\s*>\s*(\w+)\s+([A-Za-z_][A-Za-z0-9_]*)/i.exec(text);
    let keywordType;
    let name;
    if (langKeywordMatch) {
        console.log(`[Parser] MATCHED Format 1! Type: ${langKeywordMatch[1]}, Name: ${langKeywordMatch[2]}`);
        keywordType = langKeywordMatch[1];
        name = langKeywordMatch[2];
    }
    else {
        // Try Format 2: direct "> Keyword Name" at start of file
        const directMatch = /^\s*>\s*(\w+)\s+([A-Za-z_][A-Za-z0-9_]*)/i.exec(text);
        if (directMatch) {
            console.log(`[Parser] MATCHED Format 2! Type: ${directMatch[1]}, Name: ${directMatch[2]}`);
            keywordType = directMatch[1];
            name = directMatch[2];
        }
        else {
            console.log(`[Parser] No format match found`);
            keywordType = '';
            name = '';
        }
    }
    if (name) {
        // Extract syntax section
        let signature;
        const syntaxMatch = />>\s*Syntax\s*([\s\S]*?)(?:>>|$)/i.exec(text);
        if (syntaxMatch) {
            // Clean up syntax, remove markdown formatting
            const syntaxLines = syntaxMatch[1]
                .trim()
                .replace(/\*([^*]+)\*/g, '$1') // Remove italic markers
                .replace(/~n/g, '\n')
                .split('\n')
                .filter(line => line.trim().length > 0);
            // Take the first non-empty line
            if (syntaxLines.length > 0) {
                signature = syntaxLines[0].trim();
            }
        }
        // Extract description section
        let description;
        const descMatch = />>\s*Description\s*([\s\S]*?)(?:>>|$)/i.exec(text);
        if (descMatch) {
            description = descMatch[1]
                .trim()
                .replace(/\*\*([^*]+)\*\*/g, '**$1**') // Keep bold
                .replace(/\*([^*]+)\*/g, '*$1*') // Keep italic
                .split('\n')
                .filter(line => line.trim().length > 0)
                .slice(0, 3) // First 3 lines
                .join('\n')
                .trim();
        }
        symbols.push({
            name,
            signature: signature ? `${signature}` : undefined,
            description: description ? `**${keywordType}**\n\n${description}` : `**${keywordType}**`,
            uri
        });
        seenNames.add(name.toLowerCase());
        // Return early to avoid parsing other formats
        return symbols;
    }
    // 1) YAML front-matter blocks: ---\n...key: value\n---\n
    const yamlFence = /---\s*([\s\S]*?)\s*---/g;
    let ym;
    while ((ym = yamlFence.exec(text)) !== null) {
        const block = ym[1];
        const nameMatch = /name\s*:\s*(.+)/i.exec(block);
        if (nameMatch) {
            const name = nameMatch[1].trim();
            if (seenNames.has(name.toLowerCase()))
                continue;
            const signatureMatch = /signature\s*:\s*(.+)/i.exec(block);
            const descMatch = /description\s*:\s*([\s\S]+)/i.exec(block);
            const sig = signatureMatch ? signatureMatch[1].trim() : undefined;
            const desc = descMatch ? descMatch[1].trim() : undefined;
            symbols.push({ name, signature: sig, description: desc, uri, range: { start: ym.index, end: yamlFence.lastIndex } });
            seenNames.add(name.toLowerCase());
        }
    }
    // 2) Code-fenced blocks with cerberusx hint. Each line may contain "command foo(arg) - desc"
    const codeFenceRegex = /```(?:cerberusx)?\s*([\s\S]*?)```/gi;
    let cf;
    while ((cf = codeFenceRegex.exec(text)) !== null) {
        const block = cf[1];
        const lines = block.split(/\r?\n/);
        let offset = cf.index;
        for (const line of lines) {
            const trimmed = line.trim();
            const parsed = parseCommandLine(trimmed);
            if (parsed) {
                if (seenNames.has(parsed.name.toLowerCase()))
                    continue;
                const start = text.indexOf(line, offset);
                const end = start + line.length;
                symbols.push({ name: parsed.name, signature: parsed.signature, description: parsed.description, uri, range: { start, end } });
                seenNames.add(parsed.name.toLowerCase());
            }
            offset += line.length + 1;
        }
    }
    // 3) Inline 'command: name(signature) - description' or 'name(signature) - description'
    const lineRegex = /^(?:command\s*:\s*)?([A-Za-z_][A-Za-z0-9_]*)\s*(\([^\)]*\))?\s*(?:-|\:)\s*(.+)$/gim;
    let lm;
    while ((lm = lineRegex.exec(text)) !== null) {
        const name = lm[1];
        if (seenNames.has(name.toLowerCase()))
            continue;
        const signature = lm[2] ? lm[2].trim() : undefined;
        const desc = lm[3] ? lm[3].trim() : undefined;
        symbols.push({ name, signature, description: desc, uri, range: { start: lm.index, end: lineRegex.lastIndex } });
        seenNames.add(name.toLowerCase());
    }
    // Skip fallback token extraction - it creates too many duplicates without useful info
    return symbols;
}
exports.parseCerberusDocSymbols = parseCerberusDocSymbols;
function parseCommandLine(line) {
    // possible formats:
    // foo(arg1, arg2) - description
    // command foo(arg) : description
    // foo - description
    const m = /^([A-Za-z_][A-Za-z0-9_]*)(\s*\([^\)]*\))?\s*(?:-|\:)?\s*(.*)$/.exec(line);
    if (!m)
        return null;
    const name = m[1];
    const signature = m[2] ? m[2].trim() : undefined;
    const description = m[3] ? m[3].trim() : undefined;
    return { name, signature, description };
}
//# sourceMappingURL=parser.js.map