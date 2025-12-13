/**
 * Homepage Setup Screen
 * Configure Homepage dashboard with enabled apps
 */

import { BoxRenderable, CliRenderer, TextRenderable, KeyEvent } from "@opentui/core"
import { createPageLayout } from "../components/PageLayout"
import { EasiarrConfig } from "../../config/schema"
import { saveHomepageConfig, generateServicesYaml } from "../../config/homepage-config"
import { getApp } from "../../apps/registry"

interface SetupResult {
  name: string
  status: "pending" | "configuring" | "success" | "error" | "skipped"
  message?: string
}

type Step = "menu" | "generating" | "preview" | "done"

export class HomepageSetup extends BoxRenderable {
  private config: EasiarrConfig
  private cliRenderer: CliRenderer
  private onBack: () => void
  private keyHandler!: (key: KeyEvent) => void
  private results: SetupResult[] = []
  private currentStep: Step = "menu"
  private contentBox!: BoxRenderable
  private pageContainer!: BoxRenderable
  private menuIndex = 0
  private previewContent = ""

  constructor(cliRenderer: CliRenderer, config: EasiarrConfig, onBack: () => void) {
    const { container: pageContainer, content: contentBox } = createPageLayout(cliRenderer, {
      title: "Homepage Setup",
      stepInfo: "Configure Dashboard",
      footerHint: [
        { type: "key", key: "↑↓", value: "Navigate" },
        { type: "key", key: "Enter", value: "Select" },
        { type: "key", key: "Esc", value: "Back" },
      ],
    })
    super(cliRenderer, { width: "100%", height: "100%" })
    this.add(pageContainer)

    this.config = config
    this.cliRenderer = cliRenderer
    this.onBack = onBack
    this.contentBox = contentBox
    this.pageContainer = pageContainer

    this.initKeyHandler()
    this.refreshContent()
  }

  private initKeyHandler(): void {
    this.keyHandler = (key: KeyEvent) => {
      if (key.name === "escape" || (key.name === "c" && key.ctrl)) {
        if (this.currentStep === "menu") {
          this.cleanup()
        } else {
          this.currentStep = "menu"
          this.refreshContent()
        }
        return
      }

      if (this.currentStep === "menu") {
        this.handleMenuKeys(key)
      } else if (this.currentStep === "preview" || this.currentStep === "done") {
        if (key.name === "return" || key.name === "escape") {
          this.currentStep = "menu"
          this.refreshContent()
        }
      }
    }
    this.cliRenderer.keyInput.on("keypress", this.keyHandler)
  }

  private handleMenuKeys(key: KeyEvent): void {
    const menuItems = this.getMenuItems()

    if (key.name === "up" && this.menuIndex > 0) {
      this.menuIndex--
      this.refreshContent()
    } else if (key.name === "down" && this.menuIndex < menuItems.length - 1) {
      this.menuIndex++
      this.refreshContent()
    } else if (key.name === "return") {
      this.executeMenuItem(this.menuIndex)
    }
  }

  private getMenuItems(): { name: string; description: string; action: () => void }[] {
    return [
      {
        name: "📊 Generate Services",
        description: "Create services.yaml with all enabled apps",
        action: () => this.generateServices(),
      },
      {
        name: "👁️  Preview Config",
        description: "Preview generated services.yaml",
        action: () => this.previewServices(),
      },
      {
        name: "📋 Show Enabled Apps",
        description: "List apps that will be added to Homepage",
        action: () => this.showEnabledApps(),
      },
      {
        name: "↩️  Back",
        description: "Return to main menu",
        action: () => this.cleanup(),
      },
    ]
  }

  private executeMenuItem(index: number): void {
    const items = this.getMenuItems()
    if (index >= 0 && index < items.length) {
      items[index].action()
    }
  }

  private async generateServices(): Promise<void> {
    this.currentStep = "generating"
    this.results = [{ name: "services.yaml", status: "configuring" }]
    this.refreshContent()

    try {
      const paths = await saveHomepageConfig(this.config)
      this.results[0].status = "success"
      this.results[0].message = `Saved to ${paths.services}`
    } catch (error) {
      this.results[0].status = "error"
      this.results[0].message = error instanceof Error ? error.message : String(error)
    }

    this.currentStep = "done"
    this.refreshContent()
  }

