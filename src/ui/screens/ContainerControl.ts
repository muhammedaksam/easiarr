/**
 * Container Control Screen
 * Start, stop, restart containers
 */

import type { RenderContext, CliRenderer } from "@opentui/core"
import { BoxRenderable, TextRenderable, SelectRenderable, SelectRenderableEvents } from "@opentui/core"
import type { App } from "../App"
import type { EasiarrConfig } from "../../config/schema"
import {
  composeUp,
  composeDown,
  composeStop,
  composeRestart,
  getContainerStatuses,
  isDockerAvailable,
} from "../../docker"
import { createPageLayout } from "../components/PageLayout"

export class ContainerControl {
  private renderer: RenderContext
  private container: BoxRenderable
  private app: App
  private config: EasiarrConfig

  constructor(renderer: RenderContext, container: BoxRenderable, app: App, config: EasiarrConfig) {
    this.renderer = renderer
    this.container = container
    this.app = app
    this.config = config

    this.render()
  }

  private async render(): Promise<void> {
    const statuses = await getContainerStatuses()
    const runningCount = statuses.filter((s) => s.status === "running").length
    const totalCount = statuses.length

    // Status in header info?
    const statusText = `Status: ${runningCount}/${totalCount} Running`

    // Check Docker availability first to possibly change status
    const dockerOk = await isDockerAvailable()
    const finalStepInfo = dockerOk ? statusText : "Internal Error: Docker Unavailable"

    const { container: page, content } = createPageLayout(this.renderer as CliRenderer, {
      title: "Container Control",
      stepInfo: finalStepInfo,
      footerHint: "Enter Select/Action  q Back",
    })

    if (!dockerOk) {
      content.add(
        new TextRenderable(this.renderer, {
          id: "docker-error",
          content: "⚠ Docker is not available! Please check your Docker daemon.",
          fg: "#ff6666",
        })
      )
    }

    // Spacer
    content.add(
      new TextRenderable(this.renderer, {
        id: "spacer",
        content: "",
      })
    )

    // Show container list
    if (statuses.length > 0) {
      for (const status of statuses.slice(0, 12)) {
        // Show a few more since we have space
        const icon = status.status === "running" ? "🟢" : "🔴"
        content.add(
          new TextRenderable(this.renderer, {
            id: `status-${status.name}`,
            content: `${icon} ${status.name}`,
            fg: status.status === "running" ? "#00cc66" : "#666666",
          })
        )
      }
    } else if (dockerOk) {
      content.add(
        new TextRenderable(this.renderer, {
          id: "no-containers",
          content: "No containers found. Run 'Start All' first.",
          fg: "#888888",
        })
      )
    }

    const menu = new SelectRenderable(this.renderer, {
      id: "container-menu",
      width: "100%",
      height: 8, // Fixed height for actions at bottom
      options: [
        { name: "▶ Start All", description: "docker compose up -d" },
        { name: "⏹ Stop All", description: "docker compose stop" },
        { name: "🔄 Restart All", description: "docker compose restart" },
        { name: "⬇ Down (Remove)", description: "docker compose down" },
        { name: "🔃 Refresh Status", description: "Update container list" },
        { name: "◀ Back to Main Menu", description: "" },
      ],
    })

    menu.on(SelectRenderableEvents.ITEM_SELECTED, async (index) => {
      switch (index) {
        case 0:
          await composeUp()
          break
        case 1:
          await composeStop()
          break
        case 2:
          await composeRestart()
          break
        case 3:
          await composeDown()
          break
        case 4:
          // Refresh
          break
        case 5:
          this.app.navigateTo("main")
          return
      }
      // Refresh view - clear all children
      const children = this.container.getChildren()
      for (const child of children) {
        this.container.remove(child.id)
      }
      this.render()
    })

    content.add(menu)
    menu.focus()

    this.container.add(page)
  }
}
