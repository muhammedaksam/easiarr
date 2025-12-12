/**
 * Monitor Dashboard Screen
 * Configure health monitoring for app categories and individual apps
 */

import type { CliRenderer, KeyEvent } from "@opentui/core"
import {
  BoxRenderable,
  TextRenderable,
  SelectRenderable,
  TabSelectRenderable,
  TabSelectRenderableEvents,
  SelectRenderableEvents,
} from "@opentui/core"
import type { EasiarrConfig, AppCategory, AppId, MonitorOptions, MonitorConfig } from "../../config/schema"
import { APP_CATEGORIES } from "../../config/schema"
import { createPageLayout } from "../components/PageLayout"
import { APPS } from "../../apps/registry"
import { saveConfig } from "../../config/manager"
// TODO: Use these for live status view
// import { ArrApiClient, type HealthResource, type DiskSpaceResource, type QueueStatusResource, type SystemResource } from "../../api/arr-api"

// Default monitoring options
const DEFAULT_CHECKS: MonitorOptions = {
  health: true,
  diskspace: true,
  status: true,
  queue: true,
}

// Categories that support monitoring (have compatible APIs)
const MONITORABLE_CATEGORIES: AppCategory[] = ["servarr", "indexer"]

export class MonitorDashboard extends BoxRenderable {
  private config: EasiarrConfig
  private onBack: () => void
  private _renderer: CliRenderer

  private page!: BoxRenderable
  private tabs!: TabSelectRenderable
  private listContainer!: BoxRenderable
  private currentList!: SelectRenderable
  private currentTab: "categories" | "apps" | "status" = "categories"
  private statusLoading = false
  private currentListIndex = 0 // Track selected index across list recreations

  // Local state for editing
  private categoryConfigs: Map<AppCategory, { enabled: boolean; checks: MonitorOptions }>
  private appConfigs: Map<AppId, { override: boolean; enabled: boolean; checks: MonitorOptions }>

  constructor(renderer: CliRenderer, config: EasiarrConfig, onBack: () => void) {
    super(renderer, {
      width: "100%",
      height: "100%",
      flexDirection: "column",
    })

    this._renderer = renderer
    this.config = config
    this.onBack = onBack

    // Initialize from existing config or defaults
    this.categoryConfigs = new Map()
    this.appConfigs = new Map()
    this.loadFromConfig()

    this.buildUI()
  }

  private loadFromConfig(): void {
    const monitor = this.config.monitor

    // Load category configs
    for (const cat of MONITORABLE_CATEGORIES) {
      const existing = monitor?.categories?.find((c) => c.category === cat)
      if (existing) {
        this.categoryConfigs.set(cat, {
          enabled: existing.enabled,
          checks: { ...existing.checks },
        })
      } else {
        this.categoryConfigs.set(cat, {
          enabled: true,
          checks: { ...DEFAULT_CHECKS },
        })
      }
    }

    // Load app configs (from enabled *arr apps)
    const arrApps = this.getMonitorableApps()
    for (const app of arrApps) {
      const existing = monitor?.apps?.find((a) => a.appId === app.id)
      if (existing) {
        this.appConfigs.set(app.id, {
          override: existing.override,
          enabled: existing.enabled,
          checks: { ...existing.checks },
        })
      } else {
        this.appConfigs.set(app.id, {
          override: false,
          enabled: true,
          checks: { ...DEFAULT_CHECKS },
        })
      }
    }
  }

  private getMonitorableApps() {
    // Get enabled apps that are in monitorable categories
    return this.config.apps
      .filter((a) => a.enabled)
      .map((a) => APPS[a.id])
      .filter((app) => app && MONITORABLE_CATEGORIES.includes(app.category))
  }

