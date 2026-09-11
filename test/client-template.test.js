const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { getAllOperations, getOperationMessages } = require('../helpers.js');

const readTemplate = relativePath =>
  fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

test('client templates use the generated operation list and safe handler storage', () => {
  const rootTemplate = readTemplate('templates/client.hbs');
  const sourceTemplate = readTemplate('templates/src/ws/client.rs.hbs');

  for (const template of [rootTemplate, sourceTemplate]) {
    assert.ok(template.includes('message_handlers: Arc<Mutex<HashMap<String, Arc<dyn Fn(Value) + Send + Sync>>>>'));
    assert.ok(template.includes('sender: Option<Arc<futures_util::lock::Mutex<WsSender>>>'));
    assert.ok(template.includes('Legacy compatibility for older AsyncAPI documents'));
    assert.ok(template.includes('{{#each asyncapi.operations}}{{/each}}'));
    assert.ok(template.includes('{{ operation.key | toSnakeCase }}'));
    assert.ok(template.includes('TungsteniteError(#[from] tokio_tungstenite::tungstenite::Error)'));
    assert.ok(!template.includes('IoError(#[from] std::io::Error)'));
    assert.ok(!template.includes('getAllChannels asyncapi'));
    assert.ok(!template.includes('getChannelOperations ../asyncapi'));
  }
});

test('helpers resolve AsyncAPI v3 operations and message refs', () => {
  const asyncapi = {
    asyncapi: '3.0.0',
    channels: {
      market: {
        address: 'market',
        messages: {
          subscribe: { $ref: '#/components/messages/subscribe' },
          quote: { $ref: '#/components/messages/quote' },
        },
      },
    },
    components: {
      messages: {
        subscribe: {
          name: 'subscribe',
          payload: {
            type: 'object',
            required: ['name'],
            properties: { name: { type: 'string' } },
          },
        },
        quote: {
          name: 'quote',
          payload: {
            type: 'object',
            properties: { symbol: { type: 'string' } },
          },
        },
      },
      operations: {
        subscribeToMarket: {
          action: 'send',
          channel: { $ref: '#/channels/market' },
          messages: [{ $ref: '#/components/messages/subscribe' }],
        },
        receiveMarketQuote: {
          action: 'receive',
          channel: { $ref: '#/channels/market' },
          messages: [{ $ref: '#/components/messages/quote' }],
        },
      },
    },
  };

  const operations = getAllOperations(asyncapi);
  assert.deepEqual(operations.map(op => op.action), ['send', 'receive']);
  assert.equal(operations[0].key, 'subscribeToMarket');
  const sendMessages = getOperationMessages(asyncapi, operations[0]);
  const receiveMessages = getOperationMessages(asyncapi, operations[1]);
  assert.equal(sendMessages[0].name, 'subscribe');
  assert.equal(receiveMessages[0].name, 'quote');
});
