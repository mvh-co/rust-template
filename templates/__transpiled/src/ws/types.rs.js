'use strict';

require('source-map-support/register');
var fs = require('node:fs');
var path = require('node:path');
var generatorReactSdk = require('@asyncapi/generator-react-sdk');
var jsxRuntime = require('react/jsx-runtime');

const getRustGenerator = () => {
  const candidatePaths = [path.resolve(__dirname, '../../../template/node_modules/@asyncapi/modelina/lib/cjs/index.js'), path.resolve(process.cwd(), 'templates/template/node_modules/@asyncapi/modelina/lib/cjs/index.js'), path.resolve(process.cwd(), 'templates/node_modules/@asyncapi/modelina/lib/cjs/index.js'), path.resolve(process.cwd(), 'node_modules/@asyncapi/modelina/lib/cjs/index.js')];

  for (const candidate of candidatePaths) {
    if (fs.existsSync(candidate)) {
      return new (require(candidate).RustGenerator)();
    }
  }

  try {
    return new (require('@asyncapi/modelina/lib/cjs/index.js').RustGenerator)();
  } catch (error) {
    return new (require('@asyncapi/modelina').RustGenerator)();
  }
};

const resolveReference = (doc, ref) => {
  if (!ref || typeof ref !== 'string' || !ref.startsWith('#/')) {
    return undefined;
  }

  const segments = ref.replace(/^#\//, '').split('/').map(segment => segment.replace(/~1/g, '/').replace(/~0/g, '~'));
  let current = doc;

  for (const segment of segments) {
    if (!current || typeof current !== 'object') {
      return undefined;
    }
    current = current[segment];
  }

  return current;
};

const resolveMessagePayload = (doc, message) => {
  if (!message || typeof message !== 'object') {
    return null;
  }

  if (message.$ref && typeof message.$ref === 'string') {
    const refName = message.$ref.split('/').pop();
    const componentMessage = doc.components && doc.components.messages && doc.components.messages[refName] || resolveReference(doc, message.$ref);
    return resolveMessagePayload(doc, componentMessage);
  }

  if (message.payload) return resolveMessagePayload(doc, message.payload);
  if (message.content) {
    const content = message.content;
    if (content && content.schema) return resolveMessagePayload(doc, content.schema);
    if (content && content.oneOf) {
      return {
        oneOf: content.oneOf.map(item => resolveMessagePayload(doc, item) || item)
      };
    }

    if (content && typeof content === 'object') {
      const first = Object.values(content)[0];
      if (first && typeof first === 'object') {
        return resolveMessagePayload(doc, first);
      }
    }
  }

  if (message.schema) return resolveMessagePayload(doc, message.schema);
  return message;
};

const normalizeModelKey = value => String(value || 'message').replace(/[^a-zA-Z0-9]+/g, '').toLowerCase() || 'message';

const collectModelPayloads = doc => {
  const payloads = [];
  const seen = new Set();

  const addMessage = (messageKey, value) => {
    if (!value || typeof value !== 'object') {
      return;
    }

    const payload = resolveMessagePayload(doc, value);
    if (!payload || typeof payload !== 'object') {
      return;
    }

    const title = String(value.title || value.name || messageKey || 'Message');
    const modelKey = normalizeModelKey(title);
    if (seen.has(modelKey)) {
      return;
    }

    seen.add(modelKey);
    payloads.push({
      title,
      schema: { ...payload,
        title }
    });
  };

  const componentMessages = doc.components && doc.components.messages || {};
  Object.entries(componentMessages).forEach(([key, value]) => addMessage(key, value));
  const channels = doc.channels || {};

  Object.entries(channels).forEach(([channelName, channel]) => {
    const messageList = channel.messages || channel.message || {};
    if (Array.isArray(messageList)) {
      messageList.forEach(entry => {
        if (!entry || typeof entry !== 'object') {
          return;
        }

        const refName = entry.$ref && typeof entry.$ref === 'string' ? entry.$ref.split('/').pop() : null;
        const resolvedEntry = refName && doc.components && doc.components.messages && doc.components.messages[refName] ? doc.components.messages[refName] : entry;
        addMessage(refName || entry.name || channelName, resolvedEntry);
      });
      return;
    }

    Object.entries(messageList).forEach(([messageKey, value]) => {
      if (!value || typeof value !== 'object') {
        return;
      }

      const refName = value.$ref && typeof value.$ref === 'string' ? value.$ref.split('/').pop() : null;
      const resolvedEntry = refName && doc.components && doc.components.messages && doc.components.messages[refName] ? doc.components.messages[refName] : value;
      addMessage(messageKey, resolvedEntry);
    });
  });

  return payloads;
};

async function TypesRs({
  asyncapi
}) {
  const doc = (asyncapi === null || asyncapi === void 0 ? void 0 : asyncapi._json) || asyncapi || {};
  const generator = getRustGenerator();
  const generatedModels = [];

  for (const modelPayload of collectModelPayloads(doc)) {
    const result = await generator.generate(modelPayload.schema);
    const generated = result.find(item => item && typeof item.result === 'string' && item.result.trim()) || result[0];

    if (generated && typeof generated.result === 'string' && generated.result.trim()) {
      generatedModels.push(generated.result.trim());
    }
  }

  const lines = ['// Auto-generated types from AsyncAPI specification', '// DO NOT EDIT MANUALLY', '', 'use serde::{Serialize, Deserialize};', 'use std::collections::HashMap;', ''];

  if (generatedModels.length === 0) {
    lines.push('/// Generic message envelope for AsyncAPI');
    lines.push('#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]');
    lines.push('pub struct MessageEnvelope {');
    lines.push('    #[serde(flatten)]');
    lines.push('    pub payload: HashMap<String, serde_json::Value>,');
    lines.push('}');
    lines.push('');
  } else {
    generatedModels.forEach(model => {
      lines.push(...model.split('\n'));
      lines.push('');
    });
  }

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
