# Contributing to CerberusX VS Code Extension

Thank you for your interest in contributing! Here's how you can help:

## Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/[YOUR-USERNAME]/cerberusx-vscode.git
   cd cerberusx-vscode
   ```

2. **Install dependencies**
   ```bash
   npm install
   cd server && npm install && cd ..
   ```

3. **Build the extension**
   ```bash
   npm run compile
   ```

4. **Run in development mode**
   - Press `F5` in VS Code to launch Extension Development Host
   - Make changes to TypeScript files in `src/`
   - Reload the Extension Development Host to test changes

## Project Structure

```
├── src/                    # Extension source code
│   ├── extension.ts       # Main extension entry point
│   ├── debugAdapter.ts    # Debug adapter implementation
│   ├── parser.ts          # Documentation parser
│   └── sidebar.ts         # Sidebar webview provider
├── server/                # Language server (optional)
├── syntaxes/              # Syntax highlighting grammar
├── snippets/              # Code snippets
├── resources/             # Icons and assets
└── docs/                  # Additional documentation

```

## Making Changes

1. Create a new branch for your feature/fix
2. Make your changes
3. Test thoroughly
4. Commit with clear messages
5. Submit a pull request

## Testing

```bash
npm test
```

## Packaging

```bash
npm run compile
npx vsce package
```

## Code Style

- Follow existing TypeScript conventions
- Use meaningful variable names
- Add comments for complex logic
- Keep functions focused and small

## Reporting Issues

Please use GitHub Issues and include:
- VS Code version
- Extension version
- Operating system
- Steps to reproduce
- Expected vs actual behavior

## Questions?

Feel free to open an issue for discussion!
