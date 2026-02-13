import { describe, it, expect } from "vitest";
import {
  SUPPORTED_COLLECTIONS,
  COLLECTION_MAP,
} from "../../../src/firehose/types.js";

describe("firehose types", () => {
  describe("SUPPORTED_COLLECTIONS", () => {
    it("contains topic post collection", () => {
      expect(SUPPORTED_COLLECTIONS).toContain("forum.atgora.topic.post");
    });

    it("contains topic reply collection", () => {
      expect(SUPPORTED_COLLECTIONS).toContain("forum.atgora.topic.reply");
    });

    it("contains reaction collection", () => {
      expect(SUPPORTED_COLLECTIONS).toContain(
        "forum.atgora.interaction.reaction",
      );
    });

    it("has exactly 3 supported collections", () => {
      expect(SUPPORTED_COLLECTIONS).toHaveLength(3);
    });
  });

  describe("COLLECTION_MAP", () => {
    it("maps topic post to 'topic'", () => {
      expect(COLLECTION_MAP["forum.atgora.topic.post"]).toBe("topic");
    });

    it("maps topic reply to 'reply'", () => {
      expect(COLLECTION_MAP["forum.atgora.topic.reply"]).toBe("reply");
    });

    it("maps reaction to 'reaction'", () => {
      expect(COLLECTION_MAP["forum.atgora.interaction.reaction"]).toBe(
        "reaction",
      );
    });

    it("returns undefined for unsupported collection", () => {
      expect(
        COLLECTION_MAP["com.example.unknown" as keyof typeof COLLECTION_MAP],
      ).toBeUndefined();
    });
  });
});
