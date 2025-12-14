/**
 * Quick Setup Wizard
 * First-time setup flow for easiarr
 */
import { homedir } from "node:os"

import type { CliRenderer, KeyEvent } from "@opentui/core"
import {
  BoxRenderable,
  TextRenderable,
  SelectRenderable,
  SelectRenderableEvents,
  InputRenderable,
  InputRenderableEvents,
} from "@opentui/core"
import type { App } from "../App"
import type { AppConfig, AppId, VpnMode } from "../../config/schema"
import { createDefaultConfig, saveConfig } from "../../config"
import { saveCompose } from "../../compose"
import { createPageLayout } from "../components/PageLayout"
import { ensureDirectoryStructure } from "../../structure/manager"
import { SecretsEditor } from "./SecretsEditor"
import { getApp } from "../../apps"
import { ApplicationSelector } from "../components/ApplicationSelector"

type WizardStep = "welcome" | "apps" | "system" | "vpn" | "traefik" | "secrets" | "confirm"

// Category display order and short names for tabs

export class QuickSetup {
  private renderer: CliRenderer
  private container: BoxRenderable
  private app: App
  private step: WizardStep = "welcome"
  private selectedApps: Set<AppId> = new Set([
    "radarr",
    "sonarr",
    "prowlarr",
    "qbittorrent",
    "jellyfin",
    "jellyseerr",
    "flaresolverr",
    "homepage",
    "easiarr",
  ])

  private rootDir: string = `${homedir()}/media`
  private timezone: string = Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/London"
  private puid: string = process.getuid?.().toString() || "1000"
  private pgid: string = process.getgid?.().toString() || "1000"
  private umask: string = "002"

  private keyHandler: ((key: KeyEvent) => void) | null = null
  // VPN Config
  private vpnMode: VpnMode = "full"
  // Traefik config
  private traefikEnabled: boolean = false
  private traefikDomain: string = "CLOUDFLARE_DNS_ZONE"
  private traefikEntrypoint: string = "web"
  private traefikMiddlewares: string[] = []

  constructor(renderer: CliRenderer, container: BoxRenderable, app: App) {
    this.renderer = renderer
    this.container = container
    this.app = app

    this.renderStep()
  }

  private renderStep(): void {
    // Clear previous key handler if exists
    if (this.keyHandler) {
      this.renderer.keyInput.off("keypress", this.keyHandler)
      this.keyHandler = null
    }

    // Clear all children from container
    const children = this.container.getChildren()
    for (const child of children) {
      this.container.remove(child.id)
    }

    switch (this.step) {
      case "welcome":
        this.renderWelcome()
        break
      case "apps":
        this.renderAppSelection()
        break
      case "system":
        this.renderSystemConfig()
        break
      case "vpn":
        this.renderVpnConfig()
        break
      case "traefik":
        this.renderTraefikConfig()
        break
      case "secrets":
        this.renderSecrets()
        break
      case "confirm":
        this.renderConfirm()
        break
    }
  }

