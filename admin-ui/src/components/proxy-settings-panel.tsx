import { useState, useEffect } from 'react'
import { Globe, Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useProxyConfig, useUpdateProxyConfig } from '@/hooks/use-credentials'
import { extractErrorMessage } from '@/lib/utils'

export function ProxySettingsPanel() {
  const { data, isLoading, error } = useProxyConfig()
  const updateMutation = useUpdateProxyConfig()

  const [enabled, setEnabled] = useState(false)
  const [url, setUrl] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [dirty, setDirty] = useState(false)

  // 从服务端数据初始化表单
  useEffect(() => {
    if (data) {
      setEnabled(data.enabled)
      setUrl(data.url || '')
      setUsername(data.username || '')
      setPassword('')
      setDirty(false)
    }
  }, [data])

  const handleFieldChange = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v)
    setDirty(true)
  }

  const handleSave = () => {
    updateMutation.mutate(
      {
        enabled,
        url: enabled ? url : null,
        username: enabled && username ? username : null,
        password: enabled && password ? password : null,
      },
      {
        onSuccess: () => {
          toast.success(enabled ? '代理配置已更新并生效' : '代理已禁用')
          setPassword('')
          setDirty(false)
        },
        onError: (err) => {
          toast.error(`保存失败: ${extractErrorMessage(err)}`)
        },
      }
    )
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">加载代理配置...</p>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-sm text-muted-foreground">代理配置不可用</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Globe className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-lg font-semibold">网络代理</h2>
        <Badge variant={enabled ? 'default' : 'secondary'} className="text-xs">
          {enabled ? '已启用' : '已禁用'}
        </Badge>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">代理配置</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 启用开关 */}
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">启用代理</label>
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              onClick={() => handleFieldChange(setEnabled)(!enabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                enabled ? 'bg-primary' : 'bg-muted'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  enabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* 代理地址 */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">代理地址</label>
            <input
              type="text"
              value={url}
              onChange={(e) => handleFieldChange(setUrl)(e.target.value)}
              disabled={!enabled}
              placeholder="http://127.0.0.1:7890"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
            <p className="text-xs text-muted-foreground">支持 http、https、socks5 协议</p>
          </div>

          {/* 认证信息 */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">用户名（可选）</label>
              <input
                type="text"
                value={username}
                onChange={(e) => handleFieldChange(setUsername)(e.target.value)}
                disabled={!enabled}
                placeholder="代理认证用户名"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                密码（可选）
                {data?.hasPassword && !password && (
                  <span className="text-xs text-muted-foreground ml-1">（已设置，留空保持不变）</span>
                )}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => handleFieldChange(setPassword)(e.target.value)}
                disabled={!enabled}
                placeholder={data?.hasPassword ? '••••••••' : '代理认证密码'}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
          </div>

          {/* 保存按钮 */}
          <div className="flex justify-end pt-2">
            <Button
              onClick={handleSave}
              disabled={updateMutation.isPending || !dirty}
              size="sm"
            >
              {updateMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-1" />
              )}
              保存并生效
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
