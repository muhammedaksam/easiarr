import {
  BoxRenderable,
  CliRenderer,
  TextRenderable,
  KeyEvent,
  InputRenderable,
  InputRenderableEvents,
  SelectRenderable,
  SelectRenderableEvents,
} from "@opentui/core"
import { createPageLayout } from "../components/PageLayout"
import { EasiarrConfig } from "../../config/schema"
import { updateEnv, readEnvSync } from "../../utils/env"
import { saveConfig } from "../../config"
import { saveCompose } from "../../compose"
import { CloudflareApi, setupCloudflaredTunnel } from "../../api/cloudflare-api"

type SetupStep = "api_token" | "domain" | "confirm" | "progress" | "done"

export class CloudflaredSetup extends BoxRenderable {
  private cliRenderer: CliRenderer
  private config: EasiarrConfig
  private onBack: () => void
  private keyHandler: ((key: KeyEvent) => void) | null = null
  private step: SetupStep = "api_token"

  // Form values
  private apiToken = ""
  private domain = ""
  private tunnelName = "easiarr"
  private accessEmail = "" // Optional: email for Cloudflare Access protection

  // Status
  private statusMessages: string[] = []
  private error: string | null = null

  constructor(renderer: CliRenderer, config: EasiarrConfig, onBack: () => void) {
    super(renderer, {
      id: "cloudflared-setup",
      width: "100%",
      height: "100%",
      flexDirection: "column",
    })

    this.cliRenderer = renderer
    this.config = config
    this.onBack = onBack

    // Load existing values from .env
    const env = readEnvSync()
    this.apiToken = env.CLOUDFLARE_API_TOKEN || ""
    this.domain = env.CLOUDFLARE_DNS_ZONE || config.traefik?.domain || ""

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

    const { container: page, content } = createPageLayout(this.cliRenderer, {
      title: "☁️ Cloudflare Tunnel Setup",
      stepInfo: this.getStepInfo(),
      footerHint: [
        { type: "key", key: "Esc", value: "Back" },
        { type: "key", key: "Enter", value: "Continue" },
      ],
    })

    this.add(page)

    // Render based on step
    switch (this.step) {
      case "api_token":
        this.renderApiTokenStep(content)
        break
      case "domain":
        this.renderDomainStep(content)
        break
      case "confirm":
        this.renderConfirmStep(content)
        break
      case "progress":
        this.renderProgressStep(content)
        break
      case "done":
        this.renderDoneStep(content)
        break
    }
  }

  private getStepInfo(): string {
    switch (this.step) {
      case "api_token":
        return "Step 1/4: Enter Cloudflare API Token"
      case "domain":
        return "Step 2/4: Configure Domain"
      case "confirm":
        return "Step 3/4: Confirm Settings"
      case "progress":
        return "Step 4/4: Setting up tunnel..."
      case "done":
        return "Setup Complete!"
      default:
        return ""
    }
  }