  private renderWelcome(): void {
    const { container: page, content } = createPageLayout(this.renderer, {
      title: "Welcome to easiarr",
      footerHint: [
        { type: "key", key: "Enter", value: "Select" },
        { type: "key", key: "q", value: "Quit" },
      ],
    })

    // Spacer
    content.add(
      new TextRenderable(this.renderer, {
        id: "spacer1",
        content: "",
      })
    )

    // Slogan
    content.add(
      new TextRenderable(this.renderer, {
        id: "slogan",
        content: "It could be easiarr.",
        fg: "#4a9eff",
      })
    )

    // Description
    content.add(
      new TextRenderable(this.renderer, {
        id: "desc1",
        content: "This wizard will help you set up your *arr media ecosystem",
        fg: "#aaaaaa",
      })
    )

    content.add(
      new TextRenderable(this.renderer, {
        id: "desc2",
        content: "following TRaSH Guides best practices for optimal performance.",
        fg: "#aaaaaa",
      })
    )

    // Spacer
    content.add(
      new TextRenderable(this.renderer, {
        id: "spacer2",
        content: "",
      })
    )

    // Features
    content.add(
      new TextRenderable(this.renderer, {
        id: "feature1",
        content: "  ✓ Proper folder structure for hardlinks & atomic moves",
        fg: "#00cc66",
      })
    )

    content.add(
      new TextRenderable(this.renderer, {
        id: "feature2",
        content: "  ✓ Pre-configured containers with optimized settings",
        fg: "#00cc66",
      })
    )

    content.add(
      new TextRenderable(this.renderer, {
        id: "feature3",
        content: "  ✓ 41 apps available across 10 categories",
        fg: "#00cc66",
      })
    )

    content.add(
      new TextRenderable(this.renderer, {
        id: "feature4",
        content: "  ✓ Easy container management via TUI",
        fg: "#00cc66",
      })
    )

    // Spacer
    content.add(
      new TextRenderable(this.renderer, {
        id: "spacer3",
        content: "",
      })
    )

    // Menu
    const menu = new SelectRenderable(this.renderer, {
      id: "welcome-menu",
      flexGrow: 1,
      width: "100%",
      height: 6,
      backgroundColor: "#151525",
      focusedBackgroundColor: "#252545",
      selectedBackgroundColor: "#3a4a6e",
      options: [
        { name: "▶ Start Setup", description: "Begin the configuration wizard" },
        { name: "📖 About", description: "Learn more about easiarr" },
        { name: "✕ Exit", description: "Quit the application" },
      ],
    })

    menu.on(SelectRenderableEvents.ITEM_SELECTED, (index) => {
      if (index === 0) {
        this.step = "apps"
        this.renderStep()
      } else if (index === 1) {
        this.showAbout()
      } else if (index === 2) {
        process.exit(0)
      }
    })

    content.add(menu)
    menu.focus()

    // Global key handler for welcome screen
    this.keyHandler = (key: KeyEvent) => {
      if (key.name === "q") {
        process.exit(0)
      }
    }
    this.renderer.keyInput.on("keypress", this.keyHandler)

    this.container.add(page)
  }

  private showAbout(): void {
    // Clear previous key handler if exists
    if (this.keyHandler) {
      this.renderer.keyInput.off("keypress", this.keyHandler)
      this.keyHandler = null
    }

    // Clear all children from container
    const children = this.container.getChildren()
    for (const child of children) {
      this.container.remove(child.id)
    }

    const { container: page, content } = createPageLayout(this.renderer, {
      title: "About easiarr",
      footerHint: [
        { type: "key", key: "Esc", value: "Back" },
        { type: "key", key: "q", value: "Quit" },
      ],
    })

    content.add(new TextRenderable(this.renderer, { id: "about-spacer1", content: "" }))

    content.add(
      new TextRenderable(this.renderer, {
        id: "about-name",
        content: "easiarr - Docker Compose Generator for *arr Ecosystem",
        fg: "#4a9eff",
      })
    )

    content.add(new TextRenderable(this.renderer, { id: "about-spacer2", content: "" }))

    content.add(
      new TextRenderable(this.renderer, {
        id: "about-desc1",
        content: "easiarr simplifies the setup and management of media automation",
        fg: "#aaaaaa",
      })
    )

    content.add(
      new TextRenderable(this.renderer, {
        id: "about-desc2",
        content: "applications like Radarr, Sonarr, Prowlarr, and more.",
        fg: "#aaaaaa",
      })
    )

    content.add(new TextRenderable(this.renderer, { id: "about-spacer3", content: "" }))

    content.add(
      new TextRenderable(this.renderer, {
        id: "about-features",
        content: "Features:",
        fg: "#ffffff",
      })
    )

    content.add(
      new TextRenderable(this.renderer, {
        id: "about-f1",
        content: "  • TRaSH Guides compliant folder structure",
        fg: "#aaaaaa",
      })
    )

    content.add(
      new TextRenderable(this.renderer, {
        id: "about-f2",
        content: "  • Automatic docker-compose.yml generation",
        fg: "#aaaaaa",
      })
    )

    content.add(
      new TextRenderable(this.renderer, {
        id: "about-f3",
        content: "  • Interactive container management",
        fg: "#aaaaaa",
      })
    )

    content.add(
      new TextRenderable(this.renderer, {
        id: "about-f4",
        content: "  • 41+ pre-configured applications",
        fg: "#aaaaaa",
      })
    )

    content.add(new TextRenderable(this.renderer, { id: "about-spacer4", content: "" }))

    content.add(
      new TextRenderable(this.renderer, {
        id: "about-link",
        content: "GitHub: https://github.com/muhammedaksam/easiarr",
        fg: "#888888",
      })
    )

    // Key handler for About screen
    this.keyHandler = (key: KeyEvent) => {
      if (key.name === "escape") {
        this.renderStep() // Go back to welcome
      } else if (key.name === "q") {
        process.exit(0)
      }
    }
    this.renderer.keyInput.on("keypress", this.keyHandler)

    this.container.add(page)
  }

