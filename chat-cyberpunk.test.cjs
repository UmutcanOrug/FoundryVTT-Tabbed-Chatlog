const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const dependencyPaths = [process.env.NODE_MODULES_DIR ?? path.join(__dirname, 'node_modules')];
const {chromium} = require(require.resolve('playwright', {paths: dependencyPaths}));
const systemRoot = path.join(__dirname, '.qa/cyberpunk-red-source/src');
const upstreamCommit = '75b8c9d7cb76ed1ea2797a3404ce77172d424b6b';

async function upstreamFile(relative) {
  const local = path.join(systemRoot, relative);
  if (fs.existsSync(local)) return fs.readFileSync(local);
  const response = await fetch('https://gitlab.com/cyberpunk-red-team/fvtt-cyberpunk-red-core/-/raw/' + upstreamCommit + '/src/' + relative);
  if (!response.ok) throw new Error('Unable to fetch CPR fixture: ' + response.status);
  return Buffer.from(await response.arrayBuffer());
}

function dependencyAsset(name, fallback) {
  try {return require.resolve(name, {paths: dependencyPaths});}
  catch {return path.join(__dirname, '.qa', fallback);}
}

(async () => {
  const [templateFile, chatFile, diceFile] = await Promise.all([
    upstreamFile('templates/chat/cpr-stat-rollcard.hbs'), upstreamFile('modules/chat/cpr-chat.js'), upstreamFile('icons/dice/black/d10_9.svg')
  ]);
  const statTemplate = templateFile.toString('utf8');
  const chatModule = chatFile.toString('utf8');
  const cprClass = chatModule.slice(chatModule.indexOf('/**')).replace('export default class CPRChat', 'window.CPRChat = class CPRChat');
  const dice = 'data:image/svg+xml;base64,' + diceFile.toString('base64');
  const browser = await chromium.launch({headless: true, ...(process.env.CHROME_PATH ? {executablePath: process.env.CHROME_PATH} : {})});
  try {
    const page = await browser.newPage({viewport: {width: 420, height: 800}});
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    await page.setContent('<style>body{margin:0;font:14px Arial;background:#181818;color:#eee}#sidebar{width:340px;height:760px}#chat{height:100%;display:flex;flex-direction:column}#chat>*{flex:1}#chat-log{min-height:0;overflow:auto;padding:8px;list-style:none}#chat-form{flex:0 0 64px}#chat-message{width:240px}a{cursor:pointer}.chat-message{margin-bottom:8px;padding:8px;border:1px solid #666;background:#ddd;color:#111}.rollcard{border:3px solid #ca1515;padding:8px}.d10-dice-div img{width:60px}.d10-number-div{font-size:40px;text-align:right}#warning{color:#ff5b5b}</style><div id="sidebar" class="app"><section id="chat" class="sidebar-tab flexcol"><ol id="chat-log"></ol><form id="chat-form"><input id="chat-message"><button id="send">Send</button><div id="warning"></div></form></section></div><form id="scene-config"><div class="tab" data-tab="basic"><div class="form-group"><select name="journal"></select></div></div></form>');
    await page.addScriptTag({path: dependencyAsset('jquery/dist/jquery.min.js', 'jquery.min.js')});
    await page.addScriptTag({path: dependencyAsset('handlebars/dist/handlebars.min.js', 'handlebars.min.js')});
    await page.evaluate(({statTemplate, dice}) => {
      window.testHooks = new Map();
      window.Hooks = {on: (name, callback) => {
        if (!testHooks.has(name)) testHooks.set(name, []);
        testHooks.get(name).push(callback);
      }};
      window.callHook = async (name, ...args) => {
        for (const callback of testHooks.get(name) ?? []) await callback(...args);
      };
      window.CONST = {CHAT_MESSAGE_STYLES: {OTHER: 0, OOC: 1, IC: 2, EMOTE: 3}};
      window.legacyReads = 0;
      Object.defineProperty(CONST, 'CHAT_MESSAGE_TYPES', {get() {
        legacyReads++;
        return {OTHER: 0, OOC: 1, IC: 2, EMOTE: 3, WHISPER: 4, ROLL: 5};
      }});
      window.Messages = class Messages {};
      window.Dialog = {confirm: async () => {}};
      const actor = {id: 'actor', name: 'Character'};
      const scene = {id: 'scene', getFlag: () => 'https://example.test/?x="quoted"'};
      const token = {id: 'token', actor, parent: scene};
      const actors = new Map([['actor', actor]]);
      actors.filter = fn => [...actors.values()].filter(fn);
      actors.find = fn => [...actors.values()].find(fn);
      window.game = {user: {id: 'user', name: 'Player', isGM: false}, system: {id: 'cyberpunk-red-core', version: '0.92.4'},
        settings: {values: new Map([['rollMode', 'publicroll']]), register(_m, key, cfg) {this.values.set(key, cfg.default);},
          get(_m, key) {return this.values.get(key);}},
        i18n: {localize: key => ({'TC.TABS.IC': 'In Character', 'TC.TABS.Rolls': 'Rolls', 'TC.TABS.OOC': 'OOC'}[key] ?? key)},
        scenes: Object.assign(new Map([['scene', scene]]), {current: scene, active: scene}),
        messages: new Map(), modules: new Map(), actors, users: new Map()};
      window.canvas = {scene, tokens: {controlled: [{document: token}]}};
      window.ui = {chat: {scrollBottom() {}}};
      window.ChatMessage = {
        getSpeaker: () => ({scene: 'scene', actor: 'actor', token: 'token', alias: 'Character'}),
        getSpeakerActor: () => actor, getWhisperRecipients: () => [{id: 'gm'}],
        async create(data) {
          const validate = values => {
            if (typeof values.type !== 'string') throw new Error('ChatMessage validation errors: type: "' + values.type + '" is not a valid type for the ChatMessage Document class');
            if (![0,1,2,3].includes(values.style)) throw new Error('Invalid message style');
          };
          const message = {id: 'm' + game.messages.size, type: 'base', style: 1, author: game.user,
            speaker: {}, content: '', rolls: [], whisper: [], flags: {}, visible: true, blind: false, ...data};
          if (message.speaker.actor?.id) message.speaker = {...message.speaker, actor: message.speaker.actor.id};
          validate(message);
          message.updateSource = updates => {validate({...message, ...updates}); Object.assign(message, updates);};
          await callHook('preCreateChatMessage', message, Object.freeze({...data}), {}, game.user.id);
          game.messages.set(message.id, message);
          const element = $('<li class="chat-message message"></li>').attr('data-message-id', message.id)
            .append($('<header class="message-header"></header>').text(message.speaker.alias ?? 'Player'))
            .append($('<div class="message-content"></div>').html(message.content));
          await callHook('renderChatMessage', message, element, {});
          $('#chat-log').append(element);
          await callHook('createChatMessage', message);
          return message;
        }};
      window.foundry = {utils: {getRoute: p => p}};
      Handlebars.registerHelper('localize', text => text);
      Handlebars.registerHelper('cprCompare', (a, op, b) => op === '||' ? a || b : false);
      window.renderTemplate = async (_path, roll) => {
        try {return Handlebars.compile(statTemplate)(roll).replaceAll('systems/cyberpunk-red-core/icons/dice/black/d10_9.svg', dice);}
        catch (error) {throw new Error('CPR template: ' + error.message);}
      };
      window.CPRInitiative = class CPRInitiative {};
      window.makeCprRoll = () => ({rollCard: 'systems/cyberpunk-red-core/templates/chat/cpr-stat-rollcard.hbs',
        entityData: {actor: 'actor', token: null}, statName: 'COOL', statValue: 6, rollTitle: 'COOL',
        initialRoll: 9, resultTotal: 15, mods: [], additionalMods: [], wasCritical: () => false});
      $('#chat-form').on('submit', async event => {
        event.preventDefault();
        try {
          const text = $('#chat-message').val();
          const data = {style: 1, content: text};
          await callHook('chatMessage', {}, text, data);
          await ChatMessage.create(data);
          $('#warning').text('');
        } catch(error) {$('#warning').text(String(error));}
      });
    }, {statTemplate, dice});
    await page.addScriptTag({content: cprClass});
    await page.addStyleTag({path: path.join(__dirname, 'styles', 'tabbed-chatlog.css')});
    await page.addScriptTag({path: process.env.MODULE_SOURCE ?? path.join(__dirname, 'tabbed-chatlog.js')});
    await page.evaluate(async () => {
      await callHook('init');
      await callHook('ready');
      await callHook('renderChatLog', {}, $('#chat'), {});
    });
    await page.locator('#chat-message').fill('Token speaking');
    await page.locator('#send').click();
    assert.equal(await page.locator('#warning').textContent(), '', 'selected-token chat must pass modern v12 validation');
    assert.deepEqual(await page.evaluate(() => [...game.messages.values()].map(m => [m.type, m.style, m.speaker.token])), [['base',2,'token']]);
    await page.evaluate(async () => {
      window.cprPublic = await CPRChat.RenderRollCard(makeCprRoll());
      window.regularOoc = await ChatMessage.create({style: 1, content: 'Normal OOC'});
    });
    const visible = () => page.locator('#chat-log > .chat-message:visible').allTextContents();
    assert.equal((await visible()).length, 1);
    await page.locator('nav.tabbedchatlog [data-tab="rolls"]').click();
    assert.equal((await visible()).length, 1);
    assert.match((await visible())[0], /COOL/);
    assert.equal(await page.evaluate(() => cprPublic.rolls.length), 0);
    assert.equal(await page.evaluate(() => cprPublic.style), 1);
    await page.locator('nav.tabbedchatlog [data-tab="ooc"]').click();
    assert.deepEqual(await visible(), ['PlayerNormal OOC']);
    await page.evaluate(async () => {
      game.settings.values.set('rollMode', 'blindroll');
      window.blindCard = await CPRChat.RenderRollCard(makeCprRoll());
      game.settings.values.set('rollMode', 'gmroll');
      window.privateCard = await CPRChat.RenderRollCard(makeCprRoll());
      privateCard.visible = false;
      game.settings.values.set('rollMode', 'publicroll');
    });
    await page.locator('nav.tabbedchatlog [data-tab="rolls"]').click();
    assert.equal((await visible()).length, 1, 'blind and inaccessible private CPR cards must stay hidden');
    await page.locator('nav.tabbedchatlog [data-tab="ooc"]').click();
    await page.locator('nav.tabbedchatlog [data-tab="rolls"]').click();
    assert.equal((await visible()).length, 1);
    await page.evaluate(async () => {
      await ChatMessage.create({style: 2, speaker: {scene: 'other', actor: 'other', alias: 'Other actor'}, content: 'Other scene'});
      canvas.scene = {id: 'other'};
      await callHook('canvasReady');
    });
    await page.locator('nav.tabbedchatlog [data-tab="ic"]').click();
    assert.deepEqual(await visible(), ['Other actorOther scene']);
    await page.evaluate(async () => {
      await callHook('renderChatLog', {}, $('#chat'), {});
      await callHook('renderSceneConfig', {object: game.scenes.get('scene')}, $('#scene-config'));
      await callHook('renderSceneConfig', {object: game.scenes.get('scene')}, $('#scene-config'));
    });
    assert.equal(await page.locator('nav.tabbedchatlog').count(), 1);
    const field = page.locator('input[name="flags.tabbed-chatlog.webhook"]');
    assert.equal(await field.count(), 1);
    assert.equal(await field.inputValue(), 'https://example.test/?x="quoted"');
    assert.equal(await page.evaluate(() => legacyReads), 0, 'no deprecated constants may be accessed');
    for (const width of [420, 350]) {
      await page.setViewportSize({width, height:800});
      const height = await page.locator('nav.tabbedchatlog').evaluate(el => el.getBoundingClientRect().height);
      assert(height <= 32, 'tabs must not expand into a large empty panel: ' + height);
      const logHeight = await page.locator('#chat-log').evaluate(el => el.getBoundingClientRect().height);
      assert(logHeight > 500, 'chat log must retain its usable height');
    }
    await page.locator('nav.tabbedchatlog [data-tab="rolls"]').click();
    assert.deepEqual(errors, []);
    const screenshotDirectory = process.env.RUNNER_TEMP ?? path.join(__dirname, '.qa');
    fs.mkdirSync(screenshotDirectory, {recursive: true});
    await page.locator('#sidebar').screenshot({path: path.join(screenshotDirectory, 'cyberpunk-v12-fixed.png')});
    console.log('Cyberpunk RED v0.92.4 browser regression passed: actual RenderRollCard + stat template, valid style-based token chat, roll/OOC routing, blind/private protection, tab switching, scene filters and 30px toolbar.');
  } finally {
    await browser.close();
  }
})().catch(error => {console.error(error); process.exitCode = 1;});