  private previewServices(): void {
    this.previewContent = generateServicesYaml(this.config)
    this.currentStep = "preview"
    this.refreshContent()
  }

  private showEnabledApps(): void {
    const apps = this.config.apps.filter((a) => a.enabled && a.id !== "homepage")

    this.results = apps.map((app) => {
      const def = getApp(app.id)
      const hasWidget = def?.homepage?.widget ? "📊" : "📌"
      return {
        name: `${hasWidget} ${def?.name || app.id}`,
        status: "success" as const,
        message: def?.description,
      }
    })

    if (this.results.length === 0) {
      this.results = [{ name: "No apps enabled", status: "skipped", message: "Enable apps first" }]
    }

    this.currentStep = "done"
    this.refreshContent()
  }

  private refreshContent(): void {
    this.contentBox.getChildren().forEach((child) => child.destroy())

    if (this.currentStep === "menu") {
      this.renderMenu()
    } else if (this.currentStep === "preview") {
      this.renderPreview()
    } else {
      this.renderResults()
    }
  }

  private renderMenu(): void {
    this.contentBox.add(
      new TextRenderable(this.cliRenderer, {
        content: "Configure Homepage dashboard with your enabled apps:\n\n",
        fg: "#aaaaaa",
      })
    )

    this.getMenuItems().forEach((item, idx) => {
      const pointer = idx === this.menuIndex ? "→ " : "  "
      const fg = idx === this.menuIndex ? "#50fa7b" : "#8be9fd"

      this.contentBox.add(
        new TextRenderable(this.cliRenderer, {
          content: `${pointer}${item.name}\n`,
          fg,
        })
      )
      this.contentBox.add(
        new TextRenderable(this.cliRenderer, {
          content: `    ${item.description}\n\n`,
          fg: "#6272a4",
        })
      )
    })
  }

  private renderPreview(): void {
    this.contentBox.add(
      new TextRenderable(this.cliRenderer, {
        content: "Preview: services.yaml\n",
        fg: "#50fa7b",
      })
    )
    this.contentBox.add(
      new TextRenderable(this.cliRenderer, {
        content: "─".repeat(40) + "\n",
        fg: "#555555",
      })
    )

    // Show preview (truncated)
    const lines = this.previewContent.split("\n").slice(0, 30)
    for (const line of lines) {
      this.contentBox.add(
        new TextRenderable(this.cliRenderer, {
          content: line + "\n",
          fg: line.startsWith("#") ? "#6272a4" : line.endsWith(":") ? "#8be9fd" : "#f8f8f2",
        })
      )
    }

    if (this.previewContent.split("\n").length > 30) {
      this.contentBox.add(
        new TextRenderable(this.cliRenderer, {
          content: "\n... (truncated)\n",
          fg: "#6272a4",
        })
      )
    }

    this.contentBox.add(
      new TextRenderable(this.cliRenderer, {
        content: "\nPress Enter or Esc to go back",
        fg: "#6272a4",
      })
    )
  }

  private renderResults(): void {
    const headerText = this.currentStep === "done" ? "Results:\n\n" : "Generating...\n\n"
    this.contentBox.add(
      new TextRenderable(this.cliRenderer, {
        content: headerText,
        fg: this.currentStep === "done" ? "#50fa7b" : "#f1fa8c",
      })
    )

    for (const result of this.results) {
      let status = ""
      let fg = "#aaaaaa"
      switch (result.status) {
        case "pending":
          status = "⏳"
          break
        case "configuring":
          status = "🔄"
          fg = "#f1fa8c"
          break
        case "success":
          status = "✓"
          fg = "#50fa7b"
          break
        case "error":
          status = "✗"
          fg = "#ff5555"
          break
        case "skipped":
          status = "⊘"
          fg = "#6272a4"
          break
      }

      let content = `${status} ${result.name}`
      if (result.message) {
        content += ` - ${result.message}`
      }

      this.contentBox.add(new TextRenderable(this.cliRenderer, { content: content + "\n", fg }))
    }

    this.contentBox.add(
      new TextRenderable(this.cliRenderer, {
        content: "\nPress Enter or Esc to continue...",
        fg: "#6272a4",
      })
    )
  }

  private cleanup(): void {
    this.cliRenderer.keyInput.off("keypress", this.keyHandler)
    this.destroy()
    this.onBack()
  }
}
