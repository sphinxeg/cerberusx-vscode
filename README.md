```markdown
# CerberusX Extension for VS Code

A comprehensive VS Code extension providing full language support for CerberusX programming language, including syntax highlighting, IntelliSense, code snippets, integrated build tools, and **debugging capabilities**.

## Features

### 🐛 Debugging Support
- **Breakpoint debugging** - Click in the gutter to set breakpoints in your `.cxs` files
- **Step-by-step execution** - Step through code with F10 (step over), F11 (step in), Shift+F11 (step out)
- **DebugStop integration** - Automatically injects CerberusX `DebugStop` keywords at breakpoint locations
- **Stack traces** - View current execution location when stopped at breakpoints
- **Debug console** - Monitor application output during debugging
- Supports multiple platforms: glfw (desktop), html5 (browser)
- Press F5 to start debugging current file

### 🎨 Syntax Highlighting
- Full syntax highlighting for `.cxs` (CerberusX source) and `.cerberusdoc` (documentation) files
- Case-insensitive keyword recognition
- Support for comments (rem, ', #rem...#end), strings, numbers, and operators
- Highlighting for control flow, data types, and class definitions

### 💡 IntelliSense & Code Completion
- Smart autocomplete for CerberusX keywords and functions
- **Hover documentation** - Place cursor over any keyword to see signature and description
- **F1 documentation** - Press Ctrl+F1 (Cmd+F1 on Mac) to open HTML documentation for symbol under cursor
- Automatically scans workspace `.cerberusdoc` files
- Indexes `PathOfCerberusX/docs/` folder and all subfolders for comprehensive API documentation
- Scans `PathOfCerberusX/modules/` for third-party module documentation
- Real-time keyword extraction from documentation files
- Command: **CerberusX: Refresh Keywords** to manually reload IntelliSense database

### 📝 Built-in Code Snippets
Over 69 ready-to-use code snippets including:

**Basic Structures:**
- `class` - Class definition
- `method`, `function` - Method/function declarations
- `field`, `global`, `local`, `const` - Variable declarations
- `array`, `list`, `stack`, `map` - Data structure declarations

**Control Flow:**
- `if`, `ifelse` - Conditionals
- `for`, `foreach`, `while`, `repeat` - Loops
- `select` - Select-case statements
- `try` - Try-catch error handling

**Mojo Game Framework:**
- `mojoapp` - Complete Mojo application template
- `oncreate`, `onupdate`, `onrender` - Mojo lifecycle methods
- `drawtext`, `drawrect`, `drawcircle`, `drawline`, `drawimage` - Drawing functions
- `loadimage`, `loadsound`, `playsound` - Asset loading
- `setcolor`, `setalpha`, `cls` - Graphics settings

**Input Handling:**
- `keydown`, `keyhit` - Keyboard input
- `touchdown`, `mouse` - Touch/mouse input

**Game Development:**
- `gameloop` - Game loop structure
- `collision` - AABB collision detection
- `distance` - Distance calculation between points
- `setupdaterate`, `millisecs`, `rnd` - Game utilities

**Advanced:**
- `interface`, `property`, `abstract` - OOP features
- `module`, `extern` - Module and external function declarations
- `jsonparse`, `httprequest` - JSON and HTTP support

### 🔨 Build & Run Integration
- **Sidebar panel** with Build and Build & Run buttons
- Platform selection (html5, desktop, android, ios)
- Mode selection (debug, release)
- Integrated with CerberusX `trancc` compiler
- Automatic path resolution for `PathOfCerberusX/bin/trancc`
- Validation checks with user-friendly error notifications

### ⚙️ Configuration Options

**Essential Settings:**
- `cerberusx.PathOfCerberusX` (string) - **Required**. Path to CerberusX installation root folder (absolute or workspace-relative)
- `cerberusx.tranccPath` (string) - Path to trancc executable (default: `trancc`). Automatically resolved from `PathOfCerberusX/bin/`

**Build Configuration:**
- `cerberusx.tranccBuildArgs` (string) - Build command template. Default: `-build -config=${mode} -target=${target} ${file}`
- `cerberusx.tranccRunArgs` (string) - Run command template. Default: `-run -config=${mode} -target=${target} ${file}`
- `cerberusx.tranccOutput` (string) - Output mode: `terminal` (integrated terminal) or `output` (Output channel)
- `cerberusx.tranccTargetMap` (object) - Platform to target name mapping
- `cerberusx.tranccExecutableMap` (object) - OS-specific executable paths

**IntelliSense Settings:**
- `cerberusx.tokenExtractionRegex` (string) - Regex for token extraction from documentation
- `cerberusx.snippetsFile` (string) - Path for generated snippets (relative to workspace)

**Legacy Settings:**
- `cerberusx.executablePath`, `cerberusx.buildMode`, `cerberusx.targetPlatform` - Deprecated in favor of sidebar controls

## Getting Started

### Installation

1. Install the extension from VSIX:
   ```bash
   code --install-extension cerberusx-debug.vsix
   ```

2. Configure CerberusX path in VS Code settings:
   ```json
   {
     "cerberusx.PathOfCerberusX": "C:\\CerberusX"
   }
   ```

3. Open a `.cxs` file and start coding!

### Usage

**Debugging Your Code:**
1. Open a `.cxs` file in the editor
2. Click in the gutter (left of line numbers) to set breakpoints
3. Press F5 to start debugging
   - OR: Click Run > Start Debugging from the menu
   - OR: Use the Debug panel (Ctrl+Shift+D) and click the green play button
4. The debugger will:
   - Automatically inject `DebugStop` keywords at your breakpoint locations
   - Build your project with CerberusX transcc compiler
   - Launch the application
   - Stop execution when a breakpoint is hit
5. When stopped, use:
   - F5 (Continue) - Resume execution until next breakpoint
   - F10 (Step Over) - Execute current line and stop at next line
   - F11 (Step In) - Step into function calls
   - Shift+F11 (Step Out) - Step out of current function
6. View the debug console for application output
7. Press Shift+F5 to stop debugging

**Debug Configuration:**
Create a `.vscode/launch.json` file for custom debug settings:
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "CerberusX: Debug Current File",
      "type": "cerberusx",
      "request": "launch",
      "program": "${file}",
      "platform": "glfw"
    }
  ]
}
```
Supported platforms: `glfw` (desktop), `html5` (browser), `android`, `ios`

