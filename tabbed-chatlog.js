let currentTab = "ic";
let salonEnabled = false;
let turndown = undefined;

// The v12 maintenance release uses numeric ChatMessage.type and jQuery render hooks.
function getViewedSceneId() {
  return canvas?.scene?.id ?? game.scenes?.current?.id ?? game.scenes?.active?.id ?? null;
}

function isWhisperMessage(msg) {
  return getMessageWhisper(msg).length > 0 || getMessageStyle(msg) === CONST.CHAT_MESSAGE_TYPES.WHISPER;
}

function isRollMessage(msg) {
  return !!msg?.isRoll || (Array.isArray(msg?.rolls) && msg.rolls.length > 0)
    || getMessageStyle(msg) === CONST.CHAT_MESSAGE_TYPES.ROLL;
}

function normalizeChatStyle(value) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isInteger(Number(value))) return Number(value);
  return null;
}

function getMessageStyle(msg) {
  return normalizeChatStyle(msg?.type ?? msg?._source?.type);
}

function getMessageWhisper(msg) {
  return msg?.whisper ?? msg?._source?.whisper ?? msg?.data?.whisper ?? msg?.data?._source?.whisper ?? [];
}

function getMessageContent(chatMessage, data = {}) {
  return data?.content ?? chatMessage?.content ?? chatMessage?._source?.content ?? chatMessage?.data?._source?.content ?? "";
}

function getMessageSourceValue(chatMessage, data = {}, key) {
  return data?.[key] ?? chatMessage?.[key] ?? chatMessage?._source?.[key] ?? chatMessage?.data?._source?.[key];
}

function getMessageFlags(chatMessage, data = {}) {
  return data?.flags ?? chatMessage?.flags ?? chatMessage?._source?.flags ?? chatMessage?.data?.flags ?? chatMessage?.data?._source?.flags ?? {};
}

function getMessageUser(chatMessage, data = {}) {
  const userRef = chatMessage?.author ?? chatMessage?.user ?? data?.user ?? game.user;
  const userId = typeof userRef === "string" ? userRef : userRef?.id;
  return (userId ? game.users.get(userId) : null) ?? (typeof userRef === "object" ? userRef : null) ?? game.user;
}

function getControlledTokenDocument() {
  const token = canvas?.tokens?.controlled?.[0];
  return token?.document ?? token ?? null;
}

function getPendingSpeaker(chatMessage, data = {}) {
  return data?.speaker ?? chatMessage?.speaker ?? chatMessage?._source?.speaker ?? chatMessage?.data?._source?.speaker ?? null;
}

function hasMeaningfulSpeaker(speaker) {
  return !!(speaker?.token || speaker?.actor || speaker?.alias);
}

function getSceneForSpeaker(speaker) {
  return (speaker?.scene ? game.scenes.get(speaker.scene) : null) ?? canvas?.scene ?? game.scenes?.current ?? game.scenes?.active ?? null;
}

function resolveSpeakerForChatMessage(chatMessage, data = {}) {
  const speaker = getPendingSpeaker(chatMessage, data);
  const controlledToken = getControlledTokenDocument();

  if (controlledToken) {
    const scene = canvas?.scene ?? getSceneForSpeaker(speaker);
    const selectedSpeaker = ChatMessage.getSpeaker?.({
      token: controlledToken,
      actor: controlledToken.actor,
      scene
    });

    if (hasMeaningfulSpeaker(selectedSpeaker)) {
      const selectedSceneId = scene?.id ?? selectedSpeaker.scene;
      if (speaker?.token !== selectedSpeaker.token || (selectedSceneId && speaker?.scene !== selectedSceneId)) {
        return selectedSpeaker;
      }
    }
  }

  if (hasMeaningfulSpeaker(speaker)) return speaker;
  return ChatMessage.getSpeaker?.() ?? speaker;
}

function updatePendingChatMessage(chatMessage, data, updates) {
  if (!updates || !Object.keys(updates).length) return;

  chatMessage.updateSource(updates);

  if (data) Object.assign(data, updates);
}

function ensureIcSpeaker(chatMessage, data, style) {
  if (style !== CONST.CHAT_MESSAGE_TYPES?.IC && style !== CONST.CHAT_MESSAGE_TYPES?.EMOTE) {
    return getPendingSpeaker(chatMessage, data);
  }

  const existing = getPendingSpeaker(chatMessage, data);
  const speaker = hasMeaningfulSpeaker(existing) ? existing : resolveSpeakerForChatMessage(chatMessage, data);
  if (hasMeaningfulSpeaker(speaker)) updatePendingChatMessage(chatMessage, data, {speaker});
  return speaker;
}

// Mark only ordinary chat input; system cards and slash commands keep their own types.
Hooks.on("chatMessage", (_log, message, data) => {
  if (shouldHideDueToStreamView()) return;
  if (!message.trim() || message.split(/\r?\n/).some(line => /^\s*[/!?]/.test(line))) return;
  if (isRollMessage(data) || isWhisperMessage(data) || data.blind) return;
  if (data.type != null && ![CONST.CHAT_MESSAGE_TYPES.IC, CONST.CHAT_MESSAGE_TYPES.OOC].includes(data.type)) return;

  const token = getControlledTokenDocument();
  if (!token?.actor) return;
  const speaker = ChatMessage.getSpeaker({token, actor: token.actor, scene: token.parent ?? canvas.scene});
  data.type = CONST.CHAT_MESSAGE_TYPES.IC;
  data.speaker = speaker;
  data.flags ??= {};
  data.flags["tabbed-chatlog"] ??= {};
  data.flags["tabbed-chatlog"].chatInput = {type: data.type, speaker};
});

function getPolyglotLanguage(chatMessage, data = {}) {
  return getMessageFlags(chatMessage, data)?.polyglot?.language;
}

