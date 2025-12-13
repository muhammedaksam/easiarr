/**
 * Container Control Screen (Modernized)
 * Two-panel layout with container list and action panel
 * Supports individual and bulk container operations
 */

import type { RenderContext, CliRenderer, KeyEvent } from "@opentui/core"
import {
  BoxRenderable,
  TextRenderable,
  SelectRenderable,
  SelectRenderableEvents,
  TabSelectRenderable,
  TabSelectRenderableEvents,
} from "@opentui/core"
import type { App } from "../App"
import type { EasiarrConfig } from "../../config/schema"
import {
  composeUp,
  composeDown,
  composeStop,
  composeRestart,
  getContainerStatuses,
  pullImages,
  startContainer,
  stopContainer,
  restartContainer as restartSingleContainer,
  getContainerLogs,
  recreateService,
  type ContainerStatus,
} from "../../docker"
import { createPageLayout } from "../components/PageLayout"

type Mode = "containers" | "bulk"

export class ContainerControl {
  private renderer: CliRenderer
  private container: BoxRenderable
  private app: App
  private config: EasiarrConfig
  private keyHandler: ((k: KeyEvent) => void) | null = null

  // UI Components
  private page!: BoxRenderable
  private modeTabs!: TabSelectRenderable
  private leftPanel!: BoxRenderable
  private rightPanel!: BoxRenderable
  private statusText!: TextRenderable

  // State
  private mode: Mode = "containers"
  private containers: ContainerStatus[] = []
  private selectedIndex = 0
  private isLoading = false
  private statusMessage = ""

  constructor(renderer: RenderContext, container: BoxRenderable, app: App, config: EasiarrConfig) {
    this.renderer = renderer as CliRenderer
    this.container = container
    this.app = app
    this.config = config

    this.init()
  }

  private async init(): Promise<void> {
    await this.loadContainers()
    this.buildUI()
    this.attachKeyHandler()
  }

  private async loadContainers(): Promise<void> {
    this.isLoading = true
    this.containers = await getContainerStatuses()
    this.isLoading = false
  }

  private buildUI(): void {
    const runningCount = this.containers.filter((s) => s.status === "running").length
    const totalCount = this.containers.length
    const dockerOk = this.containers.length > 0 || !this.isLoading

    const statusText = `${runningCount}/${totalCount} Running`
    const finalStepInfo = dockerOk ? statusText : "Docker Unavailable"

    const { container: page, content } = createPageLayout(this.renderer, {
      title: "Container Control",
      stepInfo: finalStepInfo,
      footerHint: [
        { type: "key", key: "Tab", value: "Switch Tab" },
        { type: "key", key: "↑↓", value: "Navigate" },
        { type: "key", key: "Enter", value: "Action" },
        { type: "separator" },
        { type: "key", key: "s", value: "Start" },
        { type: "key", key: "x", value: "Stop" },
        { type: "key", key: "r", value: "Restart" },
        { type: "key", key: "l", value: "Logs" },
        { type: "key", key: "u", value: "Update" },
      ],
    })
    this.page = page

    // Tab selector
    this.modeTabs = new TabSelectRenderable(this.renderer, {
      id: "mode-tabs",
      width: "100%",
      options: [
        { name: "📦 Containers", value: "containers", description: "" },
        { name: "⚡ Bulk Actions", value: "bulk", description: "" },
      ],
      tabWidth: 18,
      showUnderline: false,
      showDescription: false,
      selectedBackgroundColor: "#4a9eff",
      textColor: "#555555",
    })

    this.modeTabs.on(TabSelectRenderableEvents.ITEM_SELECTED, (index: number) => {
      this.mode = index === 0 ? "containers" : "bulk"
      this.updatePanels()
    })

    content.add(this.modeTabs)
    content.add(new TextRenderable(this.renderer, { content: " " }))

    // Two-panel layout
    const panelRow = new BoxRenderable(this.renderer, {
      width: "100%",
      flexGrow: 1,
      flexDirection: "row",
    })

    // Left panel - Container list or Bulk options
    this.leftPanel = new BoxRenderable(this.renderer, {
      width: "60%",
      height: "100%",
      flexDirection: "column",
      border: true,
      borderStyle: "single",
      borderColor: "#4a9eff",
      title: " Containers ",
      padding: 1,
    })

    // Right panel - Actions or Info
    this.rightPanel = new BoxRenderable(this.renderer, {
      width: "40%",
      height: "100%",
      flexDirection: "column",
      border: true,
      borderStyle: "single",
      borderColor: "#666666",
      title: " Actions ",
      padding: 1,
    })

    panelRow.add(this.leftPanel)
    panelRow.add(this.rightPanel)
    content.add(panelRow)

    // Status bar
    this.statusText = new TextRenderable(this.renderer, {
      id: "status-bar",
      content: "",
      fg: "#f1fa8c",
    })
    content.add(this.statusText)

    this.container.add(page)
    this.updatePanels()
  }