**Building Projects:**
1. Click the game controller icon (🎮) in the Activity Bar to open CerberusX sidebar
2. Select your target platform (html5, glfw, android, ios)
3. Select build mode (debug, release)
4. Click **Build** or **Build & Run**

**Using Snippets:**
- Type a snippet prefix (e.g., `class`, `for`, `mojoapp`) and press Tab
- Use Tab to navigate between snippet placeholders

**IntelliSense:**
- Type any CerberusX keyword or function name
- Press Ctrl+Space to trigger autocomplete
- Hover over any keyword to see documentation with signature and description
- Press Ctrl+F1 (Cmd+F1 on Mac) to open HTML documentation in browser
- Run **CerberusX: Refresh Keywords** command to reload documentation

**Customizing Module Function Colors:**

Module functions and classes are highlighted with special colors. Customize them in your VS Code settings:

```json
{
  "editor.tokenColorCustomizations": {
    "textMateRules": [
      {
        "scope": "support.function.mojo.cerberusx",
        "settings": {
          "foreground": "#4EC9B0",
          "fontStyle": "bold"
        }
      },
      {
        "scope": "support.function.input.cerberusx",
        "settings": {
          "foreground": "#DCDCAA"
        }
      },
      {
        "scope": "support.class.mojo.cerberusx",
        "settings": {
          "foreground": "#4EC9B0",
          "fontStyle": "italic"
        }
      },
      {
        "scope": "support.class.data.cerberusx",
        "settings": {
          "foreground": "#4EC9B0"
        }
      }
    ]
  }
}
```

