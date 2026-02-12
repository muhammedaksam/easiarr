/**
 * Prowlarr Setup Screen
 * Configures Prowlarr integration with *arr apps, FlareSolverr, and proxies
 */

import { CliRenderer, KeyEvent, TextNodeRenderable, TextRenderable } from "@opentui/core"

import type { MenuItem, SetupResult } from "~/ui/screens/setup/BaseAppSetupScreen"
import {
  ArrAppType,
  PROWLARR_CATEGORIES,
  ProwlarrClient,
  ProwlarrIndexerSchema,
} from "~/api/prowlarr-api"
import { getApp } from "~/apps/registry"
import { EasiarrConfig } from "~/config/schema"
import { BaseAppSetupScreen } from "~/ui/screens/setup/BaseAppSetupScreen"
import { readEnvSync } from "~/utils/env"

const ARR_APP_TYPES: Record<string, ArrAppType> = {
  radarr: "Radarr",
  sonarr: "Sonarr",
  lidarr: "Lidarr",
  readarr: "Readarr",
  whisparr: "Whisparr",
  mylar3: "Mylar",
}

export class ProwlarrSetup extends BaseAppSetupScreen {
  private prowlarrClient: ProwlarrClient | null = null
  private availableIndexers: ProwlarrIndexerSchema[] = []
  private selectedIndexers: Set<number> = new Set()
  private listScrollOffset = 0
  private isSelectingIndexers = false
  private healthChecked = false
  private healthMessage = ""

  constructor(cliRenderer: CliRenderer, config: EasiarrConfig, onBack: () => void) {
    super(cliRenderer, config, onBack)
    this.initProwlarrClient()
  }

  getTitle(): string {
    return "Prowlarr Setup"
  }

  getStepInfo(): string {
    return "Configure indexer sync and proxies"
  }

  getMenuItems(): MenuItem[] {
    return [
      {
        name: "🔗 Sync *arr Apps",
        description: "Connect Radarr/Sonarr/etc to Prowlarr",
        action: () => this.syncArrApps(),
      },
      {
        name: "🛡️ Setup FlareSolverr",
        description: "Add Cloudflare bypass proxy",
        action: () => this.setupFlareSolverr(),
      },
      {
        name: "🔍 Add Public Indexers",
        description: "Search and add public trackers",
        action: () => this.searchIndexers(),
      },
      {
        name: "📊 Create Sync Profiles",
        description: "Limited API indexer profiles",
        action: () => this.createSyncProfiles(),
      },
      {
        name: "↩️  Back",
        description: "Return to main menu",
        action: () => this.cleanup(),
      },
    ]
  }

  // ============================================
  // CUSTOM KEY HANDLING
  // ============================================

  protected handleCustomKeys(key: KeyEvent): boolean {
    if (this.isSelectingIndexers && this.results.length === 0) {
      if (key.name === "up") {
        this.menuIndex = Math.max(0, this.menuIndex - 1)
        if (this.menuIndex < this.listScrollOffset) {
          this.listScrollOffset = this.menuIndex
        }
        this.refreshContent()
      } else if (key.name === "down") {
        this.menuIndex = Math.min(this.availableIndexers.length - 1, this.menuIndex + 1)
        const visibleItems = 15
        if (this.menuIndex >= this.listScrollOffset + visibleItems) {
          this.listScrollOffset = this.menuIndex - visibleItems + 1
        }
        this.refreshContent()
      } else if (key.name === "space") {
        if (this.selectedIndexers.has(this.menuIndex)) {
          this.selectedIndexers.delete(this.menuIndex)
        } else {
          this.selectedIndexers.add(this.menuIndex)
        }
        this.refreshContent()
      } else if (key.name === "return") {
        this.addSelectedIndexers()
      } else if (key.name === "escape") {
        this.isSelectingIndexers = false
        this.currentStep = "menu"
        this.menuIndex = 0
        this.refreshContent()
      }
      return true
    }
    return false
  }

  // ============================================
  // CUSTOM RENDERING
  // ============================================