  private renderApiTokenStep(content: BoxRenderable): void {
    content.add(
      new TextRenderable(this.cliRenderer, {
        content: "Enter your Cloudflare API Token with these permissions:",
        fg: "#888888",
      })
    )
    content.add(
      new TextRenderable(this.cliRenderer, {
        content: "  • Account:Cloudflare Tunnel:Edit",
        fg: "#50fa7b",
      })
    )
    content.add(
      new TextRenderable(this.cliRenderer, {
        content: "  • Zone:DNS:Edit",
        fg: "#50fa7b",
      })
    )
    content.add(new TextRenderable(this.cliRenderer, { content: " " }))

    content.add(
      new TextRenderable(this.cliRenderer, {
        content: "Create at: https://dash.cloudflare.com/profile/api-tokens",
        fg: "#4a9eff",
      })
    )
    content.add(new TextRenderable(this.cliRenderer, { content: " " }))

    // Token input row
    const tokenRow = new BoxRenderable(this.cliRenderer, {
      width: "100%",
      height: 1,
      flexDirection: "row",
    })
    tokenRow.add(
      new TextRenderable(this.cliRenderer, {
        content: "API Token: ",
        fg: "#aaaaaa",
      })
    )
    const tokenInput = new InputRenderable(this.cliRenderer, {
      id: "cf-api-token",
      width: 60,
      placeholder: "Paste your API token here",
      value: this.apiToken,
    })
    tokenInput.on(InputRenderableEvents.CHANGE, (v) => (this.apiToken = v))
    tokenRow.add(tokenInput)
    content.add(tokenRow)

    content.add(new TextRenderable(this.cliRenderer, { content: " " }))

    // Navigation
    const nav = new SelectRenderable(this.cliRenderer, {
      id: "cf-token-nav",
      width: "100%",
      height: 3,
      options: [
        { name: "➡️  Continue", description: "Verify token and continue" },
        { name: "✕ Cancel", description: "Return to main menu" },
      ],
    })

    nav.on(SelectRenderableEvents.ITEM_SELECTED, async (index) => {
      if (index === 0) {
        if (!this.apiToken.trim()) {
          return // Don't proceed without token
        }
        // Verify token by trying to list zones
        try {
          const api = new CloudflareApi(this.apiToken)
          const zones = await api.listZones()
          if (zones.length === 0) {
            this.error = "No zones found. Check token permissions."
            this.renderContent()
            return
          }
          // Auto-detect domain if not set
          if (!this.domain && zones.length > 0) {
            this.domain = zones[0].name
          }
          this.step = "domain"
          this.error = null
          this.renderContent()
        } catch (e) {
          this.error = `Invalid token: ${(e as Error).message}`
          this.renderContent()
        }
      } else {
        this.cleanup()
        this.onBack()
      }
    })

    content.add(nav)

    if (this.error) {
      content.add(new TextRenderable(this.cliRenderer, { content: " " }))
      content.add(
        new TextRenderable(this.cliRenderer, {
          content: `⚠️ ${this.error}`,
          fg: "#ff6666",
        })
      )
    }

    // Focus on input then nav
    tokenInput.focus()

    this.keyHandler = (key: KeyEvent) => {
      if (key.name === "escape") {
        this.cleanup()
        this.onBack()
      } else if (key.name === "tab") {
        tokenInput.blur()
        nav.focus()
      }
    }
    this.cliRenderer.keyInput.on("keypress", this.keyHandler)
  }

