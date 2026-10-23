Maintenance backport for Foundry VTT **12.343 (Version 12 Closing)**.

- Fixes the 1.6.6 validation error: type: "2" is not a valid ChatMessage type.
- Uses numeric ChatMessage.style and leaves the string document type untouched.
- Recognizes Cyberpunk RED - CORE v0.92.4 .rollcard messages without native rolls.
- Selected actor tokens speak In Character for ordinary chat input.
- Explicit /ooc, emotes, rolls, whispers and GURPS system messages retain their types.
- Preserves per-scene IC/roll filters, global OOC, notifications and auto-navigation.
- Keeps the tab bar at 30 pixels instead of allowing it to fill the sidebar.
- Private rolls remain in Rolls with recipient checks; blind cards stay hidden from non-GMs.
- Fixes scene webhook form saving and protects private/blind messages from Discord forwarding.
- Uses relative module asset paths and a ZIP with module.json at the root for Forge.

Install through Forge Bazaar > Custom Modules > Install via Manifest URL:

https://github.com/UmutcanOrug/FoundryVTT-Tabbed-Chatlog/releases/download/v12-1.6.7/module.json

Disable "Install from Bazaar if available" when installing this specific fork.
Replace the old 1.6.6 installation using this new manifest URL; its pinned update
URL will not discover this release automatically.

This release supports **12.343 only**. Its manifest and download links are pinned
to this release, and it is **not** marked as GitHub's latest release. Existing
v13/v14 releases, assets, tags and the master branch are left untouched.

Validation: 25 automated modern-v12 schema/hook scenarios and a real-browser
regression using the upstream CPR v0.92.4 chat renderer and stat-card template.
The browser test reproduces the reported validation error on 1.6.6 and passes
with the fixed version. It also checks roll/OOC routing, privacy and tab height.
No live licensed Foundry or Forge world was available during validation.
