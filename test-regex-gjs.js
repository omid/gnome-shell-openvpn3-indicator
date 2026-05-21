
let lines = [
    " Config name: sp  (Current name: SP)",
    " Config name: Cat",
    " Config name: something (Current name: Other)"
];

for (let line of lines) {
    let configMatch = line.match(/^\s*Config name:\s*(.+?)(?:\s*\(Current name:\s*(.+?)\))?\s*$/);
    if (configMatch) {
        let name = configMatch[2] ? configMatch[2].trim() : configMatch[1].trim();
        print(`Line: "${line}" -> Name: "${name}"`);
    } else {
        print(`No match for: "${line}"`);
    }
}
