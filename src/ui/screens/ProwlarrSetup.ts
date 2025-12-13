/**
 * Prowlarr Setup Screen
 * Configures Prowlarr integration with *arr apps, FlareSolverr, and proxies
 */

import { BoxRenderable, CliRenderer, TextRenderable, TextNodeRenderable, KeyEvent } from "@opentui/core"
import { createPageLayout } from "../components/PageLayout"
import { EasiarrConfig } from "../../config/schema"
import { getApp } from "../../apps/registry"
import { ProwlarrClient, ArrAppType, ProwlarrIndexerSchema, PROWLARR_CATEGORIES } from "../../api/prowlarr-api"
import { readEnvSync } from "../../utils/env"
import { debugLog } from "../../utils/debug"

interface SetupResult {
  name: string
  status: "pending" | "configuring" | "success" | "error" | "skipped"
  message?: string
}

type Step = "menu" | "sync-apps" | "flaresolverr" | "sync-profiles" | "select-indexers" | "done"

const ARR_APP_TYPES: Record<string, ArrAppType> = {
  radarr: "Radarr",
  sonarr: "Sonarr",
  lidarr: "Lidarr",
  readarr: "Readarr",
  whisparr: "Whisparr",
  mylar3: "Mylar",
}

export class ProwlarrSetup extends BoxRenderable {
  private config: EasiarrConfig
  private cliRenderer: CliRenderer
  private onBack: () => void
  private keyHandler!: (key: KeyEvent) => void
  private results: SetupResult[] = []
  private currentStep: Step = "menu"
  private contentBox!: BoxRenderable
  private pageContainer!: BoxRenderable
  private menuIndex = 0
  private prowlarrClient: ProwlarrClient | null = null
  private availableIndexers: ProwlarrIndexerSchema[] = []
  private selectedIndexers: Set<number> = new Set() // Using index in availableIndexers array
  private listScrollOffset = 0

