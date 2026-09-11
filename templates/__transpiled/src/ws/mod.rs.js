'use strict';

require('source-map-support/register');
var generatorReactSdk = require('@asyncapi/generator-react-sdk');
var jsxRuntime = require('/home/runner/.npm/_npx/0929aae77d023606/node_modules/react/cjs/react-jsx-runtime.production.min.js');

function ModRs({
  asyncapi
}) {
  const doc = (asyncapi === null || asyncapi === void 0 ? void 0 : asyncapi._json) || asyncapi || {};
  const title = doc.info && doc.info.title || 'AsyncAPI Client';
  const content = `//! WebSocket module for ${title}

pub mod types;
pub mod client;
`;
  return /*#__PURE__*/jsxRuntime.jsx(generatorReactSdk.File, {
    name: "mod.rs",
    children: /*#__PURE__*/jsxRuntime.jsx(generatorReactSdk.Text, {
      children: content
    })
  });
}

module.exports = ModRs;
//# sourceMappingURL=mod.rs.js.map