  private renderAppSelection(): void {
    const title = "Select Apps"
    const stepInfo = `${title} (${this.selectedApps.size} selected)`
    const footerHint = [
      { type: "key", key: "←→", value: "Tab" },
      { type: "key", key: "Enter", value: "Toggle" },
      { type: "key", key: "q", value: "Quit" },
    ] as const

    const { container: page, content } = createPageLayout(this.renderer, {
      title: title,
      stepInfo: stepInfo,
      footerHint: [...footerHint],
    })

    // Application Selector
    // We pass our selectedApps Set directly.
    const selector = new ApplicationSelector(this.renderer, {
      selectedApps: this.selectedApps,
      width: "100%",
      flexGrow: 1,
      onToggle: () => {
        // Update step info manually if possible?
      },
    })

    content.add(selector)

    // Spacer
    content.add(new TextRenderable(this.renderer, { content: " " }))

    // Navigation Menu (Persistent at bottom)
    const navOptions = [
      { name: "▶ Continue to next step", description: "Proceed to root directory selection" },
      { name: "◀ Back to welcome", description: "Return to the main menu" },
    ]

    const navMenu = new SelectRenderable(this.renderer, {
      id: `qs-apps-nav-menu`,
      width: "100%",
      height: 4,
      options: navOptions,
    })

    navMenu.on(SelectRenderableEvents.ITEM_SELECTED, (index) => {
      if (index === 0) {
        // Continue
        this.step = "system"
        this.renderStep()
      } else {
        // Back
        this.step = "welcome"
        this.renderStep()
      }
    })
    content.add(navMenu)

    // Focus state
    let focusTarget: "selector" | "nav" = "selector"
    selector.focus()

    // Key Handler
    this.keyHandler = (key: KeyEvent) => {
      if (key.name === "q") {
        process.exit(0)
      } else if (key.name === "escape") {
        // Go back to welcome
        this.step = "welcome"
        this.renderStep()
      } else if (key.name === "tab") {
        if (focusTarget === "selector") {
          focusTarget = "nav"
          selector.blur()
          navMenu.focus()
        } else {
          focusTarget = "selector"
          navMenu.blur()
          selector.focus()
        }
      } else {
        // Delegate
        if (focusTarget === "selector") {
          selector.handleKey(key)
        }
      }
    }
    this.renderer.keyInput.on("keypress", this.keyHandler)

    this.container.add(page)
  }

