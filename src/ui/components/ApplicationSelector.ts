import {
  BoxRenderable,
  BoxOptions,
  CliRenderer,
  RenderContext,
  TabSelectRenderable,
  SelectRenderable,
  TextRenderable,
  SelectRenderableEvents,
  KeyEvent,
} from "@opentui/core"
import { AppId } from "../../config/schema"
import { CATEGORY_ORDER } from "../../apps/categories"
import { getAppsByCategory, getArchWarning } from "../../apps"

export interface ApplicationSelectorOptions extends BoxOptions {
  selectedApps: Set<AppId>
  onToggle?: (appId: AppId, enabled: boolean) => void
}

export class ApplicationSelector extends BoxRenderable {
  private selectedApps: Set<AppId>
  private onToggle?: (appId: AppId, enabled: boolean) => void
  private currentCategoryIndex: number = 0
  private tabs: TabSelectRenderable
  private appList: SelectRenderable
  private warningBox: BoxRenderable
  private _renderer: CliRenderer | RenderContext

  // Track internal focus state
  private activeComponent: "tabs" | "list" = "tabs"

  constructor(renderer: CliRenderer | RenderContext, options: ApplicationSelectorOptions) {
    super(renderer, {
      ...options,
      flexDirection: "column",
    })

    this._renderer = renderer
    this.selectedApps = options.selectedApps
    this.onToggle = options.onToggle

    // 1. Conflict Warnings Area (Dynamic)
    this.warningBox = new BoxRenderable(renderer, {
      width: "100%",
      flexDirection: "column",
      marginBottom: 1,
    })
    this.add(this.warningBox)
    this.updateWarnings()

    // 2. Category Tabs
    const tabOptions = this.getTabOptions()
    this.tabs = new TabSelectRenderable(renderer, {
      width: "100%" /** Explicit width needed for tabs usually */,
      options: tabOptions,
      tabWidth: 12,
      showUnderline: false,
      showDescription: false,
      selectedBackgroundColor: "#4a9eff",
      textColor: "#555555",
    })

    // Event listener replaced by manual key handling for instant switching
    /*
    this.tabs.on(TabSelectRenderableEvents.ITEM_SELECTED, (index) => {
      if (this.currentCategoryIndex !== index) {
        this.currentCategoryIndex = index
        this.updateAppList()
        this.activeComponent = "tabs"
        this.tabs.focus()
      }
    })
    */

    this.add(this.tabs)

    // Spacer
    this.add(new TextRenderable(renderer, { content: " " }))

    // 3. App List
    this.appList = new SelectRenderable(renderer, {
      width: "100%",
      flexGrow: 1,
      backgroundColor: "#151525",
      focusedBackgroundColor: "#252545",
      selectedBackgroundColor: "#3a4a6e",
      showScrollIndicator: true,
      options: [], // populated via updateAppList
    })

    this.appList.on(SelectRenderableEvents.ITEM_SELECTED, (index) => {
      const category = CATEGORY_ORDER[this.currentCategoryIndex]
      const apps = getAppsByCategory()[category.id] || []
      const app = apps[index]

      if (app) {
        const isEnabled = !this.selectedApps.has(app.id)
        if (isEnabled) {
          this.selectedApps.add(app.id)
        } else {
          this.selectedApps.delete(app.id)
        }

        if (this.onToggle) {
          this.onToggle(app.id, isEnabled)
        }

        // Refresh list to show checkmark
        this.updateAppList()

        // Refresh tabs to show counts
        this.tabs.options = this.getTabOptions()
        // Refresh warnings
        this.updateWarnings()
      }
    })

    this.add(this.appList)

    // Initial population
    this.updateAppList()
  }

  private getTabOptions() {
    return CATEGORY_ORDER.map((cat) => {
      const categoryApps = getAppsByCategory()[cat.id] || []
      const selectedCount = categoryApps.filter((a) => this.selectedApps.has(a.id)).length
      const countStr = selectedCount > 0 ? `(${selectedCount})` : ""
      return {
        name: `${cat.short}${countStr}`,
        value: cat.id,
        description: "", // Required by TabSelectOption
      }
    })
  }

