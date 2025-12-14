/**
 * Cloudflare API client for tunnel and DNS management
 */

const CLOUDFLARE_API_BASE = "https://api.cloudflare.com/client/v4"

interface CloudflareResponse<T> {
  success: boolean
  errors: Array<{ code: number; message: string }>
  messages: string[]
  result: T
}

interface Zone {
  id: string
  name: string
  status: string
}

interface Tunnel {
  id: string
  name: string
  status: string
  created_at: string
  connections: Array<{
    id: string
    is_pending_reconnect: boolean
  }>
}

interface TunnelCredentials {
  account_tag: string
  tunnel_secret: string
  tunnel_id: string
  tunnel_name: string
}

interface DnsRecord {
  id: string
  name: string
  type: string
  content: string
  proxied: boolean
}

export class CloudflareApi {
  private apiToken: string
  private accountId: string | null = null

  constructor(apiToken: string) {
    this.apiToken = apiToken
  }

  private async request<T>(method: string, endpoint: string, body?: unknown): Promise<CloudflareResponse<T>> {
    const response = await fetch(`${CLOUDFLARE_API_BASE}${endpoint}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    })

    const data = (await response.json()) as CloudflareResponse<T>

    if (!data.success) {
      const errors = data.errors.map((e) => e.message).join(", ")
      throw new Error(`Cloudflare API error: ${errors}`)
    }

    return data
  }

  /**
   * Get account ID from token
   */
  async getAccountId(): Promise<string> {
    if (this.accountId) return this.accountId

    const response = await this.request<{ id: string }[]>("GET", "/accounts")
    if (response.result.length === 0) {
      throw new Error(
        "No Cloudflare accounts found. Your API token is missing the 'Account Settings:Read' permission. " +
          "Please edit your token in the Cloudflare dashboard and add: Account → Account Settings → Read"
      )
    }

    this.accountId = response.result[0].id
    return this.accountId
  }

  /**
   * List all zones (domains) in the account
   */
  async listZones(): Promise<Zone[]> {
    const response = await this.request<Zone[]>("GET", "/zones")
    return response.result
  }

  /**
   * Get zone ID by domain name
   */
  async getZoneId(domain: string): Promise<string> {
    const response = await this.request<Zone[]>("GET", `/zones?name=${encodeURIComponent(domain)}`)
    if (response.result.length === 0) {
      throw new Error(`Zone not found for domain: ${domain}`)
    }
    return response.result[0].id
  }

  /**
   * List all tunnels in the account
   */
  async listTunnels(): Promise<Tunnel[]> {
    const accountId = await this.getAccountId()
    const response = await this.request<Tunnel[]>("GET", `/accounts/${accountId}/cfd_tunnel`)
    return response.result
  }

  /**
   * Get tunnel by name
   */
  async getTunnelByName(name: string): Promise<Tunnel | null> {
    const tunnels = await this.listTunnels()
    return tunnels.find((t) => t.name === name) || null
  }

  /**
   * Create a new tunnel
   */
  async createTunnel(name: string): Promise<{ tunnel: Tunnel; credentials: TunnelCredentials }> {
    const accountId = await this.getAccountId()

    // Generate a random secret for the tunnel
    const secret = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64")

    const response = await this.request<Tunnel>("POST", `/accounts/${accountId}/cfd_tunnel`, {
      name,
      tunnel_secret: secret,
      config_src: "cloudflare", // Manage config from Cloudflare dashboard/API
    })

    return {
      tunnel: response.result,
      credentials: {
        account_tag: accountId,
        tunnel_secret: secret,
        tunnel_id: response.result.id,
        tunnel_name: name,
      },
    }
  }

  /**
   * Get tunnel token (for TUNNEL_TOKEN env var)
   * The token is base64-encoded JSON containing account_tag, tunnel_id, and tunnel_secret
   */
  async getTunnelToken(tunnelId: string): Promise<string> {
    const accountId = await this.getAccountId()
    const response = await this.request<string>("GET", `/accounts/${accountId}/cfd_tunnel/${tunnelId}/token`)
    return response.result
  }

  /**
   * Configure tunnel ingress rules
   */
  async configureTunnel(
    tunnelId: string,
    ingress: Array<{ hostname?: string; service: string; originRequest?: Record<string, unknown> }>
  ): Promise<void> {
    const accountId = await this.getAccountId()

    // Ensure there's a catch-all rule at the end
    const hasChatchAll = ingress.some((r) => !r.hostname)
    if (!hasChatchAll) {
      ingress.push({ service: "http_status:404" })
    }

    await this.request("PUT", `/accounts/${accountId}/cfd_tunnel/${tunnelId}/configurations`, {
      config: {
        ingress,
        "warp-routing": { enabled: false },
      },
    })
  }

  /**
   * List DNS records for a zone
   */
  async listDnsRecords(zoneId: string): Promise<DnsRecord[]> {
    const response = await this.request<DnsRecord[]>("GET", `/zones/${zoneId}/dns_records`)
    return response.result
  }

  /**
   * Create a CNAME DNS record pointing to the tunnel
   */
  async createDnsRecord(zoneId: string, name: string, tunnelId: string, proxied = true): Promise<DnsRecord> {
    const target = `${tunnelId}.cfargotunnel.com`

    // Check if record already exists
    const existing = await this.request<DnsRecord[]>(
      "GET",
      `/zones/${zoneId}/dns_records?type=CNAME&name=${encodeURIComponent(name)}`
    )

    if (existing.result.length > 0) {
      // Update existing record
      const recordId = existing.result[0].id
      const response = await this.request<DnsRecord>("PATCH", `/zones/${zoneId}/dns_records/${recordId}`, {
        type: "CNAME",
        name,
        content: target,
        proxied,
      })
      return response.result
    }

    // Create new record
    const response = await this.request<DnsRecord>("POST", `/zones/${zoneId}/dns_records`, {
      type: "CNAME",
      name,
      content: target,
      proxied,
    })

    return response.result
  }

  /**
   * Delete a tunnel
   */
  async deleteTunnel(tunnelId: string): Promise<void> {
    const accountId = await this.getAccountId()
    await this.request("DELETE", `/accounts/${accountId}/cfd_tunnel/${tunnelId}`)
  }

  // ==================== Cloudflare Access API ====================

  /**
   * Create an Access application
   */
  async createAccessApplication(
    domain: string,
    name = "easiarr",
    sessionDuration = "24h"
  ): Promise<{ id: string; name: string }> {
    const accountId = await this.getAccountId()

    // Check if app already exists
    const existing = await this.request<Array<{ id: string; name: string; domain: string }>>(
      "GET",
      `/accounts/${accountId}/access/apps`
    )

    const existingApp = existing.result.find((app) => app.name === name || app.domain === `*.${domain}`)
    if (existingApp) {
      return { id: existingApp.id, name: existingApp.name }
    }

    // Create new application
    const response = await this.request<{ id: string; name: string }>("POST", `/accounts/${accountId}/access/apps`, {
      name,
      domain: `*.${domain}`,
      type: "self_hosted",
      session_duration: sessionDuration,
      auto_redirect_to_identity: true,
    })

    return response.result
  }

  /**
   * Create an Access policy for an application
   */
  async createAccessPolicy(
    appId: string,
    allowedEmails: string[],
    policyName = "Allow Emails"
  ): Promise<{ id: string }> {
    const accountId = await this.getAccountId()

    // Check if policy already exists
    const existing = await this.request<Array<{ id: string; name: string }>>(
      "GET",
      `/accounts/${accountId}/access/apps/${appId}/policies`
    )

    const existingPolicy = existing.result.find((p) => p.name === policyName)
    if (existingPolicy) {
      return { id: existingPolicy.id }
    }

    // Create email-based allow policy
    const response = await this.request<{ id: string }>(
      "POST",
      `/accounts/${accountId}/access/apps/${appId}/policies`,
      {
        name: policyName,
        decision: "allow",
        include: [
          {
            email: {
              email: allowedEmails,
            },
          },
        ],
        precedence: 1,
      }
    )

    return response.result
  }

  /**
   * Create Access application with email policy
   */
  async setupAccessProtection(
    domain: string,
    allowedEmails: string[],
    appName = "easiarr"
  ): Promise<{ appId: string; policyId: string }> {
    const app = await this.createAccessApplication(domain, appName)
    const policy = await this.createAccessPolicy(app.id, allowedEmails)
    return { appId: app.id, policyId: policy.id }
  }
}

/**
 * Helper to create a fully configured tunnel with DNS
 */
export async function setupCloudflaredTunnel(
  apiToken: string,
  domain: string,
  tunnelName = "easiarr"
): Promise<{ tunnelToken: string; tunnelId: string }> {
  const api = new CloudflareApi(apiToken)

  // 1. Check if tunnel already exists
  let tunnel = await api.getTunnelByName(tunnelName)
  let tunnelToken: string

  if (tunnel) {
    // Get existing tunnel token
    tunnelToken = await api.getTunnelToken(tunnel.id)
  } else {
    // 2. Create new tunnel
    const result = await api.createTunnel(tunnelName)
    tunnel = result.tunnel
    tunnelToken = await api.getTunnelToken(tunnel.id)
  }

  // 3. Configure ingress rules
  await api.configureTunnel(tunnel.id, [
    {
      hostname: `*.${domain}`,
      service: "http://traefik:80",
      originRequest: {},
    },
  ])

  // 4. Add DNS CNAME record (wildcard)
  const zoneId = await api.getZoneId(domain)
  await api.createDnsRecord(zoneId, `*.${domain}`, tunnel.id)

  return {
    tunnelToken,
    tunnelId: tunnel.id,
  }
}
