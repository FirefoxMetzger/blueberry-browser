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
    created       TEXT DEFAULT CURRENT_TIMESTAMP
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
    metadataType: string,
  ): Event<P, M> {
    const [event] = this.publishMany([
      {
        topic,
        version,
        payload,
        payloadType,
        metadata,
        metadataType,
      },
    ]);
    return event;
  }

  publishMany<P, M>(
    entries: {
      topic: string;
      version: number;
      payload: P;
      payloadType: string;
      metadata: M;
      metadataType: string;
    }[],
  ): Event<P, M>[] {
    const db = this.requireDb();
    const created = new Date().toISOString();

    const insert = db.prepare(`
      INSERT INTO events (topic, version, payload, payload_type, metadata, metadata_type, created)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `);

    const insertMany = db.transaction(
      (
        rows: {
          topic: string;
          version: number;
          payloadJson: string;
          payloadType: string;
          metadataJson: string;
          metadataType: string;
        }[],
      ) => {
        return rows.map(
          (row) =>
            insert.get(
              row.topic,
              row.version,
              row.payloadJson,
              row.payloadType,
              row.metadataJson,
              row.metadataType,
              created,
            ) as EventRow,
        );
      },
    );

    const insertedRows = insertMany(
      entries.map((entry) => ({
        topic: entry.topic,
        version: entry.version,
        payloadJson: JSON.stringify(entry.payload),
        payloadType: entry.payloadType,
        metadataJson: JSON.stringify(entry.metadata),
        metadataType: entry.metadataType,
      })),
    );

    return insertedRows.map((row, index) => ({
      id: row.id,
      topic: row.topic,
      version: row.version,
      payload: entries[index].payload,
      payload_type: row.payload_type,
      metadata: entries[index].metadata,
      metadata_type: row.metadata_type,
      created: row.created,
    }));
  }

  query<T = unknown>(sql: string, params: unknown[] = []): T[] {
    const stmt = this.requireDb().prepare(sql);
    if (!stmt.readonly) {
      throw new Error("Only read-only (SELECT) queries are allowed.");
    }
    return stmt.all(...params) as T[];
  }

  updatePayload(id: number, payload: unknown): void {
    const db = this.requireDb();
    db.prepare(`UPDATE events SET payload = ? WHERE id = ?`).run(
      JSON.stringify(payload),
      id,
    );
  }

  private requireDb(): Database.Database {
    if (!this.db) {
      throw new Error("EventDatabase is not initialized. Call init() first.");
    }
    return this.db;
  }
}

export const eventDatabase = new EventDatabase();
