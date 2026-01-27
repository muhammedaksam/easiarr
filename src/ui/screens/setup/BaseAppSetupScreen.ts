/**
 * Base App Setup Screen
 *
 * Abstract base class for all app setup screens.
 * Provides common UI patterns: menu navigation, results display, key handling.
 *
 * Subclasses implement:
 * - getTitle(): Screen title
 * - getStepInfo(): Step info text
 * - getMenuItems(): Menu items with actions
 *
 * @example
 * ```ts
 * export class JellyfinSetup extends BaseAppSetupScreen {
 *   getTitle() { return "Jellyfin Setup" }
 *   getStepInfo() { return "Configure Jellyfin" }
 *   getMenuItems() {
 *     return [
 *       { name: "🚀 Run Wizard", description: "...", action: () => this.runWizard() },
 *       { name: "↩️ Back", description: "Return", action: () => this.cleanup() },
 *     ]
 *   }
 * }
 * ```
 */

import { BoxRenderable, CliRenderer, KeyEvent, TextRenderable } from "@opentui/core"

import type { EasiarrConfig } from "~/config/schema"
import { createPageLayout } from "~/ui/components/PageLayout"

/**
 * Result of a setup step
 */
export interface SetupResult {
  name: string
  status: "pending" | "configuring" | "success" | "error" | "skipped"
  message?: string
}

/**
 * Menu item definition
 */
export interface MenuItem {
  name: string
  description: string
  action: () => void | Promise<void>
}

/**
 * Step state for the screen
 */
export type SetupStep = "menu" | "running" | "done"

/**
 * Footer hint item
 */
interface FooterHint {
  type: "key"
  key: string
  value: string
}

export abstract class BaseAppSetupScreen extends BoxRenderable {
  protected config: EasiarrConfig
  protected cliRenderer: CliRenderer
  protected onBack: () => void
  protected keyHandler!: (key: KeyEvent) => void
  protected contentBox!: BoxRenderable
  protected pageContainer!: BoxRenderable

  protected results: SetupResult[] = []
  protected currentStep: SetupStep = "menu"
  protected menuIndex = 0

  constructor(cliRenderer: CliRenderer, config: EasiarrConfig, onBack: () => void) {
    super(cliRenderer, { width: "100%", height: "100%" })

    this.config = config
    this.cliRenderer = cliRenderer
    this.onBack = onBack

    // Create layout with values from subclass (works because JS allows calling
    // overridden methods from constructor, though TypeScript warns about it)
    const layout = createPageLayout(cliRenderer, {
      title: this.getTitle(),
      stepInfo: this.getStepInfo(),
      footerHint: this.getFooterHint(),
    })
    this.pageContainer = layout.container
    this.contentBox = layout.content
    this.add(this.pageContainer)

    this.initKeyHandler()
    this.refreshContent()
  }

  // ============================================
  // ABSTRACT METHODS - Subclasses must implement
  // ============================================

  /**
   * Screen title shown in header
   */
  abstract getTitle(): string

  /**
   * Step info text shown below title
   */
  abstract getStepInfo(): string

  /**
   * Menu items to display
   */
  abstract getMenuItems(): MenuItem[]

  // ============================================
  // OPTIONAL OVERRIDES
  // ============================================

  /**
   * Footer hints. Override to customize.
   */
  protected getFooterHint(): FooterHint[] {
    return [
      { type: "key", key: "↑↓", value: "Navigate" },
      { type: "key", key: "Enter", value: "Select" },
      { type: "key", key: "Esc", value: "Back" },
    ]
  }

  /**
   * Custom content rendering. Override to add custom steps.
   * Return false to use default rendering, true if handled.
   */
  protected renderCustomContent(): boolean {
    return false
  }

  /**
   * Handle custom key events. Override to add custom key handling.
   * Return true if handled, false to continue default handling.
   */
  protected handleCustomKeys(_key: KeyEvent): boolean {
    return false
  }

  // ============================================
  // COMMON IMPLEMENTATION
  // ============================================

  protected initKeyHandler(): void {
    this.keyHandler = (key: KeyEvent) => {
      // Allow subclass to handle first
      if (this.handleCustomKeys(key)) {
        return
      }

      // Escape always goes back
      if (key.name === "escape" || (key.name === "c" && key.ctrl)) {
        if (this.currentStep === "menu") {
          this.cleanup()
        } else {
          this.currentStep = "menu"
          this.refreshContent()
        }
        return
      }

      // Handle based on current step
      if (this.currentStep === "menu") {
        this.handleMenuKeys(key)
      } else if (this.currentStep === "done") {
        if (key.name === "return" || key.name === "escape") {
          this.currentStep = "menu"
          this.refreshContent()
        }
      }
    }
    this.cliRenderer.keyInput.on("keypress", this.keyHandler)
  }

  protected handleMenuKeys(key: KeyEvent): void {
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

  protected executeMenuItem(index: number): void {
    const items = this.getMenuItems()
    if (index >= 0 && index < items.length) {
      items[index].action()
    }
  }

  protected refreshContent(): void {
    this.contentBox.getChildren().forEach((child) => child.destroy())

    // Allow subclass custom rendering
    if (this.renderCustomContent()) {
      return
    }

    // Default rendering
    if (this.currentStep === "menu") {
      this.renderMenu()
    } else {
      this.renderResults()
    }
  }

  protected renderMenu(): void {
    this.contentBox.add(
      new TextRenderable(this.cliRenderer, {
        content: this.getMenuDescription() + "\n\n",
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

  /**
   * Description shown above menu. Override to customize.
   */
  protected getMenuDescription(): string {
    return "Select an option:"
  }

  protected renderResults(): void {
    const headerText = this.currentStep === "done" ? "Results:\n\n" : "Configuring...\n\n"
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

    if (this.currentStep === "done") {
      this.contentBox.add(
        new TextRenderable(this.cliRenderer, {
          content: "\nPress Enter or Esc to continue...",
          fg: "#6272a4",
        })
      )
    }
  }

  /**
   * Helper to run an action and display result
   */
  protected async runAction(
    name: string,
    action: () => Promise<{ success: boolean; message?: string }>
  ): Promise<void> {
    this.currentStep = "running"
    this.results = [{ name, status: "configuring" }]
    this.refreshContent()

    try {
      const result = await action()
      this.results[0] = {
        name,
        status: result.success ? "success" : "error",
        message: result.message,
      }
    } catch (error) {
      this.results[0] = {
        name,
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      }
    }

    this.currentStep = "done"
    this.refreshContent()
  }

  /**
   * Helper to run multiple actions in sequence
   */
  protected async runActions(
    actions: Array<{ name: string; action: () => Promise<{ success: boolean; message?: string }> }>
  ): Promise<void> {
    this.currentStep = "running"
    this.results = actions.map((a) => ({ name: a.name, status: "pending" as const }))
    this.refreshContent()

    for (let i = 0; i < actions.length; i++) {
      this.results[i].status = "configuring"
      this.refreshContent()

      try {
        const result = await actions[i].action()
        this.results[i] = {
          name: actions[i].name,
          status: result.success ? "success" : "error",
          message: result.message,
        }
      } catch (error) {
        this.results[i] = {
          name: actions[i].name,
          status: "error",
          message: error instanceof Error ? error.message : String(error),
        }
      }
    }

    this.currentStep = "done"
    this.refreshContent()
  }

  protected cleanup(): void {
    this.cliRenderer.keyInput.off("keypress", this.keyHandler)
    this.destroy()
    this.onBack()
  }
}