  private renderSystemConfig(): void {
    const hasTraefik = this.selectedApps.has("traefik")
    const hasGluetun = this.selectedApps.has("gluetun")
    let totalSteps = 3
    if (hasTraefik) totalSteps++
    if (hasGluetun) totalSteps++
    if (this.hasSecrets()) totalSteps++

    const { container: page, content } = createPageLayout(this.renderer, {
      title: "System Configuration",
      stepInfo: `Step 2/${totalSteps}`,
      footerHint: [
        { type: "key", key: "Tab", value: "Next" },
        { type: "key", key: "Enter", value: "Next/Continue" },
        { type: "key", key: "Esc", value: "Back" },
        { type: "key", key: "q", value: "Quit" },
      ],
    })

    // Instructions
    content.add(
      new TextRenderable(this.renderer, {
        id: "sys-desc",
        content: "Configure global environment variables for all containers:",
        fg: "#888888",
      })
    )
    content.add(new TextRenderable(this.renderer, { content: " " }))

    // Container for form fields
    const formBox = new BoxRenderable(this.renderer, {
      width: "100%",
      flexDirection: "column",
    })
    content.add(formBox)

    const createField = (id: string, label: string, value: string, placeholder: string, width: number = 40) => {
      const row = new BoxRenderable(this.renderer, {
        width: "100%",
        height: 1,
        flexDirection: "row",
        marginBottom: 1,
      })
      row.add(
        new TextRenderable(this.renderer, {
          content: label.padEnd(16),
          fg: "#aaaaaa",
        })
      )
      const input = new InputRenderable(this.renderer, {
        id,
        width,
        placeholder,
        backgroundColor: "#2a2a3e",
        textColor: "#ffffff",
        focusedBackgroundColor: "#3a3a4e",
      })
      if (value) input.value = value
      row.add(input)
      formBox.add(row)
      return input
    }

    const rootInput = createField("input-root", "Root Path:", this.rootDir, "/home/user/media", 50)
    const puidInput = createField("input-puid", "PUID:", this.puid, "1000", 10)
    const pgidInput = createField("input-pgid", "PGID:", this.pgid, "1000", 10)
    const tzInput = createField("input-tz", "Timezone:", this.timezone, "Europe/London", 30)
    const umaskInput = createField("input-umask", "Umask:", this.umask, "002", 10)

    content.add(new TextRenderable(this.renderer, { content: " " }))

    // Navigation Menu (Continue / Back)
    const navMenu = new SelectRenderable(this.renderer, {
      id: "sys-nav",
      width: "100%",
      height: 3,
      options: [{ name: "▶ Continue", description: "Proceed to VPN/Network setup" }],
    })
    content.add(navMenu)

    // Focus management
    const inputs = [rootInput, puidInput, pgidInput, tzInput, umaskInput, navMenu]
    let focusIndex = 0
    inputs[0].focus()

    // Sync values
    rootInput.on(InputRenderableEvents.CHANGE, (v) => (this.rootDir = v))
    puidInput.on(InputRenderableEvents.CHANGE, (v) => (this.puid = v))
    pgidInput.on(InputRenderableEvents.CHANGE, (v) => (this.pgid = v))
    tzInput.on(InputRenderableEvents.CHANGE, (v) => (this.timezone = v))
    umaskInput.on(InputRenderableEvents.CHANGE, (v) => (this.umask = v))

    // Navigation Logic
    const nextStep = () => {
      // Validate
      if (!this.rootDir || !this.rootDir.startsWith("/")) {
        // ideally show error, but for now just don't proceed or rely on user
      }

      // Determine next step
      if (hasGluetun) this.step = "vpn"
      else if (hasTraefik) this.step = "traefik"
      else if (this.hasSecrets()) this.step = "secrets"
      else this.step = "confirm"

      this.renderStep()
    }

    navMenu.on(SelectRenderableEvents.ITEM_SELECTED, () => nextStep())

    // Key Handler
    this.keyHandler = (key: KeyEvent) => {
      if (key.name === "q") {
        process.exit(0)
      } else if (key.name === "escape") {
        this.step = "apps"
        this.renderStep()
      } else if (key.name === "tab" || key.name === "enter") {
        // Custom focus cycling
        // If Enter on NavMenu, it triggers ITEM_SELECTED, so we don't need to handle it here explicitly if we rely on that.
        // But for inputs, Enter should move to next field.

        if (key.name === "enter" && focusIndex === inputs.length - 1) {
          // Handle by SelectRenderable logic
          return
        }

        inputs[focusIndex].blur()
        if (key.shift) {
          focusIndex = (focusIndex - 1 + inputs.length) % inputs.length
        } else {
          focusIndex = (focusIndex + 1) % inputs.length
        }
        inputs[focusIndex].focus()
      }
    }
    this.renderer.keyInput.on("keypress", this.keyHandler)

    this.container.add(page)
  }

