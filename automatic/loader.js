const generation = Number(game.release?.generation);

if (generation !== 13 && generation !== 14) {
  throw new Error("Tabbed Chatlog supports Foundry generations 13 and 14 only.");
}

const stylesheet = document.createElement("link");
stylesheet.id = "tabbed-chatlog-runtime-style";
stylesheet.rel = "stylesheet";
stylesheet.href = new URL(`./runtime/v${generation}/tabbed-chatlog.css`, import.meta.url).href;
document.head.append(stylesheet);

// Await registration so only the selected generation installs its init hooks.
if (generation === 13) await import("./runtime/v13/tabbed-chatlog.js");
else await import("./runtime/v14/tabbed-chatlog.js");

const module = game.modules.get("tabbed-chatlog");
if (module) module.api = Object.freeze({generation, implementationVersion: generation === 13 ? "1.7.2" : "1.7.1"});
console.info(`tabbed-chatlog | Loaded Foundry v${generation} implementation`);
