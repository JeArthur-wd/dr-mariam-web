import os from 'node:os'

// The browser always talks to this site; Next forwards /api and /media to Django.
// That keeps a phone on the same Wi-Fi (the door scanner) working without
// reaching the Django port directly, and avoids mixed content under HTTPS.
const backendUrl = (process.env.BACKEND_URL || 'http://127.0.0.1:8001').replace(/\/$/, '')

// Skip virtual adapters (VirtualBox, VMware, WSL, Docker) that phones cannot reach, and prefer Wi-Fi.
const VIRTUAL_ADAPTER = /vethernet|wsl|virtualbox|vmware|hyper-v|docker|^br-|^veth/i
const VIRTUAL_MAC = /^(0a:00:27|00:50:56|00:0c:29|00:15:5d)/i
const lanAddresses = Object.entries(os.networkInterfaces())
  .flatMap(([name, addresses]) => (addresses ?? []).map((address) => ({ name, ...address })))
  .filter((address) => address.family === 'IPv4' && !address.internal && !VIRTUAL_ADAPTER.test(address.name) && !VIRTUAL_MAC.test(address.mac))
  .sort((a, b) => Number(/wi-?fi|wlan|wireless/i.test(b.name)) - Number(/wi-?fi|wlan|wireless/i.test(a.name)))
  .map((address) => address.address)
// LAN_HOST overrides the guess, e.g. LAN_HOST=192.168.1.6
const lanHost = process.env.LAN_HOST || lanAddresses[0] || ''

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  // Django routes end in a slash; keep it instead of redirecting it away.
  skipTrailingSlashRedirect: true,
  // Let phones on the local network load the dev server.
  allowedDevOrigins: [...new Set([lanHost, ...lanAddresses].filter(Boolean))],
  env: {
    // Used to turn a "localhost" check-in link into one a phone can open.
    NEXT_PUBLIC_LAN_HOST: lanHost,
  },
  async rewrites() {
    return [
      // ':path*' drops a trailing slash, which Django needs on POSTs, so match it explicitly first.
      { source: '/api/:path*/', destination: `${backendUrl}/api/:path*/` },
      { source: '/api/:path*', destination: `${backendUrl}/api/:path*` },
      { source: '/media/:path*', destination: `${backendUrl}/media/:path*` },
    ]
  },
}

export default nextConfig
