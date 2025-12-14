/**
 * App Manager Screen
 * Add, remove, or configure apps
 */

import type { RenderContext, CliRenderer, KeyEvent } from "@opentui/core"
import { BoxRenderable, TextRenderable, SelectRenderable, SelectRenderableEvents, RGBA } from "@opentui/core"
import type { App } from "../App"
import type { AppId, EasiarrConfig } from "../../config/schema"
import { saveConfig } from "../../config"
import { saveCompose } from "../../compose"
import { createPageLayout } from "../components/PageLayout"
import { ensureDirectoryStructure } from "../../structure/manager"
import { ApplicationSelector } from "../components/ApplicationSelector"
import { getApp } from "../../apps/registry"
import { SecretsEditor } from "./SecretsEditor"

export class AppManager {
  private renderer: RenderContext
  private container: BoxRenderable
  private app: App
  private config: EasiarrConfig
  private selector: ApplicationSelector | null = null
  private navMenu: SelectRenderable | null = null
  private keyHandler: ((key: KeyEvent) => void) | null = null
  private activeZone: "selector" | "nav" = "selector"
  private previouslyEnabledApps: Set<AppId>
  private page: BoxRenderable | null = null

  constructor(renderer: RenderContext, container: BoxRenderable, app: App, config: EasiarrConfig) {
    this.renderer = renderer
    this.container = container
    this.app = app
    this.config = config
    // Track which apps were enabled before user starts editing
    this.previouslyEnabledApps = new Set(config.apps.filter((a) => a.enabled).map((a) => a.id))

    this.render()
  }

  private render(): void {
    // Clean up previous listeners
    if (this.keyHandler && (this.renderer as CliRenderer).keyInput) {
      ;(this.renderer as CliRenderer).keyInput.off("keypress", this.keyHandler)
      this.keyHandler = null
    }

    // Clear container
    const children = this.container.getChildren()
    for (const child of children) {
      this.container.remove(child.id)
    }

    const { container: page, content } = createPageLayout(this.renderer as CliRenderer, {
      title: "Manage Apps",
      stepInfo: "Toggle apps linked to your configuration",
      footerHint: [
        { type: "key", key: "←→", value: "Tab" },
        { type: "key", key: "Enter", value: "Toggle" },
        { type: "key", key: "s", value: "Save" },
        { type: "key", key: "q", value: "Back" },
      ],
    })
    this.page = page

    // Selected Apps Set for the selector
    // Selected Apps Set for the selector
    // We create a temporary Set to track changes, then commit to config on "Save".
    // Changes are modified in memory immediately to match QuickSetup behavior.

    const enabledApps = new Set(this.config.apps.filter((a) => a.enabled).map((a) => a.id))

    this.selector = new ApplicationSelector(this.renderer as CliRenderer, {
      selectedApps: enabledApps,
      width: "100%",
      flexGrow: 1, // list takes available space
      onToggle: (appId, enabled) => {
        this.toggleApp(appId, enabled)
      },
    })
    content.add(this.selector)

    // Separator
    content.add(new TextRenderable(this.renderer, { content: " " }))

    // Nav Menu (Save / Back)
    this.navMenu = new SelectRenderable(this.renderer, {
      id: "app-manager-nav",
      width: "100%",
      height: 4,
      options: [
        { name: "💾 Save & Apply", description: "Write config and regenerate docker-compose.yml" },
        { name: "❌ Discard / Back", description: "Return to Main Menu" },
      ],
    })

    this.navMenu.on(SelectRenderableEvents.ITEM_SELECTED, async (index) => {
      if (index === 0) {
        await this.save()
      } else {
        this.app.navigateTo("main")
      }
    })

    content.add(this.navMenu)

    this.container.add(page)

    // Initial Focus
    this.selector.focus()
    this.activeZone = "selector"

    // Key Handler
    this.keyHandler = (key: KeyEvent) => {
      if (key.name === "q") {
        this.app.navigateTo("main")
        return
      }

      if (key.name === "s" && key.ctrl) {
        // Ctrl+S to save
        this.save()
        return
      }

      if (key.name === "tab") {
        // Switch zones
        if (this.activeZone === "selector") {
          this.activeZone = "nav"
          this.selector?.blur()
          this.navMenu?.focus()
        } else {
          this.activeZone = "selector"
          this.navMenu?.blur()
          this.selector?.focus()
        }
        return
      }

      // Delegate to selector if active
      if (this.activeZone === "selector" && this.selector) {
        const handled = this.selector.handleKey(key)
        if (handled) return
      }
    }
    ;(this.renderer as CliRenderer).keyInput.on("keypress", this.keyHandler)
  }

