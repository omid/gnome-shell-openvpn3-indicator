import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

async function runCommand(argv) {
    let proc = new Gio.Subprocess({
        argv: argv,
        flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
    });
    proc.init(null);

    return new Promise((resolve, reject) => {
        proc.communicate_utf8_async(null, null, (proc, res) => {
            try {
                let [ok, stdout, stderr] = proc.communicate_utf8_finish(res);
                if (proc.get_successful()) {
                    resolve(stdout);
                } else {
                    reject(new Error(stderr || 'Command failed'));
                }
            } catch (e) {
                reject(e);
            }
        });
    });
}

runCommand(['openvpn3', 'sessions-list']).then(console.log).catch(console.error);
