import { useState } from 'react'
import { RefreshCw, Trash2, ChevronLeft, ChevronRight } from 'lucide-react'
import { useTokenUsage, useResetTokenUsage, useApiKeys } from '@/hooks/use-credentials'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatNumber } from '@/lib/utils'
import { toast } from 'sonner'

const PAGE_SIZE_OPTIONS = [10, 20, 50] as const
const PAGE_SIZE_KEY = 'kiro-mobile-page-size'

function getStoredPageSize(): number {
  const v = Number(localStorage.getItem(PAGE_SIZE_KEY))
  return PAGE_SIZE_OPTIONS.includes(v as typeof PAGE_SIZE_OPTIONS[number]) ? v : 20
}

export function TokenUsagePanel() {
  const { data, isLoading, refetch } = useTokenUsage()
  const { data: apiKeys } = useApiKeys()
  const resetUsage = useResetTokenUsage()
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(getStoredPageSize)

  // API Key ID -> 标签映射
  const apiKeyMap = new Map(apiKeys?.map(key => [key.id, key.label]) || [])

  const handleReset = () => {
    if (confirm('确定重置所有 Token 使用统计？')) {
      resetUsage.mutate(undefined, {
        onSuccess: (res) => toast.success(res.message),
        onError: (err) => toast.error('重置失败: ' + (err as Error).message),
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

  // 最近请求倒序，前端分页
  const allRequests = data ? [...data.recentRequests].reverse() : []
  const totalPages = Math.max(1, Math.ceil(allRequests.length / pageSize))
  const safePage = Math.min(currentPage, totalPages)
  const recentRequests = allRequests.slice((safePage - 1) * pageSize, safePage * pageSize)

  return (
    <div className="p-4 space-y-4">
      {/* 总览卡片 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">总览</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-400">总请求数</span>
            <span className="text-lg font-semibold text-gray-900 dark:text-white">
              {formatNumber(data?.totalRequests || 0)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-400">输入 Token</span>
            <span className="text-lg font-semibold text-blue-600">
              {formatNumber(data?.totalInputTokens || 0)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-400">输出 Token</span>
            <span className="text-lg font-semibold text-green-600">
              {formatNumber(data?.totalOutputTokens || 0)}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* 操作按钮 */}
      <div className="flex gap-2">
        <Button onClick={() => refetch()} size="sm" variant="outline" className="flex-1">
          <RefreshCw className="w-4 h-4 mr-2" />
          刷新
        </Button>
        <Button onClick={handleReset} size="sm" variant="outline" className="flex-1">
          <Trash2 className="w-4 h-4 mr-2" />
          重置统计
        </Button>
      </div>

      {/* 按凭据统计 */}
      {data && Object.keys(data.byCredential).length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">按凭据统计</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(data.byCredential).map(([credId, stats]) => (
              <div key={credId} className="border-b border-gray-200 dark:border-gray-700 last:border-0 pb-3 last:pb-0">
                <div className="font-medium text-gray-900 dark:text-white mb-2">
                  凭据 #{credId}
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <div className="text-gray-500 dark:text-gray-400">请求</div>
                    <div className="font-medium text-gray-900 dark:text-white">
                      {stats.requests}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-500 dark:text-gray-400">输入</div>
                    <div className="font-medium text-blue-600">
                      {formatNumber(stats.inputTokens)}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-500 dark:text-gray-400">输出</div>
                    <div className="font-medium text-green-600">
                      {formatNumber(stats.outputTokens)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* 按模型统计 */}
      {data && Object.keys(data.byModel).length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">按模型统计</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(data.byModel).map(([model, stats]) => (
              <div key={model} className="border-b border-gray-200 dark:border-gray-700 last:border-0 pb-3 last:pb-0">
                <div className="font-medium text-gray-900 dark:text-white mb-2 text-sm">
                  {model}
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <div className="text-gray-500 dark:text-gray-400">请求</div>
                    <div className="font-medium text-gray-900 dark:text-white">
                      {stats.requests}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-500 dark:text-gray-400">输入</div>
                    <div className="font-medium text-blue-600">
                      {formatNumber(stats.inputTokens)}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-500 dark:text-gray-400">输出</div>
                    <div className="font-medium text-green-600">
                      {formatNumber(stats.outputTokens)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* 最近请求历史 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">
            最近请求
            {allRequests.length > 0 && (
              <span className="text-sm font-normal text-gray-500 dark:text-gray-400 ml-2">
                （共 {allRequests.length} 条）
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recentRequests.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">暂无请求记录</p>
          ) : (
            <>
              <div className="space-y-3">
                {recentRequests.map((req, idx) => {
                  const time = new Date(req.timestamp)
                  const timeStr = time.toLocaleString('zh-CN', {
                    month: '2-digit', day: '2-digit',
                    hour: '2-digit', minute: '2-digit', second: '2-digit',
                    hour12: false,
                  })
                  const apiKeyLabel = req.apiKeyId ? apiKeyMap.get(req.apiKeyId) : null
                  return (
                    <div key={idx} className="border-b border-gray-200 dark:border-gray-700 last:border-0 pb-3 last:pb-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-gray-500 dark:text-gray-400">{timeStr}</span>
                        <div className="flex items-center gap-2">
                          {apiKeyLabel && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{apiKeyLabel}</Badge>
                          )}
                          <span className="text-xs text-gray-500 dark:text-gray-400">#{req.credentialId}</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-900 dark:text-white truncate mr-2">{req.model}</span>
                        <div className="flex gap-3 text-xs shrink-0">
                          <span className="text-blue-600">{formatNumber(req.inputTokens)} in</span>
                          <span className="text-green-600">{formatNumber(req.outputTokens)} out</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* 分页控件 */}
              {allRequests.length > 0 && (
                <div className="flex items-center justify-between pt-3 border-t border-gray-200 dark:border-gray-700 mt-3">
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {(safePage - 1) * pageSize + 1}-{Math.min(safePage * pageSize, allRequests.length)} / {allRequests.length}
                  </span>
                  <div className="flex items-center gap-2">
                    <select
                      className="h-7 text-xs border rounded px-1 bg-white dark:bg-gray-800 dark:border-gray-600"
                      value={pageSize}
                      onChange={(e) => {
                        const v = Number(e.target.value)
                        setPageSize(v)
                        setCurrentPage(1)
                        localStorage.setItem(PAGE_SIZE_KEY, String(v))
                      }}
                    >
                      {PAGE_SIZE_OPTIONS.map(n => (
                        <option key={n} value={n}>{n} 条/页</option>
                      ))}
                    </select>
                    {totalPages > 1 && (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 w-7 p-0"
                          disabled={safePage <= 1}
                          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        >
                          <ChevronLeft className="h-3.5 w-3.5" />
                        </Button>
                        <span className="text-xs px-1">{safePage}/{totalPages}</span>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 w-7 p-0"
                          disabled={safePage >= totalPages}
                          onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        >
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}