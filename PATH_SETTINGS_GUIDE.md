# CerberusX Extension Path Settings - Complete Guide

This guide explains every path-related setting in the CerberusX VS Code extension and how they work together.

---

## 🎯 Primary Settings (You Need These)

### 1. `cerberusx.PathOfCerberusX` ⭐ **REQUIRED**

**What it is:** The root folder where CerberusX is installed on your computer.

**Purpose:** The extension needs to know where CerberusX lives so it can find:
- The `transcc` compiler (in the `bin/` subfolder)
- Documentation files (in the `docs/` subfolder)  
- Module files (in the `modules/` subfolder)
- The `makedocs` tool (for generating HTML documentation)

**Examples:**
```json
// Windows
"cerberusx.PathOfCerberusX": "C:\\CerberusX"
"cerberusx.PathOfCerberusX": "D:\\Setup\\Programming\\GameMakers\\Blitz\\CerberusX"

// macOS
"cerberusx.PathOfCerberusX": "/Applications/CerberusX"
"cerberusx.PathOfCerberusX": "/Users/yourname/CerberusX"

// Linux
"cerberusx.PathOfCerberusX": "/home/yourname/CerberusX"
"cerberusx.PathOfCerberusX": "/opt/cerberusx"

// Relative to workspace (if CerberusX is in your project folder)
"cerberusx.PathOfCerberusX": "cerberusx"
"cerberusx.PathOfCerberusX": "../CerberusX"
```

**How the extension uses it:**
```
PathOfCerberusX/
├── bin/
│   ├── transcc_winnt.exe     ← Compiler (Windows)
│   ├── transcc_macos         ← Compiler (macOS)
│   ├── transcc_linux         ← Compiler (Linux)
│   ├── makedocs_winnt.exe    ← Doc generator (Windows)
│   └── makedocs_macos        ← Doc generator (macOS)
├── docs/                     ← HTML documentation
└── modules/                  ← CerberusX modules and .cerberusdoc files
```

**What happens if it's wrong:**
- ❌ Build commands fail: "transcc not found"
- ❌ Documentation doesn't work
- ❌ IntelliSense missing CerberusX keywords
- ❌ Debugging won't work

---

### 2. `cerberusx.tranccPath` (Optional)

**What it is:** The name or path to the `transcc` compiler executable.

**Default value:** `"trancc"`

**When to change it:**
- Usually you DON'T need to change this!
- The extension automatically detects the OS and uses the right compiler:
  - Windows → `transcc_winnt.exe`
  - macOS → `transcc_macos`
  - Linux → `transcc_linux`

**Advanced usage:**
```json
// Use a custom compiler name
"cerberusx.tranccPath": "transcc_custom"

// Use absolute path (if not in PathOfCerberusX/bin/)
"cerberusx.tranccPath": "/usr/local/bin/transcc"

// Use relative path from PathOfCerberusX
"cerberusx.tranccPath": "custom/transcc_modified.exe"
```

**How it works with PathOfCerberusX:**
1. Extension checks `tranccExecutableMap` for your OS
2. If found, uses that (e.g., `transcc_winnt.exe` on Windows)
3. Looks in `PathOfCerberusX/bin/` for the executable
4. If not absolute path, prepends `PathOfCerberusX/bin/`

---

## 🔧 OS-Specific Settings (Usually Automatic)

### 3. `cerberusx.tranccExecutableMap`

**What it is:** Maps each operating system to its specific transcc compiler name.

**Default value:**
```json
{
  "win32": "transcc_winnt.exe",
  "linux": "transcc_linux",
  "darwin": "transcc_macos"
}
```

**How it works:**
- The extension detects your OS using `process.platform`
- Looks up the compiler name in this map
- Automatically uses the right one!

**When to customize:**
```json
// If you renamed your compilers
"cerberusx.tranccExecutableMap": {
  "win32": "my_transcc.exe",
  "linux": "transcc_ubuntu",
  "darwin": "transcc_arm64"
}
```

**OS Platform Codes:**
- `win32` = Windows (both 32-bit and 64-bit)
- `darwin` = macOS
- `linux` = Linux

---

## 🎮 Build Target Settings

### 4. `cerberusx.tranccTargetMap`

**What it is:** Maps platform names to CerberusX target names.

**Default value:**
```json
{
  "html5": "Html5_Game",
  "glfw": "Desktop_Game",
  "cpptool": "C++_Tool",
  "android": "Android_Game",
  "ios": "iOS_Game"
}
```

**How it works:**
- You select "glfw" in the sidebar dropdown
- Extension translates: `glfw` → `Desktop_Game`
- Builds with: `transcc -target=Desktop_Game`

**The sidebar platforms:**
- `html5` - Browser-based games
- `glfw` - Desktop games (OpenGL)
- `cpptool` - C++ Tool (for macOS with Xcode)
- `android` - Android apps
- `ios` - iOS apps

**When to customize:**
```json
// If your CerberusX uses different target names
"cerberusx.tranccTargetMap": {
  "glfw": "GLFW3_Desktop",
  "html5": "HTML5_Browser",
  "custom": "My_Custom_Target"
}
```

**Real build command example:**
```bash
# You select: platform=glfw, mode=debug
# Extension generates:
transcc_winnt.exe -run -config=debug -target=Desktop_Game yourfile.cxs
```

---

## 📝 Build Command Templates

### 5. `cerberusx.tranccBuildArgs`

**What it is:** Template for the build command.

**Default value:** `"-build -config=${mode} -target=${target} ${file}"`

**Placeholders:**
- `${file}` - The .cxs file you're building
- `${mode}` - "debug" or "release" (from sidebar)
- `${target}` - Mapped target name (e.g., "Desktop_Game")
- `${platform}` - Original platform name (e.g., "glfw")

