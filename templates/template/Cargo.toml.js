import { File, Text } from '@asyncapi/generator-react-sdk';

const slugify = (value) => String(value || 'asyncapi-client')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '') || 'asyncapi-client';

export default function CargoToml({ asyncapi }) {
  const doc = asyncapi?._json || asyncapi || {};
  const info = doc.info || {};
  const title = info.title || 'asyncapi-client';
  const version = info.version || '1.0.0';
  const description = info.description || '';
  const licenseName = (info.license && info.license.name) || '';

  const lines = [
    '[package]',
    `name = "${slugify(title)}-sdk"`,
    `version = "${version}"`,
    'edition = "2021"',
    description ? `description = "${description.replace(/"/g, '\\"')}"` : '',
    licenseName ? `license = "${licenseName.replace(/"/g, '\\"')}"` : '',
    '',
    '[dependencies]',
    'tokio = { version = "1.0", features = ["full"] }',
    'tokio-tungstenite = { version = "0.23", features = ["native-tls"] }',
    'serde = { version = "1.0", features = ["derive"] }',
    'serde_json = "1.0"',
    'futures-util = "0.3"',
    'thiserror = "1.0"',
    'log = "0.4"',
    'chrono = "0.4"',
    ''
  ].filter(Boolean).join('\n');

  return (
    <File name="Cargo.toml">
      <Text>{lines}</Text>
    </File>
  );
}
