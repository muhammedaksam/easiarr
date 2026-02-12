/**
 * Homepage Setup Screen
 * Configure Homepage dashboard with enabled apps
 */

import { CliRenderer, KeyEvent, TextRenderable } from "@opentui/core"

import type { MenuItem } from "~/ui/screens/setup/BaseAppSetupScreen"
import { getApp } from "~/apps/registry"
import { generateServicesYaml, saveHomepageConfig } from "~/config/homepage-config"
import { EasiarrConfig } from "~/config/schema"
import { BaseAppSetupScreen } from "~/ui/screens/setup/BaseAppSetupScreen"

export class HomepageSetup extends BaseAppSetupScreen {
  private previewContent = ""
  private isPreviewMode = false

  constructor(cliRenderer: CliRenderer, config: EasiarrConfig, onBack: () => void) {
    super(cliRenderer, config, onBack)
  }

  getTitle(): string {
    return "Homepage Setup"
  }

  getStepInfo(): string {
    return "Configure Dashboard"
  }

  getMenuItems(): MenuItem[] {
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

  protected getMenuDescription(): string {
    return "Configure Homepage dashboard with your enabled apps:"
  }

  // ============================================
  // CUSTOM KEY HANDLING - Handle preview step
  // ============================================

  protected handleCustomKeys(key: KeyEvent): boolean {
    if (this.isPreviewMode) {
      if (key.name === "return" || key.name === "escape") {
        this.isPreviewMode = false
        this.refreshContent()
      }
      return true // Handled
    }
    return false
  }

  // ============================================
  // CUSTOM RENDERING - Preview step
  // ============================================

  protected renderCustomContent(): boolean {
    if (this.isPreviewMode) {
      this.renderPreview()
      return true
    }
    return false // Use default for menu/results
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

  // ============================================
  // MENU ACTIONS
  // ============================================

  private async generateServices(): Promise<void> {
    await this.runAction("services.yaml", async () => {
      const paths = await saveHomepageConfig(this.config)
      return { success: true, message: `Saved to ${paths.services}` }
    })
  }

  private async previewServices(): Promise<void> {
    this.previewContent = await generateServicesYaml(this.config)
    this.isPreviewMode = true
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
}
