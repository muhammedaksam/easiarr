/**
 * Container Logs Viewer Screen
 * Full-screen log viewer with streaming, search, and save functionality
 */

import type { RenderContext, CliRenderer, KeyEvent } from "@opentui/core"
import { BoxRenderable, TextRenderable, SelectRenderable, SelectRenderableEvents } from "@opentui/core"
import type { EasiarrConfig } from "../../config/schema"
import { getContainerLogs, getContainerStatuses, type ContainerStatus } from "../../docker"
import { createPageLayout } from "../components/PageLayout"
import { saveLog, listSavedLogs, formatBytes, formatRelativeTime } from "../../utils/logs"

type ViewMode = "select" | "logs" | "saved"

export class LogsViewer extends BoxRenderable {
  private renderer: CliRenderer
  private config: EasiarrConfig
  private onBack: () => void
  private keyHandler: ((k: KeyEvent) => void) | null = null

  // State
  private mode: ViewMode = "select"
  private containers: ContainerStatus[] = []
  private selectedContainer: ContainerStatus | null = null
  private logContent: string[] = []
  private scrollOffset = 0
  private lineCount = 100 // Number of log lines to fetch
  private isLoading = false
  private statusMessage = ""
  private savedLogs: Array<{ filename: string; path: string; date: Date; size: number }> = []

  // UI Components
  private page!: BoxRenderable
  private content!: BoxRenderable
  private statusBar!: TextRenderable

  constructor(renderer: RenderContext, config: EasiarrConfig, onBack: () => void) {
    super(renderer, { width: "100%", height: "100%", flexDirection: "column" })
    this.renderer = renderer as CliRenderer
    this.config = config
    this.onBack = onBack

    this.init()
  }

  private async init(): Promise<void> {
    await this.loadContainers()
    this.buildUI()
    this.attachKeyHandler()
  }

  private async loadContainers(): Promise<void> {
    this.isLoading = true
    const all = await getContainerStatuses()
    // Only show running containers (can fetch logs from them)
    this.containers = all.filter((c) => c.status === "running")
    this.isLoading = false
  }

  private buildUI(): void {
    const { container: page, content } = createPageLayout(this.renderer, {
      title: "📋 Container Logs",
      stepInfo: `${this.containers.length} running containers`,
      footerHint: this.getFooterHints(),
    })
    this.page = page
    this.content = content

    this.statusBar = new TextRenderable(this.renderer, {
      id: "status-bar",
      content: "",
      fg: "#f1fa8c",
    })

    this.renderContent()
    this.add(page)
  }

  private getFooterHints(): Array<{ type: "key"; key: string; value: string } | { type: "separator" }> {
    switch (this.mode) {
      case "select":
        return [
          { type: "key", key: "Enter", value: "View Logs" },
          { type: "key", key: "h", value: "Saved Logs" },
          { type: "key", key: "q", value: "Back" },
        ]
      case "logs":
        return [
          { type: "key", key: "↑↓", value: "Scroll" },
          { type: "key", key: "s", value: "Save" },
          { type: "key", key: "r", value: "Refresh" },
          { type: "key", key: "+/-", value: "Lines" },
          { type: "key", key: "q", value: "Back" },
        ]
      case "saved":
        return [
          { type: "key", key: "Enter", value: "View" },
          { type: "key", key: "q", value: "Back" },
        ]
    }
  }

  private clearContent(): void {
    const children = [...this.content.getChildren()]
    for (const child of children) {
      if (child.id) this.content.remove(child.id)
    }
  }

  private renderContent(): void {
    this.clearContent()

    switch (this.mode) {
      case "select":
        this.renderContainerSelect()
        break
      case "logs":
        this.renderLogView()
        break
      case "saved":
        this.renderSavedLogs()
        break
    }

    this.content.add(this.statusBar)
  }

