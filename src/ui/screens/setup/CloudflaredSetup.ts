import { CliRenderer, KeyEvent, TextRenderable } from "@opentui/core"

import type { MenuItem, SetupResult } from "~/ui/screens/setup/BaseAppSetupScreen"
import { CloudflareApi, setupCloudflaredTunnel } from "~/api/cloudflare-api"
import { saveCompose } from "~/compose"
import { saveConfig } from "~/config"
import { EasiarrConfig } from "~/config/schema"
import { BaseAppSetupScreen } from "~/ui/screens/setup/BaseAppSetupScreen"
import { readEnvSync, updateEnv } from "~/utils/env"

type SubStep = "api_token" | "domain_config" | "vpn_config" | "confirm"

export class CloudflaredSetup extends BaseAppSetupScreen {
  private subStep: SubStep = "api_token"
  private editingField: string | null = null
  private inputValue = ""
  private error: string | null = null

  // Form values
  private apiToken = ""
  private domain = ""
  private tunnelName = "easiarr"
  private accessEmail = ""
  private enableVpn = false
  private privateNetworkCidr = ""

  constructor(cliRenderer: CliRenderer, config: EasiarrConfig, onBack: () => void) {
    super(cliRenderer, config, onBack)

    // Load existing values from .env
    const env = readEnvSync()
    this.apiToken = env.CLOUDFLARE_API_TOKEN || ""
    this.domain = env.CLOUDFLARE_DNS_ZONE || config.traefik?.domain || ""

    this.refreshContent()
  }

  getTitle(): string {
    return "☁️ Cloudflare Tunnel Setup"
  }

  getStepInfo(): string {
    if (this.currentStep === "running") return "Step 5/5: Setting up tunnel..."
    if (this.currentStep === "done") return "Setup Complete!"

    const steps: Record<SubStep, string> = {
      api_token: "Step 1/5: Enter Cloudflare API Token",
      domain_config: "Step 2/5: Configure Domain",
      vpn_config: "Step 3/5: Zero Trust VPN (Optional)",
      confirm: "Step 4/5: Confirm Settings",
    }
    return steps[this.subStep]
  }

  getMenuItems(): MenuItem[] {
    if (this.currentStep !== "menu") return []

    switch (this.subStep) {
      case "api_token":
        return [
          {
            name: `API Token: ${this.apiToken ? "********" : "[Enter Token]"}`,
            description: "Edit your Cloudflare API Token",
            action: () => this.startEditing("apiToken"),
          },
          {
            name: "➡️  Continue",
            description: "Verify token and continue",
            action: () => this.verifyToken(),
          },
          {
            name: "✕ Cancel",
            description: "Return to main menu",
            action: () => this.onBack(),
          },
        ]

      case "domain_config":
        return [
          {
            name: `Domain: ${this.domain || "[Required]"}`,
            description: "Base domain for your services (e.g. example.com)",
            action: () => this.startEditing("domain"),
          },
          {
            name: `Tunnel Name: ${this.tunnelName}`,
            description: "Technical name for the tunnel",
            action: () => this.startEditing("tunnelName"),
          },
          {
            name: `Access Email: ${this.accessEmail || "[Optional-Recommended]"}`,
            description: "Enable email login protection",
            action: () => this.startEditing("accessEmail"),
          },
          {
            name: "➡️  Continue",
            description: "Configure VPN options",
            action: () => this.goToVpn(),
          },
          {
            name: "◀ Back",
            description: "Go back to API token",
            action: () => {
              this.subStep = "api_token"
              this.menuIndex = 0
              this.refreshContent()
            },
          },
        ]

      case "vpn_config":
        return [
          {
            name: `VPN Access: ${this.enableVpn ? "✓ Enabled" : "✗ Disabled"}`,
            description: "Toggle Zero Trust VPN access",
            action: () => {
              this.enableVpn = !this.enableVpn
              this.refreshContent()
            },
          },
          ...(this.enableVpn
            ? [
                {
                  name: `Network CIDR: ${this.privateNetworkCidr}`,
                  description: "Private network to route (e.g. 192.168.1.0/24)",
                  action: () => this.startEditing("privateNetworkCidr"),
                },
              ]
            : []),
          {
            name: "➡️  Continue",
            description: "Review and confirm setup",
            action: () => {
              this.subStep = "confirm"
              this.menuIndex = 0
              this.refreshContent()
            },
          },
          {
            name: "◀ Back",
            description: "Go back to domain config",
            action: () => {
              this.subStep = "domain_config"
              this.menuIndex = 0
              this.refreshContent()
            },
          },
        ]

      case "confirm":
        return [
          {
            name: "🚀 Setup Tunnel Now",
            description: "Create tunnel, configure DNS, and update .env",
            action: () => this.runSetup(),
          },
          {
            name: "◀ Back",
            description: "Go back to VPN settings",
            action: () => {
              this.subStep = "vpn_config"
              this.menuIndex = 0
              this.refreshContent()
            },
          },
          {
            name: "✕ Cancel",
            description: "Return to main menu",
            action: () => this.onBack(),
          },
        ]
    }
  }

