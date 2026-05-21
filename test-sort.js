let configs = [
    { name: 'Cat', lastUsed: '-' },
    { name: 'Dog', lastUsed: '2026-05-20 12:00:00' },
    { name: 'SP', lastUsed: '2026-05-20 15:47:09' },
    { name: 'Cow', lastUsed: '2026-05-19 12:00:00' },
];

let sessions = [
    { config: 'Dog' },
    { config: 'SP' },
];

let configsList = [...configs];

configsList.sort((a, b) => {
    let aConnected = sessions.find(s => s.config === a.name) ? 1 : 0;
    let bConnected = sessions.find(s => s.config === b.name) ? 1 : 0;

    if (aConnected !== bConnected) {
        return bConnected - aConnected;
    }

    let aTime = a.lastUsed || '-';
    let bTime = b.lastUsed || '-';
    if (aTime === bTime) return a.name.localeCompare(b.name);
    if (aTime === '-') return 1;
    if (bTime === '-') return -1;
    return bTime.localeCompare(aTime);
});

console.log(configsList);