  private renderContainerSelect(): void {
    if (this.containers.length === 0) {
      this.content.add(
        new TextRenderable(this.renderer, {
          id: "no-containers",
          content: "No running containers found.\nStart containers first to view logs.",
          fg: "#888888",
        })
      )
      return
    }

    this.content.add(
      new TextRenderable(this.renderer, {
        id: "select-header",
        content: "Select a container to view logs:",
        fg: "#4a9eff",
      })
    )
    this.content.add(new TextRenderable(this.renderer, { content: "" }))

    const menu = new SelectRenderable(this.renderer, {
      id: "container-select",
      width: "100%",
      height: Math.min(this.containers.length + 2, 15),
      options: this.containers.map((c) => ({
        name: `🐳 ${c.name}`,
        description: c.ports ? `Ports: ${c.ports.split(",")[0]}` : "",
      })),
    })

    menu.on(SelectRenderableEvents.ITEM_SELECTED, async (index) => {
      this.selectedContainer = this.containers[index]
      await this.fetchLogs()
      this.mode = "logs"
      this.scrollOffset = 0
      this.rebuildUI()
    })

    this.content.add(menu)
    setTimeout(() => menu.focus(), 10)
  }

  private renderLogView(): void {
    if (!this.selectedContainer) return

    // Header with container info
    const header = new BoxRenderable(this.renderer, {
      id: "log-header",
      width: "100%",
      flexDirection: "row",
      marginBottom: 1,
    })

    header.add(
      new TextRenderable(this.renderer, {
        id: "container-name",
        content: `📦 ${this.selectedContainer.name}`,
        fg: "#4a9eff",
      })
    )
    header.add(
      new TextRenderable(this.renderer, {
        id: "log-info",
        content: `  (${this.lineCount} lines, scroll: ${this.scrollOffset}/${Math.max(0, this.logContent.length - 20)})`,
        fg: "#666666",
      })
    )

    this.content.add(header)

    // Log content box
    const logBox = new BoxRenderable(this.renderer, {
      id: "log-box",
      width: "100%",
      flexGrow: 1,
      flexDirection: "column",
      border: true,
      borderStyle: "single",
      borderColor: "#444444",
      padding: 1,
      overflow: "hidden",
    })

    if (this.isLoading) {
      logBox.add(
        new TextRenderable(this.renderer, {
          id: "loading",
          content: "Loading logs...",
          fg: "#f1fa8c",
        })
      )
    } else if (this.logContent.length === 0) {
      logBox.add(
        new TextRenderable(this.renderer, {
          id: "no-logs",
          content: "No logs available",
          fg: "#888888",
        })
      )
    } else {
      // Show visible lines based on scroll offset
      const visibleLines = this.logContent.slice(this.scrollOffset, this.scrollOffset + 20)

      visibleLines.forEach((line, idx) => {
        // Colorize log levels
        let fg = "#888888"
        if (line.includes("ERROR") || line.includes("error")) fg = "#ff5555"
        else if (line.includes("WARN") || line.includes("warn")) fg = "#f1fa8c"
        else if (line.includes("INFO") || line.includes("info")) fg = "#50fa7b"
        else if (line.includes("DEBUG") || line.includes("debug")) fg = "#6272a4"

        logBox.add(
          new TextRenderable(this.renderer, {
            id: `log-line-${idx}`,
            content: line.substring(0, 120), // Truncate long lines
            fg,
          })
        )
      })
    }

    this.content.add(logBox)
  }

  private async renderSavedLogs(): Promise<void> {
    if (!this.selectedContainer) {
      this.content.add(
        new TextRenderable(this.renderer, {
          id: "no-selection",
          content: "Select a container first to view saved logs.",
          fg: "#888888",
        })
      )
      return
    }

    this.savedLogs = await listSavedLogs(this.selectedContainer.name)

    this.content.add(
      new TextRenderable(this.renderer, {
        id: "saved-header",
        content: `📁 Saved logs for ${this.selectedContainer.name}:`,
        fg: "#4a9eff",
      })
    )
    this.content.add(new TextRenderable(this.renderer, { content: "" }))

    if (this.savedLogs.length === 0) {
      this.content.add(
        new TextRenderable(this.renderer, {
          id: "no-saved",
          content: "No saved logs found. Press 's' while viewing logs to save.",
          fg: "#888888",
        })
      )
      return
    }

    const menu = new SelectRenderable(this.renderer, {
      id: "saved-select",
      width: "100%",
      height: Math.min(this.savedLogs.length + 2, 15),
      options: this.savedLogs.map((log) => ({
        name: `📄 ${log.filename}`,
        description: `${formatBytes(log.size)} - ${formatRelativeTime(log.date)}`,
      })),
    })

    menu.on(SelectRenderableEvents.ITEM_SELECTED, async (index) => {
      const log = this.savedLogs[index]
      // Load and display saved log
      const content = await Bun.file(log.path).text()
      this.logContent = content.split("\n")
      this.scrollOffset = 0
      this.mode = "logs"
      this.rebuildUI()
    })

    this.content.add(menu)
    setTimeout(() => menu.focus(), 10)
  }

