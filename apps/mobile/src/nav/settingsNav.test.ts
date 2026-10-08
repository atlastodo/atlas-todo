import { settingsSections } from "./settingsNav";

describe("settingsSections", () => {
  afterEach(() => {
    delete (window as unknown as { atlasDesktop?: unknown }).atlasDesktop;
  });

  it("lists Desktop app only inside the desktop app", () => {
    expect(settingsSections(false).map((s) => s.id)).not.toContain("desktop");
    (window as unknown as { atlasDesktop?: unknown }).atlasDesktop = {};
    expect(settingsSections(false).map((s) => s.id)).toContain("desktop");
  });
});
