# AsyncAPI Rust WebSocket template

This repository generates a minimal Rust WebSocket client from an AsyncAPI document.

## Validate the IQ Option demo spec

The current AsyncAPI generator used by this repo targets AsyncAPI 2.6.x, so the fixture in `test/iqoption.yaml` is written in that format. The local template packages need their own dependencies installed before generation, so run the template installs first and then compile the generated crate:

```bash
npm install
npm install --prefix ./templates
npm install --prefix ./templates/template
rm -rf /tmp/out
npx @asyncapi/generator ./test/iqoption.yaml ./templates -o /tmp/out -p server=production
cargo check --manifest-path /tmp/out/Cargo.toml
```

The generated client includes `send_*` methods for publish/send operations and a generic `on(...)` callback for subscribe/receive operations.

## Template usage

```bash
rm -rf <output-dir>
npx @asyncapi/generator <asyncapi-file> ./templates -o <output-dir> -p server=production
```

The `server` parameter selects which `servers` entry is used to build the default connection URL in the generated example code.