  private renderVpnConfig(): void {
    const hasTraefik = this.selectedApps.has("traefik")
    const hasGluetun = this.selectedApps.has("gluetun")
    let totalSteps = 3
    if (hasTraefik) totalSteps++
    if (hasGluetun) totalSteps++
    if (this.hasSecrets()) totalSteps++

    const stepNum = 3 // Always step 3 if present, as it comes after RootDir(2)

    const { container: page, content } = createPageLayout(this.renderer, {
      title: "VPN Configuration",
      stepInfo: `Step ${stepNum}/${totalSteps}`,
      footerHint: [
        { type: "key", key: "Enter", value: "Select" },
        { type: "key", key: "Esc", value: "Back" },
        { type: "key", key: "q", value: "Quit" },
      ],
    })

    content.add(
      new TextRenderable(this.renderer, {
        id: "vpn-desc",
        content: "Select how traffic should be routed through Gluetun VPN:",
        fg: "#888888",
      })
    )

    content.add(new TextRenderable(this.renderer, { id: "vpn-spacer1", content: "" }))

    const menu = new SelectRenderable(this.renderer, {
      id: "vpn-menu",
      width: "100%",
      height: 6,
      backgroundColor: "#151525",
      focusedBackgroundColor: "#252545",
      selectedBackgroundColor: "#3a4a6e",
      options: [
        {
          name: "🛡️  Full VPN",
          description: "Route Downloaders, Indexers, and Media Servers through VPN",
        },
        {
          name: "⚡ Mini VPN",
          description: "Route ONLY Downloaders through VPN (Recommended)",
        },
        {
          name: "❌ No VPN Routing",
          description: "Run container but don't route traffic (Manual config)",
        },
      ],
    })

    const modes: VpnMode[] = ["full", "mini", "none"]
    // Pre-select current mode
    const currentIndex = modes.indexOf(this.vpnMode)
    if (currentIndex !== -1) {
      // selecting index isn't directly exposed in options currently but defaults to 0
    }

    menu.on(SelectRenderableEvents.ITEM_SELECTED, (index) => {
      this.vpnMode = modes[index]

      // Navigate to next
      if (hasTraefik) {
        this.step = "traefik"
      } else if (this.hasSecrets()) {
        this.step = "secrets"
      } else {
        this.step = "confirm"
      }
      this.renderStep()
    })

    content.add(menu)
    menu.focus()

    // Key handler
    this.keyHandler = (key: KeyEvent) => {
      if (key.name === "q") {
        process.exit(0)
      } else if (key.name === "escape") {
        this.step = "system"
        this.renderStep()
      }
    }
    this.renderer.keyInput.on("keypress", this.keyHandler)

    this.container.add(page)
  }

