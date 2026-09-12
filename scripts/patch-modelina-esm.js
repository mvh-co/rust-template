const fs = require('node:fs');
const path = require('node:path');

const patchFile = (filePath) => {
  const source = fs.readFileSync(filePath, 'utf8');
  let updated = source.replace(/(import\s+(?:[^'";]+?\s+from\s+)?|export\s+\*\s+from\s+|export\s+\{[^}]*\}\s+from\s+)(['"])(\.{0,2}\/?[^'"]*)(\2)/g, (match, prefix, quote, specifier) => {
    if (specifier === '.' || specifier === './') {
      return `${prefix}${quote}./index.js${quote}`;
    }
    if (specifier === '..' || specifier === '../') {
      return `${prefix}${quote}../index.js${quote}`;
    }
    if (!specifier.startsWith('./') && !specifier.startsWith('../')) {
      return match;
    }

    const targetPath = path.resolve(path.dirname(filePath), specifier);
    if (fs.existsSync(`${targetPath}.js`)) {
      return `${prefix}${quote}${specifier}.js${quote}`;
    }
    if (fs.existsSync(path.join(targetPath, 'index.js'))) {
      return `${prefix}${quote}${specifier.replace(/\/$/, '')}/index.js${quote}`;
    }
    if (fs.existsSync(path.join(targetPath, 'index.mjs'))) {
      return `${prefix}${quote}${specifier.replace(/\/$/, '')}/index.mjs${quote}`;
    }
    if (fs.existsSync(path.join(targetPath, 'index.cjs'))) {
      return `${prefix}${quote}${specifier.replace(/\/$/, '')}/index.cjs${quote}`;
    }
    return match;
  });

  updated = updated.replace(/import\s+(tslib)\s+from\s+(['"])(\.{0,2}\/?(?:.*?\/)?tslib\.js|tslib)\2\s*;/g, 'import * as $1 from $2$3$2;');

  if (updated !== source) {
    fs.writeFileSync(filePath, updated);
  }
};

const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }
    if (entry.isFile() && fullPath.endsWith('.js')) {
      patchFile(fullPath);
    }
  }
};

const syncTslibToTarget = (sourceDir, targetDir) => {
  if (sourceDir === targetDir) {
    return;
  }

  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.cpSync(sourceDir, targetDir, { recursive: true, force: true });
};

const normalizeNestedTslib = (rootDir) => {
  const rootTslib = path.join(rootDir, 'node_modules', 'tslib');
  if (!fs.existsSync(rootTslib)) {
    return;
  }

  const walkTslib = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (!entry.isDirectory()) {
        continue;
      }
      if (entry.name === 'tslib' && fullPath !== rootTslib) {
        syncTslibToTarget(rootTslib, fullPath);
        continue;
      }
      walkTslib(fullPath);
    }
  };

  walkTslib(path.join(rootDir, 'node_modules'));
};

const targetRoots = [
  path.join(process.cwd(), 'node_modules', '@asyncapi'),
  path.join(process.cwd(), 'node_modules', '@stoplight'),
];

for (const targetRoot of targetRoots) {
  if (fs.existsSync(targetRoot)) {
    walk(targetRoot);
  }
}

normalizeNestedTslib(process.cwd());

console.log('Patched AsyncAPI/Stoplight ESM dependencies for Node compatibility.');
