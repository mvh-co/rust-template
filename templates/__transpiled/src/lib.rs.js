'use strict';

require('source-map-support/register');
var generatorReactSdk = require('@asyncapi/generator-react-sdk');
var jsxRuntime = require('/home/runner/.npm/_npx/0929aae77d023606/node_modules/react/cjs/react-jsx-runtime.production.min.js');

const slugify = value => String(value || 'asyncapi-client').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'asyncapi-client';
function LibRs({
  asyncapi
}) {
  const doc = (asyncapi === null || asyncapi === void 0 ? void 0 : asyncapi._json) || asyncapi || {};
  const title = doc.info && doc.info.title || 'AsyncAPI Client';
  const content = `//! ${title} WebSocket SDK
//!
//! Generic Rust client generated from AsyncAPI specification.
//! This SDK provides a WebSocket client for the API described in the specification.
//!
//! ## Example
//!
//! \`\`\`rust,no_run
//! use ${slugify(title)}_sdk::ws::client::AsyncApiClient;
//!
//! #[tokio::main]
//! async fn main() {
//!     let url = "ws://localhost:8080";
//!     let mut client = AsyncApiClient::new(url);
//!     client.connect().await.unwrap();
//! }
//! \`\`\`

pub mod ws;
`;
  return /*#__PURE__*/jsxRuntime.jsx(generatorReactSdk.File, {
    name: "lib.rs",
    children: /*#__PURE__*/jsxRuntime.jsx(generatorReactSdk.Text, {
      children: content
    })
  });
}

module.exports = LibRs;
//# sourceMappingURL=lib.rs.js.map