  private renderTraefikConfig(): void {
    const hasTraefik = this.selectedApps.has("traefik")
    const hasGluetun = this.selectedApps.has("gluetun")
    let totalSteps = 3
    if (hasTraefik) totalSteps++
    if (hasGluetun) totalSteps++
    if (this.hasSecrets()) totalSteps++

    const stepNum = hasGluetun ? 4 : 3

    const { container: page, content } = createPageLayout(this.renderer, {
      title: "Traefik Configuration",
      stepInfo: `Step ${stepNum}/${totalSteps}`,
      footerHint: [
        { type: "key", key: "Tab", value: "Next Field" },
        { type: "key", key: "Enter", value: "Continue" },
        { type: "key", key: "Esc", value: "Back" },
        { type: "key", key: "q", value: "Quit" },
      ],
    })

    content.add(
      new TextRenderable(this.renderer, {
        id: "traefik-desc",
        content: "Configure Traefik reverse proxy labels for your services:",
        fg: "#888888",
      })
    )

    content.add(new TextRenderable(this.renderer, { id: "traefik-spacer1", content: "" }))

    // Domain field
    content.add(
      new TextRenderable(this.renderer, {
        id: "traefik-domain-label",
        content: "Domain (e.g., example.com or ${CLOUDFLARE_DNS_ZONE}):",
        fg: "#aaaaaa",
      })
    )

    const domainInput = new InputRenderable(this.renderer, {
      id: "traefik-domain-input",
      width: "100%",
      placeholder: "${CLOUDFLARE_DNS_ZONE}",
      backgroundColor: "#2a2a3e",
      textColor: "#ffffff",
      focusedBackgroundColor: "#3a3a4e",
    })
    domainInput.value = "${CLOUDFLARE_DNS_ZONE}" // Default to variable

    content.add(domainInput)
    content.add(new TextRenderable(this.renderer, { id: "traefik-spacer2", content: "" }))

    // Entrypoint field
    content.add(
      new TextRenderable(this.renderer, {
        id: "traefik-entrypoint-label",
        content: "Entrypoint (e.g., web, websecure):",
        fg: "#aaaaaa",
      })
    )

    const entrypointInput = new InputRenderable(this.renderer, {
      id: "traefik-entrypoint-input",
      width: "100%",
      placeholder: "web",
      backgroundColor: "#2a2a3e",
      textColor: "#ffffff",
      focusedBackgroundColor: "#3a3a4e",
    })

    content.add(entrypointInput)
    content.add(new TextRenderable(this.renderer, { id: "traefik-spacer3", content: "" }))

    // Middlewares field
    // Calculate smart defaults
    const defaultMiddlewares: string[] = []
    if (this.selectedApps.has("authentik")) defaultMiddlewares.push("authentik-forwardauth@file")
    if (this.selectedApps.has("crowdsec")) defaultMiddlewares.push("traefik-bouncer@file")
    // Always suggest security headers if using Traefik in this stack
    defaultMiddlewares.push("security-headers@file")

    const middlewareStr = defaultMiddlewares.join(",")

    content.add(
      new TextRenderable(this.renderer, {
        id: "traefik-middleware-label",
        content: "Middlewares (comma-separated, e.g., auth@file,headers@file):",
        fg: "#aaaaaa",
      })
    )

    const middlewareInput = new InputRenderable(this.renderer, {
      id: "traefik-middleware-input",
      width: "100%",
      placeholder: middlewareStr || "Leave empty for none",
      backgroundColor: "#2a2a3e",
      textColor: "#ffffff",
      focusedBackgroundColor: "#3a3a4e",
    })
    middlewareInput.value = middlewareStr

    content.add(middlewareInput)
    content.add(new TextRenderable(this.renderer, { id: "traefik-spacer4", content: "" }))

    // Navigation menu
    const navMenu = new SelectRenderable(this.renderer, {
      id: "traefik-nav-menu",
      width: "100%",
      height: 4,
      backgroundColor: "#151525",
      focusedBackgroundColor: "#252545",
      selectedBackgroundColor: "#3a4a6e",
      options: [
        { name: "▶ Continue to confirmation", description: "Review and generate config" },
        { name: "◀ Back to root directory", description: "Return to previous step" },
      ],
    })

    navMenu.on(SelectRenderableEvents.ITEM_SELECTED, (index) => {
      // Save traefik config
      this.traefikEnabled = true
      this.traefikDomain = domainInput.value || "${CLOUDFLARE_DNS_ZONE}"
      this.traefikEntrypoint = entrypointInput.value || "web"
      this.traefikMiddlewares = middlewareInput.value
        ? middlewareInput.value
            .split(",")
            .map((m) => m.trim())
            .filter(Boolean)
        : []

      if (index === 0) {
        if (this.hasSecrets()) {
          this.step = "secrets"
        } else {
          this.step = "confirm"
        }
        this.renderStep()
      } else {
        // Go back to vpn if gluetun present, otherwise system
        this.step = hasGluetun ? "vpn" : "system"
        this.renderStep()
      }
    })

    content.add(navMenu)

    // Focus management
    let focusIndex = 0
    const focusables = [domainInput, entrypointInput, middlewareInput, navMenu]
    focusables[focusIndex].focus()

    // Key handler
    this.keyHandler = (key: KeyEvent) => {
      if (key.name === "q") {
        process.exit(0)
      } else if (key.name === "escape") {
        this.step = hasGluetun ? "vpn" : "system"
        this.renderStep()
      } else if (key.name === "tab") {
        focusables[focusIndex].blur()
        focusIndex = (focusIndex + 1) % focusables.length
        focusables[focusIndex].focus()
      }
    }
    this.renderer.keyInput.on("keypress", this.keyHandler)

    this.container.add(page)
  }

  private hasSecrets(): boolean {
    for (const id of this.selectedApps) {
      const app = getApp(id)
      if (app?.secrets && app.secrets.length > 0) return true
    }
    return false
  }

