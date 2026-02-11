import { useState } from 'react'
import { BarChart3, RotateCcw, RefreshCw, ArrowDownToLine, ArrowUpFromLine, Hash, Loader2, ChevronLeft, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useTokenUsage, useResetTokenUsage, useApiKeys } from '@/hooks/use-credentials'
import { formatNumber } from '@/lib/utils'

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const
const PAGE_SIZE_KEY = 'kiro-admin-page-size'

function getStoredPageSize(): number {
  const v = Number(localStorage.getItem(PAGE_SIZE_KEY))
  return PAGE_SIZE_OPTIONS.includes(v as typeof PAGE_SIZE_OPTIONS[number]) ? v : 20
}

export function TokenUsagePanel() {
  const { data, isLoading, error, refetch, isFetching } = useTokenUsage()
  const { data: apiKeys } = useApiKeys()
  const resetMutation = useResetTokenUsage()
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(getStoredPageSize)

  // 创建 API Key ID 到标签的映射
  const apiKeyMap = new Map(apiKeys?.map(key => [key.id, key.label]) || [])

  const handleReset = () => {
    if (!confirm('确定要重置所有 Token 使用统计吗？此操作不可撤销。')) return
    resetMutation.mutate(undefined, {
      onSuccess: () => toast.success('Token 使用统计已重置'),
      onError: (err) => toast.error(`重置失败: ${(err as Error).message}`),
    })
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">加载 Token 统计...</p>
        </CardContent>
      </Card>
    )
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-sm text-muted-foreground">Token 统计不可用</p>
        </CardContent>
      </Card>
    )
  }

  const totalTokens = data.totalInputTokens + data.totalOutputTokens
  const modelEntries = Object.entries(data.byModel).sort((a, b) =>
    (b[1].inputTokens + b[1].outputTokens) - (a[1].inputTokens + a[1].outputTokens)
  )
  const credentialEntries = Object.entries(data.byCredential).sort((a, b) =>
    (b[1].inputTokens + b[1].outputTokens) - (a[1].inputTokens + a[1].outputTokens)
  )
  // 最近请求倒序（最新的在前），前端分页
  const allRequests = [...data.recentRequests].reverse()
  const totalPages = Math.max(1, Math.ceil(allRequests.length / pageSize))
  const safePage = Math.min(currentPage, totalPages)
  const recentRequests = allRequests.slice((safePage - 1) * pageSize, safePage * pageSize)

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* 标题栏 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Token 使用统计</h2>
          <Badge variant="secondary" className="text-xs">
            每 10s 刷新
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-8 text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${isFetching ? 'animate-spin' : ''}`} />
            刷新
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            disabled={resetMutation.isPending || data.totalRequests === 0}
            className="h-8 text-xs"
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1" />
            重置
          </Button>
        </div>
      </div>

      {/* 总计卡片 - 手机 2x2，桌面 4 列 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4">
        <Card>
          <CardHeader className="pb-1 sm:pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center gap-1">
              <Hash className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              总请求数
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
            <div className="text-xl sm:text-2xl font-bold">{formatNumber(data.totalRequests)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 sm:pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center gap-1">
              <ArrowDownToLine className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              输入 Tokens
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
            <div className="text-xl sm:text-2xl font-bold text-blue-600">{formatNumber(data.totalInputTokens)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 sm:pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center gap-1">
              <ArrowUpFromLine className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              输出 Tokens
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
            <div className="text-xl sm:text-2xl font-bold text-green-600">{formatNumber(data.totalOutputTokens)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 sm:pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">
              总 Tokens
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
            <div className="text-xl sm:text-2xl font-bold">{formatNumber(totalTokens)}</div>
          </CardContent>
        </Card>
      </div>

      {/* 按模型分组 + 按凭据分组 */}
      <div className="grid gap-2 sm:gap-4 md:grid-cols-2">
        {/* 按模型分组 */}
        <Card>
          <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6">
            <CardTitle className="text-xs sm:text-sm font-medium">按模型分组</CardTitle>
          </CardHeader>
          <CardContent className="px-3 sm:px-6">
            {modelEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground">暂无数据</p>
            ) : (
              <div className="space-y-2 sm:space-y-3">
                {modelEntries.map(([model, stats]) => (
                  <div key={model} className="flex items-center justify-between text-xs sm:text-sm">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate" title={model}>{model}</div>
                      <div className="text-[10px] sm:text-xs text-muted-foreground">
                        <span className="text-blue-600">{formatNumber(stats.inputTokens)} in</span>
                        {' / '}
                        <span className="text-green-600">{formatNumber(stats.outputTokens)} out</span>
                      </div>
                    </div>
                    <Badge variant="outline" className="ml-2 shrink-0 text-[10px] sm:text-xs">
                      {stats.requests} 次
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 按凭据分组 */}
        <Card>
          <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6">
            <CardTitle className="text-xs sm:text-sm font-medium">按凭据分组</CardTitle>
          </CardHeader>
          <CardContent className="px-3 sm:px-6">
            {credentialEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground">暂无数据</p>
            ) : (
              <div className="space-y-2 sm:space-y-3">
                {credentialEntries.map(([id, stats]) => (
                  <div key={id} className="flex items-center justify-between text-xs sm:text-sm">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">凭据 #{id}</div>
                      <div className="text-[10px] sm:text-xs text-muted-foreground">
                        <span className="text-blue-600">{formatNumber(stats.inputTokens)} in</span>
                        {' / '}
                        <span className="text-green-600">{formatNumber(stats.outputTokens)} out</span>
                      </div>
                    </div>
                    <Badge variant="outline" className="ml-2 shrink-0 text-[10px] sm:text-xs">
                      {stats.requests} 次
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 最近请求列表 */}
      <Card>
        <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6">
          <CardTitle className="text-xs sm:text-sm font-medium">
            最近请求
            {allRequests.length > 0 && (
              <span className="text-muted-foreground font-normal ml-1 sm:ml-2">
                （共 {allRequests.length} 条）
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 sm:px-6">
          {recentRequests.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无请求记录</p>
          ) : (
            <>
            <div className="overflow-x-auto max-w-full" style={{ WebkitOverflowScrolling: 'touch' }}>
              <table className="text-[11px] sm:text-sm sm:w-full">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-1 sm:py-1.5 pr-3 font-medium whitespace-nowrap">时间</th>
                    <th className="text-left py-1 sm:py-1.5 pr-3 font-medium whitespace-nowrap">模型</th>
                    <th className="text-right py-1 sm:py-1.5 pr-3 font-medium whitespace-nowrap">输入</th>
                    <th className="text-right py-1 sm:py-1.5 pr-3 font-medium whitespace-nowrap">输出</th>
                    <th className="text-center py-1 sm:py-1.5 pr-3 font-medium whitespace-nowrap">Key</th>
                    <th className="text-right py-1 sm:py-1.5 font-medium whitespace-nowrap">凭据</th>
                  </tr>
                </thead>
                <tbody>
                  {recentRequests.map((req, idx) => {
                    const time = new Date(req.timestamp)
                    const timeStr = time.toLocaleTimeString('zh-CN', { hour12: false })
                    const apiKeyLabel = req.apiKeyId ? apiKeyMap.get(req.apiKeyId) : null
                    return (
                      <tr key={idx} className="border-b last:border-0">
                        <td className="py-1 sm:py-1.5 pr-3 text-muted-foreground whitespace-nowrap">{timeStr}</td>
                        <td className="py-1 sm:py-1.5 pr-3 whitespace-nowrap" title={req.model}>{req.model}</td>
                        <td className="py-1 sm:py-1.5 pr-3 text-right text-blue-600 whitespace-nowrap">{formatNumber(req.inputTokens)}</td>
                        <td className="py-1 sm:py-1.5 pr-3 text-right text-green-600 whitespace-nowrap">{formatNumber(req.outputTokens)}</td>
                        <td className="py-1 sm:py-1.5 pr-3 text-center whitespace-nowrap">
                          {apiKeyLabel ? (
                            <Badge variant="secondary" className="text-[10px] sm:text-xs px-1 py-0">{apiKeyLabel}</Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="py-1 sm:py-1.5 text-right whitespace-nowrap">#{req.credentialId}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {/* 分页控件 */}
            {allRequests.length > 0 && (
              <div className="flex items-center justify-between pt-3 border-t mt-3">
                <span className="text-xs text-muted-foreground">
                  第 {(safePage - 1) * pageSize + 1}-{Math.min(safePage * pageSize, allRequests.length)} 条，共 {allRequests.length} 条
                </span>
                <div className="flex items-center gap-2">
                  <select
                    className="h-7 text-xs border rounded px-1 bg-background"
                    value={pageSize}
                    onChange={(e) => { const v = Number(e.target.value); setPageSize(v); setCurrentPage(1); localStorage.setItem(PAGE_SIZE_KEY, String(v)) }}
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
                      <span className="text-xs px-2">{safePage} / {totalPages}</span>
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
