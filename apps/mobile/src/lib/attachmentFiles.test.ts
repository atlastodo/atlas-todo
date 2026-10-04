import * as Sharing from "expo-sharing";
import { clearSharedFiles, openPickedFile, safeFilename, shareFile } from "./attachmentFiles";

/**
 * The native attachment file glue over an in-memory file system double. The double resolves paths
 * the way expo-file-system does (join, then normalise), so a `..` in a name really climbs out of
 * the directory it was joined onto.
 */

const mockFs = {
  files: new Map<string, Uint8Array>(),
  dirs: new Set<string>(),
  handles: [] as { closed: boolean }[],
};

jest.mock("expo-file-system", () => {
  const posix = jest.requireActual("path").posix;
  const toPath = (p: unknown): string =>
    typeof p === "string" ? p.replace(/^file:\/\//, "") : (p as { path: string }).path;
  class Node {
    path: string;
    constructor(...parts: unknown[]) {
      this.path = posix.join(...parts.map(toPath));
    }
  }
  class File extends Node {
    get uri() {
      return `file://${this.path}`;
    }
    get exists() {
      return mockFs.files.has(this.path);
    }
    create() {
      mockFs.files.set(this.path, new Uint8Array());
    }
    write(bytes: Uint8Array) {
      mockFs.files.set(this.path, bytes);
    }
    delete() {
      mockFs.files.delete(this.path);
    }
    async bytes() {
      return mockFs.files.get(this.path) ?? new Uint8Array();
    }
    get size() {
      return mockFs.files.get(this.path)?.length ?? 0;
    }
    open() {
      const bytes = mockFs.files.get(this.path);
      if (!bytes) throw new Error(`no such file: ${this.path}`);
      const handle = {
        offset: 0 as number | null,
        size: bytes.length as number | null,
        closed: false,
        readBytes(length: number) {
          if (handle.closed) throw new Error("closed");
          const at = handle.offset ?? 0;
          handle.offset = at + Math.min(length, bytes.length - at);
          return bytes.slice(at, at + length);
        },
        close() {
          handle.closed = true;
        },
      };
      mockFs.handles.push(handle);
      return handle;
    }
  }
  class Directory extends Node {
    get uri() {
      return `file://${this.path}/`;
    }
    get exists() {
      return mockFs.dirs.has(this.path);
    }
    create() {
      // Always as `intermediates: true` would: every ancestor exists afterwards.
      for (let p = this.path; p !== "/"; p = posix.dirname(p)) mockFs.dirs.add(p);
    }
    delete() {
      for (const p of [...mockFs.files.keys()])
        if (p.startsWith(`${this.path}/`)) mockFs.files.delete(p);
      for (const p of [...mockFs.dirs])
        if (p === this.path || p.startsWith(`${this.path}/`)) mockFs.dirs.delete(p);
    }
  }
  return {
    File,
    Directory,
    FileMode: { ReadOnly: "r" },
    Paths: {
      get cache() {
        return new Directory("/data/app/cache");
      },
    },
  };
});
jest.mock("expo-sharing", () => ({
  isAvailableAsync: async () => true,
  shareAsync: jest.fn(async () => {}),
}));
const shareAsync = Sharing.shareAsync as jest.Mock;

const CACHE = "/data/app/cache/";

beforeEach(() => {
  mockFs.files.clear();
  mockFs.dirs.clear();
  mockFs.handles.length = 0;
  mockFs.dirs.add("/data/app/cache");
  // A file the attack aims at: the app's own op-log database next to the cache.
  mockFs.files.set("/data/app/files/SQLite/atlas-victim.db", new Uint8Array([7, 7, 7]));
  shareAsync.mockClear();
});

describe("shareFile", () => {
  it("keeps a traversal filename inside the cache and leaves the app's files alone", async () => {
    await shareFile(
      new Uint8Array([1, 2]),
      "../files/SQLite/atlas-victim.db",
      "application/x-sqlite3",
    );

    expect(mockFs.files.get("/data/app/files/SQLite/atlas-victim.db")).toEqual(
      new Uint8Array([7, 7, 7]),
    );
    const written = [...mockFs.files.keys()].filter((p) => !p.startsWith("/data/app/files/"));
    expect(written).toHaveLength(1);
    expect(written[0]!.startsWith(CACHE)).toBe(true);
    expect(written[0]!.endsWith("/atlas-victim.db")).toBe(true);
    const shared = shareAsync.mock.calls[0]![0] as string;
    expect(shared).toBe(`file://${written[0]}`);
  });

  it("clears the previous share's plaintext before writing the next one", async () => {
    await shareFile(new Uint8Array([1]), "a.txt", "text/plain");
    await shareFile(new Uint8Array([2]), "a.txt", "text/plain");
    const inCache = [...mockFs.files.keys()].filter((p) => p.startsWith(CACHE));
    expect(inCache).toHaveLength(1);
    expect(mockFs.files.get(inCache[0]!)).toEqual(new Uint8Array([2]));

    clearSharedFiles();
    expect([...mockFs.files.keys()].filter((p) => p.startsWith(CACHE))).toHaveLength(0);
  });
});

describe("openPickedFile", () => {
  it("reads the picked file in ranges, and deletes the picker's plaintext cache copy on close", async () => {
    const bytes = new Uint8Array([4, 2, 7, 1, 9]);
    mockFs.files.set("/data/app/cache/DocumentPicker/x/notes.txt", bytes);
    const asset = { uri: "file:///data/app/cache/DocumentPicker/x/notes.txt", name: "notes.txt" };
    const picked = await openPickedFile(asset as never);
    expect(picked.source.size).toBe(5);
    expect(await picked.source.read(3, 2)).toEqual(new Uint8Array([1, 9]));
    expect(await picked.source.read(0, 3)).toEqual(new Uint8Array([4, 2, 7]));
    expect(await picked.source.read(4, 10)).toEqual(new Uint8Array([9]));

    picked.close();
    expect(mockFs.handles.every((h) => h.closed)).toBe(true);
    expect(mockFs.files.has("/data/app/cache/DocumentPicker/x/notes.txt")).toBe(false);
  });

  it("never deletes a file outside the cache", async () => {
    mockFs.files.set("/storage/Download/notes.txt", new Uint8Array([4, 2]));
    const picked = await openPickedFile({
      uri: "file:///storage/Download/notes.txt",
      name: "n",
    } as never);
    picked.close();
    expect(mockFs.files.has("/storage/Download/notes.txt")).toBe(true);
  });
});

describe("safeFilename", () => {
  it.each([
    ["../files/SQLite/atlas-x.db", "atlas-x.db"],
    ["..\\..\\evil.txt", "evil.txt"],
    ["..", "attachment"],
    [".", "attachment"],
    ["", "attachment"],
    [".hidden", "hidden"],
    ["a\u0000b\nc.txt", "abc.txt"],
    ["what?.pdf", "what_.pdf"],
    ["report.pdf", "report.pdf"],
  ])("%j -> %j", (input, expected) => {
    expect(safeFilename(input)).toBe(expected);
  });

  it("caps long names and keeps the extension", () => {
    const out = safeFilename(`${"x".repeat(300)}.jpeg`);
    expect(out.length).toBe(100);
    expect(out.endsWith(".jpeg")).toBe(true);
  });
});
