import { BoxRenderable, CliRenderer, TextRenderable, KeyEvent } from "@opentui/core"
import { existsSync, readFileSync } from "node:fs"
import { writeFile, readFile } from "node:fs/promises"
import { join } from "node:path"
import { createPageLayout } from "../components/PageLayout"
import { EasiarrConfig } from "../../config/schema"
import { getApp } from "../../apps/registry"
import { getComposePath } from "../../config/manager"

export class ApiKeyViewer extends BoxRenderable {
  private config: EasiarrConfig
  private keys: Array<{ appId: string; app: string; key: string; status: "found" | "missing" | "error" }> = []
  private keyHandler!: (key: KeyEvent) => void
  private cliRenderer: CliRenderer
  private statusText: TextRenderable | null = null

  constructor(renderer: CliRenderer, config: EasiarrConfig, onBack: () => void) {
    super(renderer, {
      id: "api-key-viewer",
      width: "100%",
      height: "100%",
      backgroundColor: "#111111", // Dark bg
      zIndex: 200, // Above main menu
    })
    this.cliRenderer = renderer
    this.config = config

    this.scanKeys()
    this.renderPage(onBack)
  }

  private scanKeys() {
    this.keys = []

    for (const appConfig of this.config.apps) {
      if (!appConfig.enabled) continue

      const appDef = getApp(appConfig.id)
      if (!appDef || !appDef.apiKeyMeta) continue

      try {
        // Resolve config path
        // Volumes are: ["${root}/config/radarr:/config", ...]
        // We assume index 0 is the config volume
        const volumes = appDef.volumes(this.config.rootDir)
        if (volumes.length === 0) continue

        const parts = volumes[0].split(":")
        const hostPath = parts[0]

        const configFilePath = join(hostPath, appDef.apiKeyMeta.configFile)

        if (existsSync(configFilePath)) {
          const content = readFileSync(configFilePath, "utf-8")

          if (appDef.apiKeyMeta.parser === "regex") {
            const regex = new RegExp(appDef.apiKeyMeta.selector)
            const match = regex.exec(content)
            if (match && match[1]) {
              this.keys.push({ appId: appDef.id, app: appDef.name, key: match[1], status: "found" })
            } else {
              this.keys.push({ appId: appDef.id, app: appDef.name, key: "Not found in file", status: "error" })
            }
          } else if (appDef.apiKeyMeta.parser === "json") {
            const json = JSON.parse(content)
            // Support dot notation like "main.apiKey"
            const value = appDef.apiKeyMeta.selector.split(".").reduce((obj, key) => obj?.[key], json)
            if (value && typeof value === "string") {
              this.keys.push({ appId: appDef.id, app: appDef.name, key: value, status: "found" })
            } else {
              this.keys.push({ appId: appDef.id, app: appDef.name, key: "Key not found in JSON", status: "error" })
            }
          }
        } else {
          this.keys.push({
            appId: appDef.id,
            app: appDef.name,
            key: "Config file not found (Run app first)",
            status: "missing",
          })
        }
      } catch {
        this.keys.push({ appId: appDef.id, app: appDef.name, key: "Error reading file", status: "error" })
      }
    }
  }

  private renderPage(onBack: () => void) {
    const foundKeys = this.keys.filter((k) => k.status === "found")
    const hasFoundKeys = foundKeys.length > 0

    const { container, content } = createPageLayout(this.cliRenderer, {
      title: "API Key Extractor",
      stepInfo: "Found Keys",
      footerHint: hasFoundKeys ? "S Save to .env  Esc/Enter Return" : "Esc/Enter: Return",
    })
    this.add(container)

    if (this.keys.length === 0) {
      content.add(
        new TextRenderable(this.cliRenderer, {
          content: "No enabled apps have extractable API keys.",
          fg: "#aaaaaa",
        })
      )
    } else {
      // Header
      const header = new BoxRenderable(this.cliRenderer, {
        width: "100%",
        height: 1,
        flexDirection: "row",
        marginBottom: 1,
      })
      header.add(
        new TextRenderable(this.cliRenderer, { content: "Application".padEnd(20), fg: "#ffffff", attributes: 1 })
      )
      header.add(new TextRenderable(this.cliRenderer, { content: "API Key", fg: "#ffffff", attributes: 1 }))
      content.add(header)

      // Rows
      this.keys.forEach((k) => {
        const row = new BoxRenderable(this.cliRenderer, {
          width: "100%",
          height: 1,
          flexDirection: "row",
          marginBottom: 0,
        })

        // App Name
        row.add(
          new TextRenderable(this.cliRenderer, {
            content: k.app.padEnd(20),
            fg: k.status === "found" ? "#50fa7b" : "#ff5555",
          })
        )

        // Key
        row.add(
          new TextRenderable(this.cliRenderer, {
            content: k.key,
            fg: k.status === "found" ? "#f1fa8c" : "#6272a4",
          })
        )
        content.add(row)
      })

      // Status text for feedback
      content.add(new BoxRenderable(this.cliRenderer, { width: 1, height: 1 })) // Spacer
      this.statusText = new TextRenderable(this.cliRenderer, {
        id: "api-key-status",
        content: "",
        fg: "#50fa7b",
      })
      content.add(this.statusText)
    }

    // Key Handler
    this.keyHandler = (key: KeyEvent) => {
      if (key.name === "escape" || key.name === "enter") {
        this.destroy()
        onBack()
      } else if (key.name === "s" && hasFoundKeys) {
        this.saveToEnv()
      }
    }
    this.cliRenderer.keyInput.on("keypress", this.keyHandler)
  }

  public destroy() {
    this.cliRenderer.keyInput.off("keypress", this.keyHandler)
    if (this.parent) {
      if (this.id) {
        try {
          this.parent.remove(this.id)
        } catch {
          /* ignore */
        }
      }
    }
  }

  private async saveToEnv() {
    const foundKeys = this.keys.filter((k) => k.status === "found")
    if (foundKeys.length === 0) return

    try {
      const envPath = getComposePath().replace("docker-compose.yml", ".env")

      // Read existing .env if present
      const currentEnv: Record<string, string> = {}
      if (existsSync(envPath)) {
        const content = await readFile(envPath, "utf-8")
        content.split("\n").forEach((line) => {
          const [key, ...val] = line.split("=")
          if (key && val.length > 0) currentEnv[key.trim()] = val.join("=").trim()
        })
      }

      // Add API keys with format API_KEY_SONARR, API_KEY_RADARR, etc.
      for (const k of foundKeys) {
        const envKey = `API_KEY_${k.appId.toUpperCase()}`
        currentEnv[envKey] = k.key
      }

      // Reconstruct .env content
      const envContent = Object.entries(currentEnv)
        .map(([k, v]) => `${k}=${v}`)
        .join("\n")

      await writeFile(envPath, envContent, "utf-8")

      // Update status
      if (this.statusText) {
        this.statusText.content = `✓ Saved ${foundKeys.length} API key(s) to .env`
      }
    } catch (e) {
      if (this.statusText) {
        this.statusText.content = `✗ Error saving to .env: ${e}`
        this.statusText.fg = "#ff5555"
      }
    }
  }
}