  private clearPanel(panel: BoxRenderable): void {
    const children = [...panel.getChildren()]
    for (const child of children) {
      if (child.id) panel.remove(child.id)
    }
  }

  private updatePanels(): void {
    if (this.mode === "containers") {
      this.renderContainerList()
      this.renderContainerActions()
    } else {
      this.renderBulkOptions()
      this.renderBulkInfo()
    }
  }

  private renderContainerList(): void {
    this.clearPanel(this.leftPanel)
    this.leftPanel.title = " Containers "

    if (this.containers.length === 0) {
      this.leftPanel.add(
        new TextRenderable(this.renderer, {
          id: "no-containers",
          content: "No containers found.\nRun 'Start All' in Bulk Actions tab.",
          fg: "#888888",
        })
      )
      return
    }

    // Render container list with selection highlight
    this.containers.forEach((container, idx) => {
      const isSelected = idx === this.selectedIndex
      const icon = container.status === "running" ? "🟢" : "🔴"
      const prefix = isSelected ? "▶ " : "  "

      const row = new BoxRenderable(this.renderer, {
        id: `container-row-${idx}`,
        width: "100%",
        flexDirection: "row",
        backgroundColor: isSelected ? "#2a2a4a" : undefined,
      })

      row.add(
        new TextRenderable(this.renderer, {
          id: `container-${idx}`,
          content: `${prefix}${icon} ${container.name}`,
          fg: isSelected ? "#ffffff" : container.status === "running" ? "#50fa7b" : "#666666",
        })
      )

      // Show port if available
      if (container.ports) {
        row.add(
          new TextRenderable(this.renderer, {
            id: `port-${idx}`,
            content: ` (${container.ports.split(",")[0] || ""})`,
            fg: "#888888",
          })
        )
      }

      this.leftPanel.add(row)
    })
  }

  private renderContainerActions(): void {
    this.clearPanel(this.rightPanel)
    this.rightPanel.title = " Actions "

    const selected = this.containers[this.selectedIndex]
    if (!selected) {
      this.rightPanel.add(
        new TextRenderable(this.renderer, {
          id: "no-selection",
          content: "No container selected",
          fg: "#888888",
        })
      )
      return
    }

    // Container info header
    this.rightPanel.add(
      new TextRenderable(this.renderer, {
        id: "selected-name",
        content: `📦 ${selected.name}`,
        fg: "#4a9eff",
      })
    )
    this.rightPanel.add(
      new TextRenderable(this.renderer, {
        id: "selected-status",
        content: `Status: ${selected.status === "running" ? "🟢 Running" : "🔴 Stopped"}`,
        fg: selected.status === "running" ? "#50fa7b" : "#ff5555",
      })
    )
    this.rightPanel.add(new TextRenderable(this.renderer, { content: "" }))

    // Action buttons based on state
    const actions =
      selected.status === "running"
        ? [
            { key: "x", label: "Stop Container", action: "stop" },
            { key: "r", label: "Restart Container", action: "restart" },
            { key: "l", label: "View Logs", action: "logs" },
            { key: "u", label: "Update (Pull + Recreate)", action: "update" },
          ]
        : [
            { key: "s", label: "Start Container", action: "start" },
            { key: "u", label: "Update (Pull + Recreate)", action: "update" },
          ]

    this.rightPanel.add(
      new TextRenderable(this.renderer, {
        id: "actions-header",
        content: "Keyboard Shortcuts:",
        fg: "#888888",
      })
    )

    actions.forEach(({ key, label }, idx) => {
      this.rightPanel.add(
        new TextRenderable(this.renderer, {
          id: `action-${idx}`,
          content: ` [${key}] ${label}`,
          fg: "#f8f8f2",
        })
      )
    })
  }

