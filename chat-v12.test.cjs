const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

const root = __dirname;
const source = fs.readFileSync(path.join(root, 'tabbed-chatlog.js'), 'utf8');
const TYPES = {OTHER: 0, OOC: 1, IC: 2, EMOTE: 3, WHISPER: 4, ROLL: 5};

function setup() {
  const hooks = new Map();
  const settings = new Map(Object.entries({perScene: true, icWhispers: false, autoNavigate: false,
    hideInStreamView: true, icChatInOoc: true, icBackupWebhook: '', oocWebhook: ''}));
  const messages = new Map();
  const actor = {id: 'actor', name: 'Character', prototypeToken: {texture: {src: 'token.webp'}}};
  const scene = {id: 'scene', tokens: new Map(), getFlag: () => ''};
  const token = {id: 'token', actor, parent: scene, texture: {src: 'token.webp'}};
  scene.tokens.set(token.id, token);
  const user = {id: 'user', name: 'Player', avatar: 'avatar.webp'};
  const nodes = new Map();
  const errors = [];
  const sends = [];
  function element() {
    return {classes: new Set(), styles: {}, length: 1,
      addClass(c) {this.classes.add(c); return this;}, removeClass(c) {this.classes.delete(c); return this;},
      css(k, v) {if (typeof k === 'object') Object.assign(this.styles, k); else this.styles[k] = v; return this;},
      show() {this.styles.display = ''; return this;}, hide() {this.styles.display = 'none'; return this;}};
  }
  const $ = value => {
    if (typeof value !== 'string') return value;
    if (!nodes.has(value)) nodes.set(value, element());
    return nodes.get(value);
  };
  $.ajax = options => sends.push(options);
  const game = {user, system: {id: 'gurps'}, release: {generation: 12},
    settings: {get: (_module, key) => settings.get(key), register: (_module, key, cfg) => {
      if (!settings.has(key)) settings.set(key, cfg.default);
    }},
    messages, users: new Map([[user.id, user]]), actors: new Map([[actor.id, actor]]),
    scenes: Object.assign(new Map([[scene.id, scene]]), {current: scene, active: scene}),
    modules: new Map(), i18n: {localize: key => key}};
  const canvas = {scene, tokens: {controlled: [{document: token}], get: id => id === token.id ? {document: token} : null}};
  const context = vm.createContext({console: {...console, error: (...args) => errors.push(args)},
    $, game, canvas, CONST: {CHAT_MESSAGE_TYPES: TYPES}, URL, setTimeout: () => {},
    document: {querySelector: () => null, querySelectorAll: () => [], getElementById: () => null},
    Hooks: {on: (name, fn) => {if (!hooks.has(name)) hooks.set(name, []); hooks.get(name).push(fn);}},
    Messages: class Messages {}, Dialog: {confirm: options => options.yes()},
    ChatMessage: {getSpeaker: ({token: t = token, actor: a = actor, scene: s = scene} = {}) =>
      ({scene: s.id, actor: a.id, token: t.id, alias: a.name}), getSpeakerActor: () => actor,
      deleteDocuments: async ids => ids},
    ui: {chat: {scrollBottom() {}}}, foundry: {utils: {getRoute: p => '/game/' + p}},
    window: {game, location: {origin: 'https://example.forge-vtt.com', href: 'https://example.forge-vtt.com/game'}}});
  vm.runInContext(source, context);
  vm.runInContext('turndown = {turndown: value => value};', context);
  const call = (name, ...args) => {for (const fn of hooks.get(name) ?? []) fn(...args);};
  const make = (data = {}) => {
    const message = {type: TYPES.OOC, content: 'Hello', speaker: {}, rolls: [], whisper: [],
      blind: false, flags: {}, visible: true, author: user, ...structuredClone(data)};
    message._source = structuredClone(data);
    message.updateSource = updates => {
      assert.equal('style' in updates, false, 'v12 writes must use type, not style');
      Object.assign(message, updates);
      Object.assign(message._source, updates);
    };
    return message;
  };
  const run = expr => vm.runInContext(expr, context);
  return {context, call, make, run, game, canvas, token, settings, hooks, nodes, element, errors, sends};
}

