const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');
const root = path.join(__dirname, '.qa/automatic');
const source = fs.readFileSync(path.join(root, 'loader.js'), 'utf8');

for (const generation of [13, 14]) {
  test('Foundry ' + generation + ' loads exactly its own code and CSS', async () => {
    const imported = [];
    const styles = [];
    const moduleInfo = {};
    const hooks = [];
    const context = vm.createContext({URL, console: {info() {}},
      game: {release: {generation}, modules: new Map([['tabbed-chatlog', moduleInfo]])},
      document: {createElement: () => ({}), head: {append: node => styles.push(node)}}});
    const loader = new vm.SourceTextModule(source, {context,
      initializeImportMeta: meta => {meta.url = 'https://assets.forge-vtt.com/modules/tabbed-chatlog/loader.js';},
      importModuleDynamically: async specifier => {
        imported.push(specifier);
        assert(fs.existsSync(path.join(root, specifier)));
        const runtime = new vm.SyntheticModule([], function () {hooks.push(generation);}, {context});
        await runtime.link(() => {});
        await runtime.evaluate();
        return runtime;
      }});
    await loader.link(() => {});
    await loader.evaluate();
    assert.deepEqual(imported, ['./runtime/v' + generation + '/tabbed-chatlog.js']);
    assert.deepEqual(hooks, [generation], 'runtime hooks must register before loader finishes');
    assert.equal(styles.length, 1);
    assert.equal(styles[0].href, 'https://assets.forge-vtt.com/modules/tabbed-chatlog/runtime/v' + generation + '/tabbed-chatlog.css');
    assert.equal(moduleInfo.api.generation, generation);
  });
}

for (const generation of [12, 15]) {
  test('unsupported generation ' + generation + ' cannot load the wrong implementation', async () => {
    const loader = new vm.SourceTextModule(source, {context: vm.createContext({game: {release: {generation}}})});
    await loader.link(() => {});
    await assert.rejects(loader.evaluate(), /supports Foundry generations 13 and 14 only/);
  });
}

test('automatic manifest uses its own stable channel, not GitHub latest', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'module.json')));
  assert.deepEqual(manifest.compatibility, {minimum: '13.351', verified: '14', maximum: '14'});
  assert(manifest.manifest.endsWith('/maintenance/v13/automatic/module.json'));
  assert(manifest.download.endsWith('/releases/download/compat-1.8.0/module.zip'));
  for (const file of [...manifest.esmodules, ...manifest.languages.map(l => l.path),
    'runtime/v13/tabbed-chatlog.js', 'runtime/v14/tabbed-chatlog.js',
    'runtime/v13/tabbed-chatlog.css', 'runtime/v14/tabbed-chatlog.css']) {
    assert.equal(file.startsWith('/'), false);
    assert(fs.existsSync(path.join(root, file)), file);
  }
});
