/**
 * Main Menu Screen
 * Central navigation hub for Easiarr
 */

import type { RenderContext, CliRenderer } from "@opentui/core"
import { BoxRenderable, TextRenderable, SelectRenderable, SelectRenderableEvents } from "@opentui/core"
import type { App } from "../App"
import type { EasiarrConfig } from "../../config/schema"
import { createPageLayout } from "../components/PageLayout"
import { saveCompose } from "../../compose"
import { ApiKeyViewer } from "./ApiKeyViewer"
import { AppConfigurator } from "./AppConfigurator"

export class MainMenu {
  private renderer: RenderContext
  private container: BoxRenderable
  private app: App
  private config: EasiarrConfig
  private menu!: SelectRenderable
  private page!: BoxRenderable

  constructor(renderer: RenderContext, container: BoxRenderable, app: App, config: EasiarrConfig) {
    this.renderer = renderer
    this.container = container
    this.app = app
    this.config = config

    this.render()
  }

  private render(): void {
    const { container: page, content } = createPageLayout(this.renderer as CliRenderer, {
      title: "Main Menu",
      stepInfo: "Docker Compose Generator for *arr Ecosystem",
      footerHint: "Enter Select  Ctrl+C Exit",
    })
    this.page = page

    // Config info
    const configBox = new BoxRenderable(this.renderer, {
      width: "100%",
      flexDirection: "column",
      marginBottom: 1,
    })

    configBox.add(
      new TextRenderable(this.renderer, {
        id: "config-info-header",
        content: "Configuration Overview:",
        fg: "#4a9eff",
      })
    )

    configBox.add(new BoxRenderable(this.renderer, { width: 1, height: 1 })) // Spacer

    configBox.add(
      new TextRenderable(this.renderer, {
        id: "config-info",
        content: ` 📁 Root: ${this.config.rootDir}`,
        fg: "#aaaaaa",
      })
    )

    configBox.add(
      new TextRenderable(this.renderer, {
        id: "apps-info",
        content: `    Apps: ${this.config.apps.filter((a) => a.enabled).length} configured`,
        fg: "#aaaaaa",
      })
    )

    content.add(configBox)

    content.add(new TextRenderable(this.renderer, { id: "spacer2", content: " " }))

    // Menu
    this.menu = new SelectRenderable(this.renderer, {
      id: "main-menu-select",
      width: "100%",
      height: 10,
      options: [
        {
          name: "📦 Manage Apps",
          description: "Add, remove, or configure apps",
        },
        {
          name: "🐳 Container Control",
          description: "Start, stop, restart containers",
        },
        {
          name: "⚙️  Advanced Settings",
          description: "Customize ports, volumes, env",
        },
        {
          name: "🔑 Extract API Keys",
          description: "Find API keys from running containers",
        },
        {
          name: "⚙️  Configure Apps",
          description: "Set root folders and download clients via API",
        },
        {
          name: "🔄 Regenerate Compose",
          description: "Rebuild docker-compose.yml",
        },
        { name: "❌ Exit", description: "Close easiarr" },
      ],
    })

    this.menu.on(SelectRenderableEvents.ITEM_SELECTED, async (index) => {
      switch (index) {
        case 0:
          this.app.navigateTo("appManager")
          break
        case 1:
          this.app.navigateTo("containerControl")
          break
        case 2:
          this.app.navigateTo("advancedSettings")
          break
        case 3: {
          // API Key Extractor
          this.menu.blur()
          this.page.visible = false
          const viewer = new ApiKeyViewer(this.renderer as CliRenderer, this.config, () => {
            // On Back
            this.page.visible = true
            this.menu.focus()
          })
          this.container.add(viewer)
          break
        }
        case 4: {
          // Configure Apps
          this.menu.blur()
          this.page.visible = false
          const configurator = new AppConfigurator(this.renderer as CliRenderer, this.config, () => {
            this.page.visible = true
            this.menu.focus()
          })
          this.container.add(configurator)
          break
        }
        case 5: {
          // Regenerate compose
          await saveCompose(this.config)
          break
        }
        case 6:
          process.exit(0)
          break
      }
    })

    content.add(this.menu)
    this.menu.focus()

    this.container.add(page)
  }
}
