import i18n from "../i18n";
import { displayTitle } from "./taskTitle";

describe("displayTitle", () => {
  it("shows the placeholder for a task this device cannot decrypt, never its blank title", () => {
    expect(displayTitle({ title: "", locked: true }, i18n.t)).toBe(
      "Encrypted task — key not available",
    );
  });
});
