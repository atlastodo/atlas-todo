// Atlas's own oxlint rules (loaded through `jsPlugins` in `.oxlintrc.json`).

const STYLE_PROPS = new Set(["className", "contentContainerClassName"]);

// ESLint ran this as `no-restricted-syntax` with the selector
// `JSXOpeningElement[name.object.name='Animated'] > JSXAttribute[name.name=/^(className|contentContainerClassName)$/]`,
// which oxlint has no native equivalent for.
const noAnimatedClassName = {
  meta: {
    type: "problem",
    messages: {
      noClassName: "NativeWind does not style Reanimated components; use style or an inner View.",
    },
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        const name = node.name;
        if (name.type !== "JSXMemberExpression" || name.object.type !== "JSXIdentifier") return;
        if (name.object.name !== "Animated") return;
        for (const attr of node.attributes) {
          if (attr.type === "JSXAttribute" && STYLE_PROPS.has(attr.name.name)) {
            context.report({ node: attr, messageId: "noClassName" });
          }
        }
      },
    };
  },
};

export default {
  meta: { name: "atlas" },
  rules: { "no-animated-classname": noAnimatedClassName },
};
