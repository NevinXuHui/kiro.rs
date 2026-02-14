import type { ServerConfig } from '@/types/server'

const SERVERS_KEY = 'kiro_servers'
const CURRENT_SERVER_KEY = 'kiro_current_server'

export const serverStorage = {
  getServers: (): ServerConfig[] => {
    const data = localStorage.getItem(SERVERS_KEY)
    return data ? JSON.parse(data) : []
  },

  setServers: (servers: ServerConfig[]) => {
    localStorage.setItem(SERVERS_KEY, JSON.stringify(servers))
  },

  addServer: (server: Omit<ServerConfig, 'id' | 'createdAt'>): ServerConfig => {
    const servers = serverStorage.getServers()
    const newServer: ServerConfig = {
      ...server,
      id: Date.now().toString(),
      createdAt: Date.now(),
    }
    servers.push(newServer)
    serverStorage.setServers(servers)
    return newServer
  },

  updateServer: (id: string, updates: Partial<Omit<ServerConfig, 'id' | 'createdAt'>>) => {
    const servers = serverStorage.getServers()
    const index = servers.findIndex(s => s.id === id)
    if (index !== -1) {
      servers[index] = { ...servers[index], ...updates }
      serverStorage.setServers(servers)
    }
  },

  deleteServer: (id: string) => {
    const servers = serverStorage.getServers()
    serverStorage.setServers(servers.filter(s => s.id !== id))
    if (serverStorage.getCurrentServerId() === id) {
      serverStorage.setCurrentServerId(null)
    }
  },

  getCurrentServerId: (): string | null => {
    return localStorage.getItem(CURRENT_SERVER_KEY)
  },

  setCurrentServerId: (id: string | null) => {
    if (id) {
      localStorage.setItem(CURRENT_SERVER_KEY, id)
    } else {
      localStorage.removeItem(CURRENT_SERVER_KEY)
    }
  },

  getCurrentServer: (): ServerConfig | null => {
    const id = serverStorage.getCurrentServerId()
    if (!id) return null
    return serverStorage.getServers().find(s => s.id === id) || null
  },
}
