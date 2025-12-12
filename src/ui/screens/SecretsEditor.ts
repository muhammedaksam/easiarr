import {
  BoxRenderable,
  InputRenderable,
  TextRenderable,
  CliRenderer,
  RenderContext,
  BoxOptions,
  RGBA,
  KeyEvent,
} from "@opentui/core"
import { EasiarrConfig, AppSecret } from "../../config/schema"
import { getApp } from "../../apps/registry"
import { readEnv, updateEnv, getEnvPath } from "../../utils/env"
import { mkdir } from "node:fs/promises"
import { dirname } from "node:path"

export interface SecretsEditorOptions extends BoxOptions {
  config: EasiarrConfig
  onSave: () => void
  onCancel: () => void
  extraEnv?: Record<string, { value: string; description: string }>
}

export class SecretsEditor extends BoxRenderable {
  private inputs: Map<string, InputRenderable> = new Map()
  private secrets: Map<string, AppSecret> = new Map()
  private currentFocusIndex = 0
  private inputKeys: string[] = []
  private config: EasiarrConfig
  private onSave: () => void
  private onCancel: () => void
  private extraEnv: Record<string, { value: string; description: string }> = {}
  private envValues: Record<string, string> = {}
  private renderer: CliRenderer
  private keyHandler: ((k: KeyEvent) => void) | null = null

  constructor(renderer: CliRenderer | RenderContext, options: SecretsEditorOptions) {
    super(renderer, {
      ...options,
      border: true,
      borderStyle: "double",
      title: "Secrets Manager (.env)",
      titleAlignment: "center",
      backgroundColor: RGBA.fromHex("#1a1a1a"), // Dark background
    })

    this.renderer = renderer as CliRenderer
    this.config = options.config
    this.onSave = options.onSave
    this.onCancel = options.onCancel
    this.extraEnv = options.extraEnv || {}

    this.initSecrets()
  }

  private async initSecrets() {
    // 0. Add Extra Env (System Config)
    for (const [key, info] of Object.entries(this.extraEnv)) {
      this.secrets.set(key, {
        name: key,
        description: info.description,
        default: info.value,
        required: true,
      })
    }

    // 1. Collect Secrets from Enabled Apps
    for (const appConfig of this.config.apps) {
      if (!appConfig.enabled) continue
      const appDef = getApp(appConfig.id)
      if (appDef && appDef.secrets) {
        for (const secret of appDef.secrets) {
          if (!this.secrets.has(secret.name)) {
            this.secrets.set(secret.name, secret)
          }
        }
      }
    }

    if (this.secrets.size === 0) {
      this.add(
        new TextRenderable(this.renderer as CliRenderer, {
          content: "No secrets required for selected apps.",
          left: 2,
          top: 2,
        })
      )
      // Add Exit hint
      this.add(
        new TextRenderable(this.renderer as CliRenderer, {
          content: "Press ESC to return",
          bottom: 1,
          left: 2,
        })
      )
      return
    }

    // 2. Load existing .env
    await this.loadEnv()

    // 3. Render Inputs
    // Use a scrolling container if needed, but for now just stacking boxes
    const container = new BoxRenderable(this.renderer as CliRenderer, {
      width: "100%",
      flexDirection: "column",
      padding: 1,
    })
    this.add(container)

    this.secrets.forEach((secret, key) => {
      const row = new BoxRenderable(this.renderer as CliRenderer, {
        width: "100%",
        height: 1,
        flexDirection: "row",
        marginBottom: 1,
      })

      // Label
      const label = new TextRenderable(this.renderer as CliRenderer, {
        content: `${secret.name}${secret.required ? "*" : ""}:`.padEnd(30),
        width: 30,
        fg: secret.required ? RGBA.fromHex("#ff5555") : RGBA.fromHex("#aaaaaa"),
      })
      row.add(label)

      // Input
      const input = new InputRenderable(this.renderer as CliRenderer, {
        id: `input-${key}`,
        width: 60, // Wider for paths
        placeholder: secret.description,
        backgroundColor: RGBA.fromHex("#333333"),
        focusedBackgroundColor: RGBA.fromHex("#444444"),
        textColor: RGBA.fromHex("#ffffff"),
      })

      // Prefer envValue > default > empty
      input.value = this.envValues[key] || secret.default || ""

      row.add(input)
      container.add(row)

      this.inputs.set(key, input)
      this.inputKeys.push(key)
    })

    // Instructions
    this.add(
      new TextRenderable(this.renderer as CliRenderer, {
        content: "TAB: Next Field | CTRL+S: Save | ESC: Cancel",
        bottom: 0,
        left: 2,
        width: "100%",
      })
    )

    // Global Key Handling (intercept Tab, Enter, Esc, Ctrl+S)
    this.keyHandler = (k: KeyEvent) => {
      // Allow inputs to handle typing, but intercept navigation/actions
      if (k.name === "tab") {
        // k.preventDefault() // Prevent Input from adding tab char?
        this.focusNext()
      } else if (k.name === "s" && k.ctrl) {
        // k.preventDefault()
        this.save()
      } else if (k.name === "escape") {
        this.onCancel()
      }
    }
    this.renderer.keyInput.on("keypress", this.keyHandler)

    // Focus first
    if (this.inputKeys.length > 0) {
      this.inputs.get(this.inputKeys[0])?.focus()
    }
  }

  private async loadEnv() {
    this.envValues = await readEnv()
  }

  private async save() {
    // Collect values from inputs
    const updates: Record<string, string> = {}
    this.inputs.forEach((input, key) => {
      updates[key] = input.value
    })

    // Ensure directory exists
    try {
      await mkdir(dirname(getEnvPath()), { recursive: true })
    } catch {
      // Ignore if exists
    }

    // Update .env file
    await updateEnv(updates)

    this.onSave()
  }

  override destroy(): void {
    if (this.keyHandler) {
      this.renderer.keyInput.off("keypress", this.keyHandler)
      this.keyHandler = null
    }
    super.destroy()
  }

  private focusNext() {
    this.currentFocusIndex = (this.currentFocusIndex + 1) % this.inputKeys.length
    const key = this.inputKeys[this.currentFocusIndex]
    this.inputs.get(key)?.focus()
  }
}