  private updateAppList() {
    const category = CATEGORY_ORDER[this.currentCategoryIndex]
    const apps = getAppsByCategory()[category.id] || []

    const options = apps.map((app) => {
      const archWarning = getArchWarning(app)
      const checkmark = this.selectedApps.has(app.id) ? "[✓]" : "[ ]"
      const warnIcon = archWarning ? " ⚠️" : ""
      return {
        name: `${checkmark} ${app.name}${warnIcon}`,
        description: archWarning ? `⚠️ ${archWarning}` : `Port ${app.defaultPort} - ${app.description}`,
      }
    })

    this.appList.options = options
  }

  private updateWarnings() {
    // Clear existing
    const children = this.warningBox.getChildren()
    children.forEach((c) => this.warningBox.remove(c.id))

    const warnings = this.getConflictWarnings()

    warnings.forEach((w, i) => {
      this.warningBox.add(
        new TextRenderable(this._renderer, {
          id: `warning-${i}`,
          content: `⚠ ${w}`,
          fg: "#ffaa00",
        })
      )
    })
  }

  private getConflictWarnings(): string[] {
    const warnings: string[] = []
    const check = (list: string[], msg: string) => {
      const found = list.filter((id) => this.selectedApps.has(id as AppId))
      if (found.length > 1) warnings.push(`${msg}: ${found.join(", ")}`)
    }

    check(["homarr", "heimdall", "homepage"], "Multiple dashboards")
    check(["plex", "jellyfin"], "Multiple media servers")
    check(["overseerr", "jellyseerr"], "Multiple request managers")
    check(["prowlarr", "jackett"], "Multiple indexers")

    // Architecture warnings for selected apps
    const allApps = Object.values(getAppsByCategory()).flat()
    for (const app of allApps) {
      if (this.selectedApps.has(app.id)) {
        const archWarn = getArchWarning(app)
        if (archWarn) {
          warnings.push(archWarn)
        }
      }
    }

    return warnings
  }

  // --- Focus Management ---

  focus() {
    if (this.activeComponent === "tabs") {
      // Don't focus tabs to avoid double key handling
      this.appList.blur()
    } else {
      this.appList.focus()
    }
  }

  handleKey(key: KeyEvent): boolean {
    // Return true if handled
    // Navigation between internal components
    if (this.activeComponent === "tabs") {
      if (key.name === "down") {
        this.activeComponent = "list"
        this.tabs.blur()
        this.appList.focus()
        return true
      }
      if (key.name === "left") {
        this.switchCategory(-1)
        return true
      }
      if (key.name === "right") {
        this.switchCategory(1)
        return true
      }
    } else {
      // List active
      if (key.name === "up" && this.appList.selectedIndex === 0) {
        this.activeComponent = "tabs"
        this.appList.blur()
        return true
      }

      // Allow switching category from list too?
      if (key.name === "left" || key.name === "[") {
        this.switchCategory(-1)
        return true
      }
      if (key.name === "right" || key.name === "]") {
        this.switchCategory(1)
        return true
      }
    }

    return false
  }

  private toggleFocus() {
    if (this.activeComponent === "tabs") {
      this.activeComponent = "list"
      this.appList.focus()
    } else {
      this.activeComponent = "tabs"
      this.appList.blur()
    }
  }

  private switchCategory(delta: number) {
    let newIndex = this.currentCategoryIndex + delta
    if (newIndex < 0) newIndex = 0
    if (newIndex >= CATEGORY_ORDER.length) newIndex = CATEGORY_ORDER.length - 1

    if (newIndex !== this.currentCategoryIndex) {
      this.currentCategoryIndex = newIndex
      // Sync Tabs
      this.tabs.setSelectedIndex(newIndex)
      this.updateAppList()
    }
  }
}