  private buildUI(): void {
    const { container: page, content } = createPageLayout(this._renderer, {
      title: "Monitor Dashboard",
      stepInfo: "Configure Health Monitoring",
      footerHint: "←→ Tab  ↑↓ Navigate  Space Toggle  s Save  q Back",
    })
    this.page = page

    // Tabs
    this.tabs = new TabSelectRenderable(this._renderer, {
      width: "100%",
      options: [
        { name: "Categories", value: "categories", description: "" },
        { name: "Apps", value: "apps", description: "" },
        { name: "Status", value: "status", description: "" },
      ],
      tabWidth: 12,
      showUnderline: false,
      showDescription: false,
      selectedBackgroundColor: "#4a9eff",
      textColor: "#555555",
    })

    this.tabs.on(TabSelectRenderableEvents.ITEM_SELECTED, (index) => {
      const tabs = ["categories", "apps", "status"] as const
      this.currentTab = tabs[index]
      this.updateList()
    })

    content.add(this.tabs)
    content.add(new TextRenderable(this._renderer, { content: " " }))

    // List container
    this.listContainer = new BoxRenderable(this._renderer, {
      width: "100%",
      flexGrow: 1,
      flexDirection: "column",
    })
    content.add(this.listContainer)

    // Initial list
    this.updateList()

    // Key handling - use keyInput for proper event handling
    this._renderer.keyInput.on("keypress", this.handleKey.bind(this))

    this.add(page)
  }

  private updateList(): void {
    // Clear existing list
    const children = this.listContainer.getChildren()
    children.forEach((c) => this.listContainer.remove(c.id))

    if (this.currentTab === "categories") {
      this.renderCategoryList()
    } else if (this.currentTab === "apps") {
      this.renderAppsList()
    } else {
      this.renderStatusView()
    }
  }

  private renderCategoryList(): void {
    const options = MONITORABLE_CATEGORIES.map((cat) => {
      const cfg = this.categoryConfigs.get(cat)!
      const enabledIcon = cfg.enabled ? "✓" : "○"
      const checksStr = this.formatChecks(cfg.checks)
      return {
        name: `[${enabledIcon}] ${APP_CATEGORIES[cat]}`,
        description: `Checks: ${checksStr}`,
      }
    })

    this.currentList = new SelectRenderable(this._renderer, {
      id: "category-list",
      width: "100%",
      flexGrow: 1,
      options,
      backgroundColor: "#151525",
      focusedBackgroundColor: "#252545",
    })

    this.currentList.on(SelectRenderableEvents.ITEM_SELECTED, (index) => {
      this.currentListIndex = index // Update tracked index
      const cat = MONITORABLE_CATEGORIES[index]
      this.toggleCategoryEnabled(cat)
    })

    // Set index before adding to container
    if (this.currentListIndex < options.length) {
      this.currentList.selectedIndex = this.currentListIndex
    }

    this.listContainer.add(this.currentList)
    this.currentList.focus()

    // Add check toggles info
    this.listContainer.add(
      new TextRenderable(this._renderer, {
        id: "check-hint",
        content: "\n  Press 1-4 to toggle: 1=Health 2=Disk 3=Status 4=Queue",
        fg: "#666666",
      })
    )
  }