  private renderBulkOptions(): void {
    this.clearPanel(this.leftPanel)
    this.leftPanel.title = " Bulk Actions "

    const menu = new SelectRenderable(this.renderer, {
      id: "bulk-menu",
      width: "100%",
      height: 10,
      options: [
        { name: "▶ Start All", description: "docker compose up -d" },
        { name: "⏹ Stop All", description: "docker compose stop" },
        { name: "🔄 Restart All", description: "docker compose restart" },
        { name: "⬇ Down (Remove)", description: "docker compose down" },
        { name: "📥 Pull Updates", description: "docker compose pull" },
        { name: "🔃 Refresh Status", description: "Update container list" },
        { name: "◀ Back to Main Menu", description: "" },
      ],
    })

    menu.on(SelectRenderableEvents.ITEM_SELECTED, async (index) => {
      await this.executeBulkAction(index)
    })

    this.leftPanel.add(menu)

    // Focus the menu when in bulk mode
    if (this.mode === "bulk") {
      setTimeout(() => menu.focus(), 10)
    }
  }

  private renderBulkInfo(): void {
    this.clearPanel(this.rightPanel)
    this.rightPanel.title = " Status "

    const runningCount = this.containers.filter((c) => c.status === "running").length
    const stoppedCount = this.containers.length - runningCount

    this.rightPanel.add(
      new TextRenderable(this.renderer, {
        id: "total-containers",
        content: `Total: ${this.containers.length} containers`,
        fg: "#f8f8f2",
      })
    )
    this.rightPanel.add(
      new TextRenderable(this.renderer, {
        id: "running-count",
        content: `🟢 Running: ${runningCount}`,
        fg: "#50fa7b",
      })
    )
    this.rightPanel.add(
      new TextRenderable(this.renderer, {
        id: "stopped-count",
        content: `🔴 Stopped: ${stoppedCount}`,
        fg: stoppedCount > 0 ? "#ff5555" : "#666666",
      })
    )
    this.rightPanel.add(new TextRenderable(this.renderer, { content: "" }))

    // List running containers
    if (runningCount > 0) {
      this.rightPanel.add(
        new TextRenderable(this.renderer, {
          id: "running-header",
          content: "Running:",
          fg: "#888888",
        })
      )
      this.containers
        .filter((c) => c.status === "running")
        .slice(0, 8)
        .forEach((c, idx) => {
          this.rightPanel.add(
            new TextRenderable(this.renderer, {
              id: `running-${idx}`,
              content: ` • ${c.name}`,
              fg: "#50fa7b",
            })
          )
        })
    }
  }

  private async executeBulkAction(index: number): Promise<void> {
    this.setStatus("Executing...", "#f1fa8c")

    switch (index) {
      case 0:
        this.setStatus("Starting all containers...", "#f1fa8c")
        await composeUp()
        this.setStatus("✓ All containers started", "#50fa7b")
        break
      case 1:
        this.setStatus("Stopping all containers...", "#f1fa8c")
        await composeStop()
        this.setStatus("✓ All containers stopped", "#50fa7b")
        break
      case 2:
        this.setStatus("Restarting all containers...", "#f1fa8c")
        await composeRestart()
        this.setStatus("✓ All containers restarted", "#50fa7b")
        break
      case 3:
        this.setStatus("Removing containers...", "#f1fa8c")
        await composeDown()
        this.setStatus("✓ Containers removed", "#50fa7b")
        break
      case 4:
        this.setStatus("Pulling latest images...", "#f1fa8c")
        await pullImages()
        this.setStatus("✓ Images updated", "#50fa7b")
        break
      case 5:
        this.setStatus("Refreshing...", "#f1fa8c")
        break
      case 6:
        this.cleanup()
        this.app.navigateTo("main")
        return
    }

    await this.loadContainers()
    this.updatePanels()
  }

