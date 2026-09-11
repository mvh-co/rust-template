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

  return unwrapped;
}

function getOperationKey(op, fallback = "") {
  const plain = asPlainObject(op);
  const id = typeof op?.id === "function" ? op.id() : plain.id;
  return id || plain.operationId || plain.name || fallback || "";
}

function getOperationName(op, fallback = "") {
  const plain = asPlainObject(op);
  const name = typeof op?.name === "function" ? op.name() : plain.name;
  return name || getOperationKey(op, fallback) || "";
}

function getOperationSummary(op) {
  const plain = asPlainObject(op);
  return typeof op?.summary === "function" ? op.summary() : plain.summary || "";
}

function getOperationAction(op, fallback = "") {
  const plain = asPlainObject(op);
  const action = typeof op?.action === "function" ? op.action() : plain.action;
  return action || fallback || "";
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

function resolveSchema(asyncapi, schemaRef) {
  const normalizedRef = unwrapAsyncApiValue(schemaRef);
  if (!normalizedRef) return null;

  if (typeof normalizedRef === "object") {
    if (normalizedRef.$ref) return resolveSchema(asyncapi, normalizedRef.$ref);
    return normalizedRef;
  }

  if (typeof normalizedRef !== "string") return null;

  if (normalizedRef.startsWith("#/components/schemas/")) {
    const name = getNameFromRef(normalizedRef);
    return asyncapi?.components?.schemas?.[name] || null;
  }

  return asyncapi?.components?.schemas?.[normalizedRef] || null;
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
    return normalizedPayload;
  }

  if (typeof normalizedPayload === "string") {
    return resolveSchema(asyncapi, normalizedPayload);
  }

  return null;
}

function isRequired(required, propertyName) {
  return Array.isArray(required) && required.includes(propertyName);
}

function isConstProperty(property) {
  return !!property && property.const !== undefined;
}

