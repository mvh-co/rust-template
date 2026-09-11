function getNameFromRef(ref) {
  if (!ref) return "";
  const parts = String(ref).split("/").filter(Boolean);
  return parts[parts.length - 1] || "";
}

function isSend(op) {
  if (!op) return false;

  if (op.action) {
    return op.action === "send" || op.action === "request";
  }

  const name = op.name || getNameFromRef(op.$ref);
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

  if (op.action) {
    return op.action === "receive" || op.action === "reply";
  }

  const name = op.name || getNameFromRef(op.$ref);
  return name.includes("Event") || name.includes("Result") || name.includes("Changed");
}

function resolveSchema(asyncapi, schemaRef) {
  if (!schemaRef) return null;

  if (typeof schemaRef === "object") {
    if (schemaRef.$ref) return resolveSchema(asyncapi, schemaRef.$ref);
    return schemaRef;
  }

  if (typeof schemaRef !== "string") return null;

  if (schemaRef.startsWith("#/components/schemas/")) {
    const name = getNameFromRef(schemaRef);
    return asyncapi?.components?.schemas?.[name] || null;
  }

  return asyncapi?.components?.schemas?.[schemaRef] || null;
}

function resolveMessagePayload(asyncapi, payload) {
  if (!payload) return null;

  if (typeof payload === "object") {
    if (payload.$ref) return resolveSchema(asyncapi, payload.$ref);
    return payload;
  }

  if (typeof payload === "string") {
    return resolveSchema(asyncapi, payload);
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
  if (!messageRef) return null;

  if (typeof messageRef === "object") {
    if (messageRef.$ref) return resolveMessage(asyncapi, messageRef.$ref);
    return messageRef;
  }

  if (typeof messageRef !== "string") return null;

  if (messageRef.startsWith("#/components/messages/")) {
    const name = getNameFromRef(messageRef);
    return asyncapi?.components?.messages?.[name] || null;
  }

  if (messageRef.startsWith("#/channels/")) {
    const parts = messageRef.replace(/^#\//, "").split("/").filter(Boolean);
    const channelName = parts[1];
    const messageName = parts[3];
    const channel = asyncapi?.channels?.[channelName];
    const messages = channel?.messages || {};

    if (Array.isArray(messages)) {
      return (
        messages.find(message => {
          if (typeof message === "string") return message === messageName;
          if (message && typeof message === "object") {
            return (message.name || getNameFromRef(message.$ref)) === messageName;
          }
          return false;
        }) || null
      );
    }

    return messages[messageName] || null;
  }

  return asyncapi?.components?.messages?.[messageRef] || null;
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
    const getRefName = this?.getNameFromRef || getNameFromRef;
    const name = message.name || getRefName(message.$ref);
    return isSend({ ...message, name });
  },

  isEvent: function(message) {
    if (!message) return false;
    const getRefName = this?.getNameFromRef || getNameFromRef;
    const name = message.name || getRefName(message.$ref);
    return isReceive({ ...message, name });
  },

  isSend,
  isReceive,

  getAllSchemas: function(asyncapi) {
    const schemas = new Set();
    const getRefName = this?.getNameFromRef || getNameFromRef;

    if (asyncapi?.components?.schemas) {
      Object.keys(asyncapi.components.schemas).forEach(name => schemas.add(name));
    }

    if (asyncapi?.components?.messages) {
      Object.values(asyncapi.components.messages).forEach(msg => {
        if (msg.payload?.$ref) {
          schemas.add(getRefName(msg.payload.$ref));
        }
        if (msg.payload?.properties) {
          Object.values(msg.payload.properties).forEach(prop => {
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
    return Object.keys(asyncapi?.channels || {});
  },

  getAllOperations: function(asyncapi) {
    return Object.keys(asyncapi?.operations || {});
  },

  getChannelMessages: function(asyncapi, channelName) {
    const channel = asyncapi?.channels?.[channelName];
    if (!channel) return [];

    if (Array.isArray(channel.messages)) {
      return channel.messages
        .map(message => {
          if (typeof message === "string") {
            return asyncapi?.channels?.[channelName]?.messages?.find(item => item && typeof item === "object" && (item.name || getNameFromRef(item.$ref)) === message) || null;
          }
          return message;
        })
        .filter(Boolean);
    }

    if (channel.messages && typeof channel.messages === "object") {
      return Object.values(channel.messages)
        .map(message => resolveMessage(asyncapi, message) || message)
        .filter(Boolean);
    }

    return [];
  },

  getChannelOperations: function(asyncapi, channelName) {
    const operations = [];
    if (!asyncapi?.operations) return operations;

    Object.entries(asyncapi.operations).forEach(([key, op]) => {
      if (!op) return;
      const channelRef = typeof op.channel === "string" ? op.channel : op.channel?.$ref;
      if (channelRef === `#/channels/${channelName}`) {
        operations.push({ ...op, key });
      }
    });

    return operations;
  },

  getOperationMessages: function(asyncapi, op) {
    if (!op?.messages) return [];
    return op.messages
      .map(messageRef => resolveMessage(asyncapi, messageRef))
      .filter(Boolean);
  },
};