**Example:**
```json
// Default generates:
transcc_winnt.exe -build -config=debug -target=Desktop_Game myGame.cxs

// Custom with extra flags:
"cerberusx.tranccBuildArgs": "-build -config=${mode} -target=${target} -verbose ${file}"
// Generates:
transcc_winnt.exe -build -config=debug -target=Desktop_Game -verbose myGame.cxs
```

---

### 6. `cerberusx.tranccRunArgs`

**What it is:** Template for the "Build & Run" command.

**Default value:** `"-run -config=${mode} -target=${target} ${file}"`

**Same placeholders as tranccBuildArgs**

**Example:**
```json
// Add fullscreen flag when running
"cerberusx.tranccRunArgs": "-run -config=${mode} -target=${target} -fullscreen ${file}"
```

**Difference between Build and Run:**
- `Build` = Compiles only (`-build` flag)
- `Build & Run` = Compiles and launches (`-run` flag)

---

## 📂 Output Settings

### 7. `cerberusx.tranccOutput`

**What it is:** Where to show build output.

**Values:**
- `"terminal"` (default) - Shows in VS Code integrated terminal
- `"output"` - Shows in Output panel (CerberusX channel)

**Example:**
```json
"cerberusx.tranccOutput": "terminal"  // See commands and output in terminal
"cerberusx.tranccOutput": "output"    // Cleaner output in Output panel
```

---

## 🧠 IntelliSense Settings

### 8. `cerberusx.tokenExtractionRegex`

**What it is:** Regular expression to extract keywords from `.cerberusdoc` files.

**Default:** Complex regex that finds function/class names in documentation

**When to change:** If your documentation files use a different format.

**You probably don't need to change this!**

---

### 9. `cerberusx.snippetsFile`

**What it is:** Where to save generated code snippets.

**Default value:** `"snippets/cerberusx.json"`

**Purpose:** When the extension scans documentation files, it can generate snippets automatically and save them to this file.

**Example:**
```json
// Save to a different location
"cerberusx.snippetsFile": "custom-snippets/cerberusx-generated.json"
```

---

## 🗂️ Complete Example Configuration

Here's a complete `.vscode/settings.json` example:

```json
{
  // ===== PRIMARY SETTINGS =====
  
  // Windows
  "cerberusx.PathOfCerberusX": "D:\\CerberusX",
  
  // macOS
  // "cerberusx.PathOfCerberusX": "/Applications/CerberusX",
  
  // Linux
  // "cerberusx.PathOfCerberusX": "/home/username/CerberusX",
  
  // ===== OPTIONAL CUSTOMIZATIONS =====
  
  // Use terminal for output (default)
  "cerberusx.tranccOutput": "terminal",
  
  // Custom build flags
  "cerberusx.tranccBuildArgs": "-build -config=${mode} -target=${target} -verbose ${file}",
  
  // Custom run flags
  "cerberusx.tranccRunArgs": "-run -config=${mode} -target=${target} ${file}",
  
  // Custom target names (if needed)
  "cerberusx.tranccTargetMap": {
    "html5": "Html5_Game",
    "glfw": "Desktop_Game",
    "cpptool": "C++_Tool",
    "android": "Android_Game",
    "ios": "iOS_Game"
  },
  
  // Custom compiler names (rarely needed)
  "cerberusx.tranccExecutableMap": {
    "win32": "transcc_winnt.exe",
    "linux": "transcc_linux",
    "darwin": "transcc_macos"
  }
}
```

---

## 🔍 How Path Resolution Works

### When you click "Build" or "Build & Run":

1. **Find CerberusX root:**
   ```
   Read: cerberusx.PathOfCerberusX
   If absolute: Use as-is
   If relative: Join with workspace folder
   Result: D:\CerberusX (or /Applications/CerberusX)
   ```

2. **Find compiler:**
   ```
   Check: cerberusx.tranccExecutableMap
   Get executable for current OS: transcc_winnt.exe (Windows)
   Look in: PathOfCerberusX/bin/transcc_winnt.exe
   Result: D:\CerberusX\bin\transcc_winnt.exe
   ```

3. **Map target:**
   ```
   You selected: glfw
   Check: cerberusx.tranccTargetMap
   Map: glfw → Desktop_Game
   ```

4. **Build command:**
   ```
   Template: -run -config=${mode} -target=${target} ${file}
   Replace: mode=debug, target=Desktop_Game, file=myGame.cxs
   Result: -run -config=debug -target=Desktop_Game myGame.cxs
   ```

5. **Execute:**
   ```
   Full command:
   D:\CerberusX\bin\transcc_winnt.exe -run -config=debug -target=Desktop_Game D:\Projects\myGame.cxs
   ```

---

## ❓ Troubleshooting

### "transcc not found"
- ✅ Check `cerberusx.PathOfCerberusX` is correct
- ✅ Check `PathOfCerberusX/bin/` contains transcc
- ✅ Check filename matches your OS in `tranccExecutableMap`

### "Build failed with unknown target"
- ✅ Check `cerberusx.tranccTargetMap` has your platform
- ✅ Verify target name matches what transcc expects

### IntelliSense not working
- ✅ Check `cerberusx.PathOfCerberusX` is correct
- ✅ Verify `PathOfCerberusX/docs/` folder exists
- ✅ Run command: "CerberusX: Refresh Keywords"

### Debugger can't find executable
- ✅ Check build succeeded
- ✅ Look in build output for executable path
- ✅ Verify platform matches your OS (use glfw or cpptool)

---

## 🎯 Quick Start (Minimal Setup)

**All you really need:**

```json
{
  "cerberusx.PathOfCerberusX": "C:\\CerberusX"
}
```

Everything else has smart defaults that work automatically! 🎮
