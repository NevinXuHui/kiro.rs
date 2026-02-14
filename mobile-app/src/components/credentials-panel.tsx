import { useState } from 'react'
import { RefreshCw, Plus, Trash2, Wallet, AlertCircle } from 'lucide-react'
import { useCredentials, useSetDisabled, useSetPrimary, useDeleteCredential, useResetFailure, useAddCredential } from '@/hooks/use-credentials'
import { getCredentialBalance } from '@/api/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import type { BalanceResponse } from '@/types/api'

export function CredentialsPanel() {
  const { data, isLoading, refetch } = useCredentials()
  const setDisabled = useSetDisabled()
  const setPrimary = useSetPrimary()
  const deleteCredential = useDeleteCredential()
  const resetFailure = useResetFailure()
  const addCredential = useAddCredential()
  const [balanceMap, setBalanceMap] = useState<Map<number, BalanceResponse>>(new Map())
  const [loadingBalanceIds, setLoadingBalanceIds] = useState<Set<number>>(new Set())
  const [refreshing, setRefreshing] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [newToken, setNewToken] = useState('')
  const [newAuthMethod, setNewAuthMethod] = useState<'idc' | 'social'>('idc')

  const handleRefresh = async () => {
    setRefreshing(true)
    await refetch()
    setRefreshing(false)
  }

  const handleAddCredential = () => {
    if (!newToken.trim()) {
      toast.error('请输入 Refresh Token')
      return
    }
    addCredential.mutate(
      { refreshToken: newToken.trim(), authMethod: newAuthMethod },
      {
        onSuccess: (res) => {
          toast.success(res.message || '添加成功')
          setNewToken('')
          setShowAdd(false)
        },
        onError: (err) => toast.error('添加失败: ' + (err as Error).message),
      }
    )
  }

  const handleToggleDisabled = (id: number, disabled: boolean) => {
    setDisabled.mutate(
      { id, disabled: !disabled },
      {
        onSuccess: (res) => toast.success(res.message),
        onError: (err) => toast.error('操作失败: ' + (err as Error).message),
      }
    )
  }

  const handleSetPrimary = (id: number) => {
    setPrimary.mutate(id, {
      onSuccess: (res) => toast.success(res.message),
      onError: (err) => toast.error('操作失败: ' + (err as Error).message),
    })
  }

  const handleReset = (id: number) => {
    resetFailure.mutate(id, {
      onSuccess: (res) => toast.success(res.message),
      onError: (err) => toast.error('操作失败: ' + (err as Error).message),
    })
  }

  const handleDelete = (id: number, disabled: boolean) => {
    if (!disabled) {
      toast.error('请先禁用凭据再删除')
      return
    }
    if (confirm('确定删除此凭据？')) {
      deleteCredential.mutate(id, {
        onSuccess: (res) => toast.success(res.message),
        onError: (err) => toast.error('删除失败: ' + (err as Error).message),
      })
    }
  }

  const handleViewBalance = async (id: number) => {
    if (loadingBalanceIds.has(id)) return
    
    setLoadingBalanceIds(prev => new Set(prev).add(id))
    try {
      const balance = await getCredentialBalance(id)
      setBalanceMap(prev => new Map(prev).set(id, balance))
      toast.success('余额查询成功')
    } catch (error: any) {
      toast.error('查询失败: ' + (error.message || '未知错误'))
    } finally {
      setLoadingBalanceIds(prev => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
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
      {/* 统计卡片 */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {data?.available || 0}
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">可用凭据</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {data?.total || 0}
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">总凭据数</div>
          </CardContent>
        </Card>
      </div>

      {/* 操作按钮 */}
      <div className="flex gap-2">
        <Button onClick={handleRefresh} disabled={refreshing} size="sm" variant="outline" className="flex-1">
          <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          刷新
        </Button>
        <Button size="sm" className="flex-1" onClick={() => setShowAdd(!showAdd)}>
          <Plus className="w-4 h-4 mr-2" />
          添加凭据
        </Button>
      </div>

      {showAdd && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <Input
              placeholder="Refresh Token"
              value={newToken}
              onChange={(e) => setNewToken(e.target.value)}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={newAuthMethod === 'idc' ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => setNewAuthMethod('idc')}
              >
                IDC
              </Button>
              <Button
                size="sm"
                variant={newAuthMethod === 'social' ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => setNewAuthMethod('social')}
              >
                Social
              </Button>
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="flex-1" onClick={handleAddCredential} disabled={addCredential.isPending}>
                {addCredential.isPending ? '添加中...' : '确认添加'}
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setShowAdd(false); setNewToken('') }}>
                取消
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 凭据列表 */}
      <div className="space-y-3">
        {data?.credentials.map(credential => {
          const balance = balanceMap.get(credential.id)
          const loadingBalance = loadingBalanceIds.has(credential.id)
          
          return (
            <Card
              key={credential.id}
              className={`${credential.isCurrent ? 'ring-2 ring-blue-500' : ''}`}
            >
              <CardContent className="p-4 space-y-3">
                {/* 头部 */}
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-gray-900 dark:text-white">
                        #{credential.id}
                      </span>
                      {credential.isCurrent && (
                        <Badge variant="default" className="text-xs">当前</Badge>
                      )}
                      {credential.disabled && (
                        <Badge variant="secondary" className="text-xs">已禁用</Badge>
                      )}
                    </div>
                    {credential.email && (
                      <div className="text-sm text-gray-600 dark:text-gray-400 truncate">
                        {credential.email}
                      </div>
                    )}
                  </div>
                  <Switch
                    checked={!credential.disabled}
                    onCheckedChange={() => handleToggleDisabled(credential.id, credential.disabled)}
                  />
                </div>

                {/* 统计信息 */}
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <div className="text-gray-500 dark:text-gray-400">优先级</div>
                    <div className="font-medium text-gray-900 dark:text-white">{credential.priority}</div>
                  </div>
                  <div>
                    <div className="text-gray-500 dark:text-gray-400">成功</div>
                    <div className="font-medium text-green-600">{credential.successCount}</div>
                  </div>
                  <div>
                    <div className="text-gray-500 dark:text-gray-400">失败</div>
                    <div className="font-medium text-red-600">{credential.failureCount}</div>
                  </div>
                </div>

                {/* 余额信息 */}
                {balance && (
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-400">剩余</span>
                      <span className="font-semibold text-gray-900 dark:text-white">
                        {balance.remaining.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-400">总额</span>
                      <span className="text-gray-900 dark:text-white">
                        {balance.usageLimit.toLocaleString()}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all"
                        style={{ width: `${Math.min(100, balance.usagePercentage)}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* 操作按钮 */}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleViewBalance(credential.id)}
                    disabled={loadingBalance}
                    className="flex-1"
                  >
                    <Wallet className="w-4 h-4 mr-1" />
                    {loadingBalance ? '查询中...' : '查余额'}
                  </Button>
                  {!credential.isCurrent && !credential.disabled && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleSetPrimary(credential.id)}
                      className="flex-1"
                    >
                      设为首选
                    </Button>
                  )}
                  {credential.failureCount > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleReset(credential.id)}
                    >
                      <RefreshCw className="w-4 h-4" />
                    </Button>
                  )}
                  {credential.disabled && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDelete(credential.id, credential.disabled)}
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {data?.credentials.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="w-12 h-12 mx-auto text-gray-400 mb-4" />
            <p className="text-gray-500 dark:text-gray-400">还没有凭据</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
