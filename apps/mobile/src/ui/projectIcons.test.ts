import Hash from "lucide-react-native/icons/hash";
import { PROJECT_ICONS, projectIconFor } from "./projectIcons";

describe("projectIconFor", () => {
  it("resolves a known name", () => {
    expect(projectIconFor("rocket")).toBe(PROJECT_ICONS.rocket);
  });

  it("falls back to the hash for unknown and inherited names", () => {
    for (const name of [undefined, "", "nope", "constructor", "__proto__", "toString"]) {
      expect(projectIconFor(name)).toBe(Hash);
    }
  });
});
