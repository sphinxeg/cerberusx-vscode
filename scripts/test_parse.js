const fs = require('fs');
const path = require('path');
const parser = require('../out/parser');

const file = path.join(__dirname, '..', 'docs', 'SetSwapInterval.cerberusdoc');
const text = fs.readFileSync(file, 'utf8');
console.log('File content (first 400 chars):');
console.log(text.substring(0,400));

const syms = parser.parseCerberusDocSymbols(text, file);
console.log('Parsed symbols:', syms);