  private renderDomainStep(content: BoxRenderable): void {
    content.add(
      new TextRenderable(this.cliRenderer, {
        content: "Configure your domain for the tunnel:",
        fg: "#888888",
      })
    )
    content.add(new TextRenderable(this.cliRenderer, { content: " " }))

    // Domain input
    const domainRow = new BoxRenderable(this.cliRenderer, {
      width: "100%",
      height: 1,
      flexDirection: "row",
    })
    domainRow.add(
      new TextRenderable(this.cliRenderer, {
        content: "Domain: ",
        fg: "#aaaaaa",
      })
    )
    const domainInput = new InputRenderable(this.cliRenderer, {
      id: "cf-domain",
      width: 40,
      placeholder: "example.com",
      value: this.domain,
    })
    domainInput.on(InputRenderableEvents.CHANGE, (v) => (this.domain = v))
    domainRow.add(domainInput)
    content.add(domainRow)

    content.add(new TextRenderable(this.cliRenderer, { content: " " }))

    // Tunnel name input
    const nameRow = new BoxRenderable(this.cliRenderer, {
      width: "100%",
      height: 1,
      flexDirection: "row",
    })
    nameRow.add(
      new TextRenderable(this.cliRenderer, {
        content: "Tunnel name: ",
        fg: "#aaaaaa",
      })
    )
    const nameInput = new InputRenderable(this.cliRenderer, {
      id: "cf-tunnel-name",
      width: 30,
      placeholder: "easiarr",
      value: this.tunnelName,
    })
    nameInput.on(InputRenderableEvents.CHANGE, (v) => (this.tunnelName = v))
    nameRow.add(nameInput)
    content.add(nameRow)

    content.add(new TextRenderable(this.cliRenderer, { content: " " }))

    content.add(
      new TextRenderable(this.cliRenderer, {
        content: `Services will be accessible at: *.${this.domain || "example.com"}`,
        fg: "#50fa7b",
      })
    )

    content.add(new TextRenderable(this.cliRenderer, { content: " " }))

    // Access email (optional)
    content.add(
      new TextRenderable(this.cliRenderer, {
        content: "Cloudflare Access (optional - adds email login):",
        fg: "#888888",
      })
    )
    const emailRow = new BoxRenderable(this.cliRenderer, {
      width: "100%",
      height: 1,
      flexDirection: "row",
    })
    emailRow.add(
      new TextRenderable(this.cliRenderer, {
        content: "Email: ",
        fg: "#aaaaaa",
      })
    )
    const emailInput = new InputRenderable(this.cliRenderer, {
      id: "cf-email",
      width: 40,
      placeholder: "your@email.com (leave blank to skip)",
      value: this.accessEmail,
    })
    emailInput.on(InputRenderableEvents.CHANGE, (v) => (this.accessEmail = v))
    emailRow.add(emailInput)
    content.add(emailRow)

    content.add(new TextRenderable(this.cliRenderer, { content: " " }))

    // Navigation
    const nav = new SelectRenderable(this.cliRenderer, {
      id: "cf-domain-nav",
      width: "100%",
      height: 4,
      options: [
        { name: "◀ Back", description: "Go back to API token" },
        { name: "➡️  Continue", description: "Review and confirm" },
        { name: "✕ Cancel", description: "Return to main menu" },
      ],
    })

    nav.on(SelectRenderableEvents.ITEM_SELECTED, (index) => {
      if (index === 0) {
        this.step = "api_token"
        this.renderContent()
      } else if (index === 1) {
        if (!this.domain.trim()) return
        this.step = "confirm"
        this.renderContent()
      } else {
        this.cleanup()
        this.onBack()
      }
    })

    content.add(nav)
    domainInput.focus()

    this.keyHandler = (key: KeyEvent) => {
      if (key.name === "escape") {
        this.step = "api_token"
        this.renderContent()
      } else if (key.name === "tab") {
        nav.focus()
      }
    }
    this.cliRenderer.keyInput.on("keypress", this.keyHandler)
  }

