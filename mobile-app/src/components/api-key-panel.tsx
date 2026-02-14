import { useState } from 'react'
import { RefreshCw, Plus, Trash2, Key, Copy, Check } from 'lucide-react'
import { useApiKeys, useDeleteApiKey, useCreateApiKey } from '@/hooks/use-credentials'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'

export function ApiKeyPanel() {
  const { data, isLoading, refetch } = useApiKeys()
  const deleteApiKey = useDeleteApiKey()
  const createApiKey = useCreateApiKey()
  const [showCreate, setShowCreate] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [copiedId, setCopiedId] = useState<number | null>(null)

  const handleDelete = (id: number) => {
    if (confirm('确定删除此 API Key？')) {
      deleteApiKey.mutate(id, {
        onSuccess: (res) => toast.success(res.message),
        onError: (err) => toast.error('删除失败: ' + (err as Error).message),
      })
    }
  }

  const handleCreate = () => {
    if (!newLabel.trim()) {
      toast.error('请输入名称')
      return
    }
    createApiKey.mutate({ label: newLabel.trim() }, {
      onSuccess: (res) => {
        toast.success(res.message || '创建成功')
        setNewLabel('')
        setShowCreate(false)
      },
      onError: (err) => toast.error('创建失败: ' + (err as Error).message),
    })
  }

  const handleCopy = (key: string, id: number) => {
    navigator.clipboard.writeText(key).then(() => {
      setCopiedId(id)
      toast.success('已复制')
      setTimeout(() => setCopiedId(null), 2000)
    })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex gap-2">
        <Button onClick={() => refetch()} size="sm" variant="outline" className="flex-1">
          <RefreshCw className="w-4 h-4 mr-2" />
          刷新
        </Button>
        <Button size="sm" className="flex-1" onClick={() => setShowCreate(!showCreate)}>
          <Plus className="w-4 h-4 mr-2" />
          创建 API Key
        </Button>
      </div>

      {showCreate && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <Input
              placeholder="API Key 名称"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
            />
            <div className="flex gap-2">
              <Button size="sm" className="flex-1" onClick={handleCreate} disabled={createApiKey.isPending}>
                {createApiKey.isPending ? '创建中...' : '确认创建'}
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setShowCreate(false); setNewLabel('') }}>
                取消
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {data?.map(apiKey => (
          <Card key={apiKey.id}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-gray-900 dark:text-white">
                      {apiKey.label}
                    </span>
                    {apiKey.readOnly && (
                      <Badge variant="secondary" className="text-xs">只读</Badge>
                    )}
                    {apiKey.disabled && (
                      <Badge variant="secondary" className="text-xs">已禁用</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="text-sm text-gray-600 dark:text-gray-400 font-mono truncate">
                      {apiKey.key}
                    </div>
                    <button onClick={() => handleCopy(apiKey.key, apiKey.id)} className="shrink-0 p-1">
                      {copiedId === apiKey.id ? (
                        <Check className="w-3.5 h-3.5 text-green-500" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 text-gray-400" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {apiKey.allowedModels && apiKey.allowedModels.length > 0 && (
                <div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">允许的模型</div>
                  <div className="flex flex-wrap gap-1">
                    {apiKey.allowedModels.map(model => (
                      <Badge key={model} variant="outline" className="text-xs">{model}</Badge>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between">
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  创建于 {new Date(apiKey.createdAt).toLocaleString('zh-CN')}
                </div>
                <Button size="sm" variant="outline" onClick={() => handleDelete(apiKey.id)}>
                  <Trash2 className="w-4 h-4 text-red-500" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {data?.length === 0 && !showCreate && (
        <Card>
          <CardContent className="py-12 text-center">
            <Key className="w-12 h-12 mx-auto text-gray-400 mb-4" />
            <p className="text-gray-500 dark:text-gray-400">还没有 API Key</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
