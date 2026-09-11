import { File, Text } from '@asyncapi/generator-react-sdk';

export default function ModRs({ asyncapi }) {
  const doc = asyncapi?._json || asyncapi || {};
  const title = (doc.info && doc.info.title) || 'AsyncAPI Client';
  const content = `//! WebSocket module for ${title}

pub mod types;
pub mod client;
`;

  return (
    <File name="mod.rs">
      <Text>{content}</Text>
    </File>
  );
}