  private async fetchLogs(): Promise<void> {
    if (!this.selectedContainer) return

    this.isLoading = true
    this.setStatus("Fetching logs...", "#f1fa8c")

    const result = await getContainerLogs(this.selectedContainer.name, this.lineCount)

    if (result.success) {
      this.logContent = result.output.split("\n").filter((line) => line.trim())
      this.setStatus(`Loaded ${this.logContent.length} lines`, "#50fa7b")
    } else {
      this.logContent = []
      this.setStatus("Failed to fetch logs", "#ff5555")
    }

    this.isLoading = false
  }

  private async saveCurrentLogs(): Promise<void> {
    if (!this.selectedContainer || this.logContent.length === 0) {
      this.setStatus("No logs to save", "#ff5555")
      return
    }

    this.setStatus("Saving logs...", "#f1fa8c")
    const content = this.logContent.join("\n")
    const filepath = await saveLog(this.selectedContainer.name, content)
    this.setStatus(`✓ Saved to ${filepath}`, "#50fa7b")
  }

  private setStatus(message: string, color: string): void {
    this.statusMessage = message
    if (this.statusBar) {
      this.statusBar.content = message
      this.statusBar.fg = color
    }
  }

  private rebuildUI(): void {
    // Remove old page
    if (this.page) {
      this.remove(this.page.id)
    }
    this.buildUI()
  }

  private attachKeyHandler(): void {
    this.keyHandler = async (k: KeyEvent) => {
      switch (this.mode) {
        case "select":
          await this.handleSelectModeKey(k)
          break
        case "logs":
          await this.handleLogsModeKey(k)
          break
        case "saved":
          await this.handleSavedModeKey(k)
          break
      }
    }
    this.renderer.keyInput.on("keypress", this.keyHandler)
  }

  private async handleSelectModeKey(k: KeyEvent): Promise<void> {
    switch (k.name) {
      case "h":
        if (this.selectedContainer) {
          this.mode = "saved"
          this.rebuildUI()
        }
        break
      case "q":
      case "escape":
        this.cleanup()
        this.onBack()
        break
    }
  }

  private async handleLogsModeKey(k: KeyEvent): Promise<void> {
    const maxScroll = Math.max(0, this.logContent.length - 20)

    switch (k.name) {
      case "up":
        this.scrollOffset = Math.max(0, this.scrollOffset - 1)
        this.renderContent()
        break
      case "down":
        this.scrollOffset = Math.min(maxScroll, this.scrollOffset + 1)
        this.renderContent()
        break
      case "pageup":
        this.scrollOffset = Math.max(0, this.scrollOffset - 10)
        this.renderContent()
        break
      case "pagedown":
        this.scrollOffset = Math.min(maxScroll, this.scrollOffset + 10)
        this.renderContent()
        break
      case "home":
        this.scrollOffset = 0
        this.renderContent()
        break
      case "end":
        this.scrollOffset = maxScroll
        this.renderContent()
        break
      case "s":
        await this.saveCurrentLogs()
        break
      case "r":
        await this.fetchLogs()
        this.renderContent()
        break
      case "+":
      case "=":
        this.lineCount = Math.min(500, this.lineCount + 50)
        await this.fetchLogs()
        this.rebuildUI()
        break
      case "-":
        this.lineCount = Math.max(50, this.lineCount - 50)
        await this.fetchLogs()
        this.rebuildUI()
        break
      case "h":
        this.mode = "saved"
        this.rebuildUI()
        break
      case "q":
      case "escape":
        this.mode = "select"
        this.selectedContainer = null
        this.logContent = []
        this.rebuildUI()
        break
    }
  }

  private async handleSavedModeKey(k: KeyEvent): Promise<void> {
    switch (k.name) {
      case "q":
      case "escape":
        this.mode = this.selectedContainer ? "logs" : "select"
        this.rebuildUI()
        break
    }
  }

  private cleanup(): void {
    if (this.keyHandler) {
      this.renderer.keyInput.off("keypress", this.keyHandler)
      this.keyHandler = null
    }
  }
}
