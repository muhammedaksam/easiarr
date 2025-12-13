import { BoxRenderable, CliRenderer, TextRenderable, KeyEvent } from "@opentui/core"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { randomBytes } from "node:crypto"
import { parse as parseYaml } from "yaml"
import { createPageLayout } from "../components/PageLayout"
import { EasiarrConfig, AppDefinition } from "../../config/schema"
import { getApp } from "../../apps/registry"
import { updateEnv, readEnvSync } from "../../utils/env"
import { PortainerApiClient } from "../../api/portainer-api"

/** Generate a random 32-character hex API key */
function generateApiKey(): string {
  return randomBytes(16).toString("hex")
}

/** Get nested value from object using dot notation */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], obj)
}

/** Parse INI file and get value from section.key */
function parseIniValue(content: string, section: string, key: string): string | null {
  const lines = content.split("\n")
  let inSection = false

  for (const line of lines) {
    const trimmed = line.trim()

    // Check section header
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      const sectionName = trimmed.slice(1, -1)
      inSection = sectionName.toLowerCase() === section.toLowerCase()
      continue
    }

    // Parse key=value in current section
    if (inSection && trimmed.includes("=")) {
      const [k, ...valueParts] = trimmed.split("=")
      if (k.trim().toLowerCase() === key.toLowerCase()) {
        let value = valueParts.join("=").trim()
        // Remove quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1)
        }
        return value
      }
    }
  }
  return null
}

/** Update INI file with new values for section */
function updateIniValue(content: string, section: string, updates: Record<string, string>): string {
  const lines = content.split("\n")
  const result: string[] = []
  let inSection = false
  const updatedKeys = new Set<string>()

  for (const line of lines) {
    const trimmed = line.trim()

    // Check section header
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      // Before leaving current section, add any missing keys
      if (inSection) {
        for (const [k, v] of Object.entries(updates)) {
          if (!updatedKeys.has(k.toLowerCase())) {
            result.push(`${k} = ${v}`)
          }
        }
      }
      const sectionName = trimmed.slice(1, -1)
      inSection = sectionName.toLowerCase() === section.toLowerCase()
      result.push(line)
      continue
    }

    // Update key=value in current section
    if (inSection && trimmed.includes("=")) {
      const [k] = trimmed.split("=")
      const keyName = k.trim()
      const keyLower = keyName.toLowerCase()

      let handled = false
      for (const [updateKey, updateValue] of Object.entries(updates)) {
        if (updateKey.toLowerCase() === keyLower) {
          result.push(`${keyName} = ${updateValue}`)
          updatedKeys.add(keyLower)
          handled = true
          break
        }
      }
      if (!handled) {
        result.push(line)
      }
    } else {
      result.push(line)
    }
  }

  return result.join("\n")
}

type KeyStatus = "found" | "missing" | "error" | "generated"

interface PortainerCredentials {
  apiKey: string
  password?: string // Only set if padded (different from global)
}

export class ApiKeyViewer extends BoxRenderable {
  private config: EasiarrConfig
  private keys: Array<{ appId: string; app: string; key: string; status: KeyStatus }> = []
  private keyHandler!: (key: KeyEvent) => void
  private cliRenderer: CliRenderer
  private statusText: TextRenderable | null = null
  private portainerCredentials: PortainerCredentials | null = null

