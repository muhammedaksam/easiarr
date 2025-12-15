/**
 * Uptime Kuma API Client
 * Handles Uptime Kuma auto-setup via Socket.IO including user creation and monitor management
 */

import { io, Socket } from "socket.io-client"
import { debugLog } from "../utils/debug"
import type { IAutoSetupClient, AutoSetupOptions, AutoSetupResult } from "./auto-setup-types"
import type { AppConfig } from "../config/schema"
import { getApp } from "../apps/registry"

interface MonitorConfig {
  type: "http" | "port" | "ping" | "docker"
  name: string
  url?: string
  hostname?: string
  port?: number
  interval: number
  timeout?: number
  maxretries?: number
  active?: boolean
  docker_container?: string
  docker_host?: number
}

interface UptimeKumaResponse {
  ok: boolean
  msg?: string
  monitorID?: number
  token?: string
}

export class UptimeKumaClient implements IAutoSetupClient {
  private host: string
  private port: number
  private socket: Socket | null = null
  private authenticated = false

  constructor(host: string, port: number = 3001) {
    this.host = host
    this.port = port
  }

  /**
   * Get base URL for Uptime Kuma
   */
  private get baseUrl(): string {
    return `http://${this.host}:${this.port}`
  }

  /**
   * Connect to Socket.IO server
   */
  private async connect(): Promise<void> {
    if (this.socket?.connected) return

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Connection timeout"))
      }, 10000)

      this.socket = io(this.baseUrl, {
        transports: ["websocket"],
        reconnection: false,
      })

      this.socket.on("connect", () => {
        clearTimeout(timeout)
        debugLog("UptimeKumaApi", "Connected to Socket.IO")
        resolve()
      })

      this.socket.on("connect_error", (error) => {
        clearTimeout(timeout)
        debugLog("UptimeKumaApi", `Connection error: ${error}`)
        reject(error)
      })
    })
  }

  /**
   * Disconnect from Socket.IO server
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect()
      this.socket = null
      this.authenticated = false
    }
  }

  /**
   * Emit a Socket.IO event and wait for callback response
   */
  private emit<T>(event: string, ...args: unknown[]): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error("Not connected"))
        return
      }

      const timeout = setTimeout(() => {
        reject(new Error(`Timeout waiting for ${event} response`))
      }, 15000)

      this.socket.emit(event, ...args, (response: T) => {
        clearTimeout(timeout)
        resolve(response)
      })
    })
  }

  /**
   * Check if Uptime Kuma is reachable
   */
  async isHealthy(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/status-page/heartbeat/main`, {
        method: "GET",
      })
      // Even 404 means server is running
      debugLog("UptimeKumaApi", `Health check: ${response.status}`)
      return response.status !== 502 && response.status !== 503
    } catch (error) {
      // Try simple connection
      try {
        const response = await fetch(this.baseUrl)
        return response.ok || response.status === 404
      } catch {
        debugLog("UptimeKumaApi", `Health check failed: ${error}`)
        return false
      }
    }
  }

  /**
   * Check if already initialized (has users)
   */
  async isInitialized(): Promise<boolean> {
    try {
      await this.connect()
      // Try to get info - if it needs setup, needSetup will be true
      const response = await this.emit<{ needSetup: boolean }>("needSetup")
      this.disconnect()
      return !response.needSetup
    } catch {
      this.disconnect()
      return true // Assume initialized if we can't check
    }
  }

  /**
   * Setup initial admin user
   */
  async setupAdmin(username: string, password: string): Promise<UptimeKumaResponse> {
    await this.connect()

    const response = await this.emit<UptimeKumaResponse>("setup", {
      username,
      password,
    })

    if (response.ok) {
      this.authenticated = true
      debugLog("UptimeKumaApi", "Admin user created")
    }

    return response
  }

  /**
   * Login with username and password
   */
  async login(username: string, password: string): Promise<boolean> {
    await this.connect()

    const response = await this.emit<UptimeKumaResponse>("login", {
      username,
      password,
      token: "",
    })

    if (response.ok) {
      this.authenticated = true
      debugLog("UptimeKumaApi", "Logged in successfully")
    }

    return response.ok
  }

  /**
   * Add a monitor
   */
  async addMonitor(config: MonitorConfig): Promise<number | null> {
    if (!this.authenticated) {
      throw new Error("Not authenticated")
    }

    const payload = {
      type: config.type,
      name: config.name,
      url: config.url,
      hostname: config.hostname,
      port: config.port,
      interval: config.interval || 60,
      timeout: config.timeout || 30,
      maxretries: config.maxretries || 3,
      active: config.active ?? true,
      docker_container: config.docker_container,
      docker_host: config.docker_host,
      accepted_statuscodes: ["200-299"],
    }

    const response = await this.emit<UptimeKumaResponse>("add", payload)

    if (response.ok && response.monitorID) {
      debugLog("UptimeKumaApi", `Monitor "${config.name}" created with ID ${response.monitorID}`)
      return response.monitorID
    }

    debugLog("UptimeKumaApi", `Failed to create monitor: ${response.msg}`)
    return null
  }

  /**
   * Get list of all monitors
   */
  async getMonitors(): Promise<Record<string, unknown>[]> {
    if (!this.authenticated) {
      throw new Error("Not authenticated")
    }

    return new Promise((resolve) => {
      if (!this.socket) {
        resolve([])
        return
      }

      // Uptime Kuma sends monitor list via 'monitorList' event
      const timeout = setTimeout(() => resolve([]), 5000)

      this.socket.once("monitorList", (data: Record<string, Record<string, unknown>>) => {
        clearTimeout(timeout)
        resolve(Object.values(data) as Record<string, unknown>[])
      })

      // Request monitor list
      this.socket.emit("getMonitorList")
    })
  }

  /**
   * Auto-add monitors for enabled easiarr apps
   */
  async setupEasiarrMonitors(apps: AppConfig[]): Promise<number> {
    let addedCount = 0

    // Get existing monitors to avoid duplicates
    const existingMonitors = await this.getMonitors()
    const existingNames = new Set(existingMonitors.map((m) => m.name as string))

    for (const appConfig of apps) {
      if (!appConfig.enabled) continue

      const appDef = getApp(appConfig.id)
      if (!appDef) continue

      // Skip apps without web UI
      if (appDef.defaultPort === 0) continue

      const monitorName = `Easiarr - ${appDef.name}`

      // Skip if already exists
      if (existingNames.has(monitorName)) {
        debugLog("UptimeKumaApi", `Monitor "${monitorName}" already exists, skipping`)
        continue
      }

      const port = appConfig.port || appDef.defaultPort
      const internalPort = appDef.internalPort || port

      // Create HTTP monitor for web UIs
      const monitorId = await this.addMonitor({
        type: "http",
        name: monitorName,
        url: `http://${appConfig.id}:${internalPort}`,
        interval: 60,
        timeout: 30,
        maxretries: 2,
      })

      if (monitorId) {
        addedCount++
      }
    }

    return addedCount
  }

  /**
   * Run the auto-setup process for Uptime Kuma
   */
  async setup(options: AutoSetupOptions): Promise<AutoSetupResult> {
    const { username, password } = options

    try {
      // Check if reachable
      const healthy = await this.isHealthy()
      if (!healthy) {
        return { success: false, message: "Uptime Kuma not reachable" }
      }

      // Check if needs initial setup
      const initialized = await this.isInitialized()

      if (!initialized) {
        // Create admin user
        const setupResult = await this.setupAdmin(username, password)
        if (!setupResult.ok) {
          return { success: false, message: `Setup failed: ${setupResult.msg}` }
        }
      } else {
        // Login with existing credentials
        const loggedIn = await this.login(username, password)
        if (!loggedIn) {
          this.disconnect()
          return { success: false, message: "Login failed - check credentials" }
        }
      }

      this.disconnect()
      return {
        success: true,
        message: initialized ? "Logged in" : "Admin created",
        data: { adminCreated: !initialized },
      }
    } catch (error) {
      this.disconnect()
      return { success: false, message: `${error}` }
    }
  }
}
