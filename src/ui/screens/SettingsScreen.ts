/**
 * Settings Screen
 * Edit Traefik, VPN, and system configuration
 */

import type { CliRenderer, KeyEvent } from "@opentui/core"
import {
  BoxRenderable,
  TextRenderable,
  SelectRenderable,
  SelectRenderableEvents,
  InputRenderable,
  InputRenderableEvents,
} from "@opentui/core"
import type { EasiarrConfig, VpnMode } from "../../config/schema"
import { saveConfig } from "../../config"
import { saveCompose } from "../../compose"
import { createPageLayout } from "../components/PageLayout"

type SettingsSection = "traefik" | "vpn" | "system"

export class SettingsScreen extends BoxRenderable {
  private config: EasiarrConfig
  private onBack: () => void
  private keyHandler: ((key: KeyEvent) => void) | null = null
  private activeSection: SettingsSection = "traefik"
  private page: BoxRenderable | null = null
  private cliRenderer: CliRenderer

  // Traefik settings (local copies to edit)
  private traefikDomain: string
  private traefikEntrypoint: string
  private traefikMiddlewares: string

  // VPN settings
  private vpnMode: VpnMode

  // System settings
  private rootDir: string
  private puid: string
  private pgid: string
  private timezone: string
  private umask: string

  constructor(renderer: CliRenderer, config: EasiarrConfig, onBack: () => void) {
    super(renderer, {
      id: "settings-screen",
      width: "100%",
      height: "100%",
      flexDirection: "column",
    })

    this.cliRenderer = renderer
    this.config = config
    this.onBack = onBack

    // Initialize local copies from config
    this.traefikDomain = config.traefik?.domain || "${CLOUDFLARE_DNS_ZONE}"
    this.traefikEntrypoint = config.traefik?.entrypoint || "web"
    this.traefikMiddlewares = config.traefik?.middlewares?.join(",") || ""

    this.vpnMode = config.vpn?.mode || "none"

    this.rootDir = config.rootDir
    this.puid = config.uid.toString()
    this.pgid = config.gid.toString()
    this.timezone = config.timezone
    this.umask = config.umask

    this.renderContent()
  }

  private renderContent(): void {
    // Clear previous
    if (this.keyHandler) {
      this.cliRenderer.keyInput.off("keypress", this.keyHandler)
      this.keyHandler = null
    }

    const children = this.getChildren()
    for (const child of children) {
      this.remove(child.id)
    }

    const { container: page, content } = createPageLayout(this.cliRenderer as CliRenderer, {
      title: "Settings",
      stepInfo: "Edit Traefik, VPN, and System configuration",
      footerHint: [
        { type: "key", key: "Tab", value: "Next" },
        { type: "key", key: "Enter", value: "Select/Continue" },
        { type: "key", key: "s", value: "Save" },
        { type: "key", key: "Esc", value: "Back" },
      ],
    })
    this.page = page

    // Section tabs
    const tabsBox = new BoxRenderable(this.cliRenderer, {
      width: "100%",
      height: 1,
      flexDirection: "row",
      marginBottom: 1,
    })

    const sections: { id: SettingsSection; label: string }[] = [
      { id: "traefik", label: "Traefik" },
      { id: "vpn", label: "VPN" },
      { id: "system", label: "System" },
    ]

    for (const section of sections) {
      const isActive = this.activeSection === section.id
      tabsBox.add(
        new TextRenderable(this.cliRenderer, {
          content: ` ${section.label} `,
          fg: isActive ? "#4a9eff" : "#666666",
          marginRight: 2,
        })
      )
    }

    content.add(tabsBox)
    content.add(new TextRenderable(this.cliRenderer, { content: " " }))

    // Render active section
    switch (this.activeSection) {
      case "traefik":
        this.renderTraefikSection(content)
        break
      case "vpn":
        this.renderVpnSection(content)
        break
      case "system":
        this.renderSystemSection(content)
        break
    }

    this.add(page)
  }

