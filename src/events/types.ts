export interface Event<P = unknown, M = unknown> {
  id: number;
  topic: string;
  version: number;
  payload: P;
  payload_type: string;
  metadata: M;
  metadata_type: string;
  created: string;
}