  constructor(cliRenderer: CliRenderer, config: EasiarrConfig, onBack: () => void) {
    const { container: pageContainer, content: contentBox } = createPageLayout(cliRenderer, {
      title: "Prowlarr Setup",
      stepInfo: "Configure indexer sync and proxies",
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

    this.initProwlarrClient()
    this.initKeyHandler()
    this.refreshContent()
  }

  private initProwlarrClient(): void {
    const env = readEnvSync()
    const apiKey = env["API_KEY_PROWLARR"]
    if (apiKey) {
      const prowlarrConfig = this.config.apps.find((a) => a.id === "prowlarr")
      const port = prowlarrConfig?.port || 9696
      this.prowlarrClient = new ProwlarrClient("localhost", port, apiKey)
    }
  }

  private initKeyHandler(): void {
    this.keyHandler = (key: KeyEvent) => {
      debugLog("Prowlarr", `Key: ${key.name}, step=${this.currentStep}`)

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
      } else if (this.currentStep === "select-indexers") {
        this.handleIndexerSelectionKeys(key)
      } else if (this.currentStep === "done") {
        if (key.name === "return" || key.name === "escape") {
          this.currentStep = "menu"
          this.refreshContent()
        }
      }
    }
    this.cliRenderer.keyInput.on("keypress", this.keyHandler)
    debugLog("Prowlarr", "Key handler registered")
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

  private executeMenuItem(index: number): void {
    const items = this.getMenuItems()
    if (index >= 0 && index < items.length) {
      items[index].action()
    }
  }

  private async syncArrApps(): Promise<void> {
    if (!this.prowlarrClient) {
      this.results = [{ name: "Prowlarr", status: "error", message: "API key not found" }]
      this.currentStep = "done"
      this.refreshContent()
      return
    }

    this.currentStep = "sync-apps"
    this.results = []

    const arrApps = this.config.apps.filter((a) => a.enabled && Object.keys(ARR_APP_TYPES).includes(a.id))
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
          const result = this.results.find((r) => r.name === app.id)
          if (result) {
            result.status = "skipped"
            result.message = "No API key"
          }
          continue
        }

        const appDef = getApp(app.id)
        const port = app.port || appDef?.defaultPort || 7878

        // In Docker, use container names for inter-container communication
        await this.prowlarrClient.addArrApp(
          appType,
          app.id,
          port,
          apiKey,
          "prowlarr",
          prowlarrPort,
          appDef?.prowlarrCategoryIds
        )

        const result = this.results.find((r) => r.name === app.id)
        if (result) {
          result.status = "success"
        }
      } catch (error) {
        const result = this.results.find((r) => r.name === app.id)
        if (result) {
          result.status = "error"
          result.message = error instanceof Error ? error.message : "Unknown error"
        }
      }
      this.refreshContent()
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

    this.currentStep = "flaresolverr"
    this.results = [{ name: "FlareSolverr", status: "configuring" }]
    this.refreshContent()

    try {
      // Check if FlareSolverr is enabled
      const fsConfig = this.config.apps.find((a) => a.id === "flaresolverr")
      if (!fsConfig?.enabled) {
        this.results[0].status = "skipped"
        this.results[0].message = "FlareSolverr not enabled in config"
      } else {
        const fsPort = fsConfig.port || 8191
        // In Docker, use container name for FlareSolverr
        await this.prowlarrClient.configureFlareSolverr(`http://flaresolverr:${fsPort}`)
        this.results[0].status = "success"
        this.results[0].message = "Proxy added with 'flaresolverr' tag"
      }
    } catch (error) {
      this.results[0].status = "error"
      this.results[0].message = error instanceof Error ? error.message : "Unknown error"
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

    this.currentStep = "sync-profiles"
    this.results = [
      { name: "Automatic Search", status: "configuring" },
      { name: "Interactive Search", status: "configuring" },
    ]
    this.refreshContent()

    try {
      await this.prowlarrClient.createLimitedAPISyncProfiles()
      this.results[0].status = "success"
      this.results[0].message = "RSS disabled, auto+interactive enabled"
      this.results[1].status = "success"
      this.results[1].message = "RSS+auto disabled, interactive only"
    } catch (error) {
      this.results.forEach((r) => {
        r.status = "error"
        r.message = error instanceof Error ? error.message : "Unknown error"
      })
    }

    this.currentStep = "done"
    this.refreshContent()
  }

  private async searchIndexers(): Promise<void> {
    if (!this.prowlarrClient) return

    this.currentStep = "select-indexers"
    this.results = [{ name: "Fetching indexers...", status: "configuring" }]
    this.refreshContent()

    try {
      const schemas = await this.prowlarrClient.getIndexerSchemas()
      this.availableIndexers = schemas
        .filter((i) => i.privacy === "public" && i.enable)
        // Sort by category count descending (most capable first)
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
      this.currentStep = "done"
    }
    this.refreshContent()
  }

  private handleIndexerSelectionKeys(key: KeyEvent): void {
    if (this.results.length > 0) return // If actively adding

    if (key.name === "up") {
      this.menuIndex = Math.max(0, this.menuIndex - 1)
      if (this.menuIndex < this.listScrollOffset) {
        this.listScrollOffset = this.menuIndex
      }
      this.refreshContent()
    } else if (key.name === "down") {
      this.menuIndex = Math.min(this.availableIndexers.length - 1, this.menuIndex + 1)
      // Visible items = height - header (approx 15)
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
    }
  }

  private async addSelectedIndexers(): Promise<void> {
    const toAdd = Array.from(this.selectedIndexers).map((idx) => this.availableIndexers[idx])
    if (toAdd.length === 0) return

    this.results = toAdd.map((i) => ({ name: i.name, status: "pending" }))
    this.refreshContent()

    for (const indexer of toAdd) {
      // Update UI
      const res = this.results.find((r) => r.name === indexer.name)
      if (res) res.status = "configuring"
      this.refreshContent()

      try {
        if (!this.prowlarrClient) throw new Error("No client")

        // Auto-add FlareSolverr tag if it exists
        const tags = await this.prowlarrClient.getTags()
        const fsTag = tags.find((t) => t.label.toLowerCase() === "flaresolverr")

        if (fsTag) {
          indexer.tags = indexer.tags || []
          if (!indexer.tags.includes(fsTag.id)) {
            indexer.tags.push(fsTag.id)
          }
        }

        await this.prowlarrClient.createIndexer(indexer)
        if (res) {
          res.status = "success"
          const extra = fsTag ? " + FlareSolverr" : ""
          res.message = `Added with ${indexer.capabilities?.categories?.length || 0} categories${extra}`
        }
      } catch (e) {
        if (res) {
          res.status = "error"
          res.message = String(e)
        }
      }
      this.refreshContent()
    }

    // After done, stay on done screen
    this.currentStep = "done"
    this.refreshContent()
  }

  private refreshContent(): void {
    this.contentBox.getChildren().forEach((child) => child.destroy())

    if (this.currentStep === "menu") {
      this.renderMenu()
    } else if (this.currentStep === "select-indexers" && this.results.length === 0) {
      this.renderIndexerSelection()
    } else {
      this.renderResults()
    }
  }

  private renderMenu(): void {
    if (!this.prowlarrClient) {
      this.contentBox.add(
        new TextRenderable(this.cliRenderer, {
          content: "⚠️ Prowlarr API key not found!\nRun 'Extract API Keys' first.\n\n",
          fg: "#ff5555",
        })
      )
    }

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
  }

  private renderResults(): void {
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
    // Removed extra `})` and `)` here to fix syntax.
    // The original instruction had an extra `})` and `)` after the first `this.contentBox.add` call.

    items.forEach((idx, i) => {
      const realIndex = this.listScrollOffset + i
      const isSelected = this.selectedIndexers.has(realIndex)
      const isCurrent = realIndex === this.menuIndex

      const check = isSelected ? "[x]" : "[ ]"
      const pointer = isCurrent ? "→" : " "

      const cats = idx.capabilities?.categories || []

      // Group capabilities
      const groups = new Map<string, boolean>() // Name -> IsRelevant

      // Helper to check relevance
      const checkRel = (min: number, max: number) => [...activeCategoryIds].some((id) => id >= min && id < max)

      // Map to track which badge colors to use
      // We can pre-define colors or just cycle them, but for now let's keep the user's preferred colors if possible,
      // or define a mapping.
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

        // Find parent category from static data
        const parentCat = PROWLARR_CATEGORIES.find((pc) => {
          // Check if id matches parent
          if (pc.id === id) return true
          // Check if id matches any subcategory
          if (pc.subCategories?.some((sub) => sub.id === id)) return true
          // Check range heuristic if needed, but the static data should cover known IDs
          // Fallback to range check if no exact match found?
          // Actually, the static data structure implies ranges (e.g. Movies 2000-2999)
          // Let's use the ID ranges implied by the static data if possible, or just strict matching.
          // The previous code used ranges. Let's try to match ranges based on the starting ID of the parent category.
          // Assuming categories are 1000s blocks.
          const rangeStart = Math.floor(pc.id / 1000) * 1000
          if (id >= rangeStart && id < rangeStart + 1000) return true
          return false
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

      // Render Badge Helper
      const addBadge = (name: string) => {
        if (groups.has(name)) {
          const isRel = groups.get(name)
          const colors = categoryColors[name] || categoryColors["Other"]
          const color = isRel ? colors.active : colors.inactive

          const badge = new TextNodeRenderable({ fg: color })
          badge.add(`[${name}] `)
          if (isRel) {
            badge.attributes = 1
          } // Bold if supported/relevant

          line.add(badge)
        }
      }

      // Iterate through our static categories to render badges in order
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

  private cleanup(): void {
    this.cliRenderer.keyInput.off("keypress", this.keyHandler)
    this.destroy()
    this.onBack()
  }
}