  private renderTraefikSection(content: BoxRenderable): void {
    if (!this.config.traefik?.enabled) {
      content.add(
        new TextRenderable(this.cliRenderer, {
          content: "Traefik is not enabled. Enable it in App Manager first.",
          fg: "#ff6666",
        })
      )
      this.setupBackHandler()
      return
    }

    content.add(
      new TextRenderable(this.cliRenderer, {
        content: "Configure Traefik reverse proxy settings:",
        fg: "#888888",
      })
    )
    content.add(new TextRenderable(this.cliRenderer, { content: " " }))

    // Domain
    const domainRow = new BoxRenderable(this.cliRenderer, {
      width: "100%",
      height: 1,
      flexDirection: "row",
      marginBottom: 1,
    })
    domainRow.add(
      new TextRenderable(this.cliRenderer, {
        content: "Domain:".padEnd(16),
        fg: "#aaaaaa",
      })
    )
    const domainInput = new InputRenderable(this.cliRenderer, {
      id: "settings-traefik-domain",
      width: 40,
      placeholder: "${CLOUDFLARE_DNS_ZONE}",
      backgroundColor: "#2a2a3e",
      textColor: "#ffffff",
      focusedBackgroundColor: "#3a3a4e",
    })
    domainInput.value = this.traefikDomain
    domainInput.on(InputRenderableEvents.CHANGE, (v) => (this.traefikDomain = v))
    domainRow.add(domainInput)
    content.add(domainRow)

    // Entrypoint
    const epRow = new BoxRenderable(this.cliRenderer, {
      width: "100%",
      height: 1,
      flexDirection: "row",
      marginBottom: 1,
    })
    epRow.add(
      new TextRenderable(this.cliRenderer, {
        content: "Entrypoint:".padEnd(16),
        fg: "#aaaaaa",
      })
    )
    const epInput = new InputRenderable(this.cliRenderer, {
      id: "settings-traefik-entrypoint",
      width: 20,
      placeholder: "web",
      backgroundColor: "#2a2a3e",
      textColor: "#ffffff",
      focusedBackgroundColor: "#3a3a4e",
    })
    epInput.value = this.traefikEntrypoint
    epInput.on(InputRenderableEvents.CHANGE, (v) => (this.traefikEntrypoint = v))
    epRow.add(epInput)

    // Hint for cloudflared
    const cloudflaredEnabled = this.config.apps.some((a) => a.id === "cloudflared" && a.enabled)
    if (cloudflaredEnabled && this.traefikEntrypoint === "websecure") {
      epRow.add(
        new TextRenderable(this.cliRenderer, {
          content: "  ⚠️ Use 'web' for Cloudflare Tunnel",
          fg: "#ffcc00",
        })
      )
    }
    content.add(epRow)

    // Middlewares
    const mwRow = new BoxRenderable(this.cliRenderer, {
      width: "100%",
      height: 1,
      flexDirection: "row",
      marginBottom: 1,
    })
    mwRow.add(
      new TextRenderable(this.cliRenderer, {
        content: "Middlewares:".padEnd(16),
        fg: "#aaaaaa",
      })
    )
    const mwInput = new InputRenderable(this.cliRenderer, {
      id: "settings-traefik-middlewares",
      width: 50,
      placeholder: "security-headers@file",
      backgroundColor: "#2a2a3e",
      textColor: "#ffffff",
      focusedBackgroundColor: "#3a3a4e",
    })
    mwInput.value = this.traefikMiddlewares
    mwInput.on(InputRenderableEvents.CHANGE, (v) => (this.traefikMiddlewares = v))
    mwRow.add(mwInput)
    content.add(mwRow)

    content.add(new TextRenderable(this.cliRenderer, { content: " " }))

    // Navigation
    const navMenu = new SelectRenderable(this.cliRenderer, {
      id: "settings-traefik-nav",
      width: "100%",
      height: 4,
      options: [
        { name: "💾 Save Changes", description: "Save and regenerate docker-compose.yml" },
        { name: "➡️  Next: VPN", description: "Go to VPN settings" },
        { name: "◀ Back", description: "Return to main menu" },
      ],
    })

    navMenu.on(SelectRenderableEvents.ITEM_SELECTED, async (index) => {
      if (index === 0) {
        await this.save()
      } else if (index === 1) {
        this.activeSection = "vpn"
        this.renderContent()
      } else {
        this.cleanup()
        this.onBack()
      }
    })

    content.add(navMenu)

    // Focus management
    const inputs = [domainInput, epInput, mwInput, navMenu]
    let focusIndex = 0
    inputs[0].focus()

    this.keyHandler = (key: KeyEvent) => {
      if (key.name === "escape") {
        this.cleanup()
        this.onBack()
      } else if (key.name === "s" && !key.ctrl) {
        this.save()
      } else if (key.name === "tab" || key.name === "enter") {
        if (key.name === "enter" && focusIndex === inputs.length - 1) return
        inputs[focusIndex].blur()
        focusIndex = key.shift ? (focusIndex - 1 + inputs.length) % inputs.length : (focusIndex + 1) % inputs.length
        inputs[focusIndex].focus()
      }
    }
    ;(this.cliRenderer as CliRenderer).keyInput.on("keypress", this.keyHandler)
  }

