/**
 * Main Menu Screen
 * Central navigation hub for Easiarr
 */

import type { RenderContext, CliRenderer } from "@opentui/core"
import { BoxRenderable, TextRenderable, SelectRenderable, SelectRenderableEvents } from "@opentui/core"
import type { App } from "../App"
import type { EasiarrConfig } from "../../config/schema"
import { createPageLayout } from "../components/PageLayout"
import { saveCompose } from "../../compose"
import { saveBookmarks } from "../../config/bookmarks-generator"
import { ApiKeyViewer } from "./ApiKeyViewer"
import { AppConfigurator } from "./AppConfigurator"
import { TRaSHProfileSetup } from "./TRaSHProfileSetup"
import { ProwlarrSetup } from "./ProwlarrSetup"
import { QBittorrentSetup } from "./QBittorrentSetup"
import { FullAutoSetup } from "./FullAutoSetup"
import { MonitorDashboard } from "./MonitorDashboard"
import { HomepageSetup } from "./HomepageSetup"
import { JellyfinSetup } from "./JellyfinSetup"
import { JellyseerrSetup } from "./JellyseerrSetup"

type MenuItem = { name: string; description: string; action: () => void | Promise<void> }

type ScreenConstructor = new (renderer: CliRenderer, config: EasiarrConfig, onBack: () => void) => BoxRenderable

export class MainMenu {
  private renderer: RenderContext
  private container: BoxRenderable
  private app: App
  private config: EasiarrConfig
  private menu!: SelectRenderable
  private page!: BoxRenderable
  private menuItems: MenuItem[] = []

  constructor(renderer: RenderContext, container: BoxRenderable, app: App, config: EasiarrConfig) {
    this.renderer = renderer
    this.container = container
    this.app = app
    this.config = config

    this.render()
  }

  private isAppEnabled(id: string): boolean {
    return this.config.apps.some((a) => a.id === id && a.enabled)
  }

  private buildMenuItems(): MenuItem[] {
    const items: MenuItem[] = []

    // Core items (always shown)
    items.push({
      name: "📦 Manage Apps",
      description: "Add, remove, or configure apps",
      action: () => this.app.navigateTo("appManager"),
    })
    items.push({
      name: "🐳 Container Control",
      description: "Start, stop, restart containers",
      action: () => this.app.navigateTo("containerControl"),
    })
    items.push({
      name: "⚙️  Advanced Settings",
      description: "Customize ports, volumes, env",
      action: () => this.app.navigateTo("advancedSettings"),
    })
    items.push({
      name: "🔑 Extract API Keys",
      description: "Find API keys from running containers",
      action: () => this.showScreen(ApiKeyViewer),
    })
    items.push({
      name: "⚙️  Configure Apps",
      description: "Set root folders and download clients via API",
      action: () => this.showScreen(AppConfigurator),
    })
    items.push({
      name: "🎯 TRaSH Guide Setup",
      description: "Apply TRaSH quality profiles and custom formats",
      action: () => this.showScreen(TRaSHProfileSetup),
    })
    items.push({
      name: "🔄 Regenerate Compose",
      description: "Rebuild docker-compose.yml",
      action: async () => {
        await saveCompose(this.config)
      },
    })

    // Conditional items based on enabled apps
    if (this.isAppEnabled("prowlarr")) {
      items.push({
        name: "🔗 Prowlarr Setup",
        description: "Sync indexers to *arr apps, FlareSolverr",
        action: () => this.showScreen(ProwlarrSetup),
      })
    }
    if (this.isAppEnabled("qbittorrent")) {
      items.push({
        name: "⚡ qBittorrent Setup",
        description: "Configure TRaSH-compliant paths and categories",
        action: () => this.showScreen(QBittorrentSetup),
      })
    }

    // Full Auto Setup (always shown)
    items.push({
      name: "🚀 Full Auto Setup",
      description: "Run all configurations (Auth, Root Folders, Prowlarr, etc.)",
      action: () => this.showScreen(FullAutoSetup),
    })

    items.push({
      name: "📊 Monitor Dashboard",
      description: "Configure app health monitoring",
      action: () => this.showScreen(MonitorDashboard),
    })

    if (this.isAppEnabled("homepage")) {
      items.push({
        name: "🏠 Homepage Setup",
        description: "Generate Homepage dashboard config",
        action: () => this.showScreen(HomepageSetup),
      })
    }
    if (this.isAppEnabled("jellyfin")) {
      items.push({
        name: "🎬 Jellyfin Setup",
        description: "Run Jellyfin setup wizard via API",
        action: () => this.showScreen(JellyfinSetup),
      })
    }
    if (this.isAppEnabled("jellyseerr")) {
      items.push({
        name: "🎥 Jellyseerr Setup",
        description: "Configure Jellyseerr with media server",
        action: () => this.showScreen(JellyseerrSetup),
      })
    }

    items.push({
      name: "📑 Generate Bookmarks",
      description: "Create browser-importable bookmarks file",
      action: async () => {
        await saveBookmarks(this.config)
      },
    })

    items.push({
      name: "❌ Exit",
      description: "Close easiarr",
      action: () => process.exit(0),
    })

    return items
  }

  private showScreen(ScreenClass: ScreenConstructor): void {
    this.menu.blur()
    this.page.visible = false
    const screen = new ScreenClass(this.renderer as CliRenderer, this.config, () => {
      this.page.visible = true
      this.menu.focus()
    })
    this.container.add(screen)
  }

  private render(): void {
    const { container: page, content } = createPageLayout(this.renderer as CliRenderer, {
      title: "Main Menu",
      stepInfo: "Docker Compose Generator for *arr Ecosystem",
      footerHint: [{ type: "key", key: "Enter", value: "Select" }],
    })
    this.page = page

    // Config info
    const configBox = new BoxRenderable(this.renderer, {
      width: "100%",
      flexDirection: "column",
      marginBottom: 1,
    })

    configBox.add(
      new TextRenderable(this.renderer, {
        id: "config-info-header",
        content: "Configuration Overview:",
        fg: "#4a9eff",
      })
    )

    configBox.add(new BoxRenderable(this.renderer, { width: 1, height: 1 })) // Spacer

    configBox.add(
      new TextRenderable(this.renderer, {
        id: "config-info",
        content: ` 📁 Root: ${this.config.rootDir}`,
        fg: "#aaaaaa",
      })
    )

    configBox.add(
      new TextRenderable(this.renderer, {
        id: "apps-info",
        content: `    Apps: ${this.config.apps.filter((a) => a.enabled).length} configured`,
        fg: "#aaaaaa",
      })
    )

    content.add(configBox)

    content.add(new TextRenderable(this.renderer, { id: "spacer2", content: " " }))

    // Build menu items dynamically based on enabled apps
    this.menuItems = this.buildMenuItems()

    // Menu
    this.menu = new SelectRenderable(this.renderer, {
      id: "main-menu-select",
      width: "100%",
      flexGrow: 1,
      options: this.menuItems.map((item) => ({ name: item.name, description: item.description })),
    })

    this.menu.on(SelectRenderableEvents.ITEM_SELECTED, async (index) => {
      const item = this.menuItems[index]
      if (item) {
        await item.action()
      }
    })

    content.add(this.menu)
    this.menu.focus()

    this.container.add(page)
  }
}