  protected renderCustomContent(): boolean {
    if (this.currentStep === "menu") {
      // Show warning if no API key
      if (!this.prowlarrClient) {
        this.contentBox.add(
          new TextRenderable(this.cliRenderer, {
            content: "⚠️ Prowlarr API key not found!\nRun 'Extract API Keys' first.\n\n",
            fg: "#ff5555",
          })
        )
      }

      // Render normal menu
      this.contentBox.add(
        new TextRenderable(this.cliRenderer, {
          content: "Select an action:\n\n",
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

      return true
    }

    if (this.isSelectingIndexers && this.results.length === 0) {
      this.renderIndexerSelection()
      return true
    }

    return false // Default results rendering
  }

  private renderIndexerSelection(): void {
    const visibleHeight = 15
    const endIndex = Math.min(this.availableIndexers.length, this.listScrollOffset + visibleHeight)
    const items = this.availableIndexers.slice(this.listScrollOffset, endIndex)

    // Calculate active category IDs from selected apps
    const activeCategoryIds = new Set<number>()
    this.config.apps.forEach((app) => {
      const def = getApp(app.id)
      def?.prowlarrCategoryIds?.forEach((id) => activeCategoryIds.add(id))
    })

    this.contentBox.add(
      new TextRenderable(this.cliRenderer, {
        content: `Select Indexers (Space to toggle, Enter to add):\n\n`,
        fg: "#f1fa8c",
      })
    )

    items.forEach((idx, i) => {
      const realIndex = this.listScrollOffset + i
      const isSelected = this.selectedIndexers.has(realIndex)
      const isCurrent = realIndex === this.menuIndex

      const check = isSelected ? "[x]" : "[ ]"
      const pointer = isCurrent ? "→" : " "

      const cats = idx.capabilities?.categories || []
      const groups = new Map<string, boolean>()

      const checkRel = (min: number, max: number) =>
        [...activeCategoryIds].some((id) => id >= min && id < max)

      const categoryColors: Record<string, { active: string; inactive: string }> = {
        Movies: { active: "#00ffff", inactive: "#008b8b" },
        TV: { active: "#ff00ff", inactive: "#8b008b" },
        Audio: { active: "#00ff00", inactive: "#006400" },
        Books: { active: "#50fa7b", inactive: "#00008b" },
        XXX: { active: "#ff5555", inactive: "#8b0000" },
        PC: { active: "#f8f8f2", inactive: "#6272a4" },
        Console: { active: "#f1fa8c", inactive: "#8b8000" },
        Other: { active: "#aaaaaa", inactive: "#555555" },
      }

      cats.forEach((c) => {
        const id = c.id
        let name = ""
        let isRel = false

        const parentCat = PROWLARR_CATEGORIES.find((pc) => {
          if (pc.id === id) return true
          if (pc.subCategories?.some((sub) => sub.id === id)) return true
          const rangeStart = Math.floor(pc.id / 1000) * 1000
          return id >= rangeStart && id < rangeStart + 1000
        })

        if (parentCat) {
          name = parentCat.name
          const rangeStart = Math.floor(parentCat.id / 1000) * 1000
          isRel = checkRel(rangeStart, rangeStart + 1000)
        }

        if (name) {
          groups.set(name, groups.get(name) || isRel)
        }
      })

      const line = new TextRenderable(this.cliRenderer, { content: "" })
      line.add(`${pointer} ${check} ${idx.name} `)

      const addBadge = (name: string) => {
        if (groups.has(name)) {
          const isRel = groups.get(name)
          const colors = categoryColors[name] || categoryColors["Other"]
          const color = isRel ? colors.active : colors.inactive

          const badge = new TextNodeRenderable({ fg: color })
          badge.add(`[${name}] `)
          if (isRel) {
            badge.attributes = 1
          }
          line.add(badge)
        }
      }

      PROWLARR_CATEGORIES.forEach((cat) => {
        addBadge(cat.name)
      })

      line.add("\n")
      line.fg = isCurrent ? "#ffffff" : isSelected ? "#50fa7b" : "#aaaaaa"

      this.contentBox.add(line)
    })

    const remaining = this.availableIndexers.length - endIndex
    if (remaining > 0) {
      this.contentBox.add(
        new TextRenderable(this.cliRenderer, {
          content: `... and ${remaining} more`,
          fg: "#6272a4",
        })
      )
    }
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  private initProwlarrClient(): void {
    const env = readEnvSync()
    const apiKey = env["API_KEY_PROWLARR"]
    if (apiKey) {
      const prowlarrConfig = this.config.apps.find((a) => a.id === "prowlarr")
      const port = prowlarrConfig?.port || 9696
      this.prowlarrClient = new ProwlarrClient("localhost", port, apiKey)
    }
  }

  private updateResult(name: string, status: SetupResult["status"], message?: string): void {
    const result = this.results.find((r) => r.name === name)
    if (result) {
      result.status = status
      if (message) result.message = message
    }
    this.refreshContent()
  }

  // ============================================
  // MENU ACTIONS
  // ============================================

  private async syncArrApps(): Promise<void> {
    if (!this.prowlarrClient) {
      this.results = [{ name: "Prowlarr", status: "error", message: "API key not found" }]
      this.currentStep = "done"
      this.refreshContent()
      return
    }

    this.currentStep = "running"
    this.results = []

    const arrApps = this.config.apps.filter(
      (a) => a.enabled && Object.keys(ARR_APP_TYPES).includes(a.id)
    )
    const env = readEnvSync()
    const prowlarrConfig = this.config.apps.find((a) => a.id === "prowlarr")
    const prowlarrPort = prowlarrConfig?.port || 9696

    for (const app of arrApps) {
      const appType = ARR_APP_TYPES[app.id]
      if (!appType) continue

      this.results.push({ name: app.id, status: "configuring" })
      this.refreshContent()

      try {
        const apiKey = env[`API_KEY_${app.id.toUpperCase()}`]
        if (!apiKey) {
          this.updateResult(app.id, "skipped", "No API key")
          continue
        }

        const appDef = getApp(app.id)
        const port = app.port || appDef?.defaultPort || 7878

        await this.prowlarrClient.addArrApp(
          appType,
          app.id,
          port,
          apiKey,
          "prowlarr",
          prowlarrPort,
          appDef?.prowlarrCategoryIds
        )

        this.updateResult(app.id, "success")
      } catch (error) {
        this.updateResult(app.id, "error", error instanceof Error ? error.message : "Unknown error")
      }
    }

    // Trigger sync
    try {
      await this.prowlarrClient.syncApplications()
    } catch {
      // Sync might fail if no apps, that's ok
    }

    this.currentStep = "done"
    this.refreshContent()
  }

  private async setupFlareSolverr(): Promise<void> {
    if (!this.prowlarrClient) {
      this.results = [{ name: "Prowlarr", status: "error", message: "API key not found" }]
      this.currentStep = "done"
      this.refreshContent()
      return
    }

    this.currentStep = "running"
    this.results = [{ name: "FlareSolverr", status: "configuring" }]
    this.refreshContent()

    try {
      const fsConfig = this.config.apps.find((a) => a.id === "flaresolverr")
      if (!fsConfig?.enabled) {
        this.updateResult("FlareSolverr", "skipped", "FlareSolverr not enabled in config")
      } else {
        const fsPort = fsConfig.port || 8191
        await this.prowlarrClient.configureFlareSolverr(`http://flaresolverr:${fsPort}`)
        this.updateResult("FlareSolverr", "success", "Proxy added with 'flaresolverr' tag")
      }
    } catch (error) {
      this.updateResult(
        "FlareSolverr",
        "error",
        error instanceof Error ? error.message : "Unknown error"
      )
    }

    this.currentStep = "done"
    this.refreshContent()
  }

  private async createSyncProfiles(): Promise<void> {
    if (!this.prowlarrClient) {
      this.results = [{ name: "Prowlarr", status: "error", message: "API key not found" }]
      this.currentStep = "done"
      this.refreshContent()
      return
    }

    this.currentStep = "running"
    this.results = [
      { name: "Automatic Search", status: "configuring" },
      { name: "Interactive Search", status: "configuring" },
    ]
    this.refreshContent()

    try {
      await this.prowlarrClient.createLimitedAPISyncProfiles()
      this.updateResult("Automatic Search", "success", "RSS disabled, auto+interactive enabled")
      this.updateResult("Interactive Search", "success", "RSS+auto disabled, interactive only")
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error"
      this.results.forEach((r) => {
        r.status = "error"
        r.message = msg
      })
    }

    this.currentStep = "done"
    this.refreshContent()
  }

  private async searchIndexers(): Promise<void> {
    if (!this.prowlarrClient) return

    this.isSelectingIndexers = true
    this.results = [{ name: "Fetching indexers...", status: "configuring" }]
    this.refreshContent()

    try {
      const schemas = await this.prowlarrClient.getIndexerSchemas()
      this.availableIndexers = schemas
        .filter((i) => i.privacy === "public" && i.enable)
        .sort((a, b) => {
          const infoA = (a.capabilities?.categories || []).length
          const infoB = (b.capabilities?.categories || []).length
          return infoB - infoA
        })

      this.selectedIndexers.clear()
      this.menuIndex = 0
      this.listScrollOffset = 0
      this.results = []
    } catch (error) {
      this.results = [{ name: "Error", status: "error", message: String(error) }]
      this.isSelectingIndexers = false
      this.currentStep = "done"
    }
    this.refreshContent()
  }

  private async addSelectedIndexers(): Promise<void> {
    const toAdd = Array.from(this.selectedIndexers).map((idx) => this.availableIndexers[idx])
    if (toAdd.length === 0) return

    this.results = toAdd.map((i) => ({ name: i.name, status: "pending" as const }))
    this.refreshContent()

    for (const indexer of toAdd) {
      this.updateResult(indexer.name, "configuring")

      try {
        if (!this.prowlarrClient) throw new Error("No client")

        const tags = await this.prowlarrClient.getTags()
        const fsTag = tags.find((t) => t.label.toLowerCase() === "flaresolverr")

        if (fsTag) {
          indexer.tags = indexer.tags || []
          if (!indexer.tags.includes(fsTag.id)) {
            indexer.tags.push(fsTag.id)
          }
        }

        await this.prowlarrClient.createIndexer(indexer)
        const extra = fsTag ? " + FlareSolverr" : ""
        this.updateResult(
          indexer.name,
          "success",
          `Added with ${indexer.capabilities?.categories?.length || 0} categories${extra}`
        )
      } catch (e) {
        this.updateResult(indexer.name, "error", String(e))
      }
    }

    this.isSelectingIndexers = false
    this.currentStep = "done"
    this.refreshContent()
  }
}