  private renderSecrets(): void {
    const hasTraefik = this.selectedApps.has("traefik")
    const hasGluetun = this.selectedApps.has("gluetun")

    // Create a temporary config object for SecretsEditor
    const tempConfig = createDefaultConfig(this.rootDir)
    tempConfig.apps = Array.from(this.selectedApps).map((id) => ({ id, enabled: true }))

    // We render SecretsEditor directly as content
    // But verify page layout. SecretsEditor is a BoxRenderable.
    // We should clear container and add SecretsEditor?
    // QuickSetup uses `createPageLayout` usually.
    // SecretsEditor HAS its own layout (Box with title).
    // So we can just add it to `this.container`?
    // But we want consistent styling/dimensions.

    // Let's wrap SecretsEditor in our page layout or let it handle it.
    // SecretsEditor (Step 377) extends BoxRenderable. Top-level window.
    // It has `width: "100%", height: "100%"`.
    // So we can add it directly to `this.container`.

    let totalSteps = 3
    if (hasTraefik) totalSteps++
    if (hasGluetun) totalSteps++
    if (this.hasSecrets()) totalSteps++

    const stepNum = totalSteps - 1

    const editor = new SecretsEditor(this.renderer, {
      id: "secrets-editor",
      width: "100%",
      height: "100%",
      title: `Secrets Manager (Step ${stepNum}/${totalSteps})`,
      config: tempConfig,
      extraEnv: {
        ROOT_DIR: { value: this.rootDir, description: "Root media path" },
        TIMEZONE: { value: this.timezone, description: "System timezone" },
        PUID: { value: this.puid, description: "User ID" },
        PGID: { value: this.pgid, description: "Group ID" },
        UMASK: { value: this.umask, description: "File permissions mask" },
      },
      onSave: () => {
        this.step = "confirm"
        this.renderStep()
      },
      onCancel: () => {
        if (hasTraefik) {
          this.step = "traefik"
        } else if (hasGluetun) {
          this.step = "vpn"
        } else {
          this.step = "system"
        }
        this.renderStep()
      },
    })

    this.container.add(editor)

    // And ensure no global key handler conflicts?
    // QuickSetup `renderStep` clears `this.keyHandler`.
    // SecretsEditor attaches its own listeners.
    // Wait, SecretsEditor (Step 377) attaches to `input.on("keypress")`.
    // Does it attach to global renderer? No.
    // Does it need global focus?
    // Container add should be fine. But we need to ensure inputs get focus.
    // SecretsEditor constructor focuses first input.
    // So it should work.
  }

