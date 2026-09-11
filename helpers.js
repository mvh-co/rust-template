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
    const parts = messageRef.split("/").filter(Boolean);
    const channelName = parts[1];
    const messageName = parts[3];
    const channel = asyncapi?.channels?.[channelName];
    const messages = channel?.messages || {};

    if (Array.isArray(messages)) {
      return messages.find(message => {
        if (typeof message === "string") return message === messageName;
        if (message && typeof message === "object") {
          return (message.name || getNameFromRef(message.$ref)) === messageName;
        }
        return false;
      }) || null;
    }

    return messages[messageName] || null;
  }

  return asyncapi?.components?.messages?.[messageRef] || null;
}

module.exports = {
  // Maps AsyncAPI types to Rust types
  mapType: function(type, format, schema) {
    const resolvedType = type || schema?.type;
    const resolvedFormat = format || schema?.format;
    const itemSchema = schema || {};

    if (itemSchema.additionalProperties === true) {
      return "serde_json::Value";
    }

    if (itemSchema.const !== undefined || Array.isArray(itemSchema.enum)) {
      if (itemSchema.type) {
        return module.exports.mapType(itemSchema.type, itemSchema.format, itemSchema);
      }
      if (Array.isArray(itemSchema.enum) && itemSchema.enum.length > 0) {
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

  // Converts a name to PascalCase (for struct/enum names)
  toPascalCase: function(name) {
    if (!name) return "";
    return name
      .replace(/[^a-zA-Z0-9]/g, " ")
      .split(" ")
      .filter(word => word.length > 0)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join("");
  },

  // Converts a name to snake_case (for variables/functions)
  toSnakeCase: function(name) {
    if (!name) return "";
    return name
      .replace(/([A-Z])/g, "_$1")
      .toLowerCase()
      .replace(/[^a-zA-Z0-9_]/g, "_")
      .replace(/^_+|_+$/g, "");
  },

  // Converts a name to a slug (e.g., "Hello World" -> "hello-world")
  toSlug: function(name) {
    if (!name) return "";
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/--+/g, "-");
  },

  // Extracts the name from a $ref (e.g., "#/components/messages/AuthenticateCommand" -> "AuthenticateCommand")
  getNameFromRef: getNameFromRef,

  // Generates Rust doc comments
  generateDoc: function(description) {
    if (!description) return "";
    return description
      .split("\n")
      .map(line => `/// ${line.trim()}`)
      .join("\n///\n");
  },

  // Checks if a message is a command (sent by the client)
  isCommand: function(message) {
    return isSend(message);
  },

  // Checks if a message is an event (received by the client)
  isEvent: function(message) {
    return isReceive(message);
  },

  isSend: isSend,
  isReceive: isReceive,

  // Retrieves all unique schemas from messages
  getAllSchemas: function(asyncapi) {
    const schemas = {};

    if (asyncapi?.components?.schemas) {
      Object.entries(asyncapi.components.schemas).forEach(([name, schema]) => {
        schemas[name] = schema;
      });
    }

    if (asyncapi?.components?.messages) {
      Object.entries(asyncapi.components.messages).forEach(([name, message]) => {
        if (message?.payload) {
          schemas[name] = message.payload;
        }
      });
    }

    return schemas;
  },

  // Retrieves all channels
  getAllChannels: function(asyncapi) {
    return Object.keys(asyncapi?.channels || {});
  },

  // Retrieves all operations
  getAllOperations: function(asyncapi) {
    return Object.keys(asyncapi?.operations || {});
  },

  // Retrieves messages from a channel
  getChannelMessages: function(asyncapi, channelName) {
    const channel = asyncapi?.channels?.[channelName];
    if (!channel) return [];

    if (Array.isArray(channel.messages)) {
      return channel.messages.map(message => {
        if (typeof message === "string") {
          return asyncapi?.channels?.[channelName]?.messages?.find(item => item && typeof item === "object" && (item.name || getNameFromRef(item.$ref)) === message) || null;
        }
        return message;
      }).filter(Boolean);
    }

    if (channel.messages && typeof channel.messages === "object") {
      return Object.values(channel.messages).map(message => resolveMessage(asyncapi, message) || message).filter(Boolean);
    }

    return [];
  },

  // Retrieves operations from a channel
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