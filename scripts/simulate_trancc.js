const cp = require('child_process');
const path = require('path');

function parseArgs()
{
    const argv = process.argv.slice(2);
    const out = {};
    for (let i = 0; i < argv.length; i++)
    {
        const a = argv[i];
        if (a.startsWith('--'))
        {
            const k = a.slice(2);
            const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
            out[k] = v;
        }
    }
    return out;
}

const args = parseArgs();
const mode = args.mode || 'build';
const platform = args.platform || 'html5';
const file = args.file || 'source.cxs';
const outputMode = args.output || 'terminal';
const simulateExec = args.simulateExec || 'echo';

// Defaults matching the extension settings
const defaults = {
    tranccBuildArgs: '-build -config=${mode} -target=${target} ${file}',
    tranccRunArgs: '-run -config=${mode} -target=${target} ${file}',
    tranccTargetMap: { html5: 'Html5_Game', glfw: 'Desktop_Game', android: 'android', ios: 'ios' },
    tranccExecutableMap: { win32: 'transcc_winnt.exe', linux: 'transcc_linux', darwin: 'transcc_macos' }
};

const template = mode === 'run' ? defaults.tranccRunArgs : defaults.tranccBuildArgs;
const target = (defaults.tranccTargetMap && defaults.tranccTargetMap[platform]) ? defaults.tranccTargetMap[platform] : platform;

let cmdArgs = template.replace(/\$\{platform\}/g, platform).replace(/\$\{mode\}/g, mode).replace(/\$\{target\}/g, target);
const containsFile = /\$\{file\}/.test(cmdArgs);
if (containsFile)
{
    cmdArgs = cmdArgs.replace(/\$\{file\}/g, `"${file}"`);
} else
{
    cmdArgs = `${cmdArgs} "${file}"`.trim();
}

// Use simulated executable if requested
const executable = simulateExec;
const fullCmd = `${executable} ${cmdArgs}`;

console.log('Simulating trancc invocation');
console.log('Mode:', mode);
console.log('Platform:', platform);
console.log('Target resolved to:', target);
console.log('Output mode:', outputMode);
console.log('Executable:', executable);
console.log('Constructed command:', fullCmd);

if (outputMode === 'terminal')
{
    // spawn in shell so that `echo` behaves as expected across platforms
    const child = cp.spawn(fullCmd, { shell: true, stdio: 'inherit' });
    child.on('exit', code => process.exit(code));
} else
{
    // capture output and print with labels
    // For capturing mode, if simulateExec is a shell builtin like 'echo' on Windows, run via shell
    if (simulateExec === 'echo')
    {
        cp.exec(fullCmd, (err, stdout, stderr) =>
        {
            if (stdout) process.stdout.write(`[stdout] ${stdout}`);
            if (stderr) process.stderr.write(`[stderr] ${stderr}`);
            if (err)
            {
                console.error('[exec error]', err);
                process.exit(err.code || 1);
            } else
            {
                console.log(`\nProcess exited with code 0`);
                process.exit(0);
            }
        });
    } else
    {
        const parts = fullCmd.split(' ');
        const proc = cp.spawn(parts[0], parts.slice(1), { shell: false });
        proc.stdout.on('data', d => process.stdout.write(`[stdout] ${d}`));
        proc.stderr.on('data', d => process.stderr.write(`[stderr] ${d}`));
        proc.on('close', code =>
        {
            console.log(`\nProcess exited with code ${code}`);
            process.exit(code);
        });
    }
}