  private renderVpnSection(content: BoxRenderable): void {
    content.add(
      new TextRenderable(this.cliRenderer, {
        content: "Configure VPN routing through Gluetun:",
        fg: "#888888",
      })
    )
    content.add(new TextRenderable(this.cliRenderer, { content: " " }))

    const gluetunEnabled = this.config.apps.some((a) => a.id === "gluetun" && a.enabled)
    if (!gluetunEnabled) {
      content.add(
        new TextRenderable(this.cliRenderer, {
          content: "Gluetun VPN is not enabled. Enable it in App Manager first.",
          fg: "#ff6666",
        })
      )
      this.setupSectionNav(content, "traefik", "system")
      return
    }

    const menu = new SelectRenderable(this.cliRenderer, {
      id: "settings-vpn-menu",
      width: "100%",
      height: 6,
      options: [
        { name: "🛡️  Full VPN", description: "Route Downloaders, Indexers, and Media Servers through VPN" },
        { name: "⚡ Mini VPN", description: "Route ONLY Downloaders through VPN (Recommended)" },
        { name: "❌ No VPN Routing", description: "Run container but don't route traffic" },
      ],
    })

    // Pre-select current mode
    const modes: VpnMode[] = ["full", "mini", "none"]
    const currentIndex = modes.indexOf(this.vpnMode)
    if (currentIndex >= 0) {
      // SelectRenderable doesn't support pre-selection, user will have to select
    }

    menu.on(SelectRenderableEvents.ITEM_SELECTED, (index) => {
      this.vpnMode = modes[index]
      // Move to next section
      this.activeSection = "system"
      this.renderContent()
    })

    content.add(menu)
    content.add(new TextRenderable(this.cliRenderer, { content: " " }))

    this.setupSectionNav(content, "traefik", "system")
    menu.focus()

    this.keyHandler = (key: KeyEvent) => {
      if (key.name === "escape") {
        this.cleanup()
        this.onBack()
      }
    }
    ;(this.cliRenderer as CliRenderer).keyInput.on("keypress", this.keyHandler)
  }

  private renderSystemSection(content: BoxRenderable): void {
    content.add(
      new TextRenderable(this.cliRenderer, {
        content: "Configure system-wide settings:",
        fg: "#888888",
      })
    )
    content.add(new TextRenderable(this.cliRenderer, { content: " " }))

    const createField = (id: string, label: string, value: string, placeholder: string, width: number = 40) => {
      const row = new BoxRenderable(this.cliRenderer, {
        width: "100%",
        height: 1,
        flexDirection: "row",
        marginBottom: 1,
      })
      row.add(
        new TextRenderable(this.cliRenderer, {
          content: label.padEnd(16),
          fg: "#aaaaaa",
        })
      )
      const input = new InputRenderable(this.cliRenderer, {
        id,
        width,
        placeholder,
        backgroundColor: "#2a2a3e",
        textColor: "#ffffff",
        focusedBackgroundColor: "#3a3a4e",
      })
      input.value = value
      row.add(input)
      content.add(row)
      return input
    }

    const rootInput = createField("settings-sys-root", "Root Path:", this.rootDir, "/home/user/media", 50)
    const puidInput = createField("settings-sys-puid", "PUID:", this.puid, "1000", 10)
    const pgidInput = createField("settings-sys-pgid", "PGID:", this.pgid, "1000", 10)
    const tzInput = createField("settings-sys-tz", "Timezone:", this.timezone, "Europe/London", 30)
    const umaskInput = createField("settings-sys-umask", "Umask:", this.umask, "002", 10)

    rootInput.on(InputRenderableEvents.CHANGE, (v) => (this.rootDir = v))
    puidInput.on(InputRenderableEvents.CHANGE, (v) => (this.puid = v))
    pgidInput.on(InputRenderableEvents.CHANGE, (v) => (this.pgid = v))
    tzInput.on(InputRenderableEvents.CHANGE, (v) => (this.timezone = v))
    umaskInput.on(InputRenderableEvents.CHANGE, (v) => (this.umask = v))

    content.add(new TextRenderable(this.cliRenderer, { content: " " }))

    const navMenu = new SelectRenderable(this.cliRenderer, {
      id: "settings-sys-nav",
      width: "100%",
      height: 4,
      options: [
        { name: "💾 Save All Changes", description: "Save config and regenerate docker-compose.yml" },
        { name: "◀ Back", description: "Return to main menu" },
      ],
    })

    navMenu.on(SelectRenderableEvents.ITEM_SELECTED, async (index) => {
      if (index === 0) {
        await this.save()
      } else {
        this.cleanup()
        this.onBack()
      }
    })

    content.add(navMenu)

    const inputs = [rootInput, puidInput, pgidInput, tzInput, umaskInput, navMenu]
    let focusIndex = 0
    inputs[0].focus()

    this.keyHandler = (key: KeyEvent) => {
      if (key.name === "escape") {
        this.cleanup()
        this.onBack()
      } else if (key.name === "s" && !key.ctrl) {
        this.save()
      } else if (key.name === "tab" || key.name === "enter") {
        if (key.name === "enter" && focusIndex === inputs.length - 1) return
        inputs[focusIndex].blur()
        focusIndex = key.shift ? (focusIndex - 1 + inputs.length) % inputs.length : (focusIndex + 1) % inputs.length
        inputs[focusIndex].focus()
      }
    }
    ;(this.cliRenderer as CliRenderer).keyInput.on("keypress", this.keyHandler)
  }

