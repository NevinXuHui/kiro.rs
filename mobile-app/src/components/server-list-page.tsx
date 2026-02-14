import { useState, useEffect } from 'react'
import { Plus, Server, Trash2, Edit2, X } from 'lucide-react'
import { serverStorage } from '@/lib/server-storage'
import { testServerConnection } from '@/api/client'
import type { ServerConfig, ServerStatus } from '@/types/server'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { toast } from 'sonner'

interface ServerListPageProps {
  onSelectServer: (serverId: string) => void
}

export function ServerListPage({ onSelectServer }: ServerListPageProps) {
  const [servers, setServers] = useState<ServerConfig[]>([])
  const [serverStatuses, setServerStatuses] = useState<Map<string, ServerStatus>>(new Map())
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  useEffect(() => {
    loadServers()
  }, [])

  const loadServers = () => {
    const loaded = serverStorage.getServers()
    setServers(loaded)
    loaded.forEach(server => checkServerStatus(server))
  }

  const checkServerStatus = async (server: ServerConfig) => {
    const start = Date.now()
    const result = await testServerConnection(server.url, server.apiKey)
    const latency = Date.now() - start
    
    setServerStatuses(prev => new Map(prev).set(server.id, {
      online: result.ok,
      latency: result.ok ? latency : undefined,
      error: result.error,
    }))
  }

  const handleAddServer = () => {
    setShowAddDialog(true)
  }

  const handleSelectServer = (serverId: string) => {
    serverStorage.setCurrentServerId(serverId)
    onSelectServer(serverId)
  }

  const handleDeleteServer = (id: string) => {
    if (confirm('确定删除此服务器？')) {
      serverStorage.deleteServer(id)
      loadServers()
      toast.success('服务器已删除')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">服务器列表</h1>
          <Button onClick={handleAddServer} size="sm">
            <Plus className="w-4 h-4 mr-1" />
            添加
          </Button>
        </div>

        {servers.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Server className="w-12 h-12 mx-auto text-gray-400 mb-4" />
              <p className="text-gray-500 dark:text-gray-400 mb-4">还没有添加服务器</p>
              <Button onClick={handleAddServer}>
                <Plus className="w-4 h-4 mr-2" />
                添加第一个服务器
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {servers.map(server => {
              const status = serverStatuses.get(server.id)
              return (
                <Card
                  key={server.id}
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => handleSelectServer(server.id)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                            {server.name}
                          </h3>
                          {status && (
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                status.online
                                  ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                                  : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                              }`}
                            >
                              {status.online ? '在线' : '离线'}
                              {status.latency && ` ${status.latency}ms`}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                          {server.url}
                        </p>
                        {status?.error && (
                          <p className="text-xs text-red-500 mt-1">{status.error}</p>
                        )}
                      </div>
                      <div className="flex gap-2 ml-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            setEditingId(server.id)
                          }}
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteServer(server.id)
                          }}
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {showAddDialog && (
        <AddServerDialog
          onClose={() => setShowAddDialog(false)}
          onSuccess={() => {
            setShowAddDialog(false)
            loadServers()
          }}
        />
      )}

      {editingId && (
        <EditServerDialog
          serverId={editingId}
          onClose={() => setEditingId(null)}
          onSuccess={() => {
            setEditingId(null)
            loadServers()
          }}
        />
      )}
    </div>
  )
}

function AddServerDialog({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [testing, setTesting] = useState(false)

  const handleSubmit = async () => {
    if (!name || !url || !apiKey) {
      toast.error('请填写完整信息')
      return
    }

    setTesting(true)
    const result = await testServerConnection(url, apiKey)
    setTesting(false)

    if (!result.ok) {
      toast.error(`连接失败: ${result.error}`)
      return
    }

    serverStorage.addServer({ name, url, apiKey })
    toast.success('服务器添加成功')
    onSuccess()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <Card className="w-full max-w-md">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold">添加服务器</h2>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">名称</label>
              <Input
                placeholder="我的服务器"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">地址</label>
              <Input
                placeholder="http://192.168.1.100:8990"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Admin API Key</label>
              <Input
                type="password"
                placeholder="sk-admin..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </div>
          </div>

          <div className="flex gap-2 pt-4">
            <Button variant="outline" onClick={onClose} className="flex-1">
              取消
            </Button>
            <Button onClick={handleSubmit} disabled={testing} className="flex-1">
              {testing ? '测试中...' : '添加'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function EditServerDialog({
  serverId,
  onClose,
  onSuccess,
}: {
  serverId: string
  onClose: () => void
  onSuccess: () => void
}) {
  const server = serverStorage.getServers().find(s => s.id === serverId)
  const [name, setName] = useState(server?.name || '')
  const [url, setUrl] = useState(server?.url || '')
  const [apiKey, setApiKey] = useState(server?.apiKey || '')
  const [testing, setTesting] = useState(false)

  if (!server) {
    onClose()
    return null
  }

  const handleSubmit = async () => {
    if (!name || !url || !apiKey) {
      toast.error('请填写完整信息')
      return
    }

    setTesting(true)
    const result = await testServerConnection(url, apiKey)
    setTesting(false)

    if (!result.ok) {
      toast.error(`连接失败: ${result.error}`)
      return
    }

    serverStorage.updateServer(serverId, { name, url, apiKey })
    toast.success('服务器更新成功')
    onSuccess()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <Card className="w-full max-w-md">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold">编辑服务器</h2>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">名称</label>
              <Input
                placeholder="我的服务器"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">地址</label>
              <Input
                placeholder="http://192.168.1.100:8990"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Admin API Key</label>
              <Input
                type="password"
                placeholder="sk-admin..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </div>
          </div>

          <div className="flex gap-2 pt-4">
            <Button variant="outline" onClick={onClose} className="flex-1">
              取消
            </Button>
            <Button onClick={handleSubmit} disabled={testing} className="flex-1">
              {testing ? '测试中...' : '保存'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
