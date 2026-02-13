import { users } from "../../db/schema/users.js";
import type { Database } from "../../db/index.js";
import type { Logger } from "../../lib/logger.js";
import type { RecordEvent } from "../types.js";
import { COLLECTION_MAP, SUPPORTED_COLLECTIONS } from "../types.js";
import type { SupportedCollection } from "../types.js";
import { validateRecord } from "../validation.js";
import type { TopicIndexer } from "../indexers/topic.js";
import type { ReplyIndexer } from "../indexers/reply.js";
import type { ReactionIndexer } from "../indexers/reaction.js";

interface Indexers {
  topic: TopicIndexer;
  reply: ReplyIndexer;
  reaction: ReactionIndexer;
}

function isSupportedCollection(
  collection: string,
): collection is SupportedCollection {
  return (SUPPORTED_COLLECTIONS as readonly string[]).includes(collection);
}

export class RecordHandler {
  constructor(
    private indexers: Indexers,
    private db: Database,
    private logger: Logger,
  ) {}

  async handle(event: RecordEvent): Promise<void> {
    try {
      const { collection, action, did, rkey, record, cid, live } = event;

      if (!isSupportedCollection(collection)) {
        return;
      }

      const uri = `at://${did}/${collection}/${rkey}`;
      const indexerName = COLLECTION_MAP[collection];

      // For delete events, no record validation needed
      if (action === "delete") {
        await this.dispatchDelete(indexerName, { uri, rkey, did });
        return;
      }

      // Create and update require a valid record
      if (record === undefined) {
        this.logger.warn(
          { collection, action, did, rkey },
          "Record event missing record data",
        );
        return;
      }

      const validation = validateRecord(collection, record);
      if (!validation.success) {
        this.logger.debug(
          { collection, did, rkey, error: validation.error },
          "Record validation failed",
        );
        return;
      }

      // Upsert user stub on create
      if (action === "create") {
        await this.upsertUser(did);
      }

      const params = {
        uri,
        rkey,
        did,
        cid: cid ?? "",
        record,
        live,
      };

      if (action === "create") {
        await this.dispatchCreate(indexerName, params);
      } else {
        await this.dispatchUpdate(indexerName, params);
      }
    } catch (err) {
      this.logger.error(
        { err, eventId: event.id, collection: event.collection },
        "Error handling record event",
      );
    }
  }

  private async dispatchCreate(
    indexerName: string,
    params: {
      uri: string;
      rkey: string;
      did: string;
      cid: string;
      record: Record<string, unknown>;
      live: boolean;
    },
  ): Promise<void> {
    switch (indexerName) {
      case "topic":
        await this.indexers.topic.handleCreate(params);
        break;
      case "reply":
        await this.indexers.reply.handleCreate(params);
        break;
      case "reaction":
        await this.indexers.reaction.handleCreate(params);
        break;
    }
  }

  private async dispatchUpdate(
    indexerName: string,
    params: {
      uri: string;
      rkey: string;
      did: string;
      cid: string;
      record: Record<string, unknown>;
      live: boolean;
    },
  ): Promise<void> {
    switch (indexerName) {
      case "topic":
        await this.indexers.topic.handleUpdate(params);
        break;
      case "reply":
        await this.indexers.reply.handleUpdate(params);
        break;
      // Reactions don't have update
    }
  }

  private async dispatchDelete(
    indexerName: string,
    params: {
      uri: string;
      rkey: string;
      did: string;
    },
  ): Promise<void> {
    switch (indexerName) {
      case "topic":
        await this.indexers.topic.handleDelete({
          uri: params.uri,
          rkey: params.rkey,
          did: params.did,
        });
        break;
      case "reply":
        // For reply delete, we need the root URI to decrement the count.
        // If the record is available (backfill), use it. Otherwise, the
        // integration will handle the count via the stored rootUri.
        await this.indexers.reply.handleDelete({
          uri: params.uri,
          rkey: params.rkey,
          did: params.did,
          rootUri: "",
        });
        break;
      case "reaction":
        await this.indexers.reaction.handleDelete({
          uri: params.uri,
          rkey: params.rkey,
          did: params.did,
          subjectUri: "",
        });
        break;
    }
  }

  private async upsertUser(did: string): Promise<void> {
    try {
      await this.db
        .insert(users)
        .values({
          did,
          handle: did, // Stub -- will be updated by identity event
        })
        .onConflictDoNothing();
    } catch (err) {
      this.logger.error({ err, did }, "Failed to upsert user stub");
    }
  }
}