Available scopes for customization:
- `support.function.mojo.cerberusx` - Mojo graphics functions (DrawImage, SetColor, etc.)
- `support.function.input.cerberusx` - Input functions (KeyDown, MouseX, etc.)
- `support.function.audio.cerberusx` - Audio functions (PlaySound, LoadSound, etc.)
- `support.function.app.cerberusx` - App lifecycle functions (OnCreate, OnUpdate, etc.)
- `support.function.file.cerberusx` - File I/O functions
- `support.function.math.cerberusx` - Math functions (Sin, Cos, Sqrt, etc.)
- `support.function.string.cerberusx` - String functions (ToUpper, Split, etc.)
- `support.function.data.cerberusx` - Data structure methods (Push, Pop, etc.)
- `support.class.mojo.cerberusx` - Mojo classes (App, Image, Canvas, etc.)
- `support.class.data.cerberusx` - Data structure classes (List, Map, Stack, etc.)
- `support.class.stream.cerberusx` - Stream classes

## Development

### Building from Source

```bash
# Install dependencies
npm install
cd server && npm install && cd ..

# Compile TypeScript
npm run compile

# Package extension
npx vsce package --out cerberusx-working.vsix
```

### Running Tests

```bash
# Run unit tests
npm test

# Run integration tests
npm run test:integration
```

### Debugging

Launch the Extension Development Host (F5) in VS Code to debug and test changes.

## Commands

- **CerberusX: Refresh Keywords** - Reload IntelliSense database from documentation files
- **CerberusX: Build Project** - Build current CerberusX project
- **CerberusX: Build with trancc** - Build using trancc compiler
- **CerberusX: Build and Run with trancc** - Build and run using trancc
- **CerberusX: Generate Snippets** - Generate custom snippets from `.cerberusdoc` files
- **CerberusX: Select Build Mode** - Choose debug/release mode
- **CerberusX: Select Target Platform** - Choose target platform

## Requirements

- Visual Studio Code 1.70.0 or higher
- CerberusX SDK installed with `trancc` compiler
- Node.js (for development only)

## Known Issues

- Language server features (hover, go-to-definition) are optional and may not be available if server module is not built
- Large documentation folders may take a few seconds to index on first load

## Release Notes

### 0.3.0

- ✨ Added syntax highlighting for `.cxs` files
- ✨ Added 69 built-in code snippets
- ✨ Added hover documentation for keywords and functions
- ✨ Automatic scanning of `PathOfCerberusX/docs/` folder for IntelliSense
- ✨ Sidebar panel with Build and Build & Run buttons
- ✨ Validation for PathOfCerberusX and trancc executable
- 🐛 Fixed trancc path resolution for `PathOfCerberusX/bin/` directory
- 🐛 Made language server optional for graceful activation
- 📝 Improved error notifications with actionable messages

## Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

## License

MIT License - see LICENSE.md for details

---

**Enjoy coding with CerberusX!** 🎮

---

**Enjoy coding with CerberusX!** 🎮

## Advanced Configuration

### trancc Command Templates

## Advanced Configuration

### trancc Command Templates

The extension uses configurable templates for trancc commands. Customize in settings:

```json
{
  "cerberusx.tranccBuildArgs": "-build -config=${mode} -target=${target} ${file}",
  "cerberusx.tranccRunArgs": "-run -config=${mode} -target=${target} ${file}"
}
```

**Available placeholders:**
- `${file}` - Source file path
- `${platform}` - Selected platform (html5, glfw, android, ios)
- `${mode}` - Selected mode (debug, release)
- `${target}` - Mapped target name (from tranccTargetMap)

**Example generated commands:**

Windows HTML5 debug run:
```bash
transcc_winnt.exe -run -config=debug -target=Html5_Game "path/to/source.cxs"
```

Windows Desktop release build:
```bash
transcc_winnt.exe -build -config=release -target=Desktop_Game "path/to/source.cxs"
```

### Platform Target Mapping

Map platform names to trancc target names:

```json
{
  "cerberusx.tranccTargetMap": {
    "html5": "Html5_Game",
    "glfw": "Desktop_Game",
    "android": "Android_Game",
    "ios": "iOS_Game"
  }
}
```

### OS-Specific Executables

Use different trancc executables per OS:

```json
{
  "cerberusx.tranccExecutableMap": {
    "win32": "transcc_winnt.exe",
    "linux": "transcc_linux",
    "darwin": "transcc_macos"
  }
}
```
```