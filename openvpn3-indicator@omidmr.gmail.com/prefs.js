import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

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

export default class OpenVPN3Preferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        this._window = window;
        // Create a preferences page
        const page = new Adw.PreferencesPage();
        window.add(page);

        // Create a group for the profiles
        this._group = new Adw.PreferencesGroup({
            title: _('OpenVPN3 Profiles'),
            description: _('Manage your imported VPN configurations.'),
        });
        page.add(this._group);

        // Import Button Row
        const importRow = new Adw.ActionRow({ title: _('Import New Profile') });
        const importButton = new Gtk.Button({
            icon_name: 'document-open-symbolic',
            valign: Gtk.Align.CENTER,
            css_classes: ['suggested-action'],
        });
        importButton.connect('clicked', () => this._onImportClicked(window));
        importRow.add_suffix(importButton);
        importRow.activatable_widget = importButton;
        this._group.add(importRow);

        // Container for dynamically loaded profiles
        this._profilesGroup = new Adw.PreferencesGroup();
        this._profileRows = [];
        page.add(this._profilesGroup);

        // Load profiles
        this._refreshProfiles();

        window.connect('close-request', () => {
            this._window = null;
            this._group = null;
            this._profilesGroup = null;
            this._profileRows = null;
        });
    }

    async _refreshProfiles() {
        try {
            // Remove all existing rows from the dynamic group
            if (this._profileRows) {
                for (let row of this._profileRows) {
                    this._profilesGroup.remove(row);
                }
            }
            this._profileRows = [];

            let output = await runCommand(['openvpn3', 'configs-list']);
            let lines = output.split('\n');
            let parsing = false;
            let count = 0;

            for (let line of lines) {
                if (line.startsWith('---')) {
                    parsing = !parsing;
                    continue;
                }
                if (parsing && line.trim().length > 0) {
                    let match = line.match(/^(.+?)\s{2,}(.+)$/);
                    if (match) {
                        let configName = match[1].trim();
                        let lastUsed = match[2].trim();
                        
                        let row = new Adw.ActionRow({
                            title: configName,
                            subtitle: _('Last used: ') + lastUsed,
                        });

                        let editBtn = new Gtk.Button({
                            icon_name: 'document-edit-symbolic',
                            valign: Gtk.Align.CENTER,
                        });
                        editBtn.connect('clicked', () => this._askForRename(configName));
                        row.add_suffix(editBtn);

                        let removeBtn = new Gtk.Button({
                            icon_name: 'user-trash-symbolic',
                            valign: Gtk.Align.CENTER,
                            css_classes: ['destructive-action'],
                        });
                        removeBtn.connect('clicked', () => this._onRemoveClicked(configName));
                        row.add_suffix(removeBtn);

                        this._profilesGroup.add(row);
                        this._profileRows.push(row);
                        count++;
                    }
                }
            }
            
            if (count === 0) {
                let emptyRow = new Adw.ActionRow({ title: _('No profiles imported yet.') });
                this._profilesGroup.add(emptyRow);
                this._profileRows.push(emptyRow);
            }

        } catch (e) {
            console.error("Error refreshing profiles: " + e.message);
        }
    }

    _onImportClicked(window) {
        let filter = new Gtk.FileFilter();
        filter.set_name(_("OpenVPN Configs"));
        filter.add_pattern("*.ovpn");
        filter.add_pattern("*.conf");

        let dialog = new Gtk.FileChooserNative({
            title: _("Select OpenVPN Config"),
            action: Gtk.FileChooserAction.OPEN,
            accept_label: _("Import"),
            cancel_label: _("Cancel"),
            transient_for: window,
        });
        dialog.add_filter(filter);

        dialog.connect('response', (dialog, response) => {
            if (response === Gtk.ResponseType.ACCEPT) {
                let file = dialog.get_file();
                if (file) {
                    let path = file.get_path();
                    this._askForProfileName(window, path);
                }
            }
            dialog.destroy();
        });

        dialog.show();
    }

    _askForProfileName(window, filePath) {
        let dialog = new Gtk.MessageDialog({
            transient_for: window,
            modal: true,
            buttons: Gtk.ButtonsType.OK_CANCEL,
            text: _("Profile Name"),
            secondary_text: _("Enter a name for the imported profile (optional):"),
        });

        dialog.set_default_response(Gtk.ResponseType.OK);

        let entry = new Gtk.Entry({ margin_top: 10, margin_bottom: 10, margin_start: 10, margin_end: 10 });
        entry.set_activates_default(true);
        dialog.get_content_area().append(entry);

        dialog.connect('response', async (d, response) => {
            if (response === Gtk.ResponseType.OK) {
                let name = entry.get_text().trim();
                let importArgs = ['openvpn3', 'config-import', '--persistent', '--config', filePath];
                if (name) {
                    importArgs.push('--name', name);
                }
                
                try {
                    await runCommand(importArgs);
                    this._refreshProfiles();
                } catch (e) {
                    console.error("Import failed: " + e.message);
                }
            }
            dialog.destroy();
        });

        dialog.show();
    }

    _askForRename(configName) {
        let dialog = new Gtk.MessageDialog({
            transient_for: this._window,
            modal: true,
            buttons: Gtk.ButtonsType.OK_CANCEL,
            text: _("Rename Profile"),
            // Translators: %s is the current profile name
            secondary_text: _("Enter a new name for '%s':").replace('%s', configName),
        });

        dialog.set_default_response(Gtk.ResponseType.OK);

        let entry = new Gtk.Entry({ margin_top: 10, margin_bottom: 10, margin_start: 10, margin_end: 10 });
        entry.set_text(configName);
        entry.set_activates_default(true);
        dialog.get_content_area().append(entry);

        dialog.connect('response', async (d, response) => {
            if (response === Gtk.ResponseType.OK) {
                let newName = entry.get_text().trim();
                if (newName && newName !== configName) {
                    try {
                        await runCommand(['openvpn3', 'config-manage', '--config', configName, '--rename', newName]);
                        this._refreshProfiles();
                    } catch (e) {
                        console.error("Rename failed: " + e.message);
                    }
                }
            }
            dialog.destroy();
        });

        dialog.show();
    }

    async _onRemoveClicked(configName) {
        try {
            await runCommand(['openvpn3', 'config-remove', '--config', configName, '--force']);
            this._refreshProfiles();
        } catch (e) {
            console.error("Remove failed: " + e.message);
        }
    }
}
