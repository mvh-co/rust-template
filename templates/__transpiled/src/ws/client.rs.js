'use strict';

require('source-map-support/register');
var generatorReactSdk = require('@asyncapi/generator-react-sdk');
var jsxRuntime = require('/home/runner/work/rust-template/rust-template/node_modules/react/cjs/react-jsx-runtime.production.min.js');

const toSnakeCase = value => String(value || '').replace(/([A-Z])/g, '_$1').toLowerCase().replace(/[^a-zA-Z0-9_]/g, '_').replace(/^_+|_+$/g, '') || 'client';
const getDocument = asyncapi => (asyncapi === null || asyncapi === void 0 ? void 0 : asyncapi._json) || asyncapi || {};
const getOperations = doc => {
  const ops = [];
  const componentOperations = doc.components && doc.components.operations || {};
  Object.entries(componentOperations).forEach(([key, operation]) => {
    const action = operation && (operation.action || 'send');
    ops.push({
      ...operation,
      key,
      name: operation.name || operation.operationId || key,
      action
    });
  });
  const channelEntries = doc.channels || {};
  Object.entries(channelEntries).forEach(([channelName, channel]) => {
    const publish = channel.publish || null;
    const subscribe = channel.subscribe || null;
    if (publish) {
      ops.push({
        ...publish,
        key: `${channelName}.publish`,
        name: publish.name || publish.operationId || `${channelName}Publish`,
        action: 'send'
      });
    }
    if (subscribe) {
      ops.push({
        ...subscribe,
        key: `${channelName}.subscribe`,
        name: subscribe.name || subscribe.operationId || `${channelName}Subscribe`,
        action: 'receive'
      });
    }
  });
  return ops;
};
const buildSendMethods = operations => operations.filter(operation => operation.action === 'send' || operation.action === 'request').map(operation => {
  const methodName = toSnakeCase(operation.name || operation.operationId || operation.key || 'send_message');
  const messageName = operation.name || operation.operationId || operation.key || 'message';
  return `    /// Send a ${messageName} operation
    pub async fn ${methodName}(&self, payload: Value) -> Result<(), WsError> {
        let request_id = self.next_request_id();
        let message_name = "${messageName}";
        let mut message = json!({
            "name": message_name,
            "request_id": request_id,
            "local_time": chrono::Utc::now().timestamp_millis()
        });

        if let Value::Object(payload_obj) = payload {
            for (k, v) in payload_obj {
                message[k] = v;
            }
        }

        self.send_message(message).await?;
        Ok(())
    }`;
}).join('\n\n');
const buildReceiveHandlerMethods = operations => operations.filter(operation => operation.action === 'receive' || operation.action === 'reply').map(operation => {
  const methodName = `on_${toSnakeCase(operation.name || operation.operationId || operation.key || 'message')}`;
  const messageName = operation.name || operation.operationId || operation.key || 'message';
  return `    pub fn ${methodName}<F>(&self, handler: F)
    where
        F: Fn(Value) + Send + Sync + 'static,
    {
        self.on("${messageName}", handler);
    }`;
}).join('\n\n');
function ClientRs({
  asyncapi
}) {
  const doc = getDocument(asyncapi);
  const operations = getOperations(doc);
  const sendMethods = buildSendMethods(operations);
  const receiveMethods = buildReceiveHandlerMethods(operations);
  const title = doc.info && doc.info.title || 'AsyncAPI Client';
  const content = `// Auto-generated WebSocket client from AsyncAPI specification
// DO NOT EDIT MANUALLY

use tokio_tungstenite::connect_async;
use futures_util::{SinkExt, StreamExt};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicI64, Ordering},
        Arc, Mutex,
    },
};
use thiserror::Error;
use log::{debug, error};

type WsSender = futures_util::stream::SplitSink<
    tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>,
    tokio_tungstenite::tungstenite::Message,
>;

/// WebSocket client for ${title}
pub struct AsyncApiClient {
    url: String,
    sender: Option<Arc<futures_util::lock::Mutex<WsSender>>>,
    request_id_counter: AtomicI64,
    message_handlers: Arc<Mutex<HashMap<String, Arc<dyn Fn(Value) + Send + Sync>>>>,
}

impl AsyncApiClient {
    /// Create a new client instance
    pub fn new(url: &str) -> Self {
        AsyncApiClient {
            url: url.to_string(),
            sender: None,
            request_id_counter: AtomicI64::new(0),
            message_handlers: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Connect to the WebSocket server
    pub async fn connect(&mut self) -> Result<(), WsError> {
        let (ws_stream, _) = connect_async(&self.url)
            .await
            .map_err(|e| WsError::ConnectionError(e.to_string()))?;

        let (sender, mut receiver) = ws_stream.split();
        self.sender = Some(Arc::new(futures_util::lock::Mutex::new(sender)));

        let handlers = Arc::clone(&self.message_handlers);
        tokio::spawn(async move {
            while let Some(msg) = receiver.next().await {
                match msg {
                    Ok(tokio_tungstenite::tungstenite::Message::Text(text)) => {
                        if let Ok(value) = serde_json::from_str::<Value>(&text) {
                            debug!("Received message: {}", text);
                            if let Some(name) = value.get("name").and_then(Value::as_str) {
                                if let Some(handler) = handlers.lock().unwrap().get(name).cloned() {
                                    handler(value);
                                }
                            }
                        }
                    }
                    Ok(_) => {}
                    Err(e) => error!("WebSocket error: {}", e),
                }
            }
        });

        Ok(())
    }

    /// Register a handler for a specific message type
    pub fn on<F>(&self, message_type: &str, handler: F)
    where
        F: Fn(Value) + Send + Sync + 'static,
    {
        self.message_handlers
            .lock()
            .unwrap()
            .insert(message_type.to_string(), Arc::new(handler));
    }

    ${receiveMethods || '    // No receive operations were defined in this specification.'}

    /// Generate a new request ID
    fn next_request_id(&self) -> String {
        self.request_id_counter.fetch_add(1, Ordering::SeqCst).to_string()
    }

    /// Send a raw message
    pub async fn send_message(&self, message: Value) -> Result<(), WsError> {
        let sender = self.sender.as_ref().ok_or(WsError::NotConnected)?;
        let mut sender = sender.lock().await;
        sender
            .send(tokio_tungstenite::tungstenite::Message::Text(
                serde_json::to_string(&message)?,
            ))
            .await?;
        Ok(())
    }

${sendMethods || '    // No send operations were defined in this specification.'}
}

/// WebSocket errors
#[derive(Error, Debug)]
pub enum WsError {
    #[error("Connection error: {0}")]
    ConnectionError(String),
    #[error("Not connected to WebSocket")]
    NotConnected,
    #[error("Serialization error: {0}")]
    SerializationError(#[from] serde_json::Error),
    #[error("Tungstenite error: {0}")]
    TungsteniteError(#[from] tokio_tungstenite::tungstenite::Error),
}
`;
  return /*#__PURE__*/jsxRuntime.jsx(generatorReactSdk.File, {
    name: "client.rs",
    children: /*#__PURE__*/jsxRuntime.jsx(generatorReactSdk.Text, {
      children: content
    })
  });
}

module.exports = ClientRs;
//# sourceMappingURL=client.rs.js.map