  private renderAppsList(): void {
    const apps = this.getMonitorableApps()

    if (apps.length === 0) {
      this.listContainer.add(
        new TextRenderable(this._renderer, {
          content: "No monitorable apps enabled.\nEnable *arr apps to configure monitoring.",
          fg: "#888888",
        })
      )
      return
    }

    const options = apps.map((app) => {
      const cfg = this.appConfigs.get(app.id)!
      const overrideIcon = cfg.override ? "⚙" : "○"
      const enabledIcon = cfg.enabled ? "✓" : "○"
      const checksStr = cfg.override ? this.formatChecks(cfg.checks) : "(using category defaults)"
      return {
        name: `[${overrideIcon}] ${app.name} [${enabledIcon}]`,
        description: checksStr,
      }
    })

    this.currentList = new SelectRenderable(this._renderer, {
      id: "apps-list",
      width: "100%",
      flexGrow: 1,
      options,
      backgroundColor: "#151525",
      focusedBackgroundColor: "#252545",
    })

    this.currentList.on(SelectRenderableEvents.ITEM_SELECTED, (index) => {
      this.currentListIndex = index // Update tracked index
      const app = apps[index]
      this.toggleAppOverride(app.id)
    })

    // Set index before adding to container
    if (this.currentListIndex < options.length) {
      this.currentList.selectedIndex = this.currentListIndex
    }

    this.listContainer.add(this.currentList)
    this.currentList.focus()

    this.listContainer.add(
      new TextRenderable(this._renderer, {
        id: "app-hint",
        content: "\n  Enter: Toggle Override  e: Toggle Enabled  1-4: Toggle Checks",
        fg: "#666666",
      })
    )
  }

  private renderStatusView(): void {
    // Placeholder for live status - will be implemented
    this.listContainer.add(
      new TextRenderable(this._renderer, {
        id: "status-header",
        content: "📊 Live Status View\n",
        fg: "#4a9eff",
      })
    )

    this.listContainer.add(
      new TextRenderable(this._renderer, {
        id: "status-info",
        content: "Press 'r' to refresh status from enabled apps.\n\nConfigured monitoring:\n",
        fg: "#aaaaaa",
      })
    )

    // Show summary of what's configured
    const enabledCategories = Array.from(this.categoryConfigs.entries())
      .filter(([, cfg]) => cfg.enabled)
      .map(([cat]) => APP_CATEGORIES[cat])

    this.listContainer.add(
      new TextRenderable(this._renderer, {
        id: "status-categories",
        content: `  Categories: ${enabledCategories.join(", ") || "None"}\n`,
        fg: "#888888",
      })
    )

    const appsWithOverrides = Array.from(this.appConfigs.entries())
      .filter(([, cfg]) => cfg.override)
      .map(([appId]) => APPS[appId]?.name || appId)

    if (appsWithOverrides.length > 0) {
      this.listContainer.add(
        new TextRenderable(this._renderer, {
          id: "status-overrides",
          content: `  App Overrides: ${appsWithOverrides.join(", ")}\n`,
          fg: "#888888",
        })
      )
    }

    this.listContainer.add(
      new TextRenderable(this._renderer, {
        id: "status-hint",
        content: "\n  (Full live status display coming soon)",
        fg: "#666666",
      })
    )
  }

  private formatChecks(checks: MonitorOptions): string {
    const parts: string[] = []
    if (checks.health) parts.push("H")
    if (checks.diskspace) parts.push("D")
    if (checks.status) parts.push("S")
    if (checks.queue) parts.push("Q")
    return parts.length > 0 ? parts.join(" ") : "none"
  }

  private toggleCategoryEnabled(cat: AppCategory): void {
    const cfg = this.categoryConfigs.get(cat)!
    cfg.enabled = !cfg.enabled
    this.updateList()
  }

  private toggleCategoryCheck(cat: AppCategory, check: keyof MonitorOptions): void {
    const cfg = this.categoryConfigs.get(cat)!
    cfg.checks[check] = !cfg.checks[check]
    this.updateList()
  }

  private toggleAppOverride(appId: AppId): void {
    const cfg = this.appConfigs.get(appId)!
    cfg.override = !cfg.override
    this.updateList()
  }

  private toggleAppEnabled(appId: AppId): void {
    const cfg = this.appConfigs.get(appId)!
    cfg.enabled = !cfg.enabled
    this.updateList()
  }

  private toggleAppCheck(appId: AppId, check: keyof MonitorOptions): void {
    const cfg = this.appConfigs.get(appId)!
    if (cfg.override) {
      cfg.checks[check] = !cfg.checks[check]
      this.updateList()
    }
  }