  constructor(renderer: CliRenderer, config: EasiarrConfig, onBack: () => void) {
    super(renderer, {
      id: "api-key-viewer",
      width: "100%",
      height: "100%",
      backgroundColor: "#111111",
      zIndex: 200,
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

      // Handle Portainer separately (uses API, not config file)
      if (appConfig.id === "portainer") {
        this.scanPortainer(appConfig.port || 9000)
        continue
      }

      const appDef = getApp(appConfig.id)
      if (!appDef || !appDef.apiKeyMeta) continue

      try {
        const volumes = appDef.volumes(this.config.rootDir)
        if (volumes.length === 0) continue

        const parts = volumes[0].split(":")
        const hostPath = parts[0]
        const configFilePath = join(hostPath, appDef.apiKeyMeta.configFile)

        if (existsSync(configFilePath)) {
          const content = readFileSync(configFilePath, "utf-8")
          const result = this.extractApiKey(appDef, content, configFilePath)
          this.keys.push({ appId: appDef.id, app: appDef.name, ...result })
        } else {
          this.keys.push({
            appId: appDef.id,
            app: appDef.name,
            key: "Config file not found (Run app first)",
            status: "missing",
          })
        }
      } catch (e) {
        this.keys.push({ appId: appDef.id, app: appDef.name, key: `Error: ${e}`, status: "error" })
      }
    }
  }

  private scanPortainer(_port: number) {
    const env = readEnvSync()
    const existingApiKey = env["API_KEY_PORTAINER"]

    if (existingApiKey) {
      this.keys.push({
        appId: "portainer",
        app: "Portainer",
        key: existingApiKey,
        status: "found",
      })
      return
    }

    // Will attempt to initialize/login when saving
    const globalPassword = env["PASSWORD_GLOBAL"]
    if (!globalPassword) {
      this.keys.push({
        appId: "portainer",
        app: "Portainer",
        key: "No PASSWORD_GLOBAL set in .env",
        status: "missing",
      })
      return
    }

    // Add pending entry - actual API call happens on save
    this.keys.push({
      appId: "portainer",
      app: "Portainer",
      key: "Press S to generate API key",
      status: "missing",
    })
  }

  private extractApiKey(
    appDef: AppDefinition,
    content: string,
    configFilePath: string
  ): { key: string; status: "found" | "error" | "generated" } {
    const meta = appDef.apiKeyMeta!

    switch (meta.parser) {
      case "regex": {
        const regex = new RegExp(meta.selector)
        const match = regex.exec(content)
        if (match && match[1]) {
          return { key: match[1], status: "found" }
        }
        return { key: "Not found in file", status: "error" }
      }

      case "json": {
        const json = JSON.parse(content)
        const value = getNestedValue(json, meta.selector)
        if (value && typeof value === "string") {
          return { key: value, status: "found" }
        }
        return { key: "Key not found in JSON", status: "error" }
      }

      case "yaml": {
        const yaml = parseYaml(content) as Record<string, unknown>
        const value = getNestedValue(yaml, meta.selector)
        if (value && typeof value === "string") {
          return { key: value, status: "found" }
        }
        return { key: "Key not found in YAML", status: "error" }
      }

      case "ini": {
        const section = meta.section || "General"
        const value = parseIniValue(content, section, meta.selector)

        // Check if API is enabled and if we need to generate
        if (meta.enabledKey) {
          const enabled = parseIniValue(content, section, meta.enabledKey)
          const isDisabled = !enabled || enabled.toLowerCase() === "false" || enabled === "0"
          const needsGeneration = !value || value.toLowerCase() === "none" || value === ""

          if (meta.generateIfMissing && (isDisabled || needsGeneration)) {
            const newKey = generateApiKey()
            const updates: Record<string, string> = { [meta.selector]: newKey }
            if (meta.enabledKey) {
              updates[meta.enabledKey] = "True"
            }
            const newContent = updateIniValue(content, section, updates)
            writeFileSync(configFilePath, newContent, "utf-8")
            return { key: newKey, status: "generated" }
          }
        }

        if (value && value.toLowerCase() !== "none" && value !== "") {
          return { key: value, status: "found" }
        }
        return { key: "API key not configured", status: "error" }
      }

      default:
        return { key: `Unknown parser: ${meta.parser}`, status: "error" }
    }
  }

  private renderPage(onBack: () => void) {
    const foundKeys = this.keys.filter((k) => k.status === "found" || k.status === "generated")
    const hasFoundKeys = foundKeys.length > 0

    const { container, content } = createPageLayout(this.cliRenderer, {
      title: "API Key Extractor",
      stepInfo: "Found Keys",
      footerHint: hasFoundKeys
        ? [
            { type: "key", key: "S", value: "Save to .env" },
            { type: "key", key: "Esc/Enter", value: "Return" },
          ]
        : [{ type: "key", key: "Esc/Enter", value: "Return" }],
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

        // Status color
        let color = "#6272a4"
        if (k.status === "found") color = "#50fa7b"
        else if (k.status === "generated") color = "#8be9fd"
        else if (k.status === "error") color = "#ff5555"

        // App Name
        row.add(
          new TextRenderable(this.cliRenderer, {
            content: k.app.padEnd(20),
            fg: color,
          })
        )

        // Key with status indicator
        let keyDisplay = k.key
        if (k.status === "generated") keyDisplay = `${k.key} (generated)`

        row.add(
          new TextRenderable(this.cliRenderer, {
            content: keyDisplay,
            fg: k.status === "found" || k.status === "generated" ? "#f1fa8c" : "#6272a4",
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
    const foundKeys = this.keys.filter((k) => k.status === "found" || k.status === "generated")

    try {
      // Build updates object with API keys
      const updates: Record<string, string> = {}

      for (const k of foundKeys) {
        if (k.appId !== "portainer") {
          updates[`API_KEY_${k.appId.toUpperCase()}`] = k.key
        }
      }

      // Handle Portainer separately - need to call API
      const portainerEntry = this.keys.find((k) => k.appId === "portainer")
      if (portainerEntry && portainerEntry.status === "missing") {
        await this.initializePortainer(updates)
      } else if (portainerEntry && portainerEntry.status === "found") {
        updates["API_KEY_PORTAINER"] = portainerEntry.key
      }

      // Save Portainer credentials if we have them
      if (this.portainerCredentials) {
        updates["API_KEY_PORTAINER"] = this.portainerCredentials.apiKey
        if (this.portainerCredentials.password) {
          updates["PASSWORD_PORTAINER"] = this.portainerCredentials.password
        }
      }

      if (Object.keys(updates).length === 0) {
        if (this.statusText) {
          this.statusText.content = "No keys to save"
          this.statusText.fg = "#f1fa8c"
        }
        return
      }

      await updateEnv(updates)

      // Update status
      if (this.statusText) {
        const count = Object.keys(updates).length
        this.statusText.content = `✓ Saved ${count} key(s) to .env`
      }
    } catch (e) {
      if (this.statusText) {
        this.statusText.content = `✗ Error saving to .env: ${e}`
        this.statusText.fg = "#ff5555"
      }
    }
  }

  private async initializePortainer(_updates: Record<string, string>) {
    const env = readEnvSync()
    const globalUsername = env["USERNAME_GLOBAL"] || "admin"
    const globalPassword = env["PASSWORD_GLOBAL"]

    if (!globalPassword) return

    const portainerConfig = this.config.apps.find((a) => a.id === "portainer" && a.enabled)
    if (!portainerConfig) return

    const port = portainerConfig.port || 9000
    const client = new PortainerApiClient("localhost", port)

    try {
      // Check if reachable
      const healthy = await client.isHealthy()
      if (!healthy) {
        if (this.statusText) {
          this.statusText.content = "Portainer not reachable"
          this.statusText.fg = "#f1fa8c"
        }
        return
      }

      // Try to initialize or login
      const result = await client.initializeAdmin(globalUsername, globalPassword)

      if (result) {
        // New initialization
        const apiKey = await client.generateApiKey(result.actualPassword, "easiarr-api-key")
        this.portainerCredentials = {
          apiKey,
          password: result.passwordWasPadded ? result.actualPassword : undefined,
        }

        // Update the display
        const portainerEntry = this.keys.find((k) => k.appId === "portainer")
        if (portainerEntry) {
          portainerEntry.key = apiKey
          portainerEntry.status = "generated"
        }
      } else {
        // Already initialized, try login with saved password if available
        const portainerPassword = env["PASSWORD_PORTAINER"] || globalPassword
        await client.login(globalUsername, portainerPassword)
        const apiKey = await client.generateApiKey(portainerPassword, "easiarr-api-key")
        this.portainerCredentials = { apiKey }

        const portainerEntry = this.keys.find((k) => k.appId === "portainer")
        if (portainerEntry) {
          portainerEntry.key = apiKey
          portainerEntry.status = "generated"
        }
      }
    } catch (e) {
      if (this.statusText) {
        this.statusText.content = `Portainer error: ${e}`
        this.statusText.fg = "#ff5555"
      }
    }
  }
}
