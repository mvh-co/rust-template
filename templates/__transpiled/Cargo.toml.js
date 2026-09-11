'use strict';

require('source-map-support/register');
var generatorReactSdk = require('@asyncapi/generator-react-sdk');
var jsxRuntime = require('/home/runner/.npm/_npx/0929aae77d023606/node_modules/react/cjs/react-jsx-runtime.production.min.js');

const slugify = value => String(value || 'asyncapi-client').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'asyncapi-client';
function CargoToml({
  asyncapi
}) {
  const doc = (asyncapi === null || asyncapi === void 0 ? void 0 : asyncapi._json) || asyncapi || {};
  const info = doc.info || {};
  const title = info.title || 'asyncapi-client';
  const version = info.version || '1.0.0';
  const description = info.description || '';
  const licenseName = info.license && info.license.name || '';
  const lines = ['[package]', `name = "${slugify(title)}-sdk"`, `version = "${version}"`, 'edition = "2021"', description ? `description = "${description.replace(/"/g, '\\"')}"` : '', licenseName ? `license = "${licenseName.replace(/"/g, '\\"')}"` : '', '', '[dependencies]', 'tokio = { version = "1.0", features = ["full"] }', 'tokio-tungstenite = { version = "0.23", features = ["native-tls"] }', 'serde = { version = "1.0", features = ["derive"] }', 'serde_json = "1.0"', 'futures-util = "0.3"', 'thiserror = "1.0"', 'log = "0.4"', 'chrono = "0.4"', ''].filter(Boolean).join('\n');
  return /*#__PURE__*/jsxRuntime.jsx(generatorReactSdk.File, {
    name: "Cargo.toml",
    children: /*#__PURE__*/jsxRuntime.jsx(generatorReactSdk.Text, {
      children: lines
    })
  });
}

module.exports = CargoToml;
//# sourceMappingURL=Cargo.toml.js.map