  private async saveConfiguration(): Promise<void> {
    // Build MonitorConfig from local state
    const monitor: MonitorConfig = {
      categories: Array.from(this.categoryConfigs.entries()).map(([category, cfg]) => ({
        category,
        enabled: cfg.enabled,
        checks: cfg.checks,
      })),
      apps: Array.from(this.appConfigs.entries())
        .filter(([, cfg]) => cfg.override) // Only save apps with overrides
        .map(([appId, cfg]) => ({
          appId,
          override: cfg.override,
          enabled: cfg.enabled,
          checks: cfg.checks,
        })),
      pollIntervalSeconds: this.config.monitor?.pollIntervalSeconds ?? 60,
    }

    this.config.monitor = monitor
    await saveConfig(this.config)
  }

  private handleKey(key: KeyEvent): void {
    if (!this.page.visible) return

    // Navigation
    if (key.name === "q" || key.name === "escape") {
      this.cleanup()
      this.onBack()
      return
    }

    if (key.name === "s") {
      this.saveConfiguration()
      return
    }

    // Tab switching with left/right (cycle through 3 tabs)
    if (key.name === "left" || key.name === "right") {
      const tabs = ["categories", "apps", "status"] as const
      const currentIndex = tabs.indexOf(this.currentTab)
      let newIndex = currentIndex + (key.name === "right" ? 1 : -1)
      if (newIndex < 0) newIndex = 0
      if (newIndex >= tabs.length) newIndex = tabs.length - 1

      if (newIndex !== currentIndex) {
        this.tabs.setSelectedIndex(newIndex)
        this.currentTab = tabs[newIndex]
        this.currentListIndex = 0 // Reset selection when switching tabs
        this.updateList()
      }
      return
    }

    // Manual up/down navigation - track index ourselves
    if (key.name === "up" || key.name === "down") {
      const maxIndex =
        this.currentTab === "categories" ? MONITORABLE_CATEGORIES.length - 1 : this.getMonitorableApps().length - 1

      if (key.name === "up" && this.currentListIndex > 0) {
        this.currentListIndex--
      } else if (key.name === "down" && this.currentListIndex < maxIndex) {
        this.currentListIndex++
      }

      // Sync to SelectRenderable
      if (this.currentList) {
        this.currentList.selectedIndex = this.currentListIndex
      }
      return
    }

    // Space to toggle enabled
    if (key.name === "space") {
      if (this.currentTab === "categories") {
        const cat = MONITORABLE_CATEGORIES[this.currentListIndex]
        if (cat) this.toggleCategoryEnabled(cat)
      } else if (this.currentTab === "apps") {
        const apps = this.getMonitorableApps()
        const app = apps[this.currentListIndex]
        if (app) this.toggleAppOverride(app.id)
      }
      return
    }

    // Check toggles (1-4)
    const keyChar = key.name || key.sequence || ""
    if (["1", "2", "3", "4"].includes(keyChar)) {
      const checkMap: Record<string, keyof MonitorOptions> = {
        "1": "health",
        "2": "diskspace",
        "3": "status",
        "4": "queue",
      }
      const check = checkMap[keyChar]

      if (this.currentTab === "categories") {
        const cat = MONITORABLE_CATEGORIES[this.currentListIndex]
        if (cat) this.toggleCategoryCheck(cat, check)
      } else if (this.currentTab === "apps") {
        const apps = this.getMonitorableApps()
        const app = apps[this.currentListIndex]
        if (app) this.toggleAppCheck(app.id, check)
      }
      return
    }

    // App-specific: 'e' to toggle enabled
    if (key.name === "e" && this.currentTab === "apps") {
      const apps = this.getMonitorableApps()
      const app = apps[this.currentListIndex]
      if (app) this.toggleAppEnabled(app.id)
    }
  }

  private cleanup(): void {
    this._renderer.keyInput.off("keypress", this.handleKey.bind(this))
    this.page.visible = false
  }
}
