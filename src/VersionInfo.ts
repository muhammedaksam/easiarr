import packageJson from "../package.json" with { type: "json" }

const pkg = packageJson

export const VersionInfo = {
  version: pkg.version,
  name: pkg.name,
  description: pkg.description,
  author: pkg.author,
}

export const getVersion = () => `v${VersionInfo.version}`
