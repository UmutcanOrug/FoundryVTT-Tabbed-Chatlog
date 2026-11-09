const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const {stripTypeScriptTypes} = require('node:module');
const dependencyPaths = [process.env.NODE_MODULES_DIR ?? path.join(__dirname, 'node_modules')];
const {chromium} = require(require.resolve('playwright', {paths: dependencyPaths}));
const upstreamCommit = '13ffe799baf2ec3976f78c6e9eb5abf8799bc67d';

async function upstreamFile(relative) {
  const local = path.join(__dirname, '.qa/lancer-source', relative);
  if (fs.existsSync(local)) return fs.readFileSync(local, 'utf8');
  const response = await fetch('https://raw.githubusercontent.com/Eranziel/foundryvtt-lancer/' + upstreamCommit + '/' + relative);
  if (!response.ok) throw new Error('Unable to fetch Lancer fixture: ' + response.status);
  return response.text();
}

function dependencyAsset(name, fallback) {
  try {return require.resolve(name, {paths: dependencyPaths});}
  catch {return path.join(__dirname, '../v12/.qa', fallback);}
}

(async () => {
  const renderer = stripTypeScriptTypes(await upstreamFile('src/module/flows/_render.ts'));
  const template = await upstreamFile('public/templates/chat/stat-roll-card.hbs');
  const importMap = JSON.stringify({imports: {nanoid: 'data:text/javascript,export function nanoid(){return "lancer-fixture";}'}});
  const browser = await chromium.launch({headless: true, ...(process.env.CHROME_PATH ? {executablePath: process.env.CHROME_PATH} : {})});
  try {
    const page = await browser.newPage({viewport: {width: 420, height: 800}});
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    await page.setContent(`<script type="importmap">${importMap}</script>
      <style>body{margin:0;font:14px Arial;background:#181818;color:#eee}#sidebar{width:min(340px,100vw);height:760px}#chat{height:100%;display:flex;flex-direction:column}#chat>*{flex:1}#chat-log{min-height:0;overflow:auto;padding:8px;list-style:none}#chat-form{flex:0 0 64px}#chat-message{width:230px}a{cursor:pointer}.message{margin-bottom:8px;padding:8px;border:1px solid #666;background:#eee;color:#111}.message-header{font-weight:bold}.lancer-header{background:#b42029;color:white;padding:8px}.dice-total{font-size:32px}#warning{color:#ff5b5b}</style>
      <div id="sidebar"><section id="chat"><ol id="chat-log"></ol><form id="chat-form"><input id="chat-message"><button id="send">Send</button><div id="warning"></div></form></section></div>
      <div id="popout"><ol class="chat-log"></ol></div>
      <form id="scene-config"><div class="tab" data-tab="basic"><div class="form-group"><select name="journal"></select></div></div></form>`);
    await page.addScriptTag({path: dependencyAsset('jquery/dist/jquery.min.js', 'jquery.min.js')});
    await page.addScriptTag({path: dependencyAsset('handlebars/dist/handlebars.min.js', 'handlebars.min.js')});
    await page.evaluate(async ({renderer, template}) => {
      window.testHooks = new Map();
      window.Hooks = {on(name, callback) {
        if (!testHooks.has(name)) testHooks.set(name, []);
        testHooks.get(name).push(callback);
      }};
      window.callHook = async (name, ...args) => {
        for (const callback of testHooks.get(name) ?? []) await callback(...args);
      };
      window.CONST = {CHAT_MESSAGE_STYLES: {OTHER: 0, OOC: 1, IC: 2, EMOTE: 3},
        DICE_ROLL_MODES: {BLIND: 'blindroll', PRIVATE: 'gmroll', SELF: 'selfroll'}};
      Object.defineProperty(CONST, 'CHAT_MESSAGE_TYPES', {get() {throw new Error('Deprecated constants accessed');}});
      const scene = {id: 'scene', getFlag: () => ''};
      const token = {id: 'token', name: 'Pilot', parent: scene};
      const actor = {id: 'actor', name: 'Pilot', token};
      token.actor = actor;
      window.game = {release: {generation: 13, build: 351}, user: {id: 'user', name: 'Player', isGM: false},
        system: {id: 'lancer', version: '3.1.3'}, messages: new Map(), modules: new Map([['tabbed-chatlog', {}]]), actors: new Map([['actor', actor]]), users: new Map(),
        scenes: Object.assign(new Map([['scene', scene]]), {current: scene, active: scene}),
        settings: {values: new Map([['rollMode', 'publicroll']]), register(_m, key, cfg) {this.values.set(key, cfg.default);},
          get(_m, key) {return this.values.get(key);}},
        i18n: {localize: key => ({'TC.TABS.IC': 'In Character', 'TC.TABS.Rolls': 'Rolls', 'TC.TABS.OOC': 'OOC'}[key] ?? key)}};
      window.fixtureActor = actor;
      window.canvas = {scene, tokens: {controlled: [{document: token}]}};
      window.ui = {chat: {scrollBottom() {}}};
      window.ChatMessage = {
        getSpeaker: () => ({scene: 'scene', actor: 'actor', token: 'token', alias: 'Pilot'}),
        getSpeakerActor: () => actor,
        applyRollMode(data, mode) {
          data.whisper = mode === 'publicroll' ? [] : [mode === 'selfroll' ? game.user.id : 'gm'];
          data.blind = mode === 'blindroll';
        },
        async create(input) {
          const data = {...input};
          // Foundry migrates legacy numeric type before preCreate, not after it.
          if (typeof data.type === 'number') {data.style = data.type; delete data.type;}
          if (data.speaker) data.speaker = Object.fromEntries(Object.entries(data.speaker).map(([key, value]) => [key, value?.id ?? value]));
          const message = {id: 'm' + game.messages.size, type: 'base', style: 0, content: '', speaker: {},
            rolls: [], whisper: [], blind: false, flags: {}, author: game.user, ...data, render() {}};
          const recipients = message.whisper;
          message.visible = game.user.isGM || !recipients.length || recipients.includes(game.user.id);
          message.updateSource = updates => {
            assertValid({...message, ...updates});
            Object.assign(message, updates);
          };
          function assertValid(value) {
            if (typeof value.type !== 'string') throw new Error('Invalid ChatMessage.type');
            if (![0, 1, 2, 3].includes(value.style)) throw new Error('Invalid ChatMessage.style');
          }
          await callHook('preCreateChatMessage', message, Object.freeze({...data}), {}, game.user.id);
          assertValid(message);
          game.messages.set(message.id, message);
          const element = $('<li class="message"></li>').attr('data-message-id', message.id)
            .append($('<header class="message-header"></header>').text(message.speaker.alias ?? 'Player'))
            .append($('<div class="message-content"></div>').html(message.content));
          await callHook('renderChatMessageHTML', message, element[0], {});
          $('#chat-log').append(element);
          await callHook('createChatMessage', message);
          window.lastMessage = message;
          return message;
        }};
      ChatMessage.implementation = ChatMessage;
      window.foundry = {utils: {getRoute: value => value}, documents: {collections: {ChatMessages: class {}}},
        applications: {handlebars: {renderTemplate: async (_path, data) => Handlebars.compile(template)(data)}}};
      Handlebars.registerHelper('localize', (key, options) => options.hash.check ? options.hash.check + ' CHECK' : key);
      Handlebars.registerHelper('lancer-dice-roll', roll => new Handlebars.SafeString('<div class="dice-roll lancer-dice-roll"><div class="dice-formula">' + roll.formula + '</div><div class="dice-total">' + roll.total + '</div></div>'));
      window.LancerRenderer = await import(URL.createObjectURL(new Blob([renderer], {type: 'text/javascript'})));
      $('#chat-form').on('submit', async event => {
        event.preventDefault();
        try {
          const text = $('#chat-message').val();
          const data = {style: 1, content: text};
          await callHook('chatMessage', {}, text, data);
          await ChatMessage.create(data);
          $('#warning').text('');
        } catch (error) {$('#warning').text(String(error));}
      });
    }, {renderer, template});
    if (process.env.AUTOMATIC_PACKAGE) {
      const packageRoot = path.resolve(process.env.AUTOMATIC_PACKAGE);
      await page.route('http://tabbed-chatlog.test/**', async route => {
        const relative = new URL(route.request().url()).pathname.slice(1);
        const file = path.resolve(packageRoot, relative);
        assert(file.startsWith(packageRoot + path.sep));
        await route.fulfill({body: fs.readFileSync(file), contentType: file.endsWith('.css') ? 'text/css' : 'text/javascript',
          headers: {'Access-Control-Allow-Origin': '*'}});
      });
      await page.addScriptTag({type: 'module', url: 'http://tabbed-chatlog.test/loader.js'});
      await page.waitForFunction(() => game.modules.get('tabbed-chatlog').api?.generation === 13);
    } else {
      await page.addStyleTag({path: path.join(__dirname, 'styles/tabbed-chatlog.css')});
      await page.addScriptTag({path: path.join(__dirname, 'tabbed-chatlog.js')});
    }
    await page.evaluate(async () => {
      await callHook('init');
      await callHook('ready');
      await callHook('renderChatLog', {}, document.querySelector('#chat'), {});
    });
    assert.equal(await page.evaluate(() => testHooks.has('renderChatMessage')), false);
    await page.locator('#chat-message').fill('Selected pilot speaking');
    await page.locator('#send').click();
    assert.equal(await page.locator('#warning').textContent(), '');
    assert.deepEqual(await page.evaluate(() => [lastMessage.type, lastMessage.style, lastMessage.speaker.token]), ['base', 2, 'token']);
    const visible = () => page.locator('#chat-log > .message:visible').allTextContents();
    await page.evaluate(async () => {
      await LancerRenderer.renderTemplateStep(fixtureActor, 'systems/lancer/templates/chat/stat-roll-card.hbs',
        {title: 'HULL', result: {roll: {formula: '1d20+2', total: 17}}});
      window.publicRoll = lastMessage;
      window.ooc = await ChatMessage.create({style: 1, content: 'Normal OOC'});
    });
    assert.equal((await visible()).length, 1);
    await page.locator('nav.tabbedchatlog [data-tab="rolls"]').click();
    assert.match((await visible())[0], /HULL CHECK/);
    assert.equal((await visible()).length, 1);
    assert.equal(await page.evaluate(() => publicRoll.rolls.length), 1);
    assert.equal(await page.evaluate(() => publicRoll.style), 2);
    await page.locator('nav.tabbedchatlog [data-tab="ooc"]').click();
    assert.deepEqual(await visible(), ['PlayerNormal OOC']);
    await page.evaluate(async () => {
      for (const mode of ['gmroll', 'blindroll', 'selfroll']) {
        game.settings.values.set('rollMode', mode);
        await LancerRenderer.renderTemplateStep(fixtureActor, 'systems/lancer/templates/chat/stat-roll-card.hbs',
          {title: mode, result: {roll: {formula: '1d20', total: 10}}});
      }
      game.settings.values.set('rollMode', 'publicroll');
    });
    await page.locator('nav.tabbedchatlog [data-tab="rolls"]').click();
    assert.equal((await visible()).length, 2, 'public and self rolls only for a non-GM');
    assert((await visible()).every(text => !text.includes('blindroll') && !text.includes('gmroll')));
    await page.evaluate(async () => {
      await ChatMessage.create({style: 2, speaker: {actor: 'other', scene: 'other', alias: 'Other pilot'}, content: 'Other scene'});
      canvas.scene = {id: 'other'};
      await callHook('canvasReady');
    });
    await page.locator('nav.tabbedchatlog [data-tab="ic"]').click();
    assert.deepEqual(await visible(), ['Other pilotOther scene']);
    await page.evaluate(async () => {
      canvas.scene = {id: 'scene'};
      await callHook('canvasReady');
      await callHook('renderChatLog', {}, document.querySelector('#chat'), {});
      await callHook('renderSceneConfig', {document: {getFlag: () => 'https://example.test/hook'}}, document.querySelector('#scene-config'));
      $('#popout .chat-log').append($('#chat-log .message').first().clone());
    });
    assert.equal(await page.locator('nav.tabbedchatlog').count(), 1);
    assert.equal(await page.locator('#scene-config input[name="flags.tabbed-chatlog.webhook"]').inputValue(), 'https://example.test/hook');
    await page.locator('nav.tabbedchatlog [data-tab="rolls"]').click();
    assert.equal(await page.locator('#popout .message:visible').count(), 0, 'popouts must also be filtered');
    for (const width of [420, 350]) {
      await page.setViewportSize({width, height: 800});
      const bounds = await page.locator('nav.tabbedchatlog').boundingBox();
      assert(bounds.height <= 32);
      assert(bounds.x >= 0 && bounds.x + bounds.width <= width);
    }
    assert.deepEqual(errors, []);
    const screenshot = path.join(process.env.RUNNER_TEMP ?? path.join(__dirname, '.qa'), 'lancer-v13-fixed.png');
    fs.mkdirSync(path.dirname(screenshot), {recursive: true});
    await page.screenshot({path: screenshot, fullPage: true});
    console.log('PASS: actual Lancer 3.1.3 renderer and stat-card template, v13 HTML hooks, selected-token IC, roll/OOC routing, private/blind/self rolls, scenes, popouts and compact toolbar.');
  } finally {await browser.close();}
})().catch(error => {console.error(error); process.exitCode = 1;});
