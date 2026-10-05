import { headerThemeOptions, withAccent } from "./navTheme";

/**
 * Page titles use the body's system font and HeaderTitle's size/weight, not React Navigation's own
 * font stack. The jest platform is iOS, where the body font is "System".
 */
describe("navTheme fonts", () => {
  it("gives the default header title HeaderTitle's type", () => {
    expect(headerThemeOptions("light").headerTitleStyle).toMatchObject({
      fontFamily: "System",
      fontSize: 18,
      fontWeight: "600",
    });
  });

  it("keeps the base theme's fonts off web", () => {
    const base = { colors: {}, fonts: { regular: { fontFamily: "System" } } };
    expect(withAccent(base, false, "indigo").fonts).toBe(base.fonts);
  });
});