test('loads with v12 constants and the v12 render hook only', () => {
  const s = setup();
  assert(s.hooks.has('renderChatMessage'));
  assert.equal(s.hooks.has('renderChatMessageHTML'), false);
  s.call('init');
  assert.deepEqual(s.errors, []);
});

test('selected-token plain chat persists IC type and actor speaker through GURPS data copying', () => {
  const s = setup();
  const data = {type: TYPES.OOC, content: 'Hello', whisper: []};
  s.call('chatMessage', null, 'Hello', data);
  assert.equal(data.type, TYPES.IC);
  const copied = structuredClone(data);
  copied.type = TYPES.OOC;
  const message = s.make(copied);
  s.call('preCreateChatMessage', message, copied, {}, 'user');
  assert.equal(message.type, TYPES.IC);
  assert.equal(message.speaker.token, 'token');
  assert.equal(message.speaker.actor, 'actor');
  assert.equal(s.run('getMessageTab({type: 2})'), 'ic');
});

for (const command of ['/ooc Hello', '/roll 1d6', '/w GM Hello', '/em waves', '!/roll 1d6', 'Hello\n/roll 1d6']) {
  test('preserves explicit command: ' + command, () => {
    const s = setup();
    const data = {type: TYPES.OOC, content: command};
    s.call('chatMessage', null, command, data);
    const message = s.make(data);
    s.call('preCreateChatMessage', message, data, {}, 'user');
    assert.equal(message.type, TYPES.OOC);
  });
}

test('does not convert programmatic system cards while a token is selected', () => {
  const s = setup();
  const data = {type: TYPES.OOC, content: '<div>GURPS result</div>'};
  const message = s.make(data);
  s.call('preCreateChatMessage', message, data, {}, 'user');
  assert.equal(message.type, TYPES.OOC);
});

test('no token means public OOC stays OOC', () => {
  const s = setup();
  s.canvas.tokens.controlled = [];
  const data = {type: TYPES.OOC};
  s.call('chatMessage', null, 'Hello', data);
  assert.equal(data.type, TYPES.OOC);
});

test('preserves an explicit IC actor supplied by a system or macro', () => {
  const s = setup();
  const data = {type: TYPES.IC, speaker: {actor: 'other', alias: 'Other actor'}};
  const message = s.make(data);
  s.call('preCreateChatMessage', message, data, {}, 'user');
  assert.equal(message.speaker.actor, 'other');
});

test('OOC-tab conversion clears actor, token and scene using updateSource', () => {
  const s = setup();
  s.canvas.tokens.controlled = [];
  s.run('currentTab = "ooc"');
  const data = {type: TYPES.IC, speaker: {actor: 'actor', token: 'token', scene: 'scene'}};
  const message = s.make(data);
  s.call('preCreateChatMessage', message, data, {}, 'user');
  assert.equal(message.type, TYPES.OOC);
  assert.equal(message.speaker.actor, null);
  assert.equal(message.speaker.token, null);
  assert.equal(message.speaker.scene, null);
});

test('roll type without a rolls array still belongs in Rolls', () => {
  const s = setup();
  assert.equal(s.run('getMessageTab({type: 5, rolls: []})'), 'rolls');
  assert.equal(s.run('getMessageTab({type: 0})'), 'rolls');
  assert.equal(s.run('getMessageTab({type: 1, rolls: [{}]})'), 'rolls');
});

test('whisper routing follows icWhispers, including whispered rolls', () => {
  const s = setup();
  assert.equal(s.run('getMessageTab({type: 4})'), 'ooc');
  s.settings.set('icWhispers', true);
  assert.equal(s.run('getMessageTab({type: 5, whisper: ["gm"], rolls: [{}]})'), 'ic');
});

