const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { getAllOperations, getOperationMessages } = require('../helpers.js');

const readTemplate = relativePath =>
  fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

test('client templates use the generated operation list and safe handler storage', () => {
  const sourceTemplate = readTemplate('templates/template/src/ws/client.rs.js');
  const cargoTemplate = readTemplate('templates/template/Cargo.toml.js');

  assert.ok(sourceTemplate.includes('message_handlers: Arc<Mutex<HashMap<String, Arc<dyn Fn(Value) + Send + Sync>>>>'));
  assert.ok(sourceTemplate.includes('sender: Option<Arc<futures_util::lock::Mutex<WsSender>>>'));
  assert.ok(sourceTemplate.includes('pub fn on<F>(&self, message_type: &str, handler: F)'));
  assert.ok(sourceTemplate.includes('pub async fn ${methodName}(&self, payload: Value) -> Result<(), WsError>'));
  assert.ok(sourceTemplate.includes('self.on("${messageName}", handler);'));
  assert.ok(sourceTemplate.includes('TungsteniteError(#[from] tokio_tungstenite::tungstenite::Error)'));
  assert.ok(sourceTemplate.includes('tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>'));
  assert.ok(cargoTemplate.includes('tokio-tungstenite = { version = "0.23", features = ["rustls-tls-native-roots"] }'));
  assert.ok(!cargoTemplate.includes('native-tls'));
  assert.ok(!sourceTemplate.includes('IoError(#[from] std::io::Error)'));
  assert.ok(!sourceTemplate.includes('Legacy compatibility for older AsyncAPI documents'));
});

test('helpers resolve AsyncAPI v3 operations and message refs', () => {
  const asyncapi = {
    asyncapi: '3.1.0',
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

test('cargo template escapes multiline descriptions in TOML strings', () => {
  const CargoToml = require('../templates/__transpiled/Cargo.toml.js');
  const asyncapi = {
    asyncapi: '3.1.0',
    info: {
      title: 'WebSocket Demo',
      version: '1.0.0',
      description: [
        'AsyncAPI generated from the WebSocket client used by the package',
        '@example/websocket-client. This document describes the real-time message-driven API',
        'exposed through the persistent WebSocket endpoint used by the library.'
      ].join('\n'),
    },
  };

  const rendered = CargoToml({ asyncapi });
  const generated = String(rendered.props.children.props.children);

  assert.ok(generated.includes('description = "AsyncAPI generated from the WebSocket client used by the package @example/websocket-client. This document describes the real-time message-driven API exposed through the persistent WebSocket endpoint used by the library."'));
  assert.ok(!generated.includes('description = "AsyncAPI generated from the WebSocket client used by the package\n@example/websocket-client'));
});

test('types template deduplicates colliding Rust struct names', async () => {
  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'source-map-support/register') return {};
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const TypesRs = require('../templates/__transpiled/src/ws/types.rs.js');
    const asyncapi = {
      asyncapi: '3.1.0',
      channels: {
        market: {
          address: 'market',
          messages: {
            authResult: {
              name: 'authResult',
              payload: {
                type: 'object',
                properties: {
                  status: { type: 'string' },
                },
              },
            },
            coreEvent: {
              name: 'coreEvent',
              payload: {
                type: 'object',
                properties: {
                  sequence: { type: 'integer', format: 'int64' },
                },
              },
            },
          },
        },
      },
      components: {
        messages: {
          AuthResult: {
            name: 'AuthResult',
            payload: {
              type: 'object',
              properties: {
                status: { type: 'string' },
                user_id: { type: 'integer', format: 'int64' },
              },
            },
          },
          CoreEvent: {
            name: 'CoreEvent',
            payload: {
              type: 'object',
              properties: {
                sequence: { type: 'integer', format: 'int64' },
              },
            },
          },
        },
      },
    };

    const rendered = await TypesRs({ asyncapi });
    const generated = String(rendered.props.children.props.children);
    assert.equal((generated.match(/pub struct AuthResult/g) || []).length, 1);
    assert.equal((generated.match(/pub struct CoreEvent/g) || []).length, 1);
  } finally {
    Module._load = originalLoad;
  }
});
