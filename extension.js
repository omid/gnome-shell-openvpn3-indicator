import GObject from 'gi://GObject';
import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Extension, gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';

async function runCommand(argv) {
    try {
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
    } catch (e) {
        return Promise.reject(e);
    }
}

const OpenVPN3Indicator = GObject.registerClass(
class OpenVPN3Indicator extends PanelMenu.Button {
    _init(extension) {
        super._init(0.0, 'OpenVPN3 Indicator', false);
        this._extension = extension;
        
        this._icon = new St.Icon({
            icon_name: 'network-vpn-symbolic',
            style_class: 'system-status-icon',
        });
        this.add_child(this._icon);

        this._buildMenu();
        this._updateMenu();
        
        // Auto refresh every 10 seconds
        this._timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 10, () => {
            this._updateMenu();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _buildMenu() {
        this._listSection = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._listSection);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        let actionRow = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false
        });

        let box = new St.BoxLayout({
            vertical: false,
            x_expand: true,
        });

        // Add some spacing between the two buttons via an inline St.BoxLayout property if needed,
        // or just apply a custom style class. Here we'll add a style class for CSS.
        box.add_style_class_name('openvpn3-bottom-actions');

        let manageBtnBox = new St.BoxLayout({ vertical: false, x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER, style_class: 'openvpn3-action-button-box' });
        let manageIcon = new St.Icon({ icon_name: 'preferences-system-symbolic', style_class: 'popup-menu-icon' });
        manageBtnBox.add_child(manageIcon);
        manageBtnBox.add_child(new St.Label({ text: _('Manage'), y_align: Clutter.ActorAlign.CENTER }));

        let manageBtn = new St.Button({
            style_class: 'button openvpn3-action-button',
            child: manageBtnBox,
            x_expand: true,
            reactive: true,
            can_focus: true
        });
        manageBtn.connect('clicked', () => {
            this.menu.close();
            this._extension.openPreferences();
        });

        let refreshBtnBox = new St.BoxLayout({ vertical: false, x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER, style_class: 'openvpn3-action-button-box' });
        let refreshIcon = new St.Icon({ icon_name: 'view-refresh-symbolic', style_class: 'popup-menu-icon' });
        refreshBtnBox.add_child(refreshIcon);
        refreshBtnBox.add_child(new St.Label({ text: _('Refresh'), y_align: Clutter.ActorAlign.CENTER }));

        let refreshBtn = new St.Button({
            style_class: 'button openvpn3-action-button',
            child: refreshBtnBox,
            x_expand: true,
            reactive: true,
            can_focus: true
        });
        refreshBtn.connect('clicked', () => {
            this._updateMenu();
        });

        box.add_child(refreshBtn);
        box.add_child(manageBtn);
        
        actionRow.add_child(box);
        this.menu.addMenuItem(actionRow);
    }
    
    async _updateMenu() {
        try {
            let configsOutput = await runCommand(['openvpn3', 'configs-list']);
            let sessionsOutput = await runCommand(['openvpn3', 'sessions-list']);
            
            this._listSection.removeAll();
            
            let configs = [];
            let lines = configsOutput.split('\n');
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
            
            let sessions = [];
            let currentSession = null;
            for (let line of sessionsOutput.split('\n')) {
                if (line.startsWith('---')) {
                    if (currentSession && currentSession.path) sessions.push(currentSession);
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

            if (sessions.length > 0) {
                this._icon.opacity = 255; // Bright icon
            } else {
                this._icon.opacity = 128; // Dim icon
            }

            let configsList = [...configs];
            
            // Add any active sessions that aren't in the config list
            for (let session of sessions) {
                if (session.config && !configsList.find(c => c.name === session.config)) {
                    configsList.push({ name: session.config, lastUsed: '-' });
                }
            }

            configsList.sort((a, b) => {
                let aConnected = sessions.find(s => s.config === a.name) ? 1 : 0;
                let bConnected = sessions.find(s => s.config === b.name) ? 1 : 0;

                if (aConnected !== bConnected) {
                    return bConnected - aConnected; // Connected (1) comes before disconnected (0)
                }

                let aTime = a.lastUsed || '-';
                let bTime = b.lastUsed || '-';
                if (aTime === bTime) return a.name.localeCompare(b.name);
                if (aTime === '-') return 1;
                if (bTime === '-') return -1;
                return bTime.localeCompare(aTime);
            });

            if (configsList.length === 0) {
                let item = new PopupMenu.PopupMenuItem(_('No profiles found'));
                item.setSensitive(false);
                this._listSection.addMenuItem(item);
                return;
            }

            for (let config of configsList) {
                let session = sessions.find(s => s.config === config.name);
                let isConnected = !!session;
                let iconName = isConnected ? 'media-playback-stop-symbolic' : 'media-playback-start-symbolic';
                
                let item = new PopupMenu.PopupBaseMenuItem();
                
                let labelBox = new St.BoxLayout({
                    vertical: true,
                    x_expand: true,
                    y_align: Clutter.ActorAlign.CENTER
                });
                
                let titleLabel = new St.Label({
                    text: config.name,
                    style_class: 'openvpn3-profile-name'
                });
                labelBox.add_child(titleLabel);

                if (config.lastUsed && config.lastUsed !== '-') {
                    let subLabel = new St.Label({
                        text: _('Last used: ') + config.lastUsed,
                        style_class: 'openvpn3-subtitle'
                    });
                    labelBox.add_child(subLabel);
                }                
                item.add_child(labelBox);

                let actionBtn = new St.Button({
                    style_class: isConnected ? 'button circular destructive-action openvpn3-play-button' : 'button circular openvpn3-play-button',
                    child: new St.Icon({
                        icon_name: iconName,
                        style_class: 'popup-menu-icon'
                    }),
                    y_align: Clutter.ActorAlign.CENTER,
                    reactive: false,
                    can_focus: false
                });
                item.add_child(actionBtn);

                if (isConnected) {
                    item.add_style_class_name('openvpn3-connected-item');
                    item.connect('activate', () => this._disconnectSession(session.path));
                } else {
                    item.connect('activate', () => this._startSession(config.name));
                }
                
                this._listSection.addMenuItem(item);
            }

        } catch (e) {
            console.error("OpenVPN3Indicator error: " + e.message);
        }
    }
    
    async _startSession(configName) {
        try {
            await runCommand(['openvpn3', 'session-start', '--config', configName]);
            this._updateMenu();
        } catch (e) {
            console.error("Failed to start " + configName + ": " + e.message);
        }
    }
    
    async _disconnectSession(sessionPath) {
        try {
            await runCommand(['openvpn3', 'session-manage', '--session-path', sessionPath, '--disconnect']);
            this._updateMenu();
        } catch (e) {
            console.error("Failed to disconnect: " + e.message);
        }
    }

    destroy() {
        if (this._timeoutId) {
            GLib.source_remove(this._timeoutId);
            this._timeoutId = null;
        }
        super.destroy();
    }
});

export default class OpenVPN3Extension extends Extension {
    enable() {
        this._indicator = new OpenVPN3Indicator(this);
        Main.panel.addToStatusArea(this.uuid, this._indicator);
    }

    disable() {
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
    }
}
