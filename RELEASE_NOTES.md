Tabbed Chatlog for **Foundry VTT v13.351**, including **Lancer 3.1.3**.

- Fixes the v14-only compatibility restriction which hid the module in v13 and
  displayed "Requires Core Update". There is no need to upgrade Foundry to v14.
- Uses v13's renderChatMessageHTML hook and numeric ChatMessage.style, without
  writing numeric document types.
- Ordinary chat with a selected actor token speaks In Character. Explicit
  /ooc, whispers, emotes, rolls and programmatic system cards retain their intent.
- Lancer native rolls go to Rolls even when their message style is IC.
- Preserves scene filters, private/blind/self-roll visibility, notifications,
  compact tabs and global OOC. Refilters messages in ChatLog popouts too.
- Scene webhook configuration supports the v13 ApplicationV2 document API.

Recommended automatic v13/v14 channel, including on Forge:

https://raw.githubusercontent.com/UmutcanOrug/FoundryVTT-Tabbed-Chatlog/maintenance/v13/automatic/module.json

The automatic package 1.8.0 contains both implementations. It reads the running
Foundry core generation and loads only that generation's code and CSS: v13 uses
the new 1.7.2 implementation; v14 uses the unchanged 1.7.1 implementation. It does
not decide based on the game system's version. Future update checks use this
dedicated manifest, not GitHub's global latest URL.

For a strictly v13-only installation instead:

https://github.com/UmutcanOrug/FoundryVTT-Tabbed-Chatlog/releases/download/v13-1.7.2/module.json

Replace an existing generic-latest installation by installing through the new
manifest once. GitHub's /releases/latest/download URL cannot select a different
asset for each Foundry version. On Forge use Bazaar > Custom Modules > Install
via Manifest URL, with "Install from Bazaar if available" disabled. Reload the
world and enable Tabbed Chatlog in Manage Modules. World settings keep the same
module ID, tabbed-chatlog; do not delete world data.

Neither release is marked Latest. Existing releases/assets/tags, the v12 branch
and the master branch remain unchanged.

Validation: 26 v13 hook/schema scenarios; browser regression with the actual
Lancer 3.1.3 renderer and stat template from upstream commit
13ffe799baf2ec3976f78c6e9eb5abf8799bc67d; five automatic-loader/isolation tests.
These are automated harness tests, not a live licensed Foundry/Forge world.
