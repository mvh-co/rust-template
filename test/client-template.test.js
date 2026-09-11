const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const readTemplate = relativePath =>
  fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

test('client templates use the operation list and safe handler storage', () => {
  const rootTemplate = readTemplate('templates/client.hbs');
  const sourceTemplate = readTemplate('templates/src/ws/client.rs.hbs');

  for (const template of [rootTemplate, sourceTemplate]) {
    assert.ok(template.includes('message_handlers: Arc<Mutex<HashMap<String, Arc<dyn Fn(Value) + Send + Sync>>>>'));
    assert.ok(template.includes('sender: Option<Arc<futures_util::lock::Mutex<WsSender>>>'));
    assert.ok(template.includes('{{#each asyncapi.operations}}'));
    assert.ok(template.includes('{{@key | toSnakeCase}}'));
    assert.ok(template.includes('let message_name = "{{#if this.name}}{{this.name}}{{else}}{{@key}}{{/if}}";'));
    assert.ok(template.includes('TungsteniteError(#[from] tokio_tungstenite::tungstenite::Error)'));
    assert.ok(!template.includes('IoError(#[from] std::io::Error)'));
    assert.ok(!template.includes('getAllChannels asyncapi'));
    assert.ok(!template.includes('getChannelOperations ../asyncapi'));
  }
});
