export const WORKSPACE_EVENTS_QUERY = `
  SELECT topic, payload_type, payload
  FROM events
  WHERE metadata_type = 'workspace-meta'
  ORDER BY id ASC
`;

export const WORKSPACE_TAB_EVENTS_QUERY = `
  SELECT payload_type, payload
  FROM events
  WHERE topic = ?
    AND metadata_type = 'workspace-meta'
    AND payload_type IN (
      'tab-created',
      'tab-closed',
      'tab-url-changed',
      'tab-title-changed',
      'tab-activated',
      'tab-moved'
    )
  ORDER BY id ASC
`;

export const WORKSPACE_ACTIVITY_QUERY = `
  SELECT id, created, topic, payload_type, metadata_type
  FROM events
  WHERE topic = ?
  ORDER BY id DESC
  LIMIT 30
`;

export const LATEST_DARK_MODE_EVENT_QUERY = `
  SELECT payload
  FROM events
  WHERE topic = 'default' AND payload_type = ?
  ORDER BY id DESC
  LIMIT 1
`;

export const LATEST_WORKSPACE_SWITCH_QUERY = `
  SELECT payload
  FROM events
  WHERE payload_type = 'workspace-switched'
    AND metadata_type = 'workspace-meta'
  ORDER BY id DESC
  LIMIT 1
`;
