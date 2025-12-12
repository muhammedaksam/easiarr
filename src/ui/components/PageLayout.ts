import { BoxRenderable, TextRenderable, TextNodeRenderable, type CliRenderer } from "@opentui/core"
import { getVersion } from "../../VersionInfo"
import { type FooterHint } from "./FooterHint"

export interface PageLayoutOptions {
  title: string
  stepInfo?: string
  footerHint?: FooterHint | string
}

export interface PageLayoutResult {
  container: BoxRenderable
  content: BoxRenderable
}

export function createPageLayout(renderer: CliRenderer, options: PageLayoutOptions): PageLayoutResult {
  const { title, stepInfo, footerHint } = options
  const idPrefix = title
    .replace(/[^a-zA-Z]/g, "")
    .slice(0, 10)
    .toLowerCase()

  // Create main container
  const container = new BoxRenderable(renderer, {
    id: `${idPrefix}-page-layout`,
    width: "100%",
    height: "100%",
    flexDirection: "column",
    backgroundColor: "#1a1a2e",
  })

  // Header
  const headerText = stepInfo ? `easiarr | ${stepInfo}` : "easiarr"

  const headerBox = new BoxRenderable(renderer, {
    id: `${idPrefix}-header-box`,
    width: "100%",
    height: 3,
    borderStyle: "single",
    borderColor: "#4a9eff",
    title: headerText,
    titleAlignment: "left",
    paddingLeft: 1,
    paddingRight: 1,
    backgroundColor: "#1a1a2e",
  })

  headerBox.add(
    new TextRenderable(renderer, {
      id: `${idPrefix}-page-title`,
      content: title,
      fg: "#ffffff",
    })
  )

  container.add(headerBox)

  // Content area (flex grow)
  const content = new BoxRenderable(renderer, {
    id: `${idPrefix}-content`,
    flexGrow: 1,
    width: "100%",
    padding: 1,
    flexDirection: "column",
    backgroundColor: "#1a1a2e",
  })

  container.add(content)

  // Footer box with border
  const footerBox = new BoxRenderable(renderer, {
    id: `${idPrefix}-footer-box`,
    borderStyle: "single",
    borderColor: "#4a9eff",
    paddingLeft: 1,
    paddingRight: 1,
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#1a1a2e",
  })

  // Hint text - handle both array and string formats
  // Always append separator + Ctrl+C Exit when hints are provided
  const hintContainer = new TextRenderable(renderer, {
    id: `${idPrefix}-footer-hint`,
    content: "",
    fg: "#aaaaaa",
  })

  if (!footerHint) {
    hintContainer.content = "↑↓: Navigate  Enter: Select  Ctrl+C: Exit"
  } else if (typeof footerHint === "string") {
    hintContainer.content = footerHint + "  Ctrl+C: Exit"
  } else {
    // Append separator and global Ctrl+C hint (styled red for demo)
    const hintsWithExit: FooterHint = [
      ...footerHint,
      { type: "separator", char: " | " },
      { type: "key", key: "Ctrl+C", value: "Exit", keyColor: "#ff6666", valueColor: "#888888" },
    ]

    // Build styled content using TextNodeRenderable
    const DEFAULT_KEY_COLOR = "#8be9fd" // cyan/bright
    const DEFAULT_VALUE_COLOR = "#aaaaaa" // dim
    const DEFAULT_SEP_COLOR = "#555555"

    // Helper to create a styled text node
    const styledText = (text: string, fg?: string, bg?: string): TextNodeRenderable => {
      const node = new TextNodeRenderable({ fg, bg })
      node.add(text)
      return node
    }

    hintsWithExit.forEach((item, idx) => {
      if (item.type === "separator") {
        hintContainer.add(styledText(item.char ?? "  ", DEFAULT_SEP_COLOR))
      } else if (item.type === "text") {
        hintContainer.add(styledText(item.value, item.fg ?? DEFAULT_VALUE_COLOR))
        // Add spacing after text (except last)
        if (idx < hintsWithExit.length - 1 && hintsWithExit[idx + 1]?.type !== "separator") {
          hintContainer.add(styledText("  "))
        }
      } else if (item.type === "key") {
        const keyDisplay = item.withBrackets ? `[${item.key}]` : item.key
        // Key part (styled)
        hintContainer.add(styledText(keyDisplay, item.keyColor ?? DEFAULT_KEY_COLOR, item.keyBgColor))
        // Colon + Value
        hintContainer.add(styledText(`: ${item.value}`, item.valueColor ?? DEFAULT_VALUE_COLOR))
        // Add spacing after (except last or before separator)
        if (idx < hintsWithExit.length - 1 && hintsWithExit[idx + 1]?.type !== "separator") {
          hintContainer.add(styledText("  "))
        }
      }
    })
  }

  footerBox.add(hintContainer)

  // Version
  footerBox.add(
    new TextRenderable(renderer, {
      id: `${idPrefix}-version`,
      content: getVersion(),
      fg: "#555555",
    })
  )

  container.add(footerBox)

  return { container, content }
}
