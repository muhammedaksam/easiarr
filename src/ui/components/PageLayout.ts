import { BoxRenderable, TextRenderable, type CliRenderer } from "@opentui/core"
import { getVersion } from "../../VersionInfo"
import { type FooterHint, renderFooterHint } from "./FooterHint"

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
  let hintText: string
  if (!footerHint) {
    hintText = "↑↓ Navigate  Enter Select  Ctrl+C Exit"
  } else if (typeof footerHint === "string") {
    hintText = footerHint + "  Ctrl+C Exit"
  } else {
    // Append separator and global Ctrl+C hint to array
    const hintsWithExit: FooterHint = [
      ...footerHint,
      { type: "separator", char: "|" },
      { type: "key", key: "Ctrl+C", value: "Exit" },
    ]
    hintText = renderFooterHint(hintsWithExit)
  }

  footerBox.add(
    new TextRenderable(renderer, {
      id: `${idPrefix}-footer-hint`,
      content: hintText,
      fg: "#aaaaaa",
    })
  )

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