  private renderConfirmStep(content: BoxRenderable): void {
    content.add(
      new TextRenderable(this.cliRenderer, {
        content: "Review your settings:",
        fg: "#888888",
      })
    )
    content.add(new TextRenderable(this.cliRenderer, { content: " " }))

    content.add(
      new TextRenderable(this.cliRenderer, {
        content: `Domain: ${this.domain}`,
        fg: "#50fa7b",
      })
    )
    content.add(
      new TextRenderable(this.cliRenderer, {
        content: `Tunnel name: ${this.tunnelName}`,
        fg: "#50fa7b",
      })
    )
    content.add(
      new TextRenderable(this.cliRenderer, {
        content: `Ingress: *.${this.domain} → http://traefik:80`,
        fg: "#50fa7b",
      })
    )
    content.add(new TextRenderable(this.cliRenderer, { content: " " }))

    content.add(
      new TextRenderable(this.cliRenderer, {
        content: "This will:",
        fg: "#888888",
      })
    )
    content.add(
      new TextRenderable(this.cliRenderer, {
        content: "  1. Create/update Cloudflare Tunnel",
        fg: "#aaaaaa",
      })
    )
    content.add(
      new TextRenderable(this.cliRenderer, {
        content: `  2. Add DNS CNAME: *.${this.domain}`,
        fg: "#aaaaaa",
      })
    )
    content.add(
      new TextRenderable(this.cliRenderer, {
        content: "  3. Save tunnel token to .env",
        fg: "#aaaaaa",
      })
    )
    content.add(
      new TextRenderable(this.cliRenderer, {
        content: "  4. Update Traefik domain/entrypoint",
        fg: "#aaaaaa",
      })
    )
    if (this.accessEmail.trim()) {
      content.add(
        new TextRenderable(this.cliRenderer, {
          content: `  5. Create Cloudflare Access for: ${this.accessEmail}`,
          fg: "#aaaaaa",
        })
      )
    }

    content.add(new TextRenderable(this.cliRenderer, { content: " " }))

    // Navigation
    const nav = new SelectRenderable(this.cliRenderer, {
      id: "cf-confirm-nav",
      width: "100%",
      height: 4,
      options: [
        { name: "◀ Back", description: "Go back to domain settings" },
        { name: "🚀 Setup Tunnel", description: "Create tunnel and configure DNS" },
        { name: "✕ Cancel", description: "Return to main menu" },
      ],
    })

    nav.on(SelectRenderableEvents.ITEM_SELECTED, async (index) => {
      if (index === 0) {
        this.step = "domain"
        this.renderContent()
      } else if (index === 1) {
        this.step = "progress"
        this.renderContent()
        await this.runSetup()
      } else {
        this.cleanup()
        this.onBack()
      }
    })

    content.add(nav)
    nav.focus()

    this.keyHandler = (key: KeyEvent) => {
      if (key.name === "escape") {
        this.step = "domain"
        this.renderContent()
      }
    }
    this.cliRenderer.keyInput.on("keypress", this.keyHandler)
  }

  private renderProgressStep(content: BoxRenderable): void {
    content.add(
      new TextRenderable(this.cliRenderer, {
        content: "Setting up Cloudflare Tunnel...",
        fg: "#4a9eff",
      })
    )
    content.add(new TextRenderable(this.cliRenderer, { content: " " }))

    for (const msg of this.statusMessages) {
      content.add(
        new TextRenderable(this.cliRenderer, {
          content: msg,
          fg: msg.startsWith("✓") ? "#50fa7b" : msg.startsWith("✗") ? "#ff6666" : "#aaaaaa",
        })
      )
    }

    if (this.error) {
      content.add(new TextRenderable(this.cliRenderer, { content: " " }))
      content.add(
        new TextRenderable(this.cliRenderer, {
          content: `Error: ${this.error}`,
          fg: "#ff6666",
        })
      )
    }
  }

  private renderDoneStep(content: BoxRenderable): void {
    content.add(
      new TextRenderable(this.cliRenderer, {
        content: "✓ Cloudflare Tunnel setup complete!",
        fg: "#50fa7b",
      })
    )
    content.add(new TextRenderable(this.cliRenderer, { content: " " }))

    for (const msg of this.statusMessages) {
      content.add(
        new TextRenderable(this.cliRenderer, {
          content: msg,
          fg: msg.startsWith("✓") ? "#50fa7b" : "#aaaaaa",
        })
      )
    }

    content.add(new TextRenderable(this.cliRenderer, { content: " " }))
    content.add(
      new TextRenderable(this.cliRenderer, {
        content: "Next steps:",
        fg: "#888888",
      })
    )
    content.add(
      new TextRenderable(this.cliRenderer, {
        content: `  1. Restart containers: docker compose up -d --force-recreate`,
        fg: "#aaaaaa",
      })
    )
    content.add(
      new TextRenderable(this.cliRenderer, {
        content: `  2. Access services at: https://radarr.${this.domain}`,
        fg: "#aaaaaa",
      })
    )
    if (!this.accessEmail.trim()) {
      content.add(
        new TextRenderable(this.cliRenderer, {
          content: "  3. (Recommended) Set up Cloudflare Access for authentication",
          fg: "#aaaaaa",
        })
      )
    } else {
      content.add(
        new TextRenderable(this.cliRenderer, {
          content: `  3. ✓ Services protected by email authentication`,
          fg: "#50fa7b",
        })
      )
    }

    content.add(new TextRenderable(this.cliRenderer, { content: " " }))

    const nav = new SelectRenderable(this.cliRenderer, {
      id: "cf-done-nav",
      width: "100%",
      height: 2,
      options: [{ name: "✓ Done", description: "Return to main menu" }],
    })

    nav.on(SelectRenderableEvents.ITEM_SELECTED, () => {
      this.cleanup()
      this.onBack()
    })

    content.add(nav)
    nav.focus()

    this.keyHandler = (key: KeyEvent) => {
      if (key.name === "escape" || key.name === "return") {
        this.cleanup()
        this.onBack()
      }
    }
    this.cliRenderer.keyInput.on("keypress", this.keyHandler)
  }

