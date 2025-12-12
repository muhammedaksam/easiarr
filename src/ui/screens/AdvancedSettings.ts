/**
 * Advanced Settings Screen
 * Edit configuration files directly
 */

import {
  BoxRenderable,
  SelectRenderable,
  SelectRenderableEvents,
  CliRenderer,
  RenderContext,
  KeyEvent,
} from "@opentui/core"
import { App } from "../App"
import { EasiarrConfig } from "../../config/schema"
import { createPageLayout } from "../components/PageLayout"
import { FileEditor } from "../components/FileEditor"
import { readFile, writeFile } from "node:fs/promises"
import { getConfigPath, getComposePath } from "../../config/manager"
import { getEnvPath } from "../../utils/env"
import { existsSync } from "node:fs"

export class AdvancedSettings {
  private renderer: CliRenderer
  private container: BoxRenderable
  private app: App
  private config: EasiarrConfig
  private keyHandler: ((k: KeyEvent) => void) | null = null
  private activeEditor: FileEditor | null = null

  constructor(renderer: CliRenderer | RenderContext, container: BoxRenderable, app: App, config: EasiarrConfig) {
    this.renderer = renderer as CliRenderer
    this.container = container
    this.app = app
    this.config = config

    this.renderMenu()
  }

  private clear() {
    if (this.keyHandler) {
      this.renderer.keyInput.off("keypress", this.keyHandler)
      this.keyHandler = null
    }
    if (this.activeEditor) {
      this.activeEditor.destroy()
      this.activeEditor = null
    }
    const children = this.container.getChildren()
    for (const child of children) {
      this.container.remove(child.id)
    }
  }

  private renderMenu(): void {
    this.clear()

    const { container: page, content } = createPageLayout(this.renderer, {
      title: "Advanced Settings",
      stepInfo: "Direct File Editing",
      footerHint: [
        { type: "key", key: "Enter", value: "Select" },
        { type: "key", key: "Esc", value: "Back" },
      ],
    })

    const menu = new SelectRenderable(this.renderer, {
      id: "advanced-menu",
      width: "100%",
      flexGrow: 1,
      options: [
        {
          name: "📄 Edit config.json",
          description: "Raw application configuration",
        },
        {
          name: "🔑 Edit .env Secrets",
          description: "Environment variables and secrets",
        },
        {
          name: "🐳 View docker-compose.yml",
          description: "Generated Docker composition (Read-only recommended)",
        },
        {
          name: "◀ Back",
          description: "Return to Main Menu",
        },
      ],
    })

    menu.on(SelectRenderableEvents.ITEM_SELECTED, async (index) => {
      switch (index) {
        case 0:
          await this.editFile("config.json", getConfigPath(), async (content) => {
            // Validate JSON?
            try {
              const newConfig = JSON.parse(content)
              await writeFile(getConfigPath(), content, "utf-8")
              this.app.saveAndReload(newConfig)
            } catch {
              // Show error? For now just log/ignore or loop
              // Ideally show an error dialog.
            }
          })
          break
        case 1: {
          const envPath = getEnvPath()
          await this.editFile(".env", envPath, async (content) => {
            await writeFile(envPath, content, "utf-8")
            this.renderMenu()
          })
          break
        }
        case 2:
          await this.editFile("docker-compose.yml", getComposePath(), async (content) => {
            await writeFile(getComposePath(), content, "utf-8")
            this.renderMenu()
          })
          break
        case 3:
          this.app.navigateTo("main")
          break
      }
    })

    content.add(menu)
    menu.focus()

    this.keyHandler = (k: KeyEvent) => {
      if (k.name === "escape") {
        this.app.navigateTo("main")
      }
    }
    this.renderer.keyInput.on("keypress", this.keyHandler)

    this.container.add(page)
  }

  private async editFile(name: string, path: string, onSave: (content: string) => Promise<void>) {
    this.clear()

    let initialContent = ""
    try {
      if (existsSync(path)) {
        initialContent = await readFile(path, "utf-8")
      }
    } catch {
      initialContent = "// Failed to read file or file does not exist"
    }

    const editor = new FileEditor(this.renderer, {
      id: `editor-${name}`,
      width: "100%",
      height: "100%",
      filename: name,
      initialContent,
      onSave: async (content) => {
        await onSave(content)
        // onSave callback might navigate away (reload), but if not:
        if (name !== "config.json") {
          this.renderMenu()
        }
      },
      onCancel: () => {
        this.renderMenu()
      },
    })

    // FileEditor handles its own keys?
    // We cleared our keyHandler in this.clear().
    // FileEditor constructor attaches listeners?
    // Check FileEditor implementation again:
    // It attaches to this.textarea.on("keypress").
    // If that works, fine.

    // Wait, FileEditor focus?
    this.container.add(editor)
    this.activeEditor = editor
    setTimeout(() => editor.focus(), 10)
  }
}
