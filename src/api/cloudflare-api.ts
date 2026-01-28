/**
 * Cloudflare API client for tunnel and DNS management
 */

import { BaseApiClient } from "./base-api"

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

export class CloudflareApi extends BaseApiClient {
  protected readonly logPrefix = "CloudflareAPI"
  private apiToken: string
  private accountId: string | null = null

  constructor(apiToken: string) {
    // Use dummy host/port since we use absolute URLs
    super("api.cloudflare.com", 443)
    this.apiToken = apiToken
  }

  private async cfRequest<T>(
    method: string,
    endpoint: string,
    body?: unknown
  ): Promise<CloudflareResponse<T>> {
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

  async getAccountId(): Promise<string> {
    if (this.accountId) return this.accountId

    const response = await this.cfRequest<{ id: string }[]>("GET", "/accounts")
    if (response.result.length === 0) {
      throw new Error(
        "No Cloudflare accounts found. Your API token is missing the 'Account Settings:Read' permission."
      )
    }

    this.accountId = response.result[0].id
    return this.accountId
  }

  async listZones(): Promise<Zone[]> {
    const response = await this.cfRequest<Zone[]>("GET", "/zones")
    return response.result
  }

  async getZoneId(domain: string): Promise<string> {
    const response = await this.cfRequest<Zone[]>(
      "GET",
      `/zones?name=${encodeURIComponent(domain)}`
    )
    if (response.result.length === 0) {
      throw new Error(`Zone not found for domain: ${domain}`)
    }
    return response.result[0].id
  }

  async listTunnels(): Promise<Tunnel[]> {
    const accountId = await this.getAccountId()
    const response = await this.cfRequest<Tunnel[]>("GET", `/accounts/${accountId}/cfd_tunnel`)
    return response.result
  }

  async getTunnelByName(name: string): Promise<Tunnel | null> {
    const tunnels = await this.listTunnels()
    return tunnels.find((t) => t.name === name) || null
  }

  async createTunnel(name: string): Promise<{ tunnel: Tunnel; credentials: TunnelCredentials }> {
    const accountId = await this.getAccountId()
    const secret = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64")

    const response = await this.cfRequest<Tunnel>("POST", `/accounts/${accountId}/cfd_tunnel`, {
      name,
      tunnel_secret: secret,
      config_src: "cloudflare",
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

  async getTunnelToken(tunnelId: string): Promise<string> {
    const accountId = await this.getAccountId()
    const response = await this.cfRequest<string>(
      "GET",
      `/accounts/${accountId}/cfd_tunnel/${tunnelId}/token`
    )
    return response.result
  }

  async configureTunnel(
    tunnelId: string,
    ingress: Array<{ hostname?: string; service: string; originRequest?: Record<string, unknown> }>,
    warpRouting = false
  ): Promise<void> {
    const accountId = await this.getAccountId()

    const hasChatchAll = ingress.some((r) => !r.hostname)
    if (!hasChatchAll) {
      ingress.push({ service: "http_status:404" })
    }

    await this.cfRequest("PUT", `/accounts/${accountId}/cfd_tunnel/${tunnelId}/configurations`, {
      config: {
        ingress,
        "warp-routing": { enabled: warpRouting },
      },
    })
  }

  async listDnsRecords(zoneId: string): Promise<DnsRecord[]> {
    const response = await this.cfRequest<DnsRecord[]>("GET", `/zones/${zoneId}/dns_records`)
    return response.result
  }

  async createDnsRecord(
    zoneId: string,
    name: string,
    tunnelId: string,
    proxied = true
  ): Promise<DnsRecord> {
    const target = `${tunnelId}.cfargotunnel.com`

    const existing = await this.cfRequest<DnsRecord[]>(
      "GET",
      `/zones/${zoneId}/dns_records?type=CNAME&name=${encodeURIComponent(name)}`
    )

    if (existing.result.length > 0) {
      const recordId = existing.result[0].id
      const response = await this.cfRequest<DnsRecord>(
        "PATCH",
        `/zones/${zoneId}/dns_records/${recordId}`,
        { type: "CNAME", name, content: target, proxied }
      )
      return response.result
    }

    const response = await this.cfRequest<DnsRecord>("POST", `/zones/${zoneId}/dns_records`, {
      type: "CNAME",
      name,
      content: target,
      proxied,
    })

    return response.result
  }

  async deleteTunnel(tunnelId: string): Promise<void> {
    const accountId = await this.getAccountId()
    await this.cfRequest("DELETE", `/accounts/${accountId}/cfd_tunnel/${tunnelId}`)
  }

  // ==================== Zero Trust Private Network API ====================

  async addTunnelRoute(
    tunnelId: string,
    networkCidr: string,
    comment = "easiarr private network"
  ): Promise<string> {
    const accountId = await this.getAccountId()
    const response = await this.cfRequest<{ id: string }>(
      "POST",
      `/accounts/${accountId}/teamnet/routes`,
      { network: networkCidr, tunnel_id: tunnelId, comment }
    )
    return response.result.id
  }

  async listTunnelRoutes(): Promise<
    Array<{ id: string; network: string; tunnel_id: string; comment?: string }>
  > {
    const accountId = await this.getAccountId()
    const response = await this.cfRequest<
      Array<{ id: string; network: string; tunnel_id: string; comment?: string }>
    >("GET", `/accounts/${accountId}/teamnet/routes`)
    return response.result
  }

  async deleteTunnelRoute(routeId: string): Promise<void> {
    const accountId = await this.getAccountId()
    await this.cfRequest("DELETE", `/accounts/${accountId}/teamnet/routes/${routeId}`)
  }

  async getTunnelRouteForNetwork(
    networkCidr: string
  ): Promise<{ id: string; tunnel_id: string } | null> {
    const routes = await this.listTunnelRoutes()
    return routes.find((r) => r.network === networkCidr) || null
  }

  // ==================== Cloudflare Access API ====================

  async createAccessApplication(
    domain: string,
    name = "easiarr",
    sessionDuration = "24h"
  ): Promise<{ id: string; name: string }> {
    const accountId = await this.getAccountId()

    const existing = await this.cfRequest<Array<{ id: string; name: string; domain: string }>>(
      "GET",
      `/accounts/${accountId}/access/apps`
    )

    const existingApp = existing.result.find(
      (app) => app.name === name || app.domain === `*.${domain}`
    )
    if (existingApp) {
      return { id: existingApp.id, name: existingApp.name }
    }

    const response = await this.cfRequest<{ id: string; name: string }>(
      "POST",
      `/accounts/${accountId}/access/apps`,
      {
        name,
        domain: `*.${domain}`,
        type: "self_hosted",
        session_duration: sessionDuration,
        auto_redirect_to_identity: true,
      }
    )

    return response.result
  }

  async createAccessPolicy(
    appId: string,
    allowedEmails: string[],
    policyName = "Allow Emails"
  ): Promise<{ id: string }> {
    const accountId = await this.getAccountId()

    const existing = await this.cfRequest<Array<{ id: string; name: string }>>(
      "GET",
      `/accounts/${accountId}/access/apps/${appId}/policies`
    )

    const existingPolicy = existing.result.find((p) => p.name === policyName)
    if (existingPolicy) {
      return { id: existingPolicy.id }
    }

    const response = await this.cfRequest<{ id: string }>(
      "POST",
      `/accounts/${accountId}/access/apps/${appId}/policies`,
      {
        name: policyName,
        decision: "allow",
        include: allowedEmails.map((email) => ({ email: { email } })),
        precedence: existing.result.length + 1,
      }
    )

    return response.result
  }

  async createBypassPolicy(
    appId: string,
    bypassIp: string,
    policyName = "easiarr-web-bypass"
  ): Promise<{ id: string }> {
    const accountId = await this.getAccountId()

    const existing = await this.cfRequest<Array<{ id: string; name: string }>>(
      "GET",
      `/accounts/${accountId}/access/apps/${appId}/policies`
    )

    const existingPolicy = existing.result.find((p) => p.name === policyName)
    if (existingPolicy) {
      return { id: existingPolicy.id }
    }

    const response = await this.cfRequest<{ id: string }>(
      "POST",
      `/accounts/${accountId}/access/apps/${appId}/policies`,
      {
        name: policyName,
        decision: "bypass",
        include: [{ ip: { ip: bypassIp } }],
        precedence: existing.result.length + 1,
      }
    )

    return response.result
  }

  async setupAccessProtection(
    domain: string,
    allowedEmails: string[],
    appName = "easiarr",
    bypassIp?: string
  ): Promise<{ appId: string; policyId: string; bypassPolicyId?: string }> {
    const app = await this.createAccessApplication(domain, appName)
    const policy = await this.createAccessPolicy(app.id, allowedEmails, "easiarr-web-allow")

    let bypassPolicyId: string | undefined
    if (bypassIp) {
      const bypassPolicy = await this.createBypassPolicy(app.id, bypassIp, "easiarr-web-bypass")
      bypassPolicyId = bypassPolicy.id
    }

    return { appId: app.id, policyId: policy.id, bypassPolicyId }
  }

  // ==================== WARP Device Enrollment API ====================

  async getDeviceEnrollmentApp(): Promise<{ id: string; name: string } | null> {
    const accountId = await this.getAccountId()
    const apps = await this.cfRequest<Array<{ id: string; name: string; type: string }>>(
      "GET",
      `/accounts/${accountId}/access/apps`
    )
    return apps.result.find((a) => a.type === "warp") || null
  }

  async setupDeviceEnrollment(
    allowedEmails: string[],
    privateNetworkCidr?: string
  ): Promise<{ appId: string; allowPolicyId: string; bypassPolicyId?: string }> {
    const accountId = await this.getAccountId()

    let warpApp = await this.getDeviceEnrollmentApp()

    if (!warpApp) {
      const response = await this.cfRequest<{ id: string; name: string }>(
        "POST",
        `/accounts/${accountId}/access/apps`,
        { type: "warp", name: "Device Enrollment", session_duration: "24h" }
      )
      warpApp = response.result
    }

    const existingPolicies = await this.cfRequest<Array<{ id: string; name: string }>>(
      "GET",
      `/accounts/${accountId}/access/apps/${warpApp.id}/policies`
    )

    let allowPolicyId: string
    let bypassPolicyId: string | undefined

    const allowPolicyName = "easiarr-vpn-allow"
    const existingAllow = existingPolicies.result.find((p) => p.name === allowPolicyName)
    if (existingAllow) {
      allowPolicyId = existingAllow.id
    } else {
      const policy = await this.cfRequest<{ id: string }>(
        "POST",
        `/accounts/${accountId}/access/apps/${warpApp.id}/policies`,
        {
          name: allowPolicyName,
          decision: "allow",
          include: allowedEmails.map((email) => ({ email: { email } })),
          precedence: existingPolicies.result.length + 1,
        }
      )
      allowPolicyId = policy.result.id
    }

    if (privateNetworkCidr) {
      const bypassPolicyName = "easiarr-vpn-bypass"
      const existingBypass = existingPolicies.result.find((p) => p.name === bypassPolicyName)
      if (existingBypass) {
        bypassPolicyId = existingBypass.id
      } else {
        const bypassPolicy = await this.cfRequest<{ id: string }>(
          "POST",
          `/accounts/${accountId}/access/apps/${warpApp.id}/policies`,
          {
            name: bypassPolicyName,
            decision: "bypass",
            include: [{ ip: { ip: privateNetworkCidr } }],
            precedence: existingPolicies.result.length + 2,
          }
        )
        bypassPolicyId = bypassPolicy.result.id
      }
    }

    return { appId: warpApp.id, allowPolicyId, bypassPolicyId }
  }
}

/**
 * Helper to create a fully configured tunnel with DNS
 */
export async function setupCloudflaredTunnel(
  apiToken: string,
  domain: string,
  tunnelName = "easiarr",
  warpRouting = false
): Promise<{ tunnelToken: string; tunnelId: string; accountId: string }> {
  const api = new CloudflareApi(apiToken)

  const accountId = await api.getAccountId()

  let tunnel = await api.getTunnelByName(tunnelName)
  let tunnelToken: string

  if (tunnel) {
    tunnelToken = await api.getTunnelToken(tunnel.id)
  } else {
    const result = await api.createTunnel(tunnelName)
    tunnel = result.tunnel
    tunnelToken = await api.getTunnelToken(tunnel.id)
  }

  await api.configureTunnel(
    tunnel.id,
    [
      {
        hostname: `*.${domain}`,
        service: "http://traefik:80",
        originRequest: {},
      },
    ],
    warpRouting
  )

  const zoneId = await api.getZoneId(domain)
  await api.createDnsRecord(zoneId, `*.${domain}`, tunnel.id)

  return {
    tunnelToken,
    tunnelId: tunnel.id,
    accountId,
  }
}
