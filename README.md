# Tabbed Chatlog: Foundry v13 and Automatic v13/v14 Channel

See RELEASE_NOTES.md for installation, compatibility and testing details.

The v13 maintenance implementation is 1.7.2 and requires Foundry 13.351+ within
generation 13. It has no Lancer-only restriction: Lancer 3.1.3 is the tested
system. The automatic distribution is 1.8.0, loads the correct implementation
for the running Foundry generation, and uses a dedicated stable manifest URL.

GitHub Latest remains 1.7.1. Existing immutable release downloads are not replaced.
The v13-only manifest is pinned; automatic channel updates consult
automatic/module.json on maintenance/v13 instead of the global latest release.

## Tests

Run from this directory with Node 22.18+:

```
node --check tabbed-chatlog.js
node --test chat-v13.test.cjs
node chat-lancer.test.cjs
node build-automatic.cjs /path/to/extracted-v14-1.7.1
node --experimental-vm-modules --test automatic.test.cjs
```

The browser test requires Playwright, jQuery and Handlebars. Set
NODE_MODULES_DIR to their installation directory and CHROME_PATH to an existing
Chrome executable. Fixtures are fetched from the pinned upstream Lancer commit
unless cached under .qa/lancer-source/. The CI installs test dependencies only;
they and the upstream Lancer fixtures are never included in either release ZIP.

The automatic builder checks the SHA-256 of the existing v14 JavaScript before
copying it. Its default local reference is the workspace root. CI downloads the
original 1.7.1 release asset, verifies its digest and builds from that archive.

Both ZIPs put module.json at the archive root and use relative asset paths.
They install with the same tabbed-chatlog ID, preserving world settings.
