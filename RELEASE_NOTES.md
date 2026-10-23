Maintenance backport for Foundry VTT **12.343 (Version 12 Closing)**.

- Uses the v12 numeric ChatMessage.type API and renderChatMessage jQuery hook.
- Selected actor tokens speak In Character for ordinary chat input.
- Explicit /ooc, emotes, rolls, whispers and GURPS system messages retain their types.
- Preserves per-scene IC/roll filters, global OOC, notifications and auto-navigation.
- Fixes scene webhook form saving and protects private/blind messages from Discord forwarding.
- Uses relative module asset paths and a ZIP with module.json at the root for Forge.

Install through Forge Bazaar > Custom Modules > Install via Manifest URL:

https://github.com/UmutcanOrug/FoundryVTT-Tabbed-Chatlog/releases/download/v12-1.6.6/module.json

Disable "Install from Bazaar if available" when installing this specific fork.

This release supports **12.343 only**. Its manifest and download links are pinned
to this release, and it is **not** marked as GitHub's latest release. Existing
v13/v14 releases, assets, tags and the master branch are left untouched.

Validation: 21 automated hook/data-model scenarios and JavaScript syntax checks.
No live licensed Foundry or Forge world was available during validation.