  private async runSetup(): Promise<void> {
    this.statusMessages = []
    this.error = null

    try {
      // Step 1: Setup tunnel
      this.statusMessages.push("Creating/updating Cloudflare Tunnel...")
      this.renderContent()

      const result = await setupCloudflaredTunnel(this.apiToken, this.domain, this.tunnelName)

      this.statusMessages.pop()
      this.statusMessages.push(`✓ Tunnel created: ${this.tunnelName}`)
      this.statusMessages.push(`✓ DNS CNAME added: *.${this.domain}`)
      this.statusMessages.push(`✓ Ingress configured: *.${this.domain} → traefik:80`)
      this.renderContent()

      // Step 2: Save to .env
      this.statusMessages.push("Saving credentials to .env...")
      this.renderContent()

      await updateEnv({
        CLOUDFLARE_API_TOKEN: this.apiToken,
        CLOUDFLARE_TUNNEL_TOKEN: result.tunnelToken,
        CLOUDFLARE_DNS_ZONE: this.domain,
      })

      this.statusMessages.pop()
      this.statusMessages.push("✓ Credentials saved to .env")
      this.renderContent()

      // Step 3: Update config
      this.statusMessages.push("Updating configuration...")
      this.renderContent()

      // Enable cloudflared if not enabled
      const cloudflaredApp = this.config.apps.find((a) => a.id === "cloudflared")
      if (cloudflaredApp) {
        cloudflaredApp.enabled = true
      } else {
        this.config.apps.push({ id: "cloudflared", enabled: true })
      }

      // Update Traefik settings
      if (this.config.traefik) {
        this.config.traefik.domain = this.domain
        this.config.traefik.entrypoint = "web" // Use web for tunnel
      }

      this.config.updatedAt = new Date().toISOString()
      await saveConfig(this.config)
      await saveCompose(this.config)

      this.statusMessages.pop()
      this.statusMessages.push("✓ Configuration updated")
      this.statusMessages.push("✓ docker-compose.yml regenerated")
      this.renderContent()

      // Step 4: Optional Access setup
      if (this.accessEmail.trim()) {
        this.statusMessages.push("Creating Cloudflare Access...")
        this.renderContent()

        const api = new CloudflareApi(this.apiToken)
        await api.setupAccessProtection(this.domain, [this.accessEmail.trim()], "easiarr")

        this.statusMessages.pop()
        this.statusMessages.push(`✓ Cloudflare Access created for: ${this.accessEmail}`)
        this.renderContent()
      }

      // Done!
      this.step = "done"
      this.renderContent()
    } catch (e) {
      this.error = (e as Error).message
      this.statusMessages.push(`✗ Setup failed: ${this.error}`)
      this.renderContent()

      // Add back button on error
      setTimeout(() => {
        this.step = "confirm"
        this.renderContent()
      }, 3000)
    }
  }

  private cleanup(): void {
    if (this.keyHandler) {
      this.cliRenderer.keyInput.off("keypress", this.keyHandler)
      this.keyHandler = null
    }
    const parent = this.parent
    if (parent) {
      parent.remove(this.id)
    }
  }
}