  protected renderCustomContent(): boolean {
    if (this.currentStep === "running" || this.currentStep === "done") {
      this.renderResults()
      return true
    }

    if (this.editingField) {
      this.renderInputField()
      return true
    }

    if (this.subStep === "api_token") {
      this.renderApiInfo()
    } else if (this.subStep === "confirm") {
      this.renderReview()
    }

    if (this.error) {
      this.contentBox.add(
        new TextRenderable(this.cliRenderer, {
          content: `⚠️ ${this.error}\n\n`,
          fg: "#ff6666",
        })
      )
    }

    this.renderMenu()
    return true
  }

  private renderApiInfo(): void {
    const lines = [
      "Enter your Cloudflare API Token with these permissions:",
      "  • Account:Account Settings:Read (required)",
      "  • Account:Cloudflare Tunnel:Edit",
      "  • Zone:DNS:Edit",
      "  • Account:Zero Trust:Edit (for VPN access)",
      "  • Account:Access: Apps and Policies:Edit (optional)\n",
      "Create at: dash.cloudflare.com/profile/api-tokens\n",
    ]
    lines.forEach((l) =>
      this.contentBox.add(
        new TextRenderable(this.cliRenderer, {
          content: l + "\n",
          fg: l.includes("dash.cloudflare") ? "#4a9eff" : "#888888",
        })
      )
    )
  }

  private renderReview(): void {
    const lines = [
      "Review your settings:\n",
      `  Domain: ${this.domain}`,
      `  Tunnel name: ${this.tunnelName}`,
      `  Ingress: *.${this.domain} → traefik:80\n`,
      "This will create the tunnel, configure DNS, and save to .env.\n",
    ]
    lines.forEach((l) =>
      this.contentBox.add(
        new TextRenderable(this.cliRenderer, { content: l + "\n", fg: "#aaaaaa" })
      )
    )
  }

  private renderInputField(): void {
    const labels: Record<string, string> = {
      apiToken: "Enter Cloudflare API Token:",
      domain: "Enter domain (e.g. example.com):",
      tunnelName: "Enter tunnel name (default: easiarr):",
      accessEmail: "Enter email for login protection (optional):",
      privateNetworkCidr: "Enter private network CIDR (e.g. 192.168.1.0/24):",
    }

    this.contentBox.add(
      new TextRenderable(this.cliRenderer, {
        content: `${labels[this.editingField!]}\n\n`,
        fg: "#8be9fd",
      })
    )

    const displayValue = this.editingField === "apiToken" ? "********" : this.inputValue
    this.contentBox.add(
      new TextRenderable(this.cliRenderer, {
        content: `> ${displayValue}_`,
        fg: "#ffffff",
      })
    )

    this.contentBox.add(
      new TextRenderable(this.cliRenderer, {
        content: "\n\n(Enter to confirm, Esc to cancel, Ctrl+V to paste)",
        fg: "#6272a4",
      })
    )
  }

  protected handleCustomKeys(key: KeyEvent): boolean {
    if (this.editingField) {
      if (key.name === "return") {
        this.finishEditing(true)
      } else if (key.name === "escape") {
        this.finishEditing(false)
      } else if (key.name === "backspace") {
        this.inputValue = this.inputValue.slice(0, -1)
        this.refreshContent()
      } else if (key.name === "v" && key.ctrl) {
        // We can't actually access clipboard easily here, but we can't stop the user from thinking they can
        // If the console supports it, the sequence will just arrive.
      } else if (key.sequence && key.sequence.length === 1 && !key.ctrl) {
        this.inputValue += key.sequence
        this.refreshContent()
      }
      return true
    }

    if (this.currentStep === "menu") {
      if (key.name === "escape") {
        this.onBack()
        return true
      }
    }

    return false
  }

  // ============================================
  // WIZARD LOGIC
  // ============================================

  private startEditing(field: string): void {
    this.editingField = field
    this.inputValue = (this as unknown as Record<string, string>)[field] || ""
    this.refreshContent()
  }

  private finishEditing(save: boolean): void {
    if (save && this.editingField) {
      ;(this as unknown as Record<string, string>)[this.editingField] = this.inputValue.trim()
    }
    this.editingField = null
    this.refreshContent()
  }

