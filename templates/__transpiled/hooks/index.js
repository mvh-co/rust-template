'use strict';

require('source-map-support/register');

const fs = require('fs');
const path = require('path');
function stripHbsExtensions(targetDir) {
  if (!fs.existsSync(targetDir)) return;
  for (const entry of fs.readdirSync(targetDir, {
    withFileTypes: true
  })) {
    const entryPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      stripHbsExtensions(entryPath);
      continue;
    }
    if (entry.name.endsWith('.hbs')) {
      const renamedPath = entryPath.replace(/\.hbs$/, '');
      fs.renameSync(entryPath, renamedPath);
    }
  }
}
function removeGeneratorMetadata(targetDir) {
  const metadataPaths = ['package.json', 'package-lock.json', 'node_modules', 'filters', 'hooks'];
  metadataPaths.forEach(name => {
    const metadataPath = path.join(targetDir, name);
    if (fs.existsSync(metadataPath)) {
      fs.rmSync(metadataPath, {
        recursive: true,
        force: true
      });
    }
  });
}
module.exports = {
  'generate:after': generator => {
    stripHbsExtensions(generator.targetDir);
    removeGeneratorMetadata(generator.targetDir);
  },
  'setFileTemplateName': (generator, hookArguments) => {
    const originalFilename = (hookArguments === null || hookArguments === void 0 ? void 0 : hookArguments.originalFilename) || '';
    return originalFilename.replace(/\.hbs$/, '');
  }
};
//# sourceMappingURL=index.js.map
