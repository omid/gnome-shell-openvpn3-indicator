UUID = openvpn3-indicator@omidmr.gmail.com
DOMAIN = openvpn3-indicator
SCHEMA = org.gnome.shell.extensions.openvpn3-indicator.gschema.xml

EXTDIR = $(HOME)/.local/share/gnome-shell/extensions/$(UUID)

# Source files are now inside the $(UUID) directory
SRC_DIR = $(UUID)
SRC_FILES = $(SRC_DIR)/extension.js $(SRC_DIR)/prefs.js $(SRC_DIR)/metadata.json $(SRC_DIR)/stylesheet.css $(SRC_DIR)/$(SCHEMA)

.PHONY: all install schemas gen-prefs gen-translations debug release bump-version pack devkit

all: install

schemas:
	@echo "Compiling schemas..."
	@glib-compile-schemas $(SRC_DIR)

gen-prefs: schemas

gen-translations:
	@echo "Extracting messages into $(SRC_DIR)/po/$(DOMAIN).pot..."
	@mkdir -p $(SRC_DIR)/po $(SRC_DIR)/locale
	@xgettext --from-code=UTF-8 -k_ -kN_ -o $(SRC_DIR)/po/$(DOMAIN).pot $(SRC_DIR)/extension.js $(SRC_DIR)/prefs.js
	@for lang in $(SRC_DIR)/po/*.po; do \
		if [ -f "$$lang" ]; then \
			echo "Merging and compiling $$lang..."; \
			msgmerge -U $$lang $(SRC_DIR)/po/$(DOMAIN).pot; \
			langcode=$$(basename $$lang .po); \
			mkdir -p $(SRC_DIR)/locale/$$langcode/LC_MESSAGES; \
			msgfmt $$lang -o $(SRC_DIR)/locale/$$langcode/LC_MESSAGES/$(DOMAIN).mo; \
		fi \
	done

install: schemas gen-translations
	@if [ "$$(pwd)" != "$(EXTDIR)" ]; then \
		echo "Installing to $(EXTDIR)"; \
		rm -rf $(EXTDIR); \
		mkdir -p $(EXTDIR); \
		cp -r $(SRC_DIR)/* $(EXTDIR)/; \
		echo "Installed successfully. You may need to log out and log back in, or restart GNOME Shell (X11 only) to apply changes."; \
	else \
		echo "WARNING: You are running this from within the GNOME extensions directory!"; \
		echo "Because the files are now in a subdirectory ($(UUID)), GNOME Shell won't load them directly from here."; \
		echo "Please move this repository outside of $(HOME)/.local/share/gnome-shell/extensions/ and run 'make install'."; \
	fi

debug: install
	@echo "Enabling extension..."
	@gnome-extensions enable $(UUID) || true
	@echo "Tailing journalctl for logs (Ctrl+C to stop)..."
	@journalctl -f -o cat | grep -E -i 'gnome-shell.*openvpn3-indicator|gnome-shell.*$(UUID)' || true

bump-version:
	@echo "Bumping version in $(SRC_DIR)/metadata.json..."
	@python3 -c 'import json; \
	f = open("$(SRC_DIR)/metadata.json", "r"); \
	data = json.load(f); \
	f.close(); \
	v = data.get("version", 0) + 1; \
	data["version"] = v; \
	f = open("$(SRC_DIR)/metadata.json", "w"); \
	json.dump(data, f, indent=2); \
	f.write("\n"); \
	f.close(); \
	print(f"Bumped version to {v}")'

pack: install
	@echo "Packaging extension..."
	@cd $(SRC_DIR) && gnome-extensions pack --force --extra-source=locale
	VERSION=$$(python3 -c "import json; print(json.load(open('openvpn3-indicator@omidmr.gmail.com/metadata.json')).get('version', 0))"); \
	mv $(SRC_DIR)/$(UUID).shell-extension.zip ./$(UUID)-v$$VERSION.zip; \
	echo "Created $(UUID)-v$$VERSION.zip"

release: bump-version pack
	@echo "Release ready!"

gen-perf: gen-prefs

devkit: install
	@echo "Starting nested GNOME Shell for testing..."
	dbus-run-session -- gnome-shell --devkit
