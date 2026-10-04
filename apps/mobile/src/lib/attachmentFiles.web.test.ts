/**
 * @jest-environment jsdom
 */
import { openPickedFile, shareFile } from "./attachmentFiles.web";

/**
 * The browser build's open-in (imported by name, the `clipboard.web` pattern). The object URL must
 * outlive the click: some browsers read it only after the handler returns, so revoking it at once
 * can fail the download.
 */
describe("shareFile (web)", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    URL.createObjectURL = jest.fn(() => "blob:atlas/1");
    URL.revokeObjectURL = jest.fn();
    jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("keeps the download URL alive after the click and revokes it later", async () => {
    await shareFile(new Uint8Array([1, 2, 3]), "notes.txt", "text/plain");
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    jest.advanceTimersByTime(60_000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:atlas/1");
  });
});

describe("openPickedFile (web)", () => {
  it("reads the picked File slice by slice", async () => {
    // jsdom's Blob cannot read itself back, so the File is a stand-in with the browser's shape.
    const bytes = new Uint8Array([5, 6, 7, 8]);
    const slice = jest.fn((start: number, end: number) => ({
      arrayBuffer: async () => bytes.slice(start, end).buffer,
    }));
    const file = { size: bytes.length, slice };
    const picked = await openPickedFile({ file, name: "notes.txt", uri: "blob:x" } as never);
    expect(picked.source.size).toBe(4);
    expect(await picked.source.read(1, 2)).toEqual(new Uint8Array([6, 7]));
    expect(slice).toHaveBeenCalledWith(1, 3);
  });

  it("decodes a base64 pick", async () => {
    const picked = await openPickedFile({ base64: "AQID", name: "x", uri: "" } as never);
    expect(await picked.source.read(0, 3)).toEqual(new Uint8Array([1, 2, 3]));
  });
});