function getAbsoluteAssetUrl(src) {
  if (!src) return "";
  if (/^(https?:)?\/\//i.test(src) || src.startsWith("data:")) return src;

  const routed = globalThis.foundry?.utils?.getRoute ? foundry.utils.getRoute(src) : src;
  if (/^(https?:)?\/\//i.test(routed)) return routed;

  return new URL(routed, window.location.origin + "/").href;
}

// Apply current tab + per-scene visibility to an existing message element
function applyVisibilityToMessageElement(message, $el) {
  if (!isMessageVisible(message)) {
    $el.css("display", "none");
    $el.addClass("hardHide");
    return;
  }

  $el.css("display", "");
  $el.removeClass("hardHide");
}

function getMessageTab(msg) {
  const style = getMessageStyle(msg);

  // Whisper routing based on setting
  if (isWhisperMessage(msg)) {
    const whispersInIC = game.settings.get("tabbed-chatlog", "icWhispers");
    return whispersInIC ? "ic" : "ooc";
  }

  if (isRollMessage(msg) || style === CONST.CHAT_MESSAGE_TYPES.OTHER) return "rolls";
  if (style === CONST.CHAT_MESSAGE_TYPES.IC || style === CONST.CHAT_MESSAGE_TYPES.EMOTE) return "ic";
  return "ooc";
}



function isMessageTypeVisible(messageOrStyle) {
  return getMessageTab(typeof messageOrStyle === "object" ? messageOrStyle : {type: messageOrStyle}) === currentTab;
}



function isMessageVisible(message) {
  if (message.visible === false) return false;
  if (getMessageTab(message) !== currentTab) return false;
  if (isWhisperMessage(message) || getMessageStyle(message) === CONST.CHAT_MESSAGE_TYPES.OOC) return true;
  const sceneId = message.speaker?.scene;
  return !game.settings.get("tabbed-chatlog", "perScene") || !sceneId || sceneId === getViewedSceneId();
}



function setClassVisibility(cssClass, visible) {
    if (visible) {
        cssClass.removeClass("hardHide");
        cssClass.show();
    } else
        cssClass.hide();
};

Hooks.on("renderChatLog", async function (chatLog, html, user) {

    html = $(html);

    if (shouldHideDueToStreamView()) return;

    html.find("nav.tabbedchatlog").remove();

    let toPrepend = '<nav class="tabbedchatlog tabs">';
    for (const [tab, label] of [["ic", "IC"], ["rolls", "Rolls"], ["ooc", "OOC"]]) {
      toPrepend += `<a class="item ${tab}" data-tab="${tab}">${game.i18n.localize("TC.TABS." + label)}<i id="${tab}Notification" class="notification-pip fas fa-exclamation-circle" style="display: none;"></i></a>`;
    }
    toPrepend += '</nav>';
    html.prepend(toPrepend);

    window.game.tabbedchat = {tabs: {activate: activateTab}};

html.find("nav.tabbedchatlog a.item")
  .off("click.tabbedchatlog")
  .on("click.tabbedchatlog", function (ev) {
    ev.preventDefault();
    ev.stopPropagation();

    activateTab($(this).data("tab"));

  });

// Filter messages that were already rendered before the tabs.
applyFiltersToChatLog();
  // Re-apply after ChatLog finishes rendering.
  setTimeout(() => {
    try {
      $("#chat-log").children("li.chat-message").each(function() {
        const $li = $(this);
        const mid = $li.data("messageId") || $li.attr("data-message-id");
        const msg = mid ? game.messages.get(mid) : null;
        if (msg) applyVisibilityToMessageElement(msg, $li);
      });
    } catch (err) {
      console.warn("tabbed-chatlog: failed to re-apply chat filters", err);
    }
  }, 0);


    $("[data-tab=\"chat\"]").click(() => {
        setTimeout(() => $(".item." + currentTab).addClass("active"), 100);
    });
});

Hooks.on("renderChatMessage", (chatMessage, html, context) => {
  if (shouldHideDueToStreamView()) return;

  const $html = $(html);

  // Tag message with style class (keeps old "typeX" selector working)
  const style = getMessageStyle(chatMessage);
  if (style !== null && style !== undefined) $html.addClass("type" + style);

  // Per-scene tagging
  const perScene = game.settings.get("tabbed-chatlog", "perScene");
  const msgSceneId = chatMessage?.speaker?.scene ?? null;
  if (perScene && msgSceneId) {
    $html.addClass("scenespecific");
    $html.addClass("scene" + msgSceneId);
  }

  // Apply visibility now (important on chat rerenders, e.g. token selection)
  applyVisibilityToMessageElement(chatMessage, $html);
});



Hooks.on("diceSoNiceRollComplete", (id) => {
    if (currentTab != "rolls") {
        $("#chat-log .message[data-message-id=" + id + "]").css("display", "none");
    }
});

function activateTab(tab) {
  if (!["ic", "rolls", "ooc"].includes(tab)) return;
  currentTab = tab;
  applyFiltersToChatLog();
  ui.chat?.scrollBottom?.();
}

Hooks.on("createChatMessage", message => {
  if (shouldHideDueToStreamView() || message.visible === false) return;
  const tab = getMessageTab(message);
  const sceneId = message.speaker?.scene;
  const scoped = !isWhisperMessage(message) && getMessageStyle(message) !== CONST.CHAT_MESSAGE_TYPES.OOC;
  if (scoped && game.settings.get("tabbed-chatlog", "perScene") && sceneId && sceneId !== getViewedSceneId()) return;
  if (tab === currentTab) return;
  if (game.settings.get("tabbed-chatlog", "autoNavigate")) activateTab(tab);
  else $("#" + tab + "Notification").show();
});

Hooks.on("preCreateChatMessage", (chatMessage, data = {}, options, userId) => {
    if (shouldHideDueToStreamView()) return;
    let style = getMessageStyle(chatMessage) ?? getMessageStyle(data);
    let speaker = getPendingSpeaker(chatMessage, data);
    const selectedToken = getControlledTokenDocument();
    const input = getMessageFlags(chatMessage, data)?.["tabbed-chatlog"]?.chatInput;

    if (input?.type === CONST.CHAT_MESSAGE_TYPES.IC && input.speaker?.actor
        && style === CONST.CHAT_MESSAGE_TYPES.OOC && !isRollMessage(chatMessage)
        && !isWhisperMessage(chatMessage) && !chatMessage.blind) {
        speaker = input.speaker;
        updatePendingChatMessage(chatMessage, data, {
            type: CONST.CHAT_MESSAGE_TYPES.IC,
            speaker
        });
        style = CONST.CHAT_MESSAGE_TYPES.IC;
    }

    if (game.settings.get('tabbed-chatlog', 'icChatInOoc') && currentTab == "ooc") {
        if (style == CONST.CHAT_MESSAGE_TYPES.IC && !selectedToken) {
            const user = getMessageUser(chatMessage, data);
            speaker = {scene: null, actor: null, token: null, alias: user?.name ?? game.user?.name ?? ""};
            updatePendingChatMessage(chatMessage, data, {
                type: CONST.CHAT_MESSAGE_TYPES.OOC,
                speaker
            });
            style = CONST.CHAT_MESSAGE_TYPES.OOC;
        }
    }

    if (style == CONST.CHAT_MESSAGE_TYPES.OTHER || style == CONST.CHAT_MESSAGE_TYPES.ROLL || isRollMessage(data)) {

    } else if (style == CONST.CHAT_MESSAGE_TYPES.IC || style == CONST.CHAT_MESSAGE_TYPES.EMOTE) {
        try {
            speaker = ensureIcSpeaker(chatMessage, data, style);
            let scene = getSceneForSpeaker(speaker);
            let webhook = scene?.getFlag?.("tabbed-chatlog", "webhook");

            if (webhook == undefined || webhook == "") {
                webhook = game.settings.get("tabbed-chatlog", "icBackupWebhook");
            }

            if (webhook == undefined || webhook == "") {
                return;
            }

            var actor = loadActorForChatMessage(speaker);
            const user = getMessageUser(chatMessage, data);
            let img = "";
            let name = "";
            if (actor) {
                img = generatePortraitImageElement(actor, speaker);
                name = speaker?.alias ?? actor.name;
            } else {
                img = user?.avatar ?? "";
                name = speaker?.alias ?? user?.name ?? "";
            }

            img = getAbsoluteAssetUrl(img);

            if (!isWhisperMessage(chatMessage) && !isWhisperMessage(data) && !chatMessage.blind) {
                let message = getMessageContent(chatMessage, data);
                if (game.modules.get("polyglot")?.active) {
                    const LanguageProvider = polyglot.polyglot.LanguageProvider;
                    let lang = getPolyglotLanguage(chatMessage, data);
                    if (lang && lang != LanguageProvider.defaultLanguage) {
                        message = LanguageProvider.languages[lang] + ": ||" + message + "||";
                    }
                }
                sendToDiscord(webhook, {
                    content: turndown.turndown(message),
                    username: name,
                    avatar_url: img
                });
            }
        } catch (error) {
            console.error(error);
        }
    } else {
        try {
            let webhook = game.settings.get("tabbed-chatlog", "oocWebhook");

            if (webhook == undefined || webhook == "") {
                return;
            }

            const user = getMessageUser(chatMessage, data);
            let img = getAbsoluteAssetUrl(user?.avatar ?? "");

            if (!isWhisperMessage(chatMessage) && !isWhisperMessage(data) && !chatMessage.blind) {
                let message = getMessageContent(chatMessage, data);
                if (game.modules.get("polyglot")?.active) {
                    let lang = getPolyglotLanguage(chatMessage, data);
                    const LanguageProvider = polyglot.polyglot.LanguageProvider;
                    if (lang && lang != LanguageProvider.defaultLanguage) {
                        message = LanguageProvider.languages[lang] + ": ||" + message + "||";
                    }
                }
                sendToDiscord(webhook, {
                    content: turndown.turndown(message),
                    username: user?.name ?? game.user?.name ?? "",
                    avatar_url: img
                });
            }
        } catch (error) {
            console.error(error);
        }
    }
});

function sendToDiscord(webhook, body) {
    $.ajax({
        type: 'POST',
        url: webhook,
        data: JSON.stringify(body),
        success: function (data) {
        },
        contentType: "application/json",
        dataType: 'json'
    });
}

function loadActorForChatMessage(speaker) {
    if (!speaker) return null;

    var actor = ChatMessage.getSpeakerActor?.(speaker) ?? null;
    if (actor) return actor;

    const token = getTokenDocumentForSpeaker(speaker);
    if (token?.actor) return token.actor;

    if (speaker.actor) actor = game.actors.get(speaker.actor);
    if (!actor && speaker.alias) {
        game.actors.forEach((value) => {
            if (value.name === speaker.alias) {
                actor = value;
            }
        });
    }
    return actor ?? null;
}

function getTokenDocumentForSpeaker(speaker) {
    if (!speaker?.token) return null;

    const scene = getSceneForSpeaker(speaker);
    const sceneToken = scene?.tokens?.get?.(speaker.token);
    if (sceneToken) return sceneToken;

    const canvasToken = canvas?.tokens?.get?.(speaker.token);
    return canvasToken?.document ?? canvasToken ?? null;
}

function generatePortraitImageElement(actor, speaker) {
    const token = getTokenDocumentForSpeaker(speaker);
    return token?.texture?.src
        ?? token?.data?.img
        ?? actor?.prototypeToken?.texture?.src
        ?? actor?.token?.texture?.src
        ?? actor?.token?.data?.img
        ?? actor?.data?.token?.img
        ?? actor?.img
        ?? "";
}

Hooks.on("renderSceneNavigation", (_sceneNav, _html, _data) => {
  if (shouldHideDueToStreamView()) return;
  applyFiltersToChatLog();
});

Hooks.on("canvasReady", () => {
  if (!shouldHideDueToStreamView()) applyFiltersToChatLog();
});


Hooks.on("renderSceneConfig", (app, html) => {
  if (app.object.compendium) return;
  html = $(html);
  if (html.find('input[name="flags.tabbed-chatlog.webhook"]').length) return;
  const group = $('<div class="form-group"></div>');
  $("<label></label>").text(game.i18n.localize("TC.SETTINGS.IcSceneWebhookName")).appendTo(group);
  $("<input>").attr({type: "url", name: "flags.tabbed-chatlog.webhook", placeholder: "Webhook"})
    .val(app.object.getFlag("tabbed-chatlog", "webhook") ?? "").appendTo(group);
  $('<p class="notes"></p>').text(game.i18n.localize("TC.SETTINGS.IcSceneWebhookHint")).appendTo(group);
  const basic = html.find('.tab[data-tab="basic"]').first();
  (basic.length ? basic : html.find(".form-group").last().parent()).append(group);
});


Hooks.on('collapseSidebar', (sidebar, collapsing) => {
    if (!collapsing) {
        setALLTabsNotifyProperties();
    }

});


Hooks.on('ready', () => {
    if (game.modules.get('narrator-tools')?.active && globalThis.NarratorTools) {
        NarratorTools._msgtype = CONST.CHAT_MESSAGE_TYPES.IC;
    }

    turndown = new TurndownService();

    const sidebar = document.querySelector('#sidebar');
    if (!sidebar) return;

    sidebar.addEventListener("mousedown", sidebarMouseDown, false);

    function sidebarMouseDown() {
        sidebar.addEventListener("mousemove", sidebarMouseMove, false);
        sidebar.addEventListener("mouseup", sidebarMouseUp, false);
    }

    function sidebarMouseUp() {
        sidebar.removeEventListener("mousemove", sidebarMouseMove, false);
        sidebar.removeEventListener("mouseup", sidebarMouseUp, false);
    }

    function sidebarMouseMove() {
        setALLTabsNotifyProperties();
    }


});

function setICNotifyProperties() {
    $("#icNotification").css({right: "4px"});
};

function setRollsNotifyProperties() {
    $("#rollsNotification").css({right: "4px"});
};

function setOOCNotifyProperties() {
    $("#oocNotification").css({right: "4px"});
};

function setALLTabsNotifyProperties() {
    setICNotifyProperties();
    setRollsNotifyProperties();
    setOOCNotifyProperties();
}


function shouldHideDueToStreamView() {
    if (game.settings.get("tabbed-chatlog", "hideInStreamView")) {
        if (window.location.href.endsWith("/stream")) {
            return true;
        }
    }
    return false;
}

//The Localization here should probably be improved
const MessagesCollection = globalThis.Messages ?? globalThis.foundry?.documents?.collections?.ChatMessages;
if (MessagesCollection?.prototype) {
    MessagesCollection.prototype.flush = async function () {
        return Dialog.confirm({
            title: game.i18n.localize("CHAT.FlushTitle"),
            content: game.i18n.localize("CHAT.FlushWarning"),
            yes: () => ChatMessage.deleteDocuments([...game.messages].filter(entity => isMessageVisible(entity)).map(message => message.id)),
            options: {
                top: window.innerHeight - 150,
                left: window.innerWidth - 720
            }
        });
    };
}


Hooks.on('init', () => {

    game.settings.register('tabbed-chatlog', 'oocWebhook', {
        name: game.i18n.localize("TC.SETTINGS.OocWebhookName"),
        hint: game.i18n.localize("TC.SETTINGS.OocWebhookHint"),
        scope: 'world',
        config: true,
        default: '',
        type: String,
    });

    game.settings.register('tabbed-chatlog', 'icBackupWebhook', {
        name: game.i18n.localize("TC.SETTINGS.IcFallbackWebhookName"),
        hint: game.i18n.localize("TC.SETTINGS.IcFallbackWebhookHint"),
        scope: 'world',
        config: true,
        default: '',
        type: String,
    });

    game.settings.register('tabbed-chatlog', 'icChatInOoc', {
        name: game.i18n.localize("TC.SETTINGS.IcChatInOocName"),
        hint: game.i18n.localize("TC.SETTINGS.IcChatInOocHint"),
        scope: 'world',
        config: true,
        default: true,
        type: Boolean,
    });

    game.settings.register('tabbed-chatlog', 'hideInStreamView', {
        name: game.i18n.localize("TC.SETTINGS.HideInStreamViewName"),
        hint: game.i18n.localize("TC.SETTINGS.HideInStreamViewHint"),
        scope: 'world',
        config: true,
        default: true,
        type: Boolean,
    });

    game.settings.register('tabbed-chatlog', 'perScene', {
        name: game.i18n.localize("TC.SETTINGS.PerSceneName"),
        hint: game.i18n.localize("TC.SETTINGS.PerSceneHint"),
        scope: 'world',
        config: true,
        default: true,
        type: Boolean,
    });

    game.settings.register('tabbed-chatlog', 'icWhispers', {
        name: game.i18n.localize("TC.SETTINGS.IcWhispersName"),
        hint: game.i18n.localize("TC.SETTINGS.IcWhispersHint"),
        scope: 'world',
        config: true,
        default: false,
        type: Boolean,
    });

    game.settings.register('tabbed-chatlog', 'autoNavigate', {
        name: game.i18n.localize("TC.SETTINGS.AutoNavigateName"),
        hint: game.i18n.localize("TC.SETTINGS.AutoNavigateHint"),
        scope: 'client',
        config: true,
        default: false,
        type: Boolean,
    });

    salonEnabled = game.modules.get("salon")?.active ?? false;
});


//#region Turndown

var TurndownService = (function () {
    'use strict';

    function extend(destination) {
        for (var i = 1; i < arguments.length; i++) {
            var source = arguments[i];
            for (var key in source) {
                if (source.hasOwnProperty(key)) destination[key] = source[key];
            }
        }
        return destination
    }

    function repeat(character, count) {
        return Array(count + 1).join(character)
    }

    var blockElements = [
        'address', 'article', 'aside', 'audio', 'blockquote', 'body', 'canvas',
        'center', 'dd', 'dir', 'div', 'dl', 'dt', 'fieldset', 'figcaption',
        'figure', 'footer', 'form', 'frameset', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'header', 'hgroup', 'hr', 'html', 'isindex', 'li', 'main', 'menu', 'nav',
        'noframes', 'noscript', 'ol', 'output', 'p', 'pre', 'section', 'table',
        'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'ul'
    ];

    function isBlock(node) {
        return blockElements.indexOf(node.nodeName.toLowerCase()) !== -1
    }

    var voidElements = [
        'area', 'base', 'br', 'col', 'command', 'embed', 'hr', 'img', 'input',
        'keygen', 'link', 'meta', 'param', 'source', 'track', 'wbr'
    ];

    function isVoid(node) {
        return voidElements.indexOf(node.nodeName.toLowerCase()) !== -1
    }

    var voidSelector = voidElements.join();

    function hasVoid(node) {
        return node.querySelector && node.querySelector(voidSelector)
    }

    var rules = {};

    rules.paragraph = {
        filter: 'p',

        replacement: function (content) {
            return '\n\n' + content + '\n\n'
        }
    };

    rules.lineBreak = {
        filter: 'br',

        replacement: function (content, node, options) {
            return options.br + '\n'
        }
    };

    rules.heading = {
        filter: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],

        replacement: function (content, node, options) {
            var hLevel = Number(node.nodeName.charAt(1));

            if (options.headingStyle === 'setext' && hLevel < 3) {
                var underline = repeat((hLevel === 1 ? '=' : '-'), content.length);
                return (
                    '\n\n' + content + '\n' + underline + '\n\n'
                )
            } else {
                return '\n\n' + repeat('#', hLevel) + ' ' + content + '\n\n'
            }
        }
    };

    rules.blockquote = {
        filter: 'blockquote',

        replacement: function (content) {
            content = content.replace(/^\n+|\n+$/g, '');
            content = content.replace(/^/gm, '> ');
            return '\n\n' + content + '\n\n'
        }
    };

    rules.list = {
        filter: ['ul', 'ol'],

        replacement: function (content, node) {
            var parent = node.parentNode;
            if (parent.nodeName === 'LI' && parent.lastElementChild === node) {
                return '\n' + content
            } else {
                return '\n\n' + content + '\n\n'
            }
        }
    };

    rules.listItem = {
        filter: 'li',

        replacement: function (content, node, options) {
            content = content
                .replace(/^\n+/, '') // remove leading newlines
                .replace(/\n+$/, '\n') // replace trailing newlines with just a single one
                .replace(/\n/gm, '\n    '); // indent
            var prefix = options.bulletListMarker + '   ';
            var parent = node.parentNode;
            if (parent.nodeName === 'OL') {
                var start = parent.getAttribute('start');
                var index = Array.prototype.indexOf.call(parent.children, node);
                prefix = (start ? Number(start) + index : index + 1) + '.  ';
            }
            return (
                prefix + content + (node.nextSibling && !/\n$/.test(content) ? '\n' : '')
            )
        }
    };

    rules.indentedCodeBlock = {
        filter: function (node, options) {
            return (
                options.codeBlockStyle === 'indented' &&
                node.nodeName === 'PRE' &&
                node.firstChild &&
                node.firstChild.nodeName === 'CODE'
            )
        },

        replacement: function (content, node, options) {
            return (
                '\n\n    ' +
                node.firstChild.textContent.replace(/\n/g, '\n    ') +
                '\n\n'
            )
        }
    };

    rules.fencedCodeBlock = {
        filter: function (node, options) {
            return (
                options.codeBlockStyle === 'fenced' &&
                node.nodeName === 'PRE' &&
                node.firstChild &&
                node.firstChild.nodeName === 'CODE'
            )
        },

        replacement: function (content, node, options) {
            var className = node.firstChild.className || '';
            var language = (className.match(/language-(\S+)/) || [null, ''])[1];
            var code = node.firstChild.textContent;

            var fenceChar = options.fence.charAt(0);
            var fenceSize = 3;
            var fenceInCodeRegex = new RegExp('^' + fenceChar + '{3,}', 'gm');

            var match;
            while ((match = fenceInCodeRegex.exec(code))) {
                if (match[0].length >= fenceSize) {
                    fenceSize = match[0].length + 1;
                }
            }

            var fence = repeat(fenceChar, fenceSize);

            return (
                '\n\n' + fence + language + '\n' +
                code.replace(/\n$/, '') +
                '\n' + fence + '\n\n'
            )
        }
    };

    rules.horizontalRule = {
        filter: 'hr',

        replacement: function (content, node, options) {
            return '\n\n' + options.hr + '\n\n'
        }
    };

    rules.inlineLink = {
        filter: function (node, options) {
            return (
                options.linkStyle === 'inlined' &&
                node.nodeName === 'A' &&
                node.getAttribute('href')
            )
        },

        replacement: function (content, node) {
            var href = node.getAttribute('href');
            var title = node.title ? ' "' + node.title + '"' : '';
            return '[' + content + '](' + href + title + ')'
        }
    };

    rules.referenceLink = {
        filter: function (node, options) {
            return (
                options.linkStyle === 'referenced' &&
                node.nodeName === 'A' &&
                node.getAttribute('href')
            )
        },

        replacement: function (content, node, options) {
            var href = node.getAttribute('href');
            var title = node.title ? ' "' + node.title + '"' : '';
            var replacement;
            var reference;

            switch (options.linkReferenceStyle) {
                case 'collapsed':
                    replacement = '[' + content + '][]';
                    reference = '[' + content + ']: ' + href + title;
                    break
                case 'shortcut':
                    replacement = '[' + content + ']';
                    reference = '[' + content + ']: ' + href + title;
                    break
                default:
                    var id = this.references.length + 1;
                    replacement = '[' + content + '][' + id + ']';
                    reference = '[' + id + ']: ' + href + title;
            }

            this.references.push(reference);
            return replacement
        },

        references: [],

        append: function (options) {
            var references = '';
            if (this.references.length) {
                references = '\n\n' + this.references.join('\n') + '\n\n';
                this.references = []; // Reset references
            }
            return references
        }
    };

    rules.emphasis = {
        filter: ['em', 'i'],

        replacement: function (content, node, options) {
            if (!content.trim()) return ''
            return options.emDelimiter + content + options.emDelimiter
        }
    };

    rules.strong = {
        filter: ['strong', 'b'],

        replacement: function (content, node, options) {
            if (!content.trim()) return ''
            return options.strongDelimiter + content + options.strongDelimiter
        }
    };

    rules.code = {
        filter: function (node) {
            var hasSiblings = node.previousSibling || node.nextSibling;
            var isCodeBlock = node.parentNode.nodeName === 'PRE' && !hasSiblings;

            return node.nodeName === 'CODE' && !isCodeBlock
        },

        replacement: function (content) {
            if (!content.trim()) return ''

            var delimiter = '`';
            var leadingSpace = '';
            var trailingSpace = '';
            var matches = content.match(/`+/gm);
            if (matches) {
                if (/^`/.test(content)) leadingSpace = ' ';
                if (/`$/.test(content)) trailingSpace = ' ';
                while (matches.indexOf(delimiter) !== -1) delimiter = delimiter + '`';
            }

            return delimiter + leadingSpace + content + trailingSpace + delimiter
        }
    };

    rules.image = {
        filter: 'img',

        replacement: function (content, node) {
            var alt = node.alt || '';
            var src = node.getAttribute('src') || '';
            var title = node.title || '';
            var titlePart = title ? ' "' + title + '"' : '';
            return src ? '![' + alt + ']' + '(' + src + titlePart + ')' : ''
        }
    };

    /**
     * Manages a collection of rules used to convert HTML to Markdown
     */

    function Rules(options) {
        this.options = options;
        this._keep = [];
        this._remove = [];

        this.blankRule = {
            replacement: options.blankReplacement
        };

        this.keepReplacement = options.keepReplacement;

        this.defaultRule = {
            replacement: options.defaultReplacement
        };

        this.array = [];
        for (var key in options.rules) this.array.push(options.rules[key]);
    }

    Rules.prototype = {
        add: function (key, rule) {
            this.array.unshift(rule);
        },

        keep: function (filter) {
            this._keep.unshift({
                filter: filter,
                replacement: this.keepReplacement
            });
        },

        remove: function (filter) {
            this._remove.unshift({
                filter: filter,
                replacement: function () {
                    return ''
                }
            });
        },

        forNode: function (node) {
            if (node.isBlank) return this.blankRule
            var rule;

            if ((rule = findRule(this.array, node, this.options))) return rule
            if ((rule = findRule(this._keep, node, this.options))) return rule
            if ((rule = findRule(this._remove, node, this.options))) return rule

            return this.defaultRule
        },

        forEach: function (fn) {
            for (var i = 0; i < this.array.length; i++) fn(this.array[i], i);
        }
    };

    function findRule(rules, node, options) {
        for (var i = 0; i < rules.length; i++) {
            var rule = rules[i];
            if (filterValue(rule, node, options)) return rule
        }
        return void 0
    }

    function filterValue(rule, node, options) {
        var filter = rule.filter;
        if (typeof filter === 'string') {
            if (filter === node.nodeName.toLowerCase()) return true
        } else if (Array.isArray(filter)) {
            if (filter.indexOf(node.nodeName.toLowerCase()) > -1) return true
        } else if (typeof filter === 'function') {
            if (filter.call(rule, node, options)) return true
        } else {
            throw new TypeError('`filter` needs to be a string, array, or function')
        }
    }

    /**
     * The collapseWhitespace function is adapted from collapse-whitespace
     * by Luc Thevenard.
     *
     * The MIT License (MIT)
     *
     * Copyright (c) 2014 Luc Thevenard <lucthevenard@gmail.com>
     *
     * Permission is hereby granted, free of charge, to any person obtaining a copy
     * of this software and associated documentation files (the "Software"), to deal
     * in the Software without restriction, including without limitation the rights
     * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
     * copies of the Software, and to permit persons to whom the Software is
     * furnished to do so, subject to the following conditions:
     *
     * The above copyright notice and this permission notice shall be included in
     * all copies or substantial portions of the Software.
     *
     * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
     * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
     * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
     * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
     * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
     * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
     * THE SOFTWARE.
     */

    /**
     * collapseWhitespace(options) removes extraneous whitespace from an the given element.
     *
     * @param {Object} options
     */
    function collapseWhitespace(options) {
        var element = options.element;
        var isBlock = options.isBlock;
        var isVoid = options.isVoid;
        var isPre = options.isPre || function (node) {
            return node.nodeName === 'PRE'
        };

        if (!element.firstChild || isPre(element)) return

        var prevText = null;
        var prevVoid = false;

        var prev = null;
        var node = next(prev, element, isPre);

        while (node !== element) {
            if (node.nodeType === 3 || node.nodeType === 4) { // Node.TEXT_NODE or Node.CDATA_SECTION_NODE
                var text = node.data.replace(/[ \r\n\t]+/g, ' ');

                if ((!prevText || / $/.test(prevText.data)) &&
                    !prevVoid && text[0] === ' ') {
                    text = text.substr(1);
                }

                // `text` might be empty at this point.
                if (!text) {
                    node = remove(node);
                    continue
                }

                node.data = text;

                prevText = node;
            } else if (node.nodeType === 1) { // Node.ELEMENT_NODE
                if (isBlock(node) || node.nodeName === 'BR') {
                    if (prevText) {
                        prevText.data = prevText.data.replace(/ $/, '');
                    }

                    prevText = null;
                    prevVoid = false;
                } else if (isVoid(node)) {
                    // Avoid trimming space around non-block, non-BR void elements.
                    prevText = null;
                    prevVoid = true;
                }
            } else {
                node = remove(node);
                continue
            }

            var nextNode = next(prev, node, isPre);
            prev = node;
            node = nextNode;
        }

        if (prevText) {
            prevText.data = prevText.data.replace(/ $/, '');
            if (!prevText.data) {
                remove(prevText);
            }
        }
    }

    /**
     * remove(node) removes the given node from the DOM and returns the
     * next node in the sequence.
     *
     * @param {Node} node
     * @return {Node} node
     */
    function remove(node) {
        var next = node.nextSibling || node.parentNode;

        node.parentNode.removeChild(node);

        return next
    }

    /**
     * next(prev, current, isPre) returns the next node in the sequence, given the
     * current and previous nodes.
     *
     * @param {Node} prev
     * @param {Node} current
     * @param {Function} isPre
     * @return {Node}
     */
    function next(prev, current, isPre) {
        if ((prev && prev.parentNode === current) || isPre(current)) {
            return current.nextSibling || current.parentNode
        }

        return current.firstChild || current.nextSibling || current.parentNode
    }

    /*
     * Set up window for Node.js
     */

    var root = (typeof window !== 'undefined' ? window : {});

    /*
     * Parsing HTML strings
     */

    function canParseHTMLNatively() {
        var Parser = root.DOMParser;
        var canParse = false;

        // Adapted from https://gist.github.com/1129031
        // Firefox/Opera/IE throw errors on unsupported types
        try {
            // WebKit returns null on unsupported types
            if (new Parser().parseFromString('', 'text/html')) {
                canParse = true;
            }
        } catch (e) {
        }

        return canParse
    }

    function createHTMLParser() {
        var Parser = function () {
        };

        {
            if (shouldUseActiveX()) {
                Parser.prototype.parseFromString = function (string) {
                    var doc = new window.ActiveXObject('htmlfile');
                    doc.designMode = 'on'; // disable on-page scripts
                    doc.open();
                    doc.write(string);
                    doc.close();
                    return doc
                };
            } else {
                Parser.prototype.parseFromString = function (string) {
                    var doc = document.implementation.createHTMLDocument('');
                    doc.open();
                    doc.write(string);
                    doc.close();
                    return doc
                };
            }
        }
        return Parser
    }

    function shouldUseActiveX() {
        var useActiveX = false;
        try {
            document.implementation.createHTMLDocument('').open();
        } catch (e) {
            if (window.ActiveXObject) useActiveX = true;
        }
        return useActiveX
    }

    var HTMLParser = canParseHTMLNatively() ? root.DOMParser : createHTMLParser();

    function RootNode(input) {
        var root;
        if (typeof input === 'string') {
            var doc = htmlParser().parseFromString(
                // DOM parsers arrange elements in the <head> and <body>.
                // Wrapping in a custom element ensures elements are reliably arranged in
                // a single element.
                '<x-turndown id="turndown-root">' + input + '</x-turndown>',
                'text/html'
            );
            root = doc.getElementById('turndown-root');
        } else {
            root = input.cloneNode(true);
        }
        collapseWhitespace({
            element: root,
            isBlock: isBlock,
            isVoid: isVoid
        });

        return root
    }

    var _htmlParser;

    function htmlParser() {
        _htmlParser = _htmlParser || new HTMLParser();
        return _htmlParser
    }

    function Node(node) {
        node.isBlock = isBlock(node);
        node.isCode = node.nodeName.toLowerCase() === 'code' || node.parentNode.isCode;
        node.isBlank = isBlank(node);
        node.flankingWhitespace = flankingWhitespace(node);
        return node
    }

    function isBlank(node) {
        return (
            ['A', 'TH', 'TD', 'IFRAME', 'SCRIPT', 'AUDIO', 'VIDEO'].indexOf(node.nodeName) === -1 &&
            /^\s*$/i.test(node.textContent) &&
            !isVoid(node) &&
            !hasVoid(node)
        )
    }

    function flankingWhitespace(node) {
        var leading = '';
        var trailing = '';

        if (!node.isBlock) {
            var hasLeading = /^\s/.test(node.textContent);
            var hasTrailing = /\s$/.test(node.textContent);
            var blankWithSpaces = node.isBlank && hasLeading && hasTrailing;

            if (hasLeading && !isFlankedByWhitespace('left', node)) {
                leading = ' ';
            }

            if (!blankWithSpaces && hasTrailing && !isFlankedByWhitespace('right', node)) {
                trailing = ' ';
            }
        }

        return {leading: leading, trailing: trailing}
    }

    function isFlankedByWhitespace(side, node) {
        var sibling;
        var regExp;
        var isFlanked;

        if (side === 'left') {
            sibling = node.previousSibling;
            regExp = / $/;
        } else {
            sibling = node.nextSibling;
            regExp = /^ /;
        }

        if (sibling) {
            if (sibling.nodeType === 3) {
                isFlanked = regExp.test(sibling.nodeValue);
            } else if (sibling.nodeType === 1 && !isBlock(sibling)) {
                isFlanked = regExp.test(sibling.textContent);
            }
        }
        return isFlanked
    }

    var reduce = Array.prototype.reduce;
    var leadingNewLinesRegExp = /^\n*/;
    var trailingNewLinesRegExp = /\n*$/;
    var escapes = [
        [/\\/g, '\\\\'],
        [/\*/g, '\\*'],
        [/^-/g, '\\-'],
        [/^\+ /g, '\\+ '],
        [/^(=+)/g, '\\$1'],
        [/^(#{1,6}) /g, '\\$1 '],
        [/`/g, '\\`'],
        [/^~~~/g, '\\~~~'],
        [/\[/g, '\\['],
        [/\]/g, '\\]'],
        [/^>/g, '\\>'],
        [/_/g, '\\_'],
        [/^(\d+)\. /g, '$1\\. ']
    ];

    function TurndownService(options) {
        if (!(this instanceof TurndownService)) return new TurndownService(options)

        var defaults = {
            rules: rules,
            headingStyle: 'setext',
            hr: '* * *',
            bulletListMarker: '*',
            codeBlockStyle: 'indented',
            fence: '```',
            emDelimiter: '_',
            strongDelimiter: '**',
            linkStyle: 'inlined',
            linkReferenceStyle: 'full',
            br: '  ',
            blankReplacement: function (content, node) {
                return node.isBlock ? '\n\n' : ''
            },
            keepReplacement: function (content, node) {
                return node.isBlock ? '\n\n' + node.outerHTML + '\n\n' : node.outerHTML
            },
            defaultReplacement: function (content, node) {
                return node.isBlock ? '\n\n' + content + '\n\n' : content
            }
        };
        this.options = extend({}, defaults, options);
        this.rules = new Rules(this.options);
    }

    TurndownService.prototype = {
        /**
         * The entry point for converting a string or DOM node to Markdown
         * @public
         * @param {String|HTMLElement} input The string or DOM node to convert
         * @returns A Markdown representation of the input
         * @type String
         */

        turndown: function (input) {
            if (!canConvert(input)) {
                throw new TypeError(
                    input + ' is not a string, or an element/document/fragment node.'
                )
            }

            if (input === '') return ''

            var output = process.call(this, new RootNode(input));
            return postProcess.call(this, output)
        },

        /**
         * Add one or more plugins
         * @public
         * @param {Function|Array} plugin The plugin or array of plugins to add
         * @returns The Turndown instance for chaining
         * @type Object
         */

        use: function (plugin) {
            if (Array.isArray(plugin)) {
                for (var i = 0; i < plugin.length; i++) this.use(plugin[i]);
            } else if (typeof plugin === 'function') {
                plugin(this);
            } else {
                throw new TypeError('plugin must be a Function or an Array of Functions')
            }
            return this
        },

        /**
         * Adds a rule
         * @public
         * @param {String} key The unique key of the rule
         * @param {Object} rule The rule
         * @returns The Turndown instance for chaining
         * @type Object
         */

        addRule: function (key, rule) {
            this.rules.add(key, rule);
            return this
        },

        /**
         * Keep a node (as HTML) that matches the filter
         * @public
         * @param {String|Array|Function} filter The unique key of the rule
         * @returns The Turndown instance for chaining
         * @type Object
         */

        keep: function (filter) {
            this.rules.keep(filter);
            return this
        },

        /**
         * Remove a node that matches the filter
         * @public
         * @param {String|Array|Function} filter The unique key of the rule
         * @returns The Turndown instance for chaining
         * @type Object
         */

        remove: function (filter) {
            this.rules.remove(filter);
            return this
        },

        /**
         * Escapes Markdown syntax
         * @public
         * @param {String} string The string to escape
         * @returns A string with Markdown syntax escaped
         * @type String
         */

        escape: function (string) {
            return escapes.reduce(function (accumulator, escape) {
                return accumulator.replace(escape[0], escape[1])
            }, string)
        }
    };

    /**
     * Reduces a DOM node down to its Markdown string equivalent
     * @private
     * @param {HTMLElement} parentNode The node to convert
     * @returns A Markdown representation of the node
     * @type String
     */

    function process(parentNode) {
        var self = this;
        return reduce.call(parentNode.childNodes, function (output, node) {
            node = new Node(node);

            var replacement = '';
            if (node.nodeType === 3) {
                replacement = node.isCode ? node.nodeValue : self.escape(node.nodeValue);
            } else if (node.nodeType === 1) {
                replacement = replacementForNode.call(self, node);
            }

            return join(output, replacement)
        }, '')
    }

    /**
     * Appends strings as each rule requires and trims the output
     * @private
     * @param {String} output The conversion output
     * @returns A trimmed version of the ouput
     * @type String
     */

    function postProcess(output) {
        var self = this;
        this.rules.forEach(function (rule) {
            if (typeof rule.append === 'function') {
                output = join(output, rule.append(self.options));
            }
        });

        return output.replace(/^[\t\r\n]+/, '').replace(/[\t\r\n\s]+$/, '')
    }

    /**
     * Converts an element node to its Markdown equivalent
     * @private
     * @param {HTMLElement} node The node to convert
     * @returns A Markdown representation of the node
     * @type String
     */

    function replacementForNode(node) {
        var rule = this.rules.forNode(node);
        var content = process.call(this, node);
        var whitespace = node.flankingWhitespace;
        if (whitespace.leading || whitespace.trailing) content = content.trim();
        return (
            whitespace.leading +
            rule.replacement(content, node, this.options) +
            whitespace.trailing
        )
    }

    /**
     * Determines the new lines between the current output and the replacement
     * @private
     * @param {String} output The current conversion output
     * @param {String} replacement The string to append to the output
     * @returns The whitespace to separate the current output and the replacement
     * @type String
     */

    function separatingNewlines(output, replacement) {
        var newlines = [
            output.match(trailingNewLinesRegExp)[0],
            replacement.match(leadingNewLinesRegExp)[0]
        ].sort();
        var maxNewlines = newlines[newlines.length - 1];
        return maxNewlines.length < 2 ? maxNewlines : '\n\n'
    }

    function join(string1, string2) {
        var separator = separatingNewlines(string1, string2);

        // Remove trailing/leading newlines and replace with separator
        string1 = string1.replace(trailingNewLinesRegExp, '');
        string2 = string2.replace(leadingNewLinesRegExp, '');

        return string1 + separator + string2
    }

    /**
     * Determines whether an input can be converted
     * @private
     * @param {String|HTMLElement} input Describe this parameter
     * @returns Describe what it returns
     * @type String|Object|Array|Boolean|Number
     */

    function canConvert(input) {
        return (
            input != null && (
                typeof input === 'string' ||
                (input.nodeType && (
                    input.nodeType === 1 || input.nodeType === 9 || input.nodeType === 11
                ))
            )
        )
    }

    return TurndownService;

}());

function applyFiltersToChatLog() {
  // Update existing DOM immediately when a tab or viewed scene changes.
  const root =
    document.querySelector("#chat-log") ||
    document.querySelector("#chat-messages") ||
    document;

  const elements = root.querySelectorAll(".chat-message");
  for (const el of elements) {
    // Foundry usually provides data-message-id on the LI. Be tolerant.
    const messageId =
      el.dataset?.messageId ||
      el.getAttribute("data-message-id") ||
      el.getAttribute("data-document-id") ||
      el.getAttribute("data-id");

    const msg = messageId ? game.messages.get(messageId) : null;

    if (msg) {
      // Use the same logic as renderChatMessage so we also clear/add hardHide correctly.
      applyVisibilityToMessageElement(msg, $(el));
      continue;
    }

    // Fallback if we can't resolve the ChatMessage document (should be rare).
    const isRoll = el.classList.contains("type5") || !!el.querySelector(".dice-roll");
    const isOoc = el.classList.contains("type1");
    const isIc = el.classList.contains("type2") || el.classList.contains("type3");

    let show = true;
    if (currentTab === "rolls") show = isRoll;
    else if (currentTab === "ooc") show = isOoc;
    else if (currentTab === "ic") show = isIc;

    if (show) {
      el.classList.remove("hardHide");
      el.style.removeProperty("display");
    } else {
      el.classList.add("hardHide");
      el.style.setProperty("display", "none", "important");
    }
  }

  // Active tab highlight
  document.querySelectorAll("nav.tabbedchatlog a.item").forEach(a => a.classList.remove("active"));
  const active = document.querySelector(`nav.tabbedchatlog a.item[data-tab="${currentTab}"]`);
  if (active) active.classList.add("active");

  // Clear the notification pip for the active tab
  const n = document.getElementById(currentTab + "Notification");
  if (n) n.style.display = "none";
}

//#endregion
