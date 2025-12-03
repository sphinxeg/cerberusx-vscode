import * as vscode from 'vscode';

export class CerberusSidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'cerberusxSidebar';
  private view?: vscode.WebviewView;

  constructor(private readonly context: vscode.ExtensionContext) { }

  resolveWebviewView(webviewView: vscode.WebviewView) {
    console.log('CerberusX sidebar resolveWebviewView called');
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true
    };

    // read current settings to populate the webview
    const config = vscode.workspace.getConfiguration('cerberusx');
    const tranccBuildArgs = config.get<string>('tranccBuildArgs') || '';
    const tranccRunArgs = config.get<string>('tranccRunArgs') || '';
    const tranccOutput = config.get<string>('tranccOutput') || 'terminal';
    const tranccTargetMap = config.get<any>('tranccTargetMap') || {};
    const tranccExecutableMap = config.get<any>('tranccExecutableMap') || {};

    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview, { tranccBuildArgs, tranccRunArgs, tranccOutput, tranccTargetMap, tranccExecutableMap });

    webviewView.webview.onDidReceiveMessage(async message => {
      switch (message.command) {
        case 'build':
          vscode.commands.executeCommand('cerberusx.buildWithTrancc', message.platform, message.mode);
          break;
        case 'buildAndRun':
          vscode.commands.executeCommand('cerberusx.buildAndRunWithTrancc', message.platform, message.mode);
          break;
        case 'saveSettings':
          try {
            const key = message.key as string;
            const value = message.value;
            await vscode.workspace.getConfiguration('cerberusx').update(key, value, vscode.ConfigurationTarget.Workspace);
            webviewView.webview.postMessage({ command: 'saved', key });
            // Also show a user-visible confirmation toast
            vscode.window.showInformationMessage(`CerberusX: saved setting ${key}`);
          } catch (err) {
            webviewView.webview.postMessage({ command: 'saveError', error: String(err) });
            vscode.window.showErrorMessage(`CerberusX: failed to save settings: ${String(err)}`);
          }
          break;
      }
    });
  }

  private getHtmlForWebview(webview: vscode.Webview, configVals?: { tranccBuildArgs?: string; tranccRunArgs?: string; tranccOutput?: string; tranccTargetMap?: any; tranccExecutableMap?: any }) {
    const platforms = ['html5', 'glfw', 'cpptool', 'android', 'ios'];
    const modes = ['debug', 'release'];

    const platformOptions = platforms.map(p => `<option value="${p}">${p}</option>`).join('\n');
    const modeOptions = modes.map(m => `<option value="${m}">${m}</option>`).join('\n');

    const buildArgs = (configVals && configVals.tranccBuildArgs) ? configVals.tranccBuildArgs : '';
    const runArgs = (configVals && configVals.tranccRunArgs) ? configVals.tranccRunArgs : '';
    const outMode = (configVals && configVals.tranccOutput) ? configVals.tranccOutput : 'terminal';
    const targetMapJson = JSON.stringify((configVals && configVals.tranccTargetMap) || {}, null, 2);
    const execMapJson = JSON.stringify((configVals && configVals.tranccExecutableMap) || {}, null, 2);

    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      body { font-family: var(--vscode-font-family); padding: 12px; }
      select, button { margin: 6px 0; width: 100%; }
      .row { display:flex; gap:8px; }
      .row select { flex:1 }
      .row button { flex:1 }
    </style>
  </head>
  <body>
    <h3>CerberusX Build</h3>
    <label>Platform</label>
    <select id="platform">${platformOptions}</select>
    <label>Mode</label>
    <select id="mode">${modeOptions}</select>
    <div class="row">
      <button id="build">Build</button>
      <button id="buildRun">Build & Run</button>
    </div>
    <script>
      const vscode = acquireVsCodeApi();
      document.getElementById('build').addEventListener('click', ()=>{
        const platform = document.getElementById('platform').value;
        const mode = document.getElementById('mode').value;
        vscode.postMessage({ command: 'build', platform, mode });
      });
      document.getElementById('buildRun').addEventListener('click', ()=>{
        const platform = document.getElementById('platform').value;
        const mode = document.getElementById('mode').value;
        vscode.postMessage({ command: 'buildAndRun', platform, mode });
      });
      // accept messages from extension
      window.addEventListener('message', event => {
        const msg = event.data;
        if (msg.command === 'saved') {
          // optionally show a confirmation
          console.log('Saved', msg.key);
        } else if (msg.command === 'saveError') {
          alert('Error saving settings: ' + msg.error);
        }
      });
    </script>
  </body>
</html>`;
  }

}

function escapeHtml(s: string) {
  if (!s) return '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