function resolveMessage(asyncapi, messageRef) {
  const normalizedMessageRef = unwrapAsyncApiValue(messageRef);
  if (!normalizedMessageRef) return null;

  if (typeof normalizedMessageRef === "object") {
    if (normalizedMessageRef.$ref) return resolveMessage(asyncapi, normalizedMessageRef.$ref);
    return normalizedMessageRef;
  }

  if (typeof normalizedMessageRef !== "string") return null;

  if (normalizedMessageRef.startsWith("#/components/messages/")) {
    const name = getNameFromRef(normalizedMessageRef);
    return asyncapi?.components?.messages?.[name] || null;
  }

  if (normalizedMessageRef.startsWith("#/channels/")) {
    const parts = normalizedMessageRef.replace(/^#\//, "").split("/").filter(Boolean);
    const channelName = parts[1];
    const messageName = parts[3];
    const channel = asyncapi?.channels?.[channelName] || (typeof asyncapi?.channels === "function" ? asyncapi.channels()[channelName] : null);
    const messages = channel?.messages || {};

    if (Array.isArray(messages)) {
      return (
        messages.find(message => {
          if (typeof message === "string") return message === messageName;
          if (message && typeof message === "object") {
            const plain = asPlainObject(message);
            return (plain.name || getNameFromRef(plain.$ref)) === messageName;
          }
          return false;
        }) || null
      );
    }

    return messages[messageName] || null;
  }

  return asyncapi?.components?.messages?.[normalizedMessageRef] || null;
}

module.exports = {
  mapType: function(type, format, schema) {
    const resolvedType = type || schema?.type;
    const resolvedFormat = format || schema?.format;
    const itemSchema = schema || {};

    if (itemSchema.additionalProperties === true) {
      return "serde_json::Value";
    }

    if (itemSchema.const !== undefined) {
      if (itemSchema.type !== undefined) {
        const { const: _const, enum: _enum, ...baseSchema } = itemSchema;
        return module.exports.mapType(itemSchema.type, itemSchema.format, baseSchema);
      }
      if (typeof itemSchema.const === "string") return "String";
      if (typeof itemSchema.const === "number") return Number.isInteger(itemSchema.const) ? "i64" : "f64";
      if (typeof itemSchema.const === "boolean") return "bool";
      return "serde_json::Value";
    }

    if (Array.isArray(itemSchema.enum)) {
      if (itemSchema.type !== undefined) {
        const { const: _const, enum: _enum, ...baseSchema } = itemSchema;
        return module.exports.mapType(itemSchema.type, itemSchema.format, baseSchema);
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
      const itemRustType = module.exports.mapType(itemType, itemSchema.items?.format, itemSchema.items);
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
  },

  toPascalCase: function(name) {
    if (!name) return "";
    return String(name)
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/[^a-zA-Z0-9]+/g, " ")
      .trim()
      .split(/\s+/)
      .filter(word => word.length > 0)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join("");
  },

  toSnakeCase: function(name) {
    if (!name) return "";
    return name
      .replace(/([A-Z])/g, "_$1")
      .toLowerCase()
      .replace(/[^a-zA-Z0-9_]/g, "_")
      .replace(/^_+|_+$/g, "");
  },

  toSlug: function(name) {
    if (!name) return "";
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/--+/g, "-");
  },

  getNameFromRef: function(ref) {
    return getNameFromRef(ref);
  },

  resolveSchema: function(asyncapi, schemaRef) {
    return resolveSchema(asyncapi, schemaRef);
  },

  resolveMessagePayload: function(asyncapi, payload) {
    return resolveMessagePayload(asyncapi, payload);
  },

  isRequired: function(required, propertyName) {
    return isRequired(required, propertyName);
  },

  isConst: function(property) {
    return isConstProperty(property);
  },

  generateDoc: function(description) {
    if (!description) return "";
    return description
      .split("\n")
      .map(line => `/// ${line.trim()}`)
      .join("\n///\n");
  },

  isCommand: function(message) {
    if (!message) return false;
    const plain = asPlainObject(message);
    const getRefName = this?.getNameFromRef || getNameFromRef;
    const name = getOperationName(message, getRefName(plain.$ref));
    return isSend({ ...plain, name, action: getOperationAction(message) });
  },

  isEvent: function(message) {
    if (!message) return false;
    const plain = asPlainObject(message);
    const getRefName = this?.getNameFromRef || getNameFromRef;
    const name = getOperationName(message, getRefName(plain.$ref));
    return isReceive({ ...plain, name, action: getOperationAction(message) });
  },

  isSend,
  isReceive,

  getAllSchemas: function(asyncapi) {
    const schemas = new Set();
    const getRefName = this?.getNameFromRef || getNameFromRef;
    const components = asPlainObject(asyncapi?.components);

    if (components.schemas) {
      Object.keys(components.schemas).forEach(name => schemas.add(name));
    }

    if (components.messages) {
      Object.values(components.messages).forEach(msg => {
        const plain = asPlainObject(msg);
        const payload = unwrapAsyncApiValue(plain.payload ?? msg?.payload);
        if (payload?.$ref) {
          schemas.add(getRefName(payload.$ref));
        }
        if (payload?.properties) {
          Object.values(payload.properties).forEach(prop => {
            if (prop.$ref) {
              schemas.add(getRefName(prop.$ref));
            }
          });
        }
      });
    }

    return Array.from(schemas);
  },

  getAllChannels: function(asyncapi) {
    const channels = typeof asyncapi?.channels === "function" ? asyncapi.channels() : asyncapi?.channels || {};
    return Object.keys(channels || {});
  },

  getAllOperations: function(asyncapi) {
    const rawOperations = typeof asyncapi?.operations === "function" ? asyncapi.operations() : asyncapi?.operations;
    if (rawOperations) {
      const entries = typeof rawOperations.all === "function" ? rawOperations.all() : Object.entries(rawOperations || {});
      return entries
        .map(([key, op]) => {
          const plain = asPlainObject(op);
          return {
            ...plain,
            key: getOperationKey(op, key),
            name: getOperationName(op, key),
            summary: getOperationSummary(op) || plain.summary || "",
            action: getOperationAction(op, key.toLowerCase().includes("receive") ? "receive" : undefined),
          };
        })
        .filter(operation => operation.key);
    }

    const operations = [];
    const channels = typeof asyncapi?.channels === "function" ? asyncapi.channels() : asyncapi?.channels || {};
    Object.entries(channels || {}).forEach(([channelName, channel]) => {
      if (!channel) return;
      const plain = asPlainObject(channel);
      const publishOperation = unwrapAsyncApiValue(plain.publish ?? channel?.publish);
      if (publishOperation) {
        const publishPlain = asPlainObject(publishOperation);
        operations.push({
          ...publishPlain,
          key: getOperationKey(publishOperation, `${channelName}.publish`),
          name: getOperationName(publishOperation, `${channelName}.publish`),
          summary: getOperationSummary(publishOperation) || publishPlain.summary || "",
          action: "send",
          channelName,
        });
      }
      const subscribeOperation = unwrapAsyncApiValue(plain.subscribe ?? channel?.subscribe);
      if (subscribeOperation) {
        const subscribePlain = asPlainObject(subscribeOperation);
        operations.push({
          ...subscribePlain,
          key: getOperationKey(subscribeOperation, `${channelName}.subscribe`),
          name: getOperationName(subscribeOperation, `${channelName}.subscribe`),
          summary: getOperationSummary(subscribeOperation) || subscribePlain.summary || "",
          action: "receive",
          channelName,
        });
      }
    });

    return operations.filter(operation => operation.key);
  },

  getChannelMessages: function(asyncapi, channelName) {
    const channels = typeof asyncapi?.channels === "function" ? asyncapi.channels() : asyncapi?.channels || {};
    const channel = unwrapAsyncApiValue(channels?.[channelName]);
    if (!channel) return [];

    const plain = asPlainObject(channel);
    const messages = [];
    const publishOperation = unwrapAsyncApiValue(plain.publish ?? channel?.publish);
    const subscribeOperation = unwrapAsyncApiValue(plain.subscribe ?? channel?.subscribe);

    if (publishOperation) {
      const publishPlain = asPlainObject(publishOperation);
      const publishMessage = unwrapAsyncApiValue(publishPlain.message ?? publishOperation?.message);
      if (publishMessage) messages.push(publishMessage);
    }
    if (subscribeOperation) {
      const subscribePlain = asPlainObject(subscribeOperation);
      const subscribeMessage = unwrapAsyncApiValue(subscribePlain.message ?? subscribeOperation?.message);
      if (subscribeMessage) messages.push(subscribeMessage);
    }
    if (Array.isArray(plain.messages)) {
      messages.push(...plain.messages);
    }
    if (plain.messages && typeof plain.messages === "object") {
      messages.push(...Object.values(plain.messages));
    }

    return messages
      .map(message => resolveMessage(asyncapi, message) || unwrapAsyncApiValue(message))
      .filter(Boolean);
  },

  getChannelOperations: function(asyncapi, channelName) {
    const operations = [];
    const channels = typeof asyncapi?.channels === "function" ? asyncapi.channels() : asyncapi?.channels || {};
    const channel = unwrapAsyncApiValue(channels[channelName]);
    if (!channel) return operations;

    const plain = asPlainObject(channel);
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

    addOperation(plain.publish, "send");
    addOperation(plain.subscribe, "receive");

    const rawOperations = typeof asyncapi?.operations === "function" ? asyncapi.operations() : asyncapi?.operations;
    if (rawOperations) {
      const opEntries = typeof rawOperations.all === "function" ? rawOperations.all() : Object.entries(rawOperations || {});
      opEntries.forEach(([key, op]) => {
        if (!op) return;
        const opPlain = asPlainObject(op);
        const channelRef = unwrapAsyncApiValue(opPlain.channel ?? op?.channel);
        const resolvedChannelRef = typeof channelRef === "string" ? channelRef : channelRef?.$ref;
        if (resolvedChannelRef === `#/channels/${channelName}` || resolvedChannelRef === channelName) {
          operations.push({
            ...opPlain,
            key: getOperationKey(op, key),
            name: getOperationName(op, key),
            action: getOperationAction(op, "send"),
            summary: getOperationSummary(op) || opPlain.summary || "",
          });
        }
      });
    }

    return operations.filter(operation => operation.key);
  },

  getOperationMessages: function(asyncapi, op) {
    if (!op) return [];

    const plain = asPlainObject(op);
    const candidates = [];

    const pushCandidates = (value, asObjectMap = false) => {
      if (!value) return;
      if (Array.isArray(value)) {
        candidates.push(...value);
        return;
      }
      if (typeof value === "object") {
        if (asObjectMap) {
          candidates.push(...Object.values(value));
          return;
        }
        candidates.push(value);
        return;
      }
      candidates.push(value);
    };

    pushCandidates(unwrapAsyncApiValue(plain.messages ?? op?.messages), true);
    pushCandidates(unwrapAsyncApiValue(plain.message ?? op?.message));

    return candidates
      .map(messageRef => resolveMessage(asyncapi, messageRef) || unwrapAsyncApiValue(messageRef))
      .filter(Boolean);
  },
};
