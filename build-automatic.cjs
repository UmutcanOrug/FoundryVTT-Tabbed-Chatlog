const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');

const root = __dirname;
const v14Root = path.resolve(process.argv[2] ?? path.join(root, '../..'));
const output = path.resolve(process.argv[3] ?? path.join(root, '.qa/automatic'));
assert.notEqual(output, root);
assert.notEqual(output, v14Root);
const v14Source = fs.readFileSync(path.join(v14Root, 'tabbed-chatlog.js'));
assert.equal(createHash('sha256').update(v14Source).digest('hex'),
  'a871485c9a9e99a50f8ebf6553d1a0450c97b8202cb987d017a98a80a20b8cec', 'v14 must be the unchanged 1.7.1 implementation');

fs.mkdirSync(output, {recursive: true});
for (const name of ['module.json', 'loader.js']) fs.copyFileSync(path.join(root, 'automatic', name), path.join(output, name));
fs.cpSync(path.join(root, 'languages'), path.join(output, 'languages'), {recursive: true});
for (const name of ['LICENSE', 'LICENSE.md']) {
  if (fs.existsSync(path.join(root, name))) fs.copyFileSync(path.join(root, name), path.join(output, name));
}
for (const [generation, sourceRoot] of [[13, root], [14, v14Root]]) {
  const target = path.join(output, 'runtime', 'v' + generation);
  fs.mkdirSync(target, {recursive: true});
  fs.copyFileSync(path.join(sourceRoot, 'tabbed-chatlog.js'), path.join(target, 'tabbed-chatlog.js'));
  fs.copyFileSync(path.join(sourceRoot, 'styles/tabbed-chatlog.css'), path.join(target, 'tabbed-chatlog.css'));
}
console.log('Built automatic v13/v14 package at ' + output);