test('per-scene filters apply to IC and rolls; OOC and whispers stay global', () => {
  const s = setup();
  assert.equal(s.run('isMessageVisible({type: 2, speaker: {scene: "other"}})'), false);
  assert.equal(s.run('isMessageVisible({type: 2, speaker: {scene: "scene"}})'), true);
  s.run('currentTab = "rolls"');
  assert.equal(s.run('isMessageVisible({type: 5, speaker: {scene: "other"}})'), false);
  s.run('currentTab = "ooc"');
  assert.equal(s.run('isMessageVisible({type: 1, speaker: {scene: "other"}})'), true);
  assert.equal(s.run('isMessageVisible({type: 4, speaker: {scene: "other"}})'), true);
  s.settings.set('perScene', false);
  s.run('currentTab = "ic"');
  assert.equal(s.run('isMessageVisible({type: 2, speaker: {scene: "other"}})'), true);
});

test('v12 jQuery render hook tags and hides messages and respects core privacy', () => {
  const s = setup();
  const el = s.element();
  s.call('renderChatMessage', s.make({type: TYPES.OOC}), el, {});
  assert(el.classes.has('type1'));
  assert(el.classes.has('hardHide'));
  s.run('currentTab = "ooc"');
  s.call('renderChatMessage', s.make({type: TYPES.OOC}), el, {});
  assert.equal(el.classes.has('hardHide'), false);
  s.call('renderChatMessage', s.make({type: TYPES.OOC, visible: false}), el, {});
  assert(el.classes.has('hardHide'));
});

test('private and blind messages never go to Discord', () => {
  const s = setup();
  s.settings.set('oocWebhook', 'https://example.test/hook');
  for (const data of [{type: TYPES.WHISPER, whisper: ['gm']}, {type: TYPES.OOC, blind: true}]) {
    s.call('preCreateChatMessage', s.make(data), data, {}, 'user');
  }
  assert.equal(s.sends.length, 0);
});

test('auto-navigation uses the real active tab and ignores other scenes and invisible messages', () => {
  const s = setup();
  s.settings.set('autoNavigate', true);
  s.call('createChatMessage', s.make({type: TYPES.ROLL, speaker: {scene: 'other'}}));
  assert.equal(s.run('currentTab'), 'ic');
  s.call('createChatMessage', s.make({type: TYPES.OOC, visible: false}));
  assert.equal(s.run('currentTab'), 'ic');
  s.call('createChatMessage', s.make({type: TYPES.ROLL, speaker: {scene: 'scene'}}));
  assert.equal(s.run('currentTab'), 'rolls');
  assert.deepEqual(s.errors, []);
});

test('Forge routes remain absolute and external asset URLs stay intact', () => {
  const s = setup();
  assert.equal(s.run('getAbsoluteAssetUrl("token.webp")'), 'https://example.forge-vtt.com/game/token.webp');
  assert.equal(s.run('getAbsoluteAssetUrl("https://assets.forge-vtt.com/token.webp")'), 'https://assets.forge-vtt.com/token.webp');
});

test('stream view bypasses message type changes', () => {
  const s = setup();
  s.context.window.location.href += '/stream';
  const data = {type: TYPES.OOC};
  s.call('chatMessage', null, 'Hello', data);
  assert.equal(data.type, TYPES.OOC);
});

test('release manifest is isolated to 12.343 with pinned links and relative assets', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'module.json')));
  assert.deepEqual(manifest.compatibility, {minimum: '12.343', verified: '12.343', maximum: '12.343'});
  assert(manifest.manifest.endsWith('/releases/download/v12-1.6.6/module.json'));
  assert(manifest.download.endsWith('/releases/download/v12-1.6.6/module.zip'));
  for (const p of [...manifest.esmodules, ...manifest.styles, ...manifest.languages.map(l => l.path)]) {
    assert.equal(p.startsWith('/'), false);
    assert(fs.existsSync(path.join(root, p)), p);
  }
});
