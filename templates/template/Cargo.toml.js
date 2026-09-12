import { File, Text } from '@asyncapi/generator-react-sdk';

const escapeTomlString = (value = '') => String(value)
  .replace(/\r?\n/g, ' ')
  .replace(/\\/g, '\\\\')
  .replace(/"/g, '\\"');

const slugify = (value) => {
  const normalized = String(value || 'asyncapi-client').trim().toLowerCase();
  const sanitized = Array.from(normalized)
    .map(character => (/[a-z0-9]/.test(character) ? character : '-'))
    .join('')
    .split('-')
    .filter(Boolean)
    .join('-');

  return sanitized || 'asyncapi-client';
};

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
    description ? `description = "${escapeTomlString(description)}"` : '',
    licenseName ? `license = "${escapeTomlString(licenseName)}"` : '',
    '',
    '[dependencies]',
    'tokio = { version = "1.0", features = ["full"] }',
    'tokio-tungstenite = { version = "0.23", features = ["rustls-tls-native-roots"] }',
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
