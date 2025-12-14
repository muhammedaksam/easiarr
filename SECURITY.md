# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability in easiarr, please report it responsibly:

1. **DO NOT** create a public GitHub issue for security vulnerabilities
2. Email security concerns to: info[at]muhammedaksam.com.tr
3. Include as much detail as possible:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Any suggested fixes (optional)

## Response Timeline

- **Acknowledgment**: Within 48 hours
- **Initial Assessment**: Within 7 days
- **Resolution Target**: Within 30 days for critical issues

## Security Best Practices for Users

### Environment Variables

easiarr stores sensitive information in `.env` files. Always:

- Never commit `.env` files to version control
- Set restrictive file permissions: `chmod 600 ~/.easiarr/.env`
- Use strong, unique passwords for each service
- Regularly rotate API keys and credentials

### Network Security

- Use Traefik with HTTPS when exposing services externally
- Consider using Cloudflare Tunnel for secure external access
- Enable authentication on all services (Global username/password)
- Use Cloudflare Access for additional protection when available

### Docker Security

- Keep Docker and container images updated
- Use the provided PUID/PGID settings to run containers as non-root
- Limit container capabilities where possible
- Mount volumes with minimal required permissions

## Scope

This security policy applies to:

- The easiarr npm package (@muhammedaksam/easiarr)
- Generated docker-compose.yml configurations
- Generated .env files and API keys
- The easiarr TUI application

## Out of Scope

- Third-party applications configured by easiarr (Radarr, Sonarr, etc.)
- Docker/Bun runtime vulnerabilities
- User misconfiguration after initial setup
