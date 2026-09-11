'use strict';

require('source-map-support/register');
var generatorReactSdk = require('@asyncapi/generator-react-sdk');
var jsxRuntime = require('/home/runner/work/rust-template/rust-template/node_modules/react/cjs/react-jsx-runtime.production.min.js');

const upperCamel = value => String(value || '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[^a-zA-Z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean).map(part => part.charAt(0).toUpperCase() + part.slice(1)).join('') || 'Message';
const toSnakeCase = value => String(value || '').replace(/([A-Z])/g, '_$1').toLowerCase().replace(/[^a-zA-Z0-9_]/g, '_').replace(/^_+|_+$/g, '') || 'message';
const mapRustType = (schema = {}) => {
  if (schema.additionalProperties === true) return 'serde_json::Value';
  if (schema.const !== undefined) {
    if (typeof schema.const === 'string') return 'String';
    if (typeof schema.const === 'number') return Number.isInteger(schema.const) ? 'i64' : 'f64';
    if (typeof schema.const === 'boolean') return 'bool';
    return 'serde_json::Value';
  }
  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    const first = schema.enum[0];
    if (typeof first === 'string') return 'String';
    if (typeof first === 'number') return Number.isInteger(first) ? 'i64' : 'f64';
    if (typeof first === 'boolean') return 'bool';
  }
  if (schema.type === 'array') {
    const inner = mapRustType(schema.items || {
      type: 'string'
    });
    return `Vec<${inner}>`;
  }
  if (schema.type === 'integer') return schema.format === 'int32' ? 'i32' : 'i64';
  if (schema.type === 'number') return 'f64';
  if (schema.type === 'boolean') return 'bool';
  if (schema.type === 'string') return 'String';
  return 'serde_json::Value';
};
const resolveMessagePayload = (doc, message) => {
  if (!message) return null;
  if (message.$ref && typeof message.$ref === 'string') {
    const name = message.$ref.split('/').pop();
    const componentMessage = doc.components && doc.components.messages && doc.components.messages[name];
    if (!componentMessage) return null;
    return resolveMessagePayload(doc, componentMessage);
  }
  if (message.payload) return resolveMessagePayload(doc, message.payload);
  if (message.content) {
    const content = message.content;
    if (content && content.schema) return content.schema;
    if (content && content.oneOf) return {
      oneOf: content.oneOf
    };
    if (content && typeof content === 'object') {
      const first = Object.values(content)[0];
      if (first && typeof first === 'object') return resolveMessagePayload(doc, first);
    }
  }
  if (message.schema) return message.schema;
  return message;
};
const collectMessages = doc => {
  const messageMap = {};
  const seenStructNames = new Set();
  const addMessage = (key, value) => {
    if (!value || typeof value !== 'object') return;
    let messageName = key || value.name || 'message';
    let resolvedValue = value;
    if (value.$ref && typeof value.$ref === 'string') {
      const refName = value.$ref.split('/').pop();
      const resolved = doc.components && doc.components.messages && doc.components.messages[refName] || null;
      if (!resolved) return;
      messageName = refName;
      resolvedValue = resolved;
    }
    const structName = upperCamel(messageName);
    if (seenStructNames.has(structName)) return;
    seenStructNames.add(structName);
    messageMap[structName] = resolvedValue;
  };
  const componentMessages = doc.components && doc.components.messages || {};
  Object.entries(componentMessages).forEach(([key, value]) => addMessage(key, value));
  const channels = doc.channels || {};
  Object.entries(channels).forEach(([channelName, channel]) => {
    const messageList = channel.messages || channel.message || {};
    if (Array.isArray(messageList)) {
      messageList.forEach(entry => {
        if (entry && typeof entry === 'object' && entry.$ref) {
          const refName = entry.$ref.split('/').pop();
          if (doc.components && doc.components.messages && doc.components.messages[refName]) {
            addMessage(refName, doc.components.messages[refName]);
          }
        }
      });
      return;
    }
    Object.entries(messageList).forEach(([key, value]) => addMessage(key, value));
  });
  return Object.entries(messageMap);
};
function TypesRs({
  asyncapi
}) {
  const doc = (asyncapi === null || asyncapi === void 0 ? void 0 : asyncapi._json) || asyncapi || {};
  const lines = ['// Auto-generated types from AsyncAPI specification', '// DO NOT EDIT MANUALLY', '', 'use serde::{Serialize, Deserialize};', 'use std::collections::HashMap;', ''];
  collectMessages(doc).forEach(([messageKey, message]) => {
    const payload = resolveMessagePayload(doc, message);
    const payloadSchema = payload && typeof payload === 'object' && payload.properties ? payload : {
      properties: {}
    };
    const properties = payloadSchema.properties || {};
    const propertyEntries = Object.entries(properties);
    if (payloadSchema.additionalProperties === true) {
      lines.push(`/// ${messageKey} payload`);
      lines.push('#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]');
      lines.push(`pub struct ${upperCamel(messageKey)}(pub serde_json::Value);`);
      lines.push('');
      return;
    }
    lines.push(`/// ${messageKey} payload`);
    lines.push('#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]');
    lines.push(`pub struct ${upperCamel(messageKey)} {`);
    propertyEntries.forEach(([propertyName, property]) => {
      const rustFieldName = toSnakeCase(propertyName);
      const rustType = mapRustType(property);
      const required = Array.isArray(payloadSchema.required) && payloadSchema.required.includes(propertyName);
      const fieldLine = required ? `    pub ${rustFieldName}: ${rustType},` : `    #[serde(skip_serializing_if = "Option::is_none")]\n    pub ${rustFieldName}: Option<${rustType}>,`;
      lines.push(fieldLine);
    });
    lines.push('}');
    lines.push('');
  });
  lines.push('/// Generic message envelope for AsyncAPI');
  lines.push('#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]');
  lines.push('pub struct MessageEnvelope {');
  lines.push('    #[serde(flatten)]');
  lines.push('    pub payload: HashMap<String, serde_json::Value>,');
  lines.push('}');
  lines.push('');
  const content = lines.join('\n');
  return /*#__PURE__*/jsxRuntime.jsx(generatorReactSdk.File, {
    name: "types.rs",
    children: /*#__PURE__*/jsxRuntime.jsx(generatorReactSdk.Text, {
      children: content
    })
  });
}

module.exports = TypesRs;
//# sourceMappingURL=types.rs.js.map
