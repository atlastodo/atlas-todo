// eslint-disable-next-line @typescript-eslint/no-require-imports
const tailwindConfig = require("../../tailwind.config.js");

describe("accent opacity configuration", () => {
  const accentColors = tailwindConfig.theme?.extend?.colors?.accent ?? {};
  const shades = [50, 100, 200, 300, 400, 500, 600, 700, 900, 950] as const;

  it("configures all accent shades with <alpha-value> and -rgb variable", () => {
    for (const shade of shades) {
      expect(accentColors[shade]).toBe(`rgb(var(--accent-${shade}-rgb) / <alpha-value>)`);
    }
  });
});