  private setupSectionNav(content: BoxRenderable, prev: SettingsSection, next: SettingsSection): void {
    const navMenu = new SelectRenderable(this.cliRenderer, {
      id: "settings-section-nav",
      width: "100%",
      height: 4,
      options: [
        { name: "◀ Previous", description: `Go to ${prev} settings` },
        { name: "➡️  Next", description: `Go to ${next} settings` },
        { name: "💾 Save", description: "Save all changes" },
        { name: "✕ Back", description: "Return to main menu" },
      ],
    })

    navMenu.on(SelectRenderableEvents.ITEM_SELECTED, async (index) => {
      if (index === 0) {
        this.activeSection = prev
        this.renderContent()
      } else if (index === 1) {
        this.activeSection = next
        this.renderContent()
      } else if (index === 2) {
        await this.save()
      } else {
        this.cleanup()
        this.onBack()
      }
    })

    content.add(navMenu)
  }

  private setupBackHandler(): void {
    const navMenu = new SelectRenderable(this.cliRenderer, {
      id: "settings-back-nav",
      width: "100%",
      height: 2,
      options: [{ name: "◀ Back", description: "Return to main menu" }],
    })

    navMenu.on(SelectRenderableEvents.ITEM_SELECTED, () => {
      this.cleanup()
      this.onBack()
    })

    if (this.page) {
      const content = this.page.getChildren()[0] as BoxRenderable
      content?.add(navMenu)
    }
    navMenu.focus()

    this.keyHandler = (key: KeyEvent) => {
      if (key.name === "escape") {
        this.cleanup()
        this.onBack()
      }
    }
    ;(this.cliRenderer as CliRenderer).keyInput.on("keypress", this.keyHandler)
  }

  private async save(): Promise<void> {
    // Update config with local values
    if (this.config.traefik) {
      this.config.traefik.domain = this.traefikDomain
      this.config.traefik.entrypoint = this.traefikEntrypoint
      this.config.traefik.middlewares = this.traefikMiddlewares
        .split(",")
        .map((m) => m.trim())
        .filter((m) => m)
    }

    if (this.config.vpn) {
      this.config.vpn.mode = this.vpnMode
    }

    this.config.rootDir = this.rootDir
    this.config.uid = parseInt(this.puid, 10) || 1000
    this.config.gid = parseInt(this.pgid, 10) || 1000
    this.config.timezone = this.timezone
    this.config.umask = this.umask
    this.config.updatedAt = new Date().toISOString()

    await saveConfig(this.config)
    await saveCompose(this.config)

    this.cleanup()
    this.onBack()
  }

  private cleanup(): void {
    if (this.keyHandler) {
      ;(this.cliRenderer as CliRenderer).keyInput.off("keypress", this.keyHandler)
      this.keyHandler = null
    }
    const parent = this.parent
    if (parent) {
      parent.remove(this.id)
    }
  }
}
