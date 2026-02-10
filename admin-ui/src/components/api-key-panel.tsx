import { useState } from 'react'
import { Key, Plus, Pencil, Trash2, Copy, ChevronDown, ChevronUp, Shield, ShieldOff, Loader2, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { MultiSelect } from '@/components/ui/multi-select'
import { useApiKeys, useCreateApiKey, useUpdateApiKey, useDeleteApiKey, useTokenUsage } from '@/hooks/use-credentials'
import { extractErrorMessage, formatNumber } from '@/lib/utils'
import { SUPPORTED_MODELS } from '@/constants/models'
import type { ApiKeyEntryView } from '@/types/api'

export function ApiKeyPanel() {
  const [expanded, setExpanded] = useState(true)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingKey, setEditingKey] = useState<ApiKeyEntryView | null>(null)
  const [newKeyResult, setNewKeyResult] = useState<{ id: number; key: string } | null>(null)

  // 表单状态
  const [formLabel, setFormLabel] = useState('')
  const [formKey, setFormKey] = useState('')
  const [formReadOnly, setFormReadOnly] = useState(false)
  const [formAllowedModels, setFormAllowedModels] = useState<string[]>([])
  const [formDisabled, setFormDisabled] = useState(false)

  const { data: apiKeys, isLoading, error } = useApiKeys()
  const { data: tokenUsage } = useTokenUsage()
  const createMutation = useCreateApiKey()
  const updateMutation = useUpdateApiKey()
  const deleteMutation = useDeleteApiKey()

  // 重置表单
  const resetForm = () => {
    setFormLabel('')
    setFormKey('')
    setFormReadOnly(false)
    setFormAllowedModels([])
    setFormDisabled(false)
    setNewKeyResult(null)
  }

  // 打开创建对话框
  const openCreateDialog = () => {
    resetForm()
    setCreateDialogOpen(true)
  }

  // 打开编辑对话框
  const openEditDialog = (apiKey: ApiKeyEntryView) => {
    setEditingKey(apiKey)
    setFormLabel(apiKey.label)
    setFormReadOnly(apiKey.readOnly)
    setFormAllowedModels(apiKey.allowedModels || [])
    setFormDisabled(apiKey.disabled)
    setEditDialogOpen(true)
  }

  // 创建 API Key
  const handleCreate = () => {
    if (!formLabel.trim()) {
      toast.error('请输入标签')
      return
    }

    const allowedModels = formAllowedModels.length > 0 ? formAllowedModels : undefined

    createMutation.mutate(
      {
        label: formLabel.trim(),
        key: formKey.trim() || undefined,
        readOnly: formReadOnly,
        allowedModels,
      },
      {
        onSuccess: (res) => {
          toast.success('API Key 创建成功')
          setNewKeyResult({ id: res.id, key: res.key })
        },
        onError: (err) => {
          toast.error(`创建失败: ${extractErrorMessage(err)}`)
        },
      }
    )
  }

  // 更新 API Key
  const handleUpdate = () => {
    if (!editingKey) return
    if (!formLabel.trim()) {
      toast.error('请输入标签')
      return
    }

    const allowedModels = formAllowedModels.length > 0 ? formAllowedModels : null

    updateMutation.mutate(
      {
        id: editingKey.id,
        label: formLabel.trim(),
        readOnly: formReadOnly,
        allowedModels,
        disabled: formDisabled,
      },
      {
        onSuccess: () => {
          toast.success('API Key 更新成功')
          setEditDialogOpen(false)
          setEditingKey(null)
        },
        onError: (err) => {
          toast.error(`更新失败: ${extractErrorMessage(err)}`)
        },
      }
    )
  }

  // 切换禁用状态
  const handleToggleDisabled = (apiKey: ApiKeyEntryView) => {
    updateMutation.mutate(
      { id: apiKey.id, disabled: !apiKey.disabled },
      {
        onSuccess: () => {
          toast.success(apiKey.disabled ? '已启用' : '已禁用')
        },
        onError: (err) => {
          toast.error(`操作失败: ${extractErrorMessage(err)}`)
        },
      }
    )
  }

  // 删除 API Key
  const handleDelete = (apiKey: ApiKeyEntryView) => {
    if (!confirm(`确定要删除 API Key "${apiKey.label}" 吗？此操作无法撤销。`)) return

    deleteMutation.mutate(apiKey.id, {
      onSuccess: () => {
        toast.success('API Key 已删除')
      },
      onError: (err) => {
        toast.error(`删除失败: ${extractErrorMessage(err)}`)
      },
    })
  }

  // 复制到剪贴板
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success('已复制到剪贴板')
  }

  // 关闭创建对话框
  const closeCreateDialog = () => {
    setCreateDialogOpen(false)
    resetForm()
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">加载 API Key...</p>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-sm text-muted-foreground">API Key 管理不可用</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* 标题栏 */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 hover:opacity-80"
        >
          <Key className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">API Key 管理</h2>
          <Badge variant="secondary" className="text-xs">
            {apiKeys?.length || 0} 个
          </Badge>
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
        <Button size="sm" onClick={openCreateDialog}>
          <Plus className="h-4 w-4 mr-1" />
          添加 Key
        </Button>
      </div>

      {/* API Key 列表 */}
      {expanded && (
        <div className="space-y-3">
          {!apiKeys || apiKeys.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                暂无 API Key
              </CardContent>
            </Card>
          ) : (
            apiKeys.map((apiKey) => {
              // 获取该 API Key 的 token 使用统计
              const stats = tokenUsage?.byApiKey[apiKey.id.toString()]
              const totalTokens = stats ? stats.inputTokens + stats.outputTokens : 0

              return (
              <Card key={apiKey.id} className={apiKey.disabled ? 'opacity-60' : ''}>
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium">{apiKey.label}</span>
                        {apiKey.readOnly && (
                          <Badge variant="secondary" className="text-xs">只读</Badge>
                        )}
                        {apiKey.disabled && (
                          <Badge variant="destructive" className="text-xs">已禁用</Badge>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <code className="bg-muted px-1.5 py-0.5 rounded text-xs break-all">{apiKey.key}</code>
                          <span className="text-xs whitespace-nowrap">({apiKey.keyLength} 字符)</span>
                        </div>
                        {apiKey.allowedModels && apiKey.allowedModels.length > 0 && (
                          <div className="text-xs break-words">
                            模型白名单: {apiKey.allowedModels.join(', ')}
                          </div>
                        )}
                        {stats && (
                          <div className="flex items-center gap-2 sm:gap-3 text-xs flex-wrap">
                            <div className="flex items-center gap-1">
                              <ArrowDownToLine className="h-3 w-3 text-blue-600" />
                              <span className="text-blue-600">{formatNumber(stats.inputTokens)}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <ArrowUpFromLine className="h-3 w-3 text-green-600" />
                              <span className="text-green-600">{formatNumber(stats.outputTokens)}</span>
                            </div>
                            <span className="whitespace-nowrap">总计: {formatNumber(totalTokens)} tokens</span>
                            <span className="whitespace-nowrap">({stats.requests} 次)</span>
                          </div>
                        )}
                        <div className="text-xs">
                          创建于: {new Date(apiKey.createdAt).toLocaleString('zh-CN')}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleToggleDisabled(apiKey)}
                        title={apiKey.disabled ? '启用' : '禁用'}
                      >
                        {apiKey.disabled ? (
                          <Shield className="h-4 w-4" />
                        ) : (
                          <ShieldOff className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditDialog(apiKey)}
                        title="编辑"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(apiKey)}
                        title="删除"
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
            })
          )}
        </div>
      )}

      {/* 创建对话框 */}
      <Dialog open={createDialogOpen} onOpenChange={closeCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加 API Key</DialogTitle>
          </DialogHeader>
          {newKeyResult ? (
            <div className="space-y-4">
              <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
                <p className="text-sm font-medium text-green-800 dark:text-green-200 mb-2">
                  API Key 创建成功
                </p>
                <p className="text-xs text-green-600 dark:text-green-400 mb-3">
                  请保存此 Key，之后将无法查看完整值
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-white dark:bg-gray-900 px-3 py-2 rounded border text-sm font-mono break-all">
                    {newKeyResult.key}
                  </code>
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => copyToClipboard(newKeyResult.key)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={closeCreateDialog}>完成</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">标签 *</label>
                <Input
                  value={formLabel}
                  onChange={(e) => setFormLabel(e.target.value)}
                  placeholder="例如: Claude Code"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Key（可选，留空自动生成）</label>
                <Input
                  value={formKey}
                  onChange={(e) => setFormKey(e.target.value)}
                  placeholder="sk-ant-..."
                />
              </div>
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">只读模式</label>
                <Switch checked={formReadOnly} onCheckedChange={setFormReadOnly} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">模型白名单（可选）</label>
                <MultiSelect
                  options={SUPPORTED_MODELS}
                  value={formAllowedModels}
                  onChange={setFormAllowedModels}
                  placeholder="选择允许的模型..."
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={closeCreateDialog}>
                  取消
                </Button>
                <Button onClick={handleCreate} disabled={createMutation.isPending}>
                  {createMutation.isPending ? '创建中...' : '创建'}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 编辑对话框 */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑 API Key</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">标签 *</label>
              <Input
                value={formLabel}
                onChange={(e) => setFormLabel(e.target.value)}
                placeholder="例如: Claude Code"
              />
            </div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">只读模式</label>
              <Switch checked={formReadOnly} onCheckedChange={setFormReadOnly} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">模型白名单（可选）</label>
              <MultiSelect
                options={SUPPORTED_MODELS}
                value={formAllowedModels}
                onChange={setFormAllowedModels}
                placeholder="选择允许的模型..."
              />
            </div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">禁用</label>
              <Switch checked={formDisabled} onCheckedChange={setFormDisabled} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                取消
              </Button>
              <Button onClick={handleUpdate} disabled={updateMutation.isPending}>
                {updateMutation.isPending ? '保存中...' : '保存'}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