  private renderConfirm(): void {
    const hasTraefik = this.selectedApps.has("traefik")
    const hasGluetun = this.selectedApps.has("gluetun")
    let totalSteps = 3
    if (hasTraefik) totalSteps++
    if (hasGluetun) totalSteps++
    if (this.hasSecrets()) totalSteps++

    const { container: page, content } = createPageLayout(this.renderer, {
      title: "Confirm Setup",
      stepInfo: `Step ${totalSteps}/${totalSteps}`,
      footerHint: [
        { type: "key", key: "Enter", value: "Select" },
        { type: "key", key: "Esc", value: "Back" },
        { type: "key", key: "q", value: "Quit" },
      ],
    })

    content.add(new TextRenderable(this.renderer, { id: "confirm-spacer", content: "" }))

    content.add(
      new TextRenderable(this.renderer, {
        id: "confirm-root",
        content: `📁 Root: ${this.rootDir}`,
        fg: "#cccccc",
      })
    )

    content.add(
      new TextRenderable(this.renderer, {
        id: "confirm-apps",
        content: `📦 Apps: ${this.selectedApps.size} selected`,
        fg: "#cccccc",
      })
    )

    // List apps
    const appList = Array.from(this.selectedApps).join(", ")
    content.add(
      new TextRenderable(this.renderer, {
        id: "confirm-applist",
        content: `   ${appList}`,
        fg: "#888888",
      })
    )

    // Show VPN config if enabled
    if (hasGluetun) {
      content.add(new TextRenderable(this.renderer, { id: "confirm-spacer-vpn", content: "" }))
      content.add(
        new TextRenderable(this.renderer, {
          id: "confirm-vpn",
          content: `🛡️ VPN Routing: ${this.vpnMode.toUpperCase()}`,
          fg: "#cccccc",
        })
      )
    }

    // Show Traefik config if enabled
    if (hasTraefik && this.traefikEnabled) {
      content.add(new TextRenderable(this.renderer, { id: "confirm-spacer-traefik", content: "" }))
      content.add(
        new TextRenderable(this.renderer, {
          id: "confirm-traefik",
          content: `🔀 Traefik: Enabled`,
          fg: "#cccccc",
        })
      )
      content.add(
        new TextRenderable(this.renderer, {
          id: "confirm-traefik-domain",
          content: `   Domain: \${${this.traefikDomain}}`,
          fg: "#888888",
        })
      )
      content.add(
        new TextRenderable(this.renderer, {
          id: "confirm-traefik-entry",
          content: `   Entrypoint: ${this.traefikEntrypoint}`,
          fg: "#888888",
        })
      )
      if (this.traefikMiddlewares.length > 0) {
        content.add(
          new TextRenderable(this.renderer, {
            id: "confirm-traefik-mw",
            content: `   Middlewares: ${this.traefikMiddlewares.join(", ")}`,
            fg: "#888888",
          })
        )
      }
    }

    // Show Secrets status
    if (this.hasSecrets()) {
      content.add(new TextRenderable(this.renderer, { id: "confirm-spacer-secrets", content: "" }))
      content.add(
        new TextRenderable(this.renderer, {
          id: "confirm-secrets",
          content: `🔑 Secrets: Configured (.env)`,
          fg: "#cccccc",
        })
      )
    }

    content.add(new TextRenderable(this.renderer, { id: "confirm-spacer2", content: "" }))

    const menu = new SelectRenderable(this.renderer, {
      id: "confirm-menu",
      width: "100%",
      backgroundColor: "#151525",
      focusedBackgroundColor: "#252545",
      selectedBackgroundColor: "#3a4a6e",
      options: [
        {
          name: "✓ Generate Config & Compose",
          description: "Create files and finish",
        },
        { name: "◀ Back", description: "Return to previous step" },
        { name: "❌ Cancel", description: "Exit without saving" },
      ],
    })

    menu.on(SelectRenderableEvents.ITEM_SELECTED, async (index) => {
      if (index === 0) {
        await this.finishSetup()
      } else if (index === 1) {
        // Navigation priority: Secrets -> Traefik -> VPN -> RootDir
        if (this.hasSecrets()) {
          this.step = "secrets"
        } else if (this.selectedApps.has("traefik")) {
          this.step = "traefik"
        } else if (this.selectedApps.has("gluetun")) {
          this.step = "vpn"
        } else {
          this.step = "system"
        }
        this.renderStep()
      } else {
        process.exit(0)
      }
    })

    content.add(menu)
    menu.focus()

    // Key handler for confirm screen
    this.keyHandler = (key: KeyEvent) => {
      if (key.name === "q") {
        process.exit(0)
      } else if (key.name === "escape") {
        if (this.hasSecrets()) {
          this.step = "secrets"
        } else if (this.selectedApps.has("traefik")) {
          this.step = "traefik"
        } else if (this.selectedApps.has("gluetun")) {
          this.step = "vpn"
        } else {
          this.step = "system"
        }
        this.renderStep()
      }
    }
    this.renderer.keyInput.on("keypress", this.keyHandler)

    this.container.add(page)
  }

  private async finishSetup(): Promise<void> {
    // Create config
    const config = createDefaultConfig(this.rootDir)
    config.timezone = this.timezone
    config.uid = parseInt(this.puid) || 1000
    config.gid = parseInt(this.pgid) || 1000
    config.umask = this.umask

    // Add selected apps
    config.apps = Array.from(this.selectedApps).map(
      (id): AppConfig => ({
        id,
        enabled: true,
      })
    )

    // Add VPN config if enabled
    if (this.selectedApps.has("gluetun")) {
      config.vpn = {
        mode: this.vpnMode,
      }
    }

    // Add Traefik config if enabled
    if (this.selectedApps.has("traefik") && this.traefikEnabled) {
      config.traefik = {
        enabled: true,
        domain: this.traefikDomain,
        entrypoint: this.traefikEntrypoint,
        middlewares: this.traefikMiddlewares,
      }
    }

    // Save config
    await saveConfig(config)

    // Generate directory structure
    await ensureDirectoryStructure(config)

    // Generate docker-compose.yml
    await saveCompose(config)

    // Navigate to main menu
    this.app.setConfig(config)
    this.app.navigateTo("main")
  }
}
