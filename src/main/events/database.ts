import { app } from "electron";
import Database from "better-sqlite3";
import { existsSync } from "fs";
import { join } from "path";
import type { Event } from "./types";

const CREATE_TABLE_SQL = `
  CREATE TABLE events (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    topic         VARCHAR(200),
    version       INTEGER,
    payload       VARCHAR,
    payload_type  VARCHAR(200),
    metadata      VARCHAR,
    metadata_type VARCHAR(200),
    created       DATE DEFAULT CURRENT_DATE
  );
`;

interface EventRow {
  id: number;
  topic: string;
  version: number;
  payload: string;
  payload_type: string;
  metadata: string;
  metadata_type: string;
  created: string;
}

class EventDatabase {
  private db: Database.Database | null = null;

  init(): void {
    if (this.db) {
      return;
    }

    const dbPath = join(app.getPath("userData"), "events.db");
    const isNewDb = !existsSync(dbPath);

    this.db = new Database(dbPath);

    if (isNewDb) {
      this.db.exec(CREATE_TABLE_SQL);
    }
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  publish<P, M>(
    topic: string,
    version: number,
    payload: P,
    payloadType: string,
    metadata: M,
    metadataType: string
  ): Event<P, M> {
    const db = this.requireDb();

    const payloadJson = JSON.stringify(payload);
    const metadataJson = JSON.stringify(metadata);

    const insert = db.prepare(`
      INSERT INTO events (topic, version, payload, payload_type, metadata, metadata_type)
      VALUES (?, ?, ?, ?, ?, ?)
      RETURNING *
    `);

    const row = insert.get(
      topic,
      version,
      payloadJson,
      payloadType,
      metadataJson,
      metadataType
    ) as EventRow;

    return {
      id: row.id,
      topic: row.topic,
      version: row.version,
      payload,
      payload_type: row.payload_type,
      metadata,
      metadata_type: row.metadata_type,
      created: row.created,
    };
  }

  query<T = unknown>(sql: string, params: unknown[] = []): T[] {
    const stmt = this.requireDb().prepare(sql);
    if (!stmt.readonly) {
      throw new Error("Only read-only (SELECT) queries are allowed.");
    }
    return stmt.all(...params) as T[];
  }

  private requireDb(): Database.Database {
    if (!this.db) {
      throw new Error("EventDatabase is not initialized. Call init() first.");
    }
    return this.db;
  }
}

export const eventDatabase = new EventDatabase();
