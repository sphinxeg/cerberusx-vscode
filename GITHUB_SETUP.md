# Quick Setup Guide for GitHub

Follow these steps to upload your extension to GitHub:

## 1. Update Repository Information

Edit `package.json` and replace `[YOUR-USERNAME]` with your actual GitHub username in these lines:
- `"url": "https://github.com/[YOUR-USERNAME]/cerberusx-vscode.git"`
- `"homepage": "https://github.com/[YOUR-USERNAME]/cerberusx-vscode#readme"`
- `"bugs": { "url": "https://github.com/[YOUR-USERNAME]/cerberusx-vscode/issues" }`

## 2. Initialize Git Repository

```bash
# Initialize git (if not already done)
git init

# Add all source files
git add .

# Create initial commit
git commit -m "Initial commit: CerberusX VS Code Extension v0.3.1"
```

## 3. Create GitHub Repository

1. Go to https://github.com/new
2. Repository name: `cerberusx-vscode` (or your preferred name)
3. Description: "VS Code extension for CerberusX game development language"
4. Choose Public or Private
5. Do NOT initialize with README (we already have one)
6. Click "Create repository"

## 4. Push to GitHub

```bash
# Add remote (replace [YOUR-USERNAME] with your GitHub username)
git remote add origin https://github.com/[YOUR-USERNAME]/cerberusx-vscode.git

# Push to GitHub
git branch -M main
git push -u origin main
```

## 5. Files Included

The `.gitignore` file ensures these are NOT uploaded:
- ✗ `out/` (compiled files)
- ✗ `node_modules/` (dependencies)
- ✗ `.vscode-test/` (test installations)
- ✗ `*.vsix` (packaged extensions)
- ✓ All source code in `src/`
- ✓ Configuration files
- ✓ Documentation
- ✓ Resources (icons, snippets, etc.)

## 6. After Upload

Users can install your extension by:

```bash
# Clone and build
git clone https://github.com/[YOUR-USERNAME]/cerberusx-vscode.git
cd cerberusx-vscode
npm install
cd server && npm install && cd ..
npm run compile
npx vsce package

# Install
code --install-extension cerberusx-0.3.1.vsix
```

## Optional: Publish to VS Code Marketplace

See: https://code.visualstudio.com/api/working-with-extensions/publishing-extension
