function getNameFromRef(ref) {
  if (!ref) return "";
  const parts = String(ref).split("/").filter(Boolean);
  return parts[parts.length - 1] || "";
}

function unwrapAsyncApiValue(value) {
  if (typeof value === "function") {
    try {
      return value();
    } catch (error) {
      return value;
    }
  }

  if (value && typeof value === "object" && value._json) {
    return value._json;
  }

  if (value && typeof value === "object" && value._raw) {
    return value._raw;
  }

  return value;
}

function asPlainObject(value) {
  const unwrapped = unwrapAsyncApiValue(value);

  if (!unwrapped || typeof unwrapped !== "object") {
    return {};
  }

  if (unwrapped._json) {
    return { ...unwrapped._json, ...unwrapped };
  }

  if (unwrapped._raw) {
    return { ...unwrapped._raw, ...unwrapped };
  }

  return unwrapped;
}

function withFallback(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  return value;
}

function coerceEntries(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((entry, index) => [String(index), entry]);
  }
  if (typeof value === "object") {
    return Object.entries(value);
  }
  return [];
}

function getOperationKey(op, fallback = "") {
  const plain = asPlainObject(op);
  const id = typeof op?.id === "function" ? op.id() : plain.id;
  return withFallback(id, withFallback(plain.operationId, withFallback(plain.name, fallback))) || "";
}

function getOperationName(op, fallback = "") {
  const plain = asPlainObject(op);
  const name = typeof op?.name === "function" ? op.name() : plain.name;
  return withFallback(name, withFallback(getOperationKey(op, fallback), "")) || "";
}

function getOperationSummary(op) {
  const plain = asPlainObject(op);
  return typeof op?.summary === "function" ? op.summary() : plain.summary || "";
}

function getOperationAction(op, fallback = "") {
  const plain = asPlainObject(op);
  const action = typeof op?.action === "function" ? op.action() : plain.action;
  return withFallback(action, fallback) || "";
}

function isSend(op) {
  if (!op) return false;

  const plain = asPlainObject(op);
  const action = getOperationAction(op);
  if (action) {
    return action === "send" || action === "request";
  }

  const name = getOperationName(op, getNameFromRef(plain.$ref));
  return (
    name.includes("Command") ||
    name.includes("Request") ||
    name === "subscribeMessage" ||
    name === "unsubscribeMessage" ||
    name === "heartbeat"
  );
}

function isReceive(op) {
  if (!op) return false;

  const plain = asPlainObject(op);
  const action = getOperationAction(op);
  if (action) {
    return action === "receive" || action === "reply";
  }

  const name = getOperationName(op, getNameFromRef(plain.$ref));
  return name.includes("Event") || name.includes("Result") || name.includes("Changed");
}

