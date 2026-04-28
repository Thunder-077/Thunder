const COLOR_CLASS_PREFIXES = new Set(["bg", "text", "border", "fill", "stroke"])

function getTailwindColorViolation(classToken) {
  const baseClass = classToken.split(":").pop()
  if (!baseClass) {
    return null
  }

  const separatorIndex = baseClass.indexOf("-")
  if (separatorIndex === -1) {
    return null
  }

  const prefix = baseClass.slice(0, separatorIndex)
  if (!COLOR_CLASS_PREFIXES.has(prefix)) {
    return null
  }

  const rawValue = baseClass.slice(separatorIndex + 1)
  const colorValue = rawValue.split("/")[0]

  if (colorValue === "black" || colorValue === "white") {
    return classToken
  }

  if (
    colorValue.startsWith("[") &&
    /#|rgb\(|rgba\(|hsl\(|hsla\(|oklch\(|oklab\(/i.test(colorValue)
  ) {
    return classToken
  }

  return null
}

function inspectClassList(value, report) {
  const classTokens = value.split(/\s+/).filter(Boolean)

  for (const classToken of classTokens) {
    const violation = getTailwindColorViolation(classToken)
    if (violation) {
      report(violation)
    }
  }
}

export const noTailwindHardcodedColorsRule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow hardcoded Tailwind colors in class strings.",
    },
    schema: [],
    messages: {
      hardcodedColor:
        "Use semantic color tokens such as bg-background, text-foreground, or border-border instead of the hardcoded Tailwind color '{{ className }}'.",
    },
  },
  create(context) {
    return {
      Literal(node) {
        if (typeof node.value !== "string") {
          return
        }

        inspectClassList(node.value, (className) => {
          context.report({
            node,
            messageId: "hardcodedColor",
            data: { className },
          })
        })
      },
      TemplateElement(node) {
        inspectClassList(node.value.cooked ?? "", (className) => {
          context.report({
            node,
            messageId: "hardcodedColor",
            data: { className },
          })
        })
      },
    }
  },
}
