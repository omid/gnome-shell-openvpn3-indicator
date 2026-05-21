const GLib = imports.gi.GLib;
let [res, stdout] = GLib.spawn_command_line_sync('openvpn3 configs-list');
let output = new TextDecoder().decode(stdout);
console.log(output);

let configs = [];
let lines = output.split('\n');
let parsing = false;
for (let line of lines) {
    if (line.startsWith('---')) {
        parsing = !parsing;
        continue;
    }
    if (parsing && line.trim().length > 0) {
        let match = line.match(/^(.+?)\s{2,}(.+)$/);
        if (match) {
            configs.push({name: match[1].trim(), lastUsed: match[2].trim()});
        }
    }
}
console.log(configs);

let [res2, stdout2] = GLib.spawn_command_line_sync('openvpn3 sessions-list');
let output2 = new TextDecoder().decode(stdout2);
console.log(output2);

let sessions = [];
let currentSession = null;
for (let line of output2.split('\n')) {
    if (line.startsWith('---')) {
        if (currentSession) sessions.push(currentSession);
        currentSession = {};
        continue;
    }
    let pathMatch = line.match(/^\s*Path:\s*(.+)$/);
    if (pathMatch) currentSession.path = pathMatch[1].trim();

    let configMatch = line.match(/^\s*Config name:\s*(.+?)(?:\s*\(Current name:\s*(.+?)\))?\s*$/);
    if (configMatch) {
        currentSession.config = configMatch[2] ? configMatch[2].trim() : configMatch[1].trim();
    }
    
    let statusMatch = line.match(/^\s*Status:\s*(.+)$/);
    if (statusMatch) currentSession.status = statusMatch[1].trim();
}
console.log(sessions);
