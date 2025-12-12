/**
 * Monitor Dashboard Screen
 * Three-panel master-detail layout for configuring health monitoring
 */

import type { CliRenderer, KeyEvent } from "@opentui/core"
import { BoxRenderable, TextRenderable, TabSelectRenderable, TabSelectRenderableEvents } from "@opentui/core"
import type { EasiarrConfig, AppCategory, AppId, MonitorOptions, MonitorConfig } from "../../config/schema"
import { APP_CATEGORIES } from "../../config/schema"
import { createPageLayout } from "../components/PageLayout"
import { APPS } from "../../apps/registry"
import { saveConfig } from "../../config/manager"
import {
  ArrApiClient,
  type HealthResource,
  type DiskSpaceResource,
  type SystemResource,
  type QueueStatusResource,
} from "../../api/arr-api"

// Default monitoring options
const DEFAULT_CHECKS: MonitorOptions = {
  health: true,
  diskspace: true,
  status: true,
  queue: true,
}

// Categories that support monitoring (have compatible APIs)
const MONITORABLE_CATEGORIES: AppCategory[] = ["servarr", "indexer"]

// Check type labels
const CHECK_LABELS: Record<keyof MonitorOptions, string> = {
  health: "Health Warnings",
  diskspace: "Disk Space",
  status: "System Status",
  queue: "Queue Info",
}

export class MonitorDashboard extends BoxRenderable {
  private config: EasiarrConfig
  private onBack: () => void
  private _renderer: CliRenderer

  private page!: BoxRenderable
  private modeTabs!: TabSelectRenderable
  private categoriesPanel!: BoxRenderable
  private appsPanel!: BoxRenderable
  private checksPanel!: BoxRenderable

  // State
  private currentMode: "configure" | "status" = "configure"
  private currentPanel: 0 | 1 | 2 = 0 // 0=categories, 1=apps, 2=checks
  private categoryIndex = 0
  private appIndex = 0
  private checkIndex = 0

  // Data
  private categoryConfigs: Map<AppCategory, { enabled: boolean; checks: MonitorOptions }>
  private appConfigs: Map<AppId, { override: boolean; enabled: boolean; checks: MonitorOptions }>
  private availableCategories: AppCategory[] = []
  private keyHandler: (key: KeyEvent) => void

  // Status data
  private statusData: Map<
    AppId,
    {
      loading: boolean
      error?: string
      health?: HealthResource[]
      disk?: DiskSpaceResource[]
      system?: SystemResource
      queue?: QueueStatusResource
    }
  > = new Map()

  constructor(renderer: CliRenderer, config: EasiarrConfig, onBack: () => void) {
    super(renderer, {
      width: "100%",
      height: "100%",
      flexDirection: "column",
    })

    this._renderer = renderer
    this.config = config
    this.onBack = onBack

    this.categoryConfigs = new Map()
    this.appConfigs = new Map()
    this.loadFromConfig()
    this.computeAvailableCategories()

    this.keyHandler = this.handleKey.bind(this)
    this.buildUI()
  }

