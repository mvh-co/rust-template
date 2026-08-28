module.exports = {
  // Maps AsyncAPI types to Rust types
  mapType: function(type, format) {
    const typeMap = {
      string: "String",
      number: "f64",
      integer: format === "int32" ? "i32" : "i64",
      boolean: "bool",
      object: "serde_json::Value",
      array: "Vec<serde_json::Value>",
    };
    return typeMap[type] || "serde_json::Value";
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
      .replace(/[^a-z0-9]+/g, "-")  // Replace non-alphanumeric characters with "-"
      .replace(/^-+|-+$/g, "")     // Remove leading/trailing "-"
      .replace(/--+/g, "-");       // Replace multiple "-" with a single "-"
  },

  // Extracts the name from a $ref (e.g., "#/components/messages/AuthenticateCommand" -> "AuthenticateCommand")
  getNameFromRef: function(ref) {
    if (!ref) return "";
    const parts = ref.split("/");
    return parts[parts.length - 1];
  },

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
    if (!message) return false;
    const name = message.name || this.getNameFromRef(message.$ref);
    return name.includes("Command") || name.includes("Request") || name === "subscribeMessage" || name === "unsubscribeMessage" || name === "heartbeat";
  },

  // Checks if a message is an event (received by the client)
  isEvent: function(message) {
    if (!message) return false;
    const name = message.name || this.getNameFromRef(message.$ref);
    return name.includes("Event") || name.includes("Result") || name.includes("Changed");
  },

  // Retrieves all unique schemas from messages
  getAllSchemas: function(asyncapi) {
    const schemas = new Set();
    if (asyncapi.components?.schemas) {
      Object.keys(asyncapi.components.schemas).forEach(name => schemas.add(name));
    }
    if (asyncapi.components?.messages) {
      Object.values(asyncapi.components.messages).forEach(msg => {
        if (msg.payload?.$ref) {
          schemas.add(this.getNameFromRef(msg.payload.$ref));
        }
        if (msg.payload?.properties) {
          Object.values(msg.payload.properties).forEach(prop => {
            if (prop.$ref) {
              schemas.add(this.getNameFromRef(prop.$ref));
            }
          });
        }
      });
    }
    return Array.from(schemas);
  },

  // Retrieves all channels
  getAllChannels: function(asyncapi) {
    return Object.keys(asyncapi.channels || {});
  },

  // Retrieves all operations
  getAllOperations: function(asyncapi) {
    return Object.keys(asyncapi.operations || {});
  },

  // Retrieves messages from a channel
  getChannelMessages: function(asyncapi, channelName) {
    const channel = asyncapi.channels[channelName];
    if (!channel) return [];
    return channel.messages || [];
  },

  // Retrieves operations from a channel
  getChannelOperations: function(asyncapi, channelName) {
    const operations = [];
    if (asyncapi.operations) {
      Object.values(asyncapi.operations).forEach(op => {
        if (op.channel && op.channel.$ref === `#/channels/${channelName}`) {
          operations.push(op);
        }
      });
    }
    return operations;
  }
};