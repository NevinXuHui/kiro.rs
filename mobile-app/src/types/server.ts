export interface ServerConfig {
  id: string
  name: string
  url: string
  apiKey: string
  createdAt: number
}

export interface ServerStatus {
  online: boolean
  latency?: number
  error?: string
}
