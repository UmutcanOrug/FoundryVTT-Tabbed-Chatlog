# Tabbed Chatlog for Foundry VTT 12.343

Version 1.6.7 is a maintenance backport for Foundry VTT Version 12 Closing,
build 343. It is intentionally separate from the v13/v14 releases.

## Install on The Forge

Open Bazaar > Custom Modules > Install via Manifest URL and use:

https://github.com/UmutcanOrug/FoundryVTT-Tabbed-Chatlog/releases/download/v12-1.6.7/module.json

Disable "Install from Bazaar if available" when installing this specific fork.
Enable Tabbed Chatlog in the world's module settings. Refresh the game after
replacing an existing installation.

Install this new manifest explicitly when replacing 1.6.6, whose manifest is
pinned to its own release. An update check against that older URL stays on 1.6.6.

## Behavior

- Plain chat with a selected actor token uses that token's IC speaker.
- Uses modern v12.343 ChatMessage.style; document type remains a string subtype.
- Cyberpunk RED - CORE v0.92.4 roll cards are recognized even with no native rolls.
- Explicit /ooc, /em, /w and roll commands retain their Foundry behavior.
- IC and rolls can be filtered by the viewed scene; OOC remains global.
- Ordinary whispers follow the whisper-tab setting. Private rolls stay in Rolls
  and respect Foundry visibility rules; blind cards remain hidden from non-GMs.
- Discord webhooks do not receive private or blind messages.

## Release Isolation

The maintenance branch is `maintenance/v12`; the release tag is `v12-1.6.7`.
Both manifest and archive URLs are pinned to that release. Updating this
installation will not switch it to the generic GitHub latest release.
Compatibility minimum, verified and maximum are all `12.343`.

The release workflow explicitly uses `--latest=false` and never replaces assets
or tags from existing releases. The master branch and the v13/v14 assets are
not changed by this backport.

## Validation

Run `node --check tabbed-chatlog.js` and `node --test chat-v12.test.cjs`.
The 25 unit scenarios simulate the modern Foundry v12 hooks and schema. The
browser test `node chat-cyberpunk.test.cjs` uses Playwright, jQuery and Handlebars
with the actual CPR v0.92.4 RenderRollCard code and stat-card template pinned to
upstream commit 75b8c9d7cb76ed1ea2797a3404ce77172d424b6b. CI installs its browser
dependencies separately from the distributable module. These tests do not run
a licensed Foundry server or a live Forge world. For an in-world smoke test,
select a token, send plain text and /ooc text, roll dice, send a GM whisper,
change the viewed scene, and check IC/Rolls/OOC tabs after a reload.

The archive contains module.json, tabbed-chatlog.js, languages/, styles/ and the
upstream licenses at its root. Source tests and workflow files are not shipped.