  private loadFromConfig(): void {
    const monitor = this.config.monitor

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

  private computeAvailableCategories(): void {
    // Only show categories that have at least one enabled app
    this.availableCategories = MONITORABLE_CATEGORIES.filter((cat) => {
      const apps = this.getAppsInCategory(cat)
      return apps.length > 0
    })
  }

  private getMonitorableApps() {
    return this.config.apps
      .filter((a) => a.enabled)
      .map((a) => APPS[a.id])
      .filter((app) => app && MONITORABLE_CATEGORIES.includes(app.category))
  }

  private getAppsInCategory(category: AppCategory) {
    return this.config.apps
      .filter((a) => a.enabled)
      .map((a) => APPS[a.id])
      .filter((app) => app && app.category === category)
  }

  private buildUI(): void {
    const { container: page, content } = createPageLayout(this._renderer, {
      title: "Monitor Dashboard",
      stepInfo: "Configure Health Monitoring",
      footerHint: [
        { type: "key", key: "Tab", value: "Panel" },
        { type: "key", key: "↑↓", value: "Navigate" },
        { type: "key", key: "Space", value: "Toggle" },
        { type: "key", key: "1-4", value: "Checks" },
        { type: "key", key: "←→", value: "Mode" },
        { type: "key", key: "s", value: "Save" },
        { type: "key", key: "q", value: "Back" },
      ],
    })
    this.page = page

    // Mode tabs
    this.modeTabs = new TabSelectRenderable(this._renderer, {
      width: "100%",
      options: [
        { name: "Configure", value: "configure", description: "" },
        { name: "Status", value: "status", description: "" },
      ],
      tabWidth: 12,
      showUnderline: false,
      showDescription: false,
      selectedBackgroundColor: "#4a9eff",
      textColor: "#555555",
    })

    this.modeTabs.on(TabSelectRenderableEvents.ITEM_SELECTED, (index) => {
      this.currentMode = index === 0 ? "configure" : "status"
      this.updateAllPanels()
    })

    content.add(this.modeTabs)
    content.add(new TextRenderable(this._renderer, { content: " " }))

    // Three-panel row
    const panelRow = new BoxRenderable(this._renderer, {
      width: "100%",
      flexGrow: 1,
      flexDirection: "row",
    })

    // Categories panel (left)
    this.categoriesPanel = new BoxRenderable(this._renderer, {
      width: "25%",
      height: "100%",
      flexDirection: "column",
      border: true,
      borderStyle: "single",
      borderColor: "#4a9eff",
      title: "Categories",
      titleAlignment: "left",
      backgroundColor: "#151525",
    })

    // Apps panel (middle)
    this.appsPanel = new BoxRenderable(this._renderer, {
      width: "35%",
      height: "100%",
      flexDirection: "column",
      border: true,
      borderStyle: "single",
      borderColor: "#555555",
      title: "Apps",
      titleAlignment: "left",
      backgroundColor: "#151525",
    })

    // Checks panel (right)
    this.checksPanel = new BoxRenderable(this._renderer, {
      width: "40%",
      height: "100%",
      flexDirection: "column",
      border: true,
      borderStyle: "single",
      borderColor: "#555555",
      title: "Checks",
      titleAlignment: "left",
      backgroundColor: "#151525",
    })

    panelRow.add(this.categoriesPanel)
    panelRow.add(this.appsPanel)
    panelRow.add(this.checksPanel)
    content.add(panelRow)

    this._renderer.keyInput.on("keypress", this.keyHandler)
    this.add(page)

    this.updateAllPanels()
  }

  private updateAllPanels(): void {
    this.renderCategoriesPanel()
    this.renderAppsPanel()
    this.renderChecksPanel()
    this.updatePanelBorders()
  }

  private updatePanelBorders(): void {
    // Highlight focused panel
    this.categoriesPanel.borderColor = this.currentPanel === 0 ? "#4a9eff" : "#555555"
    this.appsPanel.borderColor = this.currentPanel === 1 ? "#4a9eff" : "#555555"
    this.checksPanel.borderColor = this.currentPanel === 2 ? "#4a9eff" : "#555555"
  }

  private clearPanel(panel: BoxRenderable): void {
    const children = panel.getChildren()
    children.forEach((c) => panel.remove(c.id))
  }

  private renderCategoriesPanel(): void {
    this.clearPanel(this.categoriesPanel)

    if (this.availableCategories.length === 0) {
      this.categoriesPanel.add(
        new TextRenderable(this._renderer, {
          content: "No apps enabled",
          fg: "#888888",
        })
      )
      return
    }

    this.availableCategories.forEach((cat, idx) => {
      const apps = this.getAppsInCategory(cat)
      const cfg = this.categoryConfigs.get(cat)!
      const pointer = idx === this.categoryIndex ? "▶ " : "  "
      const enabledIcon = cfg.enabled ? "●" : "○"
      const fg = idx === this.categoryIndex ? "#50fa7b" : "#aaaaaa"

      this.categoriesPanel.add(
        new TextRenderable(this._renderer, {
          id: `cat-${idx}`,
          content: `${pointer}${enabledIcon} ${APP_CATEGORIES[cat]} (${apps.length})`,
          fg,
        })
      )
    })
  }

  private renderAppsPanel(): void {
    this.clearPanel(this.appsPanel)

    if (this.availableCategories.length === 0) {
      return
    }

    const selectedCat = this.availableCategories[this.categoryIndex]
    if (!selectedCat) return

    const apps = this.getAppsInCategory(selectedCat)

    if (apps.length === 0) {
      this.appsPanel.add(
        new TextRenderable(this._renderer, {
          content: "No apps in category",
          fg: "#888888",
        })
      )
      return
    }

    // Clamp appIndex
    if (this.appIndex >= apps.length) {
      this.appIndex = 0
    }

    apps.forEach((app, idx) => {
      const cfg = this.appConfigs.get(app.id)
      const pointer = idx === this.appIndex ? "▶ " : "  "
      const overrideIcon = cfg?.override ? "⚙" : " "
      const enabledIcon = cfg?.enabled ? "●" : "○"
      const fg = idx === this.appIndex ? "#50fa7b" : "#aaaaaa"

      this.appsPanel.add(
        new TextRenderable(this._renderer, {
          id: `app-${idx}`,
          content: `${pointer}${overrideIcon}${enabledIcon} ${app.name}`,
          fg,
        })
      )
    })
  }

  private renderChecksPanel(): void {
    this.clearPanel(this.checksPanel)

    if (this.currentMode === "status") {
      this.renderStatusView()
      return
    }

    if (this.availableCategories.length === 0) {
      return
    }

    const selectedCat = this.availableCategories[this.categoryIndex]
    if (!selectedCat) return

    // When Categories panel is focused, show category-level settings
    if (this.currentPanel === 0) {
      this.renderCategoryChecks(selectedCat)
      return
    }

    // When Apps or Checks panel is focused, show app-level settings
    const apps = this.getAppsInCategory(selectedCat)
    const selectedApp = apps[this.appIndex]
    if (!selectedApp) return

    const cfg = this.appConfigs.get(selectedApp.id)
    if (!cfg) return

    // Title
    this.checksPanel.add(
      new TextRenderable(this._renderer, {
        id: "checks-title",
        content: `${selectedApp.name}`,
        fg: "#4a9eff",
        attributes: 1, // bold
      })
    )

    this.checksPanel.add(
      new TextRenderable(this._renderer, {
        id: "checks-divider",
        content: "─".repeat(20),
        fg: "#555555",
      })
    )

    // Check toggles
    const checks: (keyof MonitorOptions)[] = ["health", "diskspace", "status", "queue"]
    const effectiveChecks = cfg.override ? cfg.checks : this.categoryConfigs.get(selectedCat)!.checks

    checks.forEach((check, idx) => {
      const isEnabled = effectiveChecks[check]
      const pointer = idx === this.checkIndex ? "▶ " : "  "
      const icon = isEnabled ? "[✓]" : "[ ]"
      const fg = idx === this.checkIndex ? "#50fa7b" : "#aaaaaa"
      const dimmed = !cfg.override && idx === this.checkIndex ? " (category)" : ""

      this.checksPanel.add(
        new TextRenderable(this._renderer, {
          id: `check-${idx}`,
          content: `${pointer}${icon} ${CHECK_LABELS[check]}${dimmed}`,
          fg,
        })
      )
    })

    // Override toggle
    this.checksPanel.add(new TextRenderable(this._renderer, { content: " " }))

    const overridePointer = this.checkIndex === 4 ? "▶ " : "  "
    const overrideIcon = cfg.override ? "[✓]" : "[ ]"
    const overrideFg = this.checkIndex === 4 ? "#50fa7b" : "#8be9fd"

    this.checksPanel.add(
      new TextRenderable(this._renderer, {
        id: "override-toggle",
        content: `${overridePointer}${overrideIcon} Override Category`,
        fg: overrideFg,
      })
    )
  }

  private renderCategoryChecks(category: AppCategory): void {
    const cfg = this.categoryConfigs.get(category)
    if (!cfg) return

    // Title
    this.checksPanel.add(
      new TextRenderable(this._renderer, {
        id: "cat-checks-title",
        content: `${APP_CATEGORIES[category]} Defaults`,
        fg: "#4a9eff",
        attributes: 1, // bold
      })
    )

    this.checksPanel.add(
      new TextRenderable(this._renderer, {
        id: "cat-checks-subtitle",
        content: "Default checks for all apps in category",
        fg: "#888888",
      })
    )

    this.checksPanel.add(
      new TextRenderable(this._renderer, {
        id: "cat-checks-divider",
        content: "─".repeat(25),
        fg: "#555555",
      })
    )

    // Check toggles for category defaults
    const checks: (keyof MonitorOptions)[] = ["health", "diskspace", "status", "queue"]

    checks.forEach((check, idx) => {
      const isEnabled = cfg.checks[check]
      const pointer = idx === this.checkIndex ? "▶ " : "  "
      const icon = isEnabled ? "[✓]" : "[ ]"
      const fg = idx === this.checkIndex ? "#50fa7b" : "#aaaaaa"

      this.checksPanel.add(
        new TextRenderable(this._renderer, {
          id: `cat-check-${idx}`,
          content: `${pointer}${icon} ${CHECK_LABELS[check]}`,
          fg,
        })
      )
    })

    // Info about inheritance
    this.checksPanel.add(new TextRenderable(this._renderer, { content: " " }))
    this.checksPanel.add(
      new TextRenderable(this._renderer, {
        id: "cat-checks-info",
        content: "Apps inherit these unless overridden",
        fg: "#555555",
      })
    )
  }

  private renderStatusView(): void {
    if (this.availableCategories.length === 0) {
      return
    }

    const selectedCat = this.availableCategories[this.categoryIndex]
    if (!selectedCat) return

    const apps = this.getAppsInCategory(selectedCat)
    const selectedApp = apps[this.appIndex]
    if (!selectedApp) return

    const status = this.statusData.get(selectedApp.id)

    // Title
    this.checksPanel.add(
      new TextRenderable(this._renderer, {
        content: `📊 ${selectedApp.name} Status`,
        fg: "#4a9eff",
        attributes: 1,
      })
    )

    this.checksPanel.add(
      new TextRenderable(this._renderer, {
        content: "─".repeat(25),
        fg: "#555555",
      })
    )

    if (!status) {
      this.checksPanel.add(
        new TextRenderable(this._renderer, {
          content: "\nPress 'r' to fetch status",
          fg: "#888888",
        })
      )
      return
    }

    if (status.loading) {
      this.checksPanel.add(
        new TextRenderable(this._renderer, {
          content: "\n⏳ Loading...",
          fg: "#f1fa8c",
        })
      )
      return
    }

    if (status.error) {
      this.checksPanel.add(
        new TextRenderable(this._renderer, {
          content: `\n❌ Error: ${status.error}`,
          fg: "#ff5555",
        })
      )
      return
    }

    // Health warnings
    if (status.health && status.health.length > 0) {
      this.checksPanel.add(
        new TextRenderable(this._renderer, {
          content: `\n⚠️ Health Warnings: ${status.health.length}`,
          fg: "#ffb86c",
        })
      )
      status.health.slice(0, 3).forEach((h) => {
        this.checksPanel.add(
          new TextRenderable(this._renderer, {
            content: `  • ${h.message}`,
            fg: "#f1fa8c",
          })
        )
      })
    } else {
      this.checksPanel.add(
        new TextRenderable(this._renderer, {
          content: "\n✓ Health: OK",
          fg: "#50fa7b",
        })
      )
    }

    // Disk space
    if (status.disk && status.disk.length > 0) {
      const totalFree = status.disk.reduce((sum, d) => sum + (d.freeSpace || 0), 0)
      const freeGB = (totalFree / 1024 / 1024 / 1024).toFixed(1)
      const freeColor = totalFree < 10 * 1024 * 1024 * 1024 ? "#ff5555" : "#50fa7b"
      this.checksPanel.add(
        new TextRenderable(this._renderer, {
          content: `\n💾 Disk Free: ${freeGB} GB`,
          fg: freeColor,
        })
      )
    }

    // System status
    if (status.system) {
      this.checksPanel.add(
        new TextRenderable(this._renderer, {
          content: `\n📦 Version: ${status.system.version || "Unknown"}`,
          fg: "#8be9fd",
        })
      )
    }

    // Queue
    if (status.queue) {
      const queueCount = status.queue.totalCount || 0
      this.checksPanel.add(
        new TextRenderable(this._renderer, {
          content: `\n📥 Queue: ${queueCount} items`,
          fg: queueCount > 0 ? "#f1fa8c" : "#50fa7b",
        })
      )
    }

    this.checksPanel.add(
      new TextRenderable(this._renderer, {
        content: "\n\nPress 'r' to refresh",
        fg: "#555555",
      })
    )
  }

  private async fetchStatus(): Promise<void> {
    if (this.availableCategories.length === 0) return

    const selectedCat = this.availableCategories[this.categoryIndex]
    if (!selectedCat) return

    const apps = this.getAppsInCategory(selectedCat)
    const selectedApp = apps[this.appIndex]
    if (!selectedApp) return

    // Read API key from env file
    const { readEnv } = await import("../../utils/env")
    const env = await readEnv()
    const apiKey = env[`API_KEY_${selectedApp.id.toUpperCase()}`]

    if (!apiKey) {
      this.statusData.set(selectedApp.id, {
        loading: false,
        error: "No API key in .env",
      })
      this.renderChecksPanel()
      return
    }

    // Mark as loading
    this.statusData.set(selectedApp.id, { loading: true })
    this.renderChecksPanel()

    try {
      const client = new ArrApiClient("localhost", selectedApp.defaultPort, apiKey)

      const [health, disk, system, queue] = await Promise.allSettled([
        client.getHealth(),
        client.getDiskSpace(),
        client.getSystemStatus(),
        client.getQueueStatus(),
      ])

      this.statusData.set(selectedApp.id, {
        loading: false,
        health: health.status === "fulfilled" ? health.value : undefined,
        disk: disk.status === "fulfilled" ? disk.value : undefined,
        system: system.status === "fulfilled" ? system.value : undefined,
        queue: queue.status === "fulfilled" ? queue.value : undefined,
      })
    } catch (err) {
      this.statusData.set(selectedApp.id, {
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      })
    }

    this.renderChecksPanel()
  }

  private handleKey(key: KeyEvent): void {
    if (!this.page.visible) return

    // Quit
    if (key.name === "q" || key.name === "escape") {
      this.cleanup()
      this.onBack()
      return
    }

    // Save
    if (key.name === "s") {
      this.saveConfiguration()
      return
    }

    // Refresh status (in status mode)
    if (key.name === "r" && this.currentMode === "status") {
      this.fetchStatus()
      return
    }

    // Mode switch
    if (key.name === "left" || key.name === "right") {
      const newMode = key.name === "left" ? 0 : 1
      this.modeTabs.setSelectedIndex(newMode)
      this.currentMode = newMode === 0 ? "configure" : "status"
      this.updateAllPanels()
      return
    }

    // Tab to switch panels
    if (key.name === "tab") {
      if (key.shift) {
        this.currentPanel = ((this.currentPanel - 1 + 3) % 3) as 0 | 1 | 2
      } else {
        this.currentPanel = ((this.currentPanel + 1) % 3) as 0 | 1 | 2
      }
      this.updatePanelBorders()
      return
    }

    // Navigation within panel
    if (key.name === "up" || key.name === "down") {
      const delta = key.name === "up" ? -1 : 1
      this.navigatePanel(delta)
      return
    }

    // Toggle
    if (key.name === "space" || key.name === "return") {
      this.toggleCurrentItem()
      return
    }

    // Number keys 1-4 for quick check toggling
    const numKey = parseInt(key.sequence || "", 10)
    if (numKey >= 1 && numKey <= 4) {
      const checkIdx = numKey - 1 // 0-indexed
      if (this.currentPanel === 0) {
        // Toggle category-level check directly
        this.toggleCategoryCheck(checkIdx)
      } else {
        // Toggle app-level check (or category if not overriding)
        this.checkIndex = checkIdx
        this.toggleCurrentItem()
        this.currentPanel = 2 // Move to checks panel for visual feedback
        this.updatePanelBorders()
      }
      this.renderChecksPanel()
      return
    }
  }

  private navigatePanel(delta: number): void {
    if (this.currentPanel === 0) {
      // Categories
      const max = this.availableCategories.length - 1
      this.categoryIndex = Math.max(0, Math.min(max, this.categoryIndex + delta))
      this.appIndex = 0 // Reset app selection
      this.checkIndex = 0
      this.updateAllPanels()
    } else if (this.currentPanel === 1) {
      // Apps
      const cat = this.availableCategories[this.categoryIndex]
      const apps = cat ? this.getAppsInCategory(cat) : []
      const max = apps.length - 1
      this.appIndex = Math.max(0, Math.min(max, this.appIndex + delta))
      this.checkIndex = 0
      this.renderAppsPanel()
      this.renderChecksPanel()
    } else {
      // Checks (0-3 for checks, 4 for override)
      this.checkIndex = Math.max(0, Math.min(4, this.checkIndex + delta))
      this.renderChecksPanel()
    }
  }

  private toggleCurrentItem(): void {
    const cat = this.availableCategories[this.categoryIndex]
    if (!cat) return

    if (this.currentPanel === 0) {
      // When in Categories panel, toggle category enabled status
      const cfg = this.categoryConfigs.get(cat)!
      cfg.enabled = !cfg.enabled
      this.renderCategoriesPanel()
      this.renderChecksPanel()
    } else if (this.currentPanel === 1) {
      // Toggle app enabled
      const apps = this.getAppsInCategory(cat)
      const app = apps[this.appIndex]
      if (app) {
        const cfg = this.appConfigs.get(app.id)!
        cfg.enabled = !cfg.enabled
        this.renderAppsPanel()
      }
    } else if (this.currentPanel === 2) {
      // Toggle check or override - depends on whether we're viewing category or app
      // Since we show category checks when panel 0 is focused, but we're now in panel 2,
      // we're viewing an app's checks
      const apps = this.getAppsInCategory(cat)
      const app = apps[this.appIndex]
      if (!app) return

      const cfg = this.appConfigs.get(app.id)!

      if (this.checkIndex === 4) {
        // Toggle override
        cfg.override = !cfg.override
      } else {
        // Toggle specific check
        const checks: (keyof MonitorOptions)[] = ["health", "diskspace", "status", "queue"]
        const checkKey = checks[this.checkIndex]

        if (cfg.override) {
          cfg.checks[checkKey] = !cfg.checks[checkKey]
        } else {
          // Toggle on category level (affects all apps without override)
          const catCfg = this.categoryConfigs.get(cat)!
          catCfg.checks[checkKey] = !catCfg.checks[checkKey]
        }
      }
      this.renderChecksPanel()
    }
  }

  /**
   * Toggle category-level check by number key (1-4)
   * This allows direct toggling of category defaults from any panel
   */
  private toggleCategoryCheck(checkIdx: number): void {
    const cat = this.availableCategories[this.categoryIndex]
    if (!cat) return

    const catCfg = this.categoryConfigs.get(cat)
    if (!catCfg) return

    const checks: (keyof MonitorOptions)[] = ["health", "diskspace", "status", "queue"]
    if (checkIdx >= 0 && checkIdx < checks.length) {
      catCfg.checks[checks[checkIdx]] = !catCfg.checks[checks[checkIdx]]
      this.renderChecksPanel()
    }
  }

  private async saveConfiguration(): Promise<void> {
    const monitor: MonitorConfig = {
      categories: Array.from(this.categoryConfigs.entries()).map(([category, cfg]) => ({
        category,
        enabled: cfg.enabled,
        checks: cfg.checks,
      })),
      apps: Array.from(this.appConfigs.entries())
        .filter(([, cfg]) => cfg.override)
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

  private cleanup(): void {
    this._renderer.keyInput.off("keypress", this.keyHandler)
    // Remove self from parent container
    if (this.parent && this.id) {
      try {
        this.parent.remove(this.id)
      } catch {
        /* ignore removal errors */
      }
    }
  }
}
