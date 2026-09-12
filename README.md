# AsyncAPI Rust WebSocket template

This repository generates a minimal Rust WebSocket client from an AsyncAPI document.

## Validate the IQ Option demo spec

The template supports AsyncAPI 3.0.x and resolves operation metadata from `components.operations` with `action: send|receive` plus channel metadata under `components.channels` / `channels[*].address`. The demo fixture in `test/iqoption.yaml` uses that v3 shape. The generated client uses `tokio-tungstenite` with the `rustls-tls-native-roots` feature, so it does not require OpenSSL (`pkg-config`/`libssl-dev`) at build time. The local template packages need their own dependencies installed before generation, so run the template installs first and then compile the generated crate:

```bash
npm install
npm install --prefix ./templates
npm install --prefix ./templates/template
rm -rf /tmp/out
npx @asyncapi/cli generate fromTemplate ./test/iqoption.yaml ./templates -o /tmp/out -p server=production
cargo check --manifest-path /tmp/out/Cargo.toml
```

The generated client includes `send_*` methods for publish/send operations and a generic `on(...)` callback for subscribe/receive operations.

## Template usage

```bash
rm -rf <output-dir>
npx @asyncapi/cli generate fromTemplate <asyncapi-file> ./templates -o <output-dir> -p server=production
```

The `server` parameter selects which `servers` entry is used to build the default connection URL in the generated example code.