  private async executeContainerAction(action: string): Promise<void> {
    const selected = this.containers[this.selectedIndex]
    if (!selected) return

    const serviceName = selected.name

    switch (action) {
      case "start":
        this.setStatus(`Starting ${serviceName}...`, "#f1fa8c")
        await startContainer(serviceName)
        this.setStatus(`✓ ${serviceName} started`, "#50fa7b")
        break
      case "stop":
        this.setStatus(`Stopping ${serviceName}...`, "#f1fa8c")
        await stopContainer(serviceName)
        this.setStatus(`✓ ${serviceName} stopped`, "#50fa7b")
        break
      case "restart":
        this.setStatus(`Restarting ${serviceName}...`, "#f1fa8c")
        await restartSingleContainer(serviceName)
        this.setStatus(`✓ ${serviceName} restarted`, "#50fa7b")
        break
      case "update":
        this.setStatus(`Updating ${serviceName}...`, "#f1fa8c")
        await recreateService(serviceName)
        this.setStatus(`✓ ${serviceName} updated`, "#50fa7b")
        break
      case "logs":
        await this.showLogs(serviceName)
        return // Don't refresh after logs
    }

    await this.loadContainers()
    this.updatePanels()
  }

  private async showLogs(serviceName: string): Promise<void> {
    this.setStatus(`Fetching logs for ${serviceName}...`, "#f1fa8c")
    const result = await getContainerLogs(serviceName, 25)

    this.clearPanel(this.rightPanel)
    this.rightPanel.title = ` Logs: ${serviceName} `

    if (!result.success) {
      this.rightPanel.add(
        new TextRenderable(this.renderer, {
          id: "logs-error",
          content: "Failed to fetch logs",
          fg: "#ff5555",
        })
      )
      return
    }

    // Display logs (truncated for UI)
    const logLines = result.output.split("\n").slice(-20)
    logLines.forEach((line, idx) => {
      this.rightPanel.add(
        new TextRenderable(this.renderer, {
          id: `log-${idx}`,
          content: line.substring(0, 60),
          fg: "#888888",
        })
      )
    })

    this.setStatus("Press any key to close logs", "#4a9eff")
  }

  private setStatus(message: string, color: string): void {
    this.statusMessage = message
    if (this.statusText) {
      this.statusText.content = message
      this.statusText.fg = color
    }
  }

  private attachKeyHandler(): void {
    this.keyHandler = (k: KeyEvent) => {
      if (this.mode === "containers") {
        this.handleContainerModeKey(k)
      } else {
        this.handleBulkModeKey(k)
      }
    }
    this.renderer.keyInput.on("keypress", this.keyHandler)
  }

  private handleContainerModeKey(k: KeyEvent): void {
    const maxIndex = this.containers.length - 1

    switch (k.name) {
      case "up":
        this.selectedIndex = Math.max(0, this.selectedIndex - 1)
        this.updatePanels()
        break
      case "down":
        this.selectedIndex = Math.min(maxIndex, this.selectedIndex + 1)
        this.updatePanels()
        break
      case "tab":
        this.mode = "bulk"
        this.modeTabs.setSelectedIndex(1)
        this.updatePanels()
        break
      case "s":
        this.executeContainerAction("start")
        break
      case "x":
        this.executeContainerAction("stop")
        break
      case "r":
        this.executeContainerAction("restart")
        break
      case "l":
        this.executeContainerAction("logs")
        break
      case "u":
        this.executeContainerAction("update")
        break
      case "q":
      case "escape":
        this.cleanup()
        this.app.navigateTo("main")
        break
    }
  }

  private handleBulkModeKey(k: KeyEvent): void {
    if (k.name === "tab") {
      this.mode = "containers"
      this.modeTabs.setSelectedIndex(0)
      this.updatePanels()
    } else if (k.name === "q" || k.name === "escape") {
      this.cleanup()
      this.app.navigateTo("main")
    }
  }

  private cleanup(): void {
    if (this.keyHandler) {
      this.renderer.keyInput.off("keypress", this.keyHandler)
      this.keyHandler = null
    }
  }
}