  private toggleApp(id: AppId, enabled: boolean): void {
    const existingIndex = this.config.apps.findIndex((a) => a.id === id)
    if (existingIndex >= 0) {
      this.config.apps[existingIndex].enabled = enabled
    } else {
      if (enabled) {
        this.config.apps.push({ id, enabled: true })
      }
    }

    // Auto-enable Traefik config when traefik app is enabled
    if (id === "traefik") {
      if (enabled && !this.config.traefik?.enabled) {
        this.config.traefik = {
          enabled: true,
          domain: "${CLOUDFLARE_DNS_ZONE}",
          entrypoint: "web",
          middlewares: [],
        }
      } else if (!enabled && this.config.traefik?.enabled) {
        this.config.traefik.enabled = false
      }
    }

    // Auto-enable VPN config when gluetun app is enabled
    if (id === "gluetun") {
      if (enabled && !this.config.vpn) {
        this.config.vpn = { mode: "mini" }
      } else if (!enabled && this.config.vpn) {
        this.config.vpn.mode = "none"
      }
    }
  }

  private async save() {
    await saveConfig(this.config)
    await ensureDirectoryStructure(this.config)
    await saveCompose(this.config)

    // Check for newly-enabled apps that have secrets
    const currentlyEnabled = new Set(this.config.apps.filter((a) => a.enabled).map((a) => a.id))
    const newlyEnabled = [...currentlyEnabled].filter((id) => !this.previouslyEnabledApps.has(id))
    const appsWithSecrets = newlyEnabled.filter((id) => {
      const appDef = getApp(id)
      return appDef?.secrets && appDef.secrets.length > 0
    })

    if (appsWithSecrets.length > 0) {
      this.showSecretsPrompt(appsWithSecrets)
    } else {
      this.app.navigateTo("main")
    }
  }

  private showSecretsPrompt(appsWithSecrets: AppId[]) {
    // Hide the main page
    if (this.page) this.page.visible = false
    if (this.keyHandler) {
      ;(this.renderer as CliRenderer).keyInput.off("keypress", this.keyHandler)
      this.keyHandler = null
    }

    // Create a prompt overlay
    const overlay = new BoxRenderable(this.renderer, {
      id: "secrets-prompt-overlay",
      width: "100%",
      height: "100%",
      backgroundColor: RGBA.fromHex("#111111"),
      zIndex: 200,
      flexDirection: "column",
      padding: 2,
    })

    const appNames = appsWithSecrets.map((id) => getApp(id)?.name || id).join(", ")
    overlay.add(
      new TextRenderable(this.renderer, {
        content: "🔑 New Apps Require Configuration",
        fg: "#f1fa8c",
        marginBottom: 1,
      })
    )
    overlay.add(
      new TextRenderable(this.renderer, {
        content: `The following apps need secrets configured: ${appNames}`,
        fg: "#aaaaaa",
        marginBottom: 2,
      })
    )

    const menu = new SelectRenderable(this.renderer, {
      id: "secrets-prompt-menu",
      width: "100%",
      height: 4,
      options: [
        { name: "✓ Configure Secrets Now", description: "Open the Secrets Editor" },
        { name: "✗ Skip for Now", description: "Return to Main Menu" },
      ],
    })

    menu.on(SelectRenderableEvents.ITEM_SELECTED, (index) => {
      this.container.remove("secrets-prompt-overlay")
      if (index === 0) {
        // Show SecretsEditor
        const editor = new SecretsEditor(this.renderer as CliRenderer, {
          id: "secrets-editor-overlay",
          width: "100%",
          height: "100%",
          config: this.config,
          onSave: () => {
            this.container.remove("secrets-editor-overlay")
            this.app.navigateTo("main")
          },
          onCancel: () => {
            this.container.remove("secrets-editor-overlay")
            this.app.navigateTo("main")
          },
        })
        this.container.add(editor)
      } else {
        this.app.navigateTo("main")
      }
    })

    overlay.add(menu)
    this.container.add(overlay)
    menu.focus()
  }
}
