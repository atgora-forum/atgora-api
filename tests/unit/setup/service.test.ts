import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSetupService } from "../../../src/setup/service.js";
import type { SetupService } from "../../../src/setup/service.js";
import type { Logger } from "../../../src/lib/logger.js";

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function createMockDb() {
  // Select chain: db.select().from().where() -> Promise<rows[]>
  const whereSelectFn = vi.fn<() => Promise<unknown[]>>();
  const fromFn = vi.fn<() => { where: typeof whereSelectFn }>().mockReturnValue({
    where: whereSelectFn,
  });
  const selectFn = vi.fn<() => { from: typeof fromFn }>().mockReturnValue({
    from: fromFn,
  });

  // Insert chain: db.insert().values() -> Promise<void>
  const valuesFn = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const insertFn = vi.fn<() => { values: typeof valuesFn }>().mockReturnValue({
    values: valuesFn,
  });

  // Update chain: db.update().set().where() -> Promise<void>
  const whereUpdateFn = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const setFn = vi.fn<() => { where: typeof whereUpdateFn }>().mockReturnValue({
    where: whereUpdateFn,
  });
  const updateFn = vi.fn<() => { set: typeof setFn }>().mockReturnValue({
    set: setFn,
  });

  return {
    db: { select: selectFn, insert: insertFn, update: updateFn },
    mocks: {
      selectFn,
      fromFn,
      whereSelectFn,
      insertFn,
      valuesFn,
      updateFn,
      setFn,
      whereUpdateFn,
    },
  };
}

function createMockLogger(): Logger {
  return {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn(),
    silent: vi.fn(),
    level: "silent",
  } as unknown as Logger;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TEST_DID = "did:plc:test123456789";
const DEFAULT_COMMUNITY_NAME = "ATgora Community";

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("SetupService", () => {
  let service: SetupService;
  let mocks: ReturnType<typeof createMockDb>["mocks"];
  let mockLogger: Logger;

  beforeEach(() => {
    const { db, mocks: m } = createMockDb();
    mocks = m;
    mockLogger = createMockLogger();
    service = createSetupService(db as never, mockLogger);
  });

  // =========================================================================
  // getStatus
  // =========================================================================

  describe("getStatus()", () => {
    it("returns { initialized: false } when no settings row exists", async () => {
      mocks.whereSelectFn.mockResolvedValueOnce([]);

      const result = await service.getStatus();

      expect(result).toStrictEqual({ initialized: false });
    });

    it("returns { initialized: false } when settings exist but not initialized", async () => {
      mocks.whereSelectFn.mockResolvedValueOnce([
        {
          initialized: false,
          communityName: "Test Community",
        },
      ]);

      const result = await service.getStatus();

      expect(result).toStrictEqual({ initialized: false });
    });

    it("returns { initialized: true, communityName } when initialized", async () => {
      mocks.whereSelectFn.mockResolvedValueOnce([
        {
          initialized: true,
          communityName: "My Forum",
        },
      ]);

      const result = await service.getStatus();

      expect(result).toStrictEqual({
        initialized: true,
        communityName: "My Forum",
      });
    });

    it("propagates database errors", async () => {
      mocks.whereSelectFn.mockRejectedValueOnce(new Error("Connection lost"));

      await expect(service.getStatus()).rejects.toThrow("Connection lost");
    });
  });

  // =========================================================================
  // initialize
  // =========================================================================

  describe("initialize()", () => {
    it("returns success for first authenticated user when no row exists", async () => {
      // Select returns no rows
      mocks.whereSelectFn.mockResolvedValueOnce([]);

      const result = await service.initialize(TEST_DID);

      expect(result).toStrictEqual({
        initialized: true,
        adminDid: TEST_DID,
        communityName: DEFAULT_COMMUNITY_NAME,
      });
      // Verify insert was called
      expect(mocks.insertFn).toHaveBeenCalled();
      expect(mocks.valuesFn).toHaveBeenCalled();
    });

    it("returns success when row exists but not initialized", async () => {
      // Select returns uninitialized row
      mocks.whereSelectFn.mockResolvedValueOnce([
        {
          initialized: false,
          communityName: "Existing Name",
        },
      ]);

      const result = await service.initialize(TEST_DID);

      expect(result).toStrictEqual({
        initialized: true,
        adminDid: TEST_DID,
        communityName: "Existing Name",
      });
      // Verify update was called (not insert)
      expect(mocks.updateFn).toHaveBeenCalled();
      expect(mocks.setFn).toHaveBeenCalled();
      expect(mocks.insertFn).not.toHaveBeenCalled();
    });

    it("returns conflict error when already initialized", async () => {
      mocks.whereSelectFn.mockResolvedValueOnce([
        {
          initialized: true,
          communityName: "Already Set",
        },
      ]);

      const result = await service.initialize(TEST_DID);

      expect(result).toStrictEqual({ alreadyInitialized: true });
      // No insert or update should be called
      expect(mocks.insertFn).not.toHaveBeenCalled();
      expect(mocks.updateFn).not.toHaveBeenCalled();
    });

    it("accepts optional communityName when no row exists", async () => {
      mocks.whereSelectFn.mockResolvedValueOnce([]);

      const result = await service.initialize(TEST_DID, "Custom Name");

      expect(result).toStrictEqual({
        initialized: true,
        adminDid: TEST_DID,
        communityName: "Custom Name",
      });
      expect(mocks.insertFn).toHaveBeenCalled();
    });

    it("updates communityName when row exists and communityName provided", async () => {
      mocks.whereSelectFn.mockResolvedValueOnce([
        {
          initialized: false,
          communityName: "Old Name",
        },
      ]);

      const result = await service.initialize(TEST_DID, "New Name");

      expect(result).toStrictEqual({
        initialized: true,
        adminDid: TEST_DID,
        communityName: "New Name",
      });
      expect(mocks.updateFn).toHaveBeenCalled();
    });

    it("preserves existing communityName when no override provided", async () => {
      mocks.whereSelectFn.mockResolvedValueOnce([
        {
          initialized: false,
          communityName: "Keep This Name",
        },
      ]);

      const result = await service.initialize(TEST_DID);

      expect(result).toStrictEqual({
        initialized: true,
        adminDid: TEST_DID,
        communityName: "Keep This Name",
      });
    });

    it("propagates database errors", async () => {
      mocks.whereSelectFn.mockRejectedValueOnce(
        new Error("Connection lost"),
      );

      await expect(service.initialize(TEST_DID)).rejects.toThrow(
        "Connection lost",
      );
    });
  });
});
