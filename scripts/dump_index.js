const fs = require('fs');
const path = require('path');
const parser = require('../out/parser');

function findFiles(dir, ext) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) results.push(...findFiles(full, ext));
    else if (e.isFile() && e.name.endsWith(ext)) results.push(full);
  }
  return results;
}

const files = findFiles(path.join(__dirname, '..'), '.cerberusdoc');
console.log('Found files:', files);
const tokens = new Set();
const symbolsMap = new Map();
for (const f of files) {
  const content = fs.readFileSync(f,'utf8');
  const extracted = new parser.TokenExtractor().extractFromText(content);
  extracted.forEach(t => tokens.add(t));
  const syms = parser.parseCerberusDocSymbols(content, f);
  syms.forEach(s => {
    const key = s.name.toLowerCase();
    if (!symbolsMap.has(key)) symbolsMap.set(key, []);
    symbolsMap.get(key).push(s);
  });
}
console.log('Tokens include SetSwapInterval?', tokens.has('SetSwapInterval'));
console.log('SymbolsMap has setswapinterval?', symbolsMap.has('setswapinterval'));
if (symbolsMap.has('setswapinterval')) console.log(symbolsMap.get('setswapinterval'));
