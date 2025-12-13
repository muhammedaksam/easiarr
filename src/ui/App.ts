/**
 * Main Application Controller
 * Manages navigation between screens
 */

import type { KeyEvent, CliRenderer } from "@opentui/core"
import { BoxRenderable } from "@opentui/core"
import { loadConfig, configExists, saveConfig } from "../config"
import type { EasiarrConfig } from "../config/schema"
import { MainMenu } from "./screens/MainMenu"
import { QuickSetup } from "./screens/QuickSetup"
import { AppManager } from "./screens/AppManager"
import { ContainerControl } from "./screens/ContainerControl"
import { AdvancedSettings } from "./screens/AdvancedSettings"
import { checkForUpdates } from "../utils/update-checker"
import { UpdateNotification } from "./components/UpdateNotification"

export type Screen = "main" | "quickSetup" | "appManager" | "containerControl" | "advancedSettings"

export class App {
  private renderer: CliRenderer
  private config: EasiarrConfig | null = null
  private currentScreen: Screen = "main"
  private screenContainer: BoxRenderable

  constructor(renderer: CliRenderer) {
    this.renderer = renderer
    this.screenContainer = new BoxRenderable(renderer, {
      id: "screen-container",
      width: "100%",
      height: "100%",
    })
    renderer.root.add(this.screenContainer)
  }

  async start(): Promise<void> {
    // Load existing config or show quick setup
    if (await configExists()) {
      this.config = await loadConfig()
    }

    if (!this.config) {
      this.navigateTo("quickSetup")
    } else {
      // Check for updates before showing main menu
      const updateInfo = await checkForUpdates()

      if (updateInfo.updateAvailable) {
        // Show update notification
        const notification = new UpdateNotification(this.renderer, updateInfo, () => {
          // After dismissing, show main menu
          this.navigateTo("main")
        })
        this.renderer.root.add(notification)
      } else {
        this.navigateTo("main")
      }
    }

    // Handle exit
    this.renderer.keyInput.on("keypress", (key: KeyEvent) => {
      if (key.ctrl && key.name === "c") {
        process.exit(0)
      }
    })
  }

  navigateTo(screen: Screen): void {
    this.currentScreen = screen

    // Clear all children from container
    const children = this.screenContainer.getChildren()
    for (const child of children) {
      this.screenContainer.remove(child.id)
    }

    switch (screen) {
      case "main":
        new MainMenu(this.renderer, this.screenContainer, this, this.config!)
        break
      case "quickSetup":
        new QuickSetup(this.renderer, this.screenContainer, this)
        break
      case "appManager":
        new AppManager(this.renderer, this.screenContainer, this, this.config!)
        break
      case "containerControl":
        new ContainerControl(this.renderer, this.screenContainer, this, this.config!)
        break
      case "advancedSettings":
        new AdvancedSettings(this.renderer, this.screenContainer, this, this.config!)
        break
    }
  }

  async saveAndReload(config: EasiarrConfig): Promise<void> {
    await saveConfig(config)
    this.config = config
    this.navigateTo("main")
  }

  setConfig(config: EasiarrConfig): void {
    this.config = config
  }

  getConfig(): EasiarrConfig | null {
    return this.config
  }
}
