import { File, Text } from '@asyncapi/generator-react-sdk';

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

export default function LibRs({ asyncapi }) {
  const doc = asyncapi?._json || asyncapi || {};
  const title = (doc.info && doc.info.title) || 'AsyncAPI Client';
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

  return (
    <File name="lib.rs">
      <Text>{content}</Text>
    </File>
  );
}