function resolveChannel(asyncapi, channelRef) {
  const normalizedRef = unwrapAsyncApiValue(channelRef);
  if (!normalizedRef) return null;

  if (typeof normalizedRef === "object") {
    if (normalizedRef.$ref) return resolveChannel(asyncapi, normalizedRef.$ref);
    return normalizedRef;
  }

  if (typeof normalizedRef !== "string") return null;

  const segments = normalizedRef.replace(/^#\//, "").split("/").filter(Boolean);
  if (segments[0] === "channels") {
    const channelName = segments[1];
    const channels = asPlainObject(asyncapi?.channels || asyncapi?.components?.channels || {});
    return channels[channelName] || null;
  }

  if (segments[0] === "components" && segments[1] === "channels") {
    const channelName = segments[2];
    const channels = asPlainObject(asyncapi?.components?.channels || asyncapi?.channels || {});
    return channels[channelName] || null;
  }

  const channels = asPlainObject(asyncapi?.channels || asyncapi?.components?.channels || {});
  return channels[normalizedRef] || null;
}

function resolveSchema(asyncapi, schemaRef) {
  const normalizedRef = unwrapAsyncApiValue(schemaRef);
  if (!normalizedRef) return null;

  if (typeof normalizedRef === "object") {
    if (normalizedRef.$ref) return resolveSchema(asyncapi, normalizedRef.$ref);
    if (normalizedRef.schema) return resolveSchema(asyncapi, normalizedRef.schema);
    if (normalizedRef.content) {
      const content = asPlainObject(normalizedRef.content);
      const firstPayload = Object.values(content)[0];
      const resolvedContent = asPlainObject(firstPayload);
      if (resolvedContent && resolvedContent.schema) {
        return resolveSchema(asyncapi, resolvedContent.schema);
      }
    }
    return normalizedRef;
  }

  if (typeof normalizedRef !== "string") return null;

  const trimmedRef = normalizedRef.trim();
  if (!trimmedRef) return null;

  if (trimmedRef.startsWith("#/components/schemas/")) {
    const name = getNameFromRef(trimmedRef);
    return asyncapi?.components?.schemas?.[name] || null;
  }

  if (trimmedRef.startsWith("#/components/messages/")) {
    const messageName = getNameFromRef(trimmedRef);
    const message = asyncapi?.components?.messages?.[messageName];
    if (!message) return null;
    const plainMessage = asPlainObject(message);
    return resolveSchema(asyncapi, plainMessage.payload ?? plainMessage.content ?? plainMessage.schema ?? null);
  }

  const components = asPlainObject(asyncapi?.components);
  if (components.schemas && components.schemas[trimmedRef]) {
    return components.schemas[trimmedRef];
  }

  return null;
}

function resolveMessagePayload(asyncapiOrPayload, payloadOrAsyncapi) {
  const isDirectCall =
    asyncapiOrPayload &&
    typeof asyncapiOrPayload === "object" &&
    (asyncapiOrPayload.components || asyncapiOrPayload.channels || asyncapiOrPayload.messages);

  const asyncapi = isDirectCall ? asyncapiOrPayload : payloadOrAsyncapi;
  const payload = isDirectCall ? payloadOrAsyncapi : asyncapiOrPayload;
  const normalizedPayload = unwrapAsyncApiValue(payload);

  if (!normalizedPayload) return null;

  if (typeof normalizedPayload === "object") {
    if (normalizedPayload.$ref) return resolveSchema(asyncapi, normalizedPayload.$ref);
    if (normalizedPayload.payload) return resolveMessagePayload(asyncapi, normalizedPayload.payload);
    if (normalizedPayload.schema) return resolveSchema(asyncapi, normalizedPayload.schema);
    if (normalizedPayload.content) {
      const content = asPlainObject(normalizedPayload.content);
      const firstValue = Object.values(content)[0];
      if (firstValue) {
        const resolvedFirstValue = asPlainObject(firstValue);
        if (resolvedFirstValue.schema) return resolveSchema(asyncapi, resolvedFirstValue.schema);
        return resolveSchema(asyncapi, resolvedFirstValue);
      }
    }
    if (
      normalizedPayload.type ||
      normalizedPayload.properties ||
      normalizedPayload.items ||
      normalizedPayload.oneOf ||
      normalizedPayload.anyOf ||
      normalizedPayload.allOf ||
      normalizedPayload.additionalProperties !== undefined ||
      normalizedPayload.enum ||
      normalizedPayload.const !== undefined
    ) {
      return normalizedPayload;
    }
    return normalizedPayload;
  }

  if (typeof normalizedPayload === "string") {
    return resolveSchema(asyncapi, normalizedPayload);
  }

  return null;
}

function resolveMessage(asyncapi, messageRef) {
  const normalizedMessageRef = unwrapAsyncApiValue(messageRef);
  if (!normalizedMessageRef) return null;

  if (typeof normalizedMessageRef === "object") {
    if (normalizedMessageRef.$ref) return resolveMessage(asyncapi, normalizedMessageRef.$ref);
    if (normalizedMessageRef.payload || normalizedMessageRef.content || normalizedMessageRef.name || normalizedMessageRef.summary || normalizedMessageRef.title) {
      return normalizedMessageRef;
    }
    return normalizedMessageRef;
  }

  if (typeof normalizedMessageRef !== "string") return null;

  const trimmedRef = normalizedMessageRef.trim();
  if (!trimmedRef) return null;

  if (trimmedRef.startsWith("#/components/messages/")) {
    const name = getNameFromRef(trimmedRef);
    return asyncapi?.components?.messages?.[name] || null;
  }

  if (trimmedRef.startsWith("#/channels/")) {
    const parts = trimmedRef.replace(/^#\//, "").split("/").filter(Boolean);
    const channelName = parts[1];
    const messageName = parts[3] || parts[parts.length - 1];
    const channel = resolveChannel(asyncapi, `#/channels/${channelName}`) || resolveChannel(asyncapi, `#/components/channels/${channelName}`);
    if (!channel) return null;
    const channelMessages = asPlainObject(channel.messages || channel.message || {});
    if (Array.isArray(channel.messages) || Array.isArray(channel.message)) {
      const values = Array.isArray(channel.messages) ? channel.messages : channel.message;
      return values.find(message => {
        if (typeof message === "string") return message === messageName;
        const plainMessage = asPlainObject(message);
        return (plainMessage.name || getNameFromRef(plainMessage.$ref)) === messageName;
      }) || null;
    }
    return channelMessages[messageName] || null;
  }

  if (trimmedRef.startsWith("#/components/channels/")) {
    const parts = trimmedRef.replace(/^#\//, "").split("/").filter(Boolean);
    const channelName = parts[2];
    const messageName = parts[4] || parts[parts.length - 1];
    const channel = resolveChannel(asyncapi, `#/components/channels/${channelName}`) || resolveChannel(asyncapi, `#/channels/${channelName}`);
    if (!channel) return null;
    const channelMessages = asPlainObject(channel.messages || channel.message || {});
    if (Array.isArray(channel.messages) || Array.isArray(channel.message)) {
      const values = Array.isArray(channel.messages) ? channel.messages : channel.message;
      return values.find(message => {
        if (typeof message === "string") return message === messageName;
        const plainMessage = asPlainObject(message);
        return (plainMessage.name || getNameFromRef(plainMessage.$ref)) === messageName;
      }) || null;
    }
    return channelMessages[messageName] || null;
  }

  const components = asPlainObject(asyncapi?.components);
  if (components.messages && components.messages[trimmedRef]) {
    return components.messages[trimmedRef];
  }

  const rootMessages = asPlainObject(asyncapi?.messages);
  if (rootMessages[trimmedRef]) {
    return rootMessages[trimmedRef];
  }

  return null;
}

function getAllMessages(asyncapi) {
  const messages = {};
  const components = asPlainObject(asyncapi?.components);

  if (components.messages) {
    Object.assign(messages, components.messages);
  }

  if (asyncapi?.messages) {
    Object.assign(messages, asPlainObject(asyncapi.messages));
  }

  const channels = asPlainObject(asyncapi?.channels || components.channels || {});
  Object.values(channels).forEach(channel => {
    const plainChannel = asPlainObject(channel);
    if (plainChannel.messages) {
      Object.assign(messages, asPlainObject(plainChannel.messages));
    }
    if (plainChannel.message) {
      const messageRef = unwrapAsyncApiValue(plainChannel.message);
      if (Array.isArray(messageRef)) {
        messageRef.forEach((entry, index) => {
          const resolved = resolveMessage(asyncapi, entry);
          if (resolved) {
            messages[index] = resolved;
          }
        });
      } else if (typeof messageRef === "object") {
        const messageEntries = coerceEntries(messageRef);
        messageEntries.forEach(([key, entry]) => {
          const resolved = resolveMessage(asyncapi, entry);
          if (resolved) {
            messages[key] = resolved;
          }
        });
      }
    }
  });

  return messages;
}

function getAllSchemas(asyncapi) {
  const schemas = new Set();
  const components = asPlainObject(asyncapi?.components);

  if (components.schemas) {
    Object.keys(components.schemas).forEach(name => schemas.add(name));
  }

  const allMessages = getAllMessages(asyncapi);
  Object.values(allMessages).forEach(message => {
    const plainMessage = asPlainObject(message);
    const payload = resolveMessagePayload(asyncapi, plainMessage.payload ?? plainMessage.content ?? plainMessage);
    if (payload && payload.$ref) {
      const refName = getNameFromRef(payload.$ref);
      if (refName) schemas.add(refName);
    }
    if (payload && payload.properties) {
      Object.values(payload.properties).forEach(property => {
        const plainProperty = asPlainObject(property);
        if (plainProperty.$ref) {
          const refName = getNameFromRef(plainProperty.$ref);
          if (refName) schemas.add(refName);
        }
      });
    }
  });

  return Array.from(schemas);
}

function getAllChannels(asyncapi) {
  const components = asPlainObject(asyncapi?.components);
  const channels = asPlainObject(asyncapi?.channels || components.channels || {});
  return Object.keys(channels || {});
}

function getAllOperations(asyncapi) {
  const seen = new Set();
  const operations = [];

  const addOperation = (op, key, fallbackAction, channelName) => {
    if (!op) return;
    const plain = asPlainObject(op);
    const operationKey = getOperationKey(op, key);
    if (!operationKey || seen.has(operationKey)) {
      return;
    }
    seen.add(operationKey);

    const action = getOperationAction(op, fallbackAction) || fallbackAction || "";
    operations.push({
      ...plain,
      key: operationKey,
      name: getOperationName(op, key),
      summary: getOperationSummary(op) || plain.summary || "",
      action,
      channelName,
    });
  };

  const componentOperations = asPlainObject(asyncapi?.components?.operations || {});
  Object.entries(componentOperations).forEach(([key, op]) => {
    addOperation(op, key, getOperationAction(op), undefined);
  });

  const rawOperations = typeof asyncapi?.operations === "function" ? asyncapi.operations() : asyncapi?.operations;
  const operationEntries = coerceEntries(rawOperations)
    .filter(([key, op]) => key && op)
    .map(([key, op]) => [key, op]);
  operationEntries.forEach(([key, op]) => addOperation(op, key, getOperationAction(op), undefined));

  const channels = asPlainObject(asyncapi?.channels || asyncapi?.components?.channels || {});
  Object.entries(channels).forEach(([channelName, channel]) => {
    const plainChannel = asPlainObject(channel);
    const publishOperation = unwrapAsyncApiValue(plainChannel.publish ?? channel?.publish);
    if (publishOperation) {
      addOperation(publishOperation, `${channelName}.publish`, "send", channelName);
    }

    const subscribeOperation = unwrapAsyncApiValue(plainChannel.subscribe ?? channel?.subscribe);
    if (subscribeOperation) {
      addOperation(subscribeOperation, `${channelName}.subscribe`, "receive", channelName);
    }

    if (plainChannel.messages && Array.isArray(plainChannel.messages)) {
      plainChannel.messages.forEach(message => {
        const resolved = resolveMessage(asyncapi, message);
        if (resolved) {
          // no-op: channel.message entries are already resolved in the message templates
        }
      });
    }
  });

  return operations.filter(operation => operation.key);
}

function getChannelMessages(asyncapi, channelName) {
  const channels = asPlainObject(asyncapi?.channels || asyncapi?.components?.channels || {});
  const channel = unwrapAsyncApiValue(channels[channelName]);
  if (!channel) return [];

  const plainChannel = asPlainObject(channel);
  const messages = [];

  const collect = value => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(item => collect(item));
      return;
    }
    if (typeof value === "object") {
      if (value.$ref) {
        messages.push(value);
        return;
      }
      if (value.messages) {
        collect(value.messages);
        return;
      }
      if (value.message) {
        collect(value.message);
        return;
      }
      messages.push(value);
      return;
    }
    messages.push(value);
  };

  collect(plainChannel.messages ?? channel?.messages);
  collect(plainChannel.message ?? channel?.message);

  const publishOperation = unwrapAsyncApiValue(plainChannel.publish ?? channel?.publish);
  const subscribeOperation = unwrapAsyncApiValue(plainChannel.subscribe ?? channel?.subscribe);
  collect(unwrapAsyncApiValue(publishOperation?.message ?? publishOperation?.messages));
  collect(unwrapAsyncApiValue(subscribeOperation?.message ?? subscribeOperation?.messages));

  const resolvedMessages = messages
    .map(message => resolveMessage(asyncapi, message) || unwrapAsyncApiValue(message))
    .filter(Boolean);

  return resolvedMessages;
}

function getChannelOperations(asyncapi, channelName) {
  const operations = [];
  const channels = asPlainObject(asyncapi?.channels || asyncapi?.components?.channels || {});
  const channel = unwrapAsyncApiValue(channels[channelName]);
  if (!channel) return operations;

  const addOperation = (value, fallbackAction) => {
    const op = unwrapAsyncApiValue(value);
    if (!op) return;
    const opPlain = asPlainObject(op);
    operations.push({
      ...opPlain,
      key: getOperationKey(op, `${channelName}.${fallbackAction}`),
      name: getOperationName(op, `${channelName}.${fallbackAction}`),
      action: getOperationAction(op, fallbackAction),
      summary: getOperationSummary(op) || opPlain.summary || "",
    });
  };

  addOperation(asPlainObject(channel).publish, "send");
  addOperation(asPlainObject(channel).subscribe, "receive");

  const componentOperations = asPlainObject(asyncapi?.components?.operations || {});
  Object.entries(componentOperations).forEach(([key, operation]) => {
    const plainOperation = asPlainObject(operation);
    const channelRef = unwrapAsyncApiValue(plainOperation.channel ?? operation?.channel);
    const resolvedChannelRef = typeof channelRef === "string" ? channelRef : channelRef?.$ref;
    if (resolvedChannelRef === `#/channels/${channelName}` || resolvedChannelRef === channelName || resolvedChannelRef === `#/components/channels/${channelName}`) {
      operations.push({
        ...plainOperation,
        key: getOperationKey(operation, key),
        name: getOperationName(operation, key),
        action: getOperationAction(operation, "send"),
        summary: getOperationSummary(operation) || plainOperation.summary || "",
      });
    }
  });

  return operations.filter(operation => operation.key);
}

function getOperationMessages(asyncapi, op) {
  if (!op) return [];

  const plain = asPlainObject(op);
  const candidates = [];

  const pushCandidates = value => {
    if (!value) return;
    if (Array.isArray(value)) {
      candidates.push(...value);
      return;
    }
    if (typeof value === "object") {
      if (value.$ref) {
        candidates.push(value);
        return;
      }
      if (value.messages) {
        pushCandidates(value.messages);
        return;
      }
      if (value.message) {
        pushCandidates(value.message);
        return;
      }
      candidates.push(value);
      return;
    }
    candidates.push(value);
  };

  pushCandidates(plain.messages ?? op?.messages);
  pushCandidates(plain.message ?? op?.message);

  const channelRef = unwrapAsyncApiValue(plain.channel ?? op?.channel);
  if (channelRef) {
    const resolvedChannel = resolveChannel(asyncapi, channelRef);
    if (resolvedChannel) {
      const channelPlain = asPlainObject(resolvedChannel);
      pushCandidates(channelPlain.messages ?? resolvedChannel?.messages);
      pushCandidates(channelPlain.message ?? resolvedChannel?.message);
    }
  }

  return candidates
    .map(messageRef => resolveMessage(asyncapi, messageRef) || unwrapAsyncApiValue(messageRef))
    .filter(Boolean);
}

function mapType(type, format, schema) {
  const resolvedType = type || schema?.type;
  const resolvedFormat = format || schema?.format;
  const itemSchema = schema || {};

  if (itemSchema.additionalProperties === true) {
    return "serde_json::Value";
  }

  if (itemSchema.const !== undefined) {
    if (itemSchema.type !== undefined) {
      const { const: _const, enum: _enum, ...baseSchema } = itemSchema;
      return mapType(itemSchema.type, itemSchema.format, baseSchema);
    }
    if (typeof itemSchema.const === "string") return "String";
    if (typeof itemSchema.const === "number") return Number.isInteger(itemSchema.const) ? "i64" : "f64";
    if (typeof itemSchema.const === "boolean") return "bool";
    return "serde_json::Value";
  }

  if (Array.isArray(itemSchema.enum)) {
    if (itemSchema.type !== undefined) {
      const { const: _const, enum: _enum, ...baseSchema } = itemSchema;
      return mapType(itemSchema.type, itemSchema.format, baseSchema);
    }
    if (itemSchema.enum.length > 0) {
      const firstEnumValue = itemSchema.enum[0];
      if (typeof firstEnumValue === "string") return "String";
      if (typeof firstEnumValue === "number") return Number.isInteger(firstEnumValue) ? "i64" : "f64";
      if (typeof firstEnumValue === "boolean") return "bool";
    }
    return "serde_json::Value";
  }

  if (resolvedType === "array") {
    const itemType = itemSchema.items?.type || "serde_json::Value";
    const itemRustType = mapType(itemType, itemSchema.items?.format, itemSchema.items);
    return `Vec<${itemRustType}>`;
  }

  if (resolvedType === "integer") {
    return resolvedFormat === "int32" ? "i32" : "i64";
  }

  const typeMap = {
    string: "String",
    number: "f64",
    boolean: "bool",
    object: "serde_json::Value",
  };

  if (typeMap[resolvedType]) {
    return typeMap[resolvedType];
  }

  return "serde_json::Value";
}

function toPascalCase(name) {
  if (!name) return "";
  return String(name)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(word => word.length > 0)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");
}

function toSnakeCase(name) {
  if (!name) return "";
  return name
    .replace(/([A-Z])/g, "_$1")
    .toLowerCase()
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .replace(/^_+|_+$/g, "");
}

function toSlug(name) {
  if (!name) return "";
  const normalized = String(name).trim();
  const slug = Array.from(normalized.toLowerCase())
    .map(character => (/[a-z0-9]/.test(character) ? character : '-'))
    .join('')
    .split('-')
    .filter(Boolean)
    .join('-');

  return slug;
}

function generateDoc(description) {
  if (!description) return "";
  return description
    .split("\n")
    .map(line => `/// ${line.trim()}`)
    .join("\n///\n");
}

function isRequired(required, propertyName) {
  return Array.isArray(required) && required.includes(propertyName);
}

function isConstProperty(property) {
  return !!property && property.const !== undefined;
}

function isCommand(message) {
  if (!message) return false;
  const plain = asPlainObject(message);
  const name = getOperationName(message, getNameFromRef(plain.$ref));
  return isSend({ ...plain, name, action: getOperationAction(message) });
}

function isEvent(message) {
  if (!message) return false;
  const plain = asPlainObject(message);
  const name = getOperationName(message, getNameFromRef(plain.$ref));
  return isReceive({ ...plain, name, action: getOperationAction(message) });
}

module.exports = {
  mapType,
  toPascalCase,
  toSnakeCase,
  toSlug,
  getNameFromRef,
  resolveSchema,
  resolveMessagePayload,
  resolveMessage,
  isRequired,
  isConst: isConstProperty,
  generateDoc,
  isCommand,
  isEvent,
  isSend,
  isReceive,
  getAllSchemas,
  getAllMessages,
  getAllChannels,
  getAllOperations,
  getChannelMessages,
  getChannelOperations,
  getOperationMessages,
};
