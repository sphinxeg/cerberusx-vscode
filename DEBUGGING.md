# CerberusX Debugging Guide

## Overview
The CerberusX extension now includes full debugging support using CerberusX's built-in `DebugStop` keyword functionality. This allows you to set breakpoints, step through code, and inspect execution flow directly in VS Code.

## How It Works

### 1. DebugStop Injection
When you set breakpoints in VS Code and start debugging:
- The debug adapter reads your source file
- Automatically inserts `DebugStop` keywords at breakpoint locations
- Creates a temporary debug file (`.debug_yourfile.cxs`)
- Compiles the modified file using CerberusX transcc compiler

### 2. Execution Control
Once the application is running:
- Execution pauses when a `DebugStop` is encountered
- VS Code displays the current line and file
- You can use standard debugging controls:
  - **F5** - Continue to next breakpoint
  - **F10** - Step Over (next line)
  - **F11** - Step In (enter function)
  - **Shift+F11** - Step Out (exit function)

### 3. Debugger Communication
The debug adapter communicates with CerberusX debugger via stdin:
- `c` - Continue execution
- `n` - Next (step over)
- `s` - Step in
- `o` - Step out

## Quick Start

1. **Open a .cxs file**
2. **Set breakpoints** - Click in the gutter (left of line numbers)
3. **Press F5** - Start debugging
4. **Use debug controls** when stopped at a breakpoint

## Debug Configuration

Create `.vscode/launch.json` in your workspace:

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
    },
    {
      "name": "CerberusX: Debug Main",
      "type": "cerberusx",
      "request": "launch",
      "program": "${workspaceFolder}/main.cxs",
      "platform": "html5"
    }
  ]
}
```

### Configuration Options

- **program** - Path to .cxs file to debug
  - `${file}` - Current file
  - `${workspaceFolder}/path/to/file.cxs` - Specific file
- **platform** - Target platform
  - `glfw` - Windows/Linux/Mac desktop (recommended for debugging)
  - `html5` - Web browser
  - `android` - Android device/emulator
  - `ios` - iOS device/simulator
- **mode** - Always uses "debug" mode for debugging

## Features

### ✅ Supported
- Line breakpoints
- Step over (F10)
- Step in (F11)
- Step out (Shift+F11)
- Continue (F5)
- Stop debugging (Shift+F5)
- Stack traces (shows current file:line)
- Debug console output
- Automatic DebugStop injection
- Temporary file cleanup after build

### ⏳ Future Enhancements
- Variable inspection
- Watch expressions
- Conditional breakpoints
- Exception breakpoints
- Multi-threaded debugging
- Hot reload/edit-and-continue

## Platform Support

### Best Platform for Debugging
**glfw (Desktop)** is recommended for debugging because:
- Fast compile times
- Native process with full stdin/stdout communication
- Easy to restart and recompile
- No browser dependencies

### HTML5 Debugging
- Opens in external browser
- Limited stdin/stdout communication
- Breakpoints may not work as expected
- Better for final testing, not active debugging

## Troubleshooting

### Breakpoints not being hit
1. Make sure `PathOfCerberusX` is configured in settings
2. Check that transcc_winnt.exe (or platform equivalent) exists in `PathOfCerberusX/bin/`
3. Verify the debug console shows "Created debug file with breakpoints"
4. Look for DebugStop injection messages in the output

### Build fails
1. Check the debug console for compilation errors
2. Verify your code compiles normally (without debugging)
3. The temporary `.debug_*.cxs` file should be created in the same directory
4. If build succeeds without debugging, the issue is with DebugStop injection

### Application doesn't start
1. Check platform setting (use `glfw` for desktop)
2. Verify the build completed successfully
3. Look in the `.build` folder for compiled executables
4. Check debug console for "Application exited with code" messages

### Can't step through code
1. Make sure you're using `glfw` platform (html5 has limited stepping)
2. Verify the process is still running (check debug console)
3. Try setting another breakpoint and continuing
4. Check that stdin commands are being sent (look for debug console messages)

## Technical Details

### Files Modified During Debug
- **Source**: `yourfile.cxs`
- **Debug file**: `.debug_yourfile.cxs` (temporary, auto-deleted after build)
- **Build output**: `yourfile.build/glfw/windows/yourfile.exe` (or platform equivalent)

### Debug Adapter
Located in `src/debugAdapter.ts`:
- `CerberusXDebugSession` - Main debug adapter implementing VS Code Debug Adapter Protocol
- `injectBreakpoints()` - Inserts DebugStop at breakpoint lines
- `checkForDebugStop()` - Monitors output for debug stop events
- `launch()` - Builds and runs the application with debugging

### Communication Flow
1. VS Code sends breakpoint locations to debug adapter
2. Debug adapter injects DebugStop keywords
3. transcc compiles modified source
4. Application runs with DebugStop pauses
5. Debug adapter monitors stdout for stop events
6. When stopped, sends "stopped" event to VS Code
7. User presses F5/F10/F11 → debug adapter sends stdin command (c/n/s)
8. Application continues/steps
9. Repeat from step 5

## Example Debugging Session

```cerberusx
' game.cxs
Import mojo

Class Game Extends App
    Method OnCreate:Int()
        Print "Game Created"  ' <- Set breakpoint here (line 5)
        Return 0
    End
    
    Method OnUpdate:Int()
        Print "Updating..."   ' <- Set breakpoint here (line 10)
        Return 0
    End
    
    Method OnRender:Int()
        Cls
        DrawText "Hello Debug", 10, 10  ' <- Set breakpoint here (line 16)
        Return 0
    End
End

Function Main:Int()
    New Game()  ' <- Set breakpoint here (line 22)
    Return 0
End
```

**Debug Flow:**
1. F5 → Stops at line 22 (Main)
2. F10 → Steps to line 5 (OnCreate)
3. F5 → Continues to line 10 (OnUpdate)
4. F11 → Steps through update logic
5. F5 → Continues to line 16 (OnRender)
6. Shift+F5 → Stops debugging

## Notes

- Debug file cleanup happens automatically after build completion
- Stack traces currently show only the main thread
- For complex debugging, consider adding manual `Print` statements alongside breakpoints
- The debug adapter works best with glfw platform due to direct process control

## Support

For issues or questions:
1. Check the debug console output (View → Output → CerberusX Debug)
2. Verify your CerberusX installation is working (try manual transcc build)
3. Review this documentation
4. Check extension logs in VS Code Developer Tools (Help → Toggle Developer Tools)