  private async verifyToken(): Promise<void> {
    if (!this.apiToken.trim()) {
      this.error = "API Token is required"
      this.refreshContent()
      return
    }

    this.currentStep = "running"
    this.results = [{ name: "Verify API Token", status: "configuring" }]
    this.refreshContent()

    try {
      const api = new CloudflareApi(this.apiToken)
      const zones = await api.listZones()
      if (zones.length === 0) {
        throw new Error("No zones found. Check token permissions.")
      }
      if (!this.domain && zones.length > 0) {
        this.domain = zones[0].name
      }
      this.subStep = "domain_config"
      this.error = null
      this.currentStep = "menu"
      this.menuIndex = 0
    } catch (e) {
      this.error = `Invalid token: ${(e as Error).message}`
      this.currentStep = "menu"
    }
    this.refreshContent()
  }

  private goToVpn(): void {
    if (!this.domain.trim()) {
      this.error = "Domain is required"
      this.refreshContent()
      return
    }

    // Auto-detect private network CIDR
    const env = readEnvSync()
    const localIp = env["LOCAL_DOCKER_IP"] || "192.168.1.1"
    const parts = localIp.split(".")
    if (parts.length === 4) {
      this.privateNetworkCidr = `${parts[0]}.${parts[1]}.${parts[2]}.0/24`
    }

    this.subStep = "vpn_config"
    this.menuIndex = 0
    this.error = null
    this.refreshContent()
  }

  private async runSetup(): Promise<void> {
    this.currentStep = "running"
    this.results = [
      { name: "Create Tunnel", status: "pending" },
      { name: "Configure DNS", status: "pending" },
      { name: "Save Config", status: "pending" },
      { name: "Access Protection", status: "pending" },
    ]
    this.refreshContent()

    try {
      // Step 1: Tunnel & DNS
      this.updateStatus(0, "configuring")
      const tunnelResult = await setupCloudflaredTunnel(
        this.apiToken,
        this.domain,
        this.tunnelName,
        this.enableVpn
      )
      this.updateStatus(0, "success", this.tunnelName)
      this.updateStatus(1, "success", `*.${this.domain}`)

      // Step 2: Save credentials
      this.updateStatus(2, "configuring")
      await updateEnv({
        CLOUDFLARE_API_TOKEN: this.apiToken,
        CLOUDFLARE_TUNNEL_TOKEN: tunnelResult.tunnelToken,
        CLOUDFLARE_TUNNEL_ID: tunnelResult.tunnelId,
        CLOUDFLARE_ACCOUNT_ID: tunnelResult.accountId,
        CLOUDFLARE_DNS_ZONE: this.domain,
        ...(this.enableVpn ? { CLOUDFLARE_PRIVATE_NETWORK: this.privateNetworkCidr } : {}),
      })

      // Update in-memory config
      const app = this.config.apps.find((a) => a.id === "cloudflared")
      if (app) app.enabled = true
      else this.config.apps.push({ id: "cloudflared", enabled: true })

      if (this.config.traefik) {
        this.config.traefik.domain = this.domain
        this.config.traefik.entrypoint = "web"
      }

      await saveConfig(this.config)
      await saveCompose(this.config)
      this.updateStatus(2, "success")

      // Step 3: Access
      this.updateStatus(3, "configuring")
      if (this.accessEmail.trim()) {
        const api = new CloudflareApi(this.apiToken)
        let publicIp: string | undefined
        try {
          const res = await fetch("https://1.1.1.1/cdn-cgi/trace")
          const text = await res.text()
          const match = text.match(/ip=(.+)/)
          if (match) publicIp = `${match[1].trim()}/32`
        } catch {
          // Ignore
        }

        await api.setupAccessProtection(this.domain, [this.accessEmail.trim()], "easiarr", publicIp)
        this.updateStatus(3, "success", `Protected for ${this.accessEmail}`)
      } else {
        // Fallback to basic auth handled by backend if needed, or just skip
        this.updateStatus(3, "skipped", "No email provided")
      }

      // Step 4: VPN (if enabled)
      if (this.enableVpn) {
        // Logic already included in setupCloudflaredTunnel for basic route,
        // but we could add more specific VPN results here if we wanted.
      }
    } catch (e) {
      const idx = this.results.findIndex((r) => r.status === "configuring")
      if (idx !== -1) this.updateStatus(idx, "error", (e as Error).message)
    }

    this.currentStep = "done"
    this.refreshContent()
  }

  private updateStatus(index: number, status: SetupResult["status"], message?: string): void {
    if (this.results[index]) {
      this.results[index].status = status
      if (message) this.results[index].message = message
    }
    this.refreshContent()
  }
}
