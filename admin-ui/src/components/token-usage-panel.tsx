import { BarChart3, RotateCcw, ArrowDownToLine, ArrowUpFromLine, Hash, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useTokenUsage, useResetTokenUsage } from '@/hooks/use-credentials'
import { formatNumber } from '@/lib/utils'

export function TokenUsagePanel() {
  const { data, isLoading, error } = useTokenUsage()
  const resetMutation = useResetTokenUsage()

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
  // 最近请求倒序（最新的在前）
  const recentRequests = [...data.recentRequests].reverse().slice(0, 50)

  return (
    <div className="space-y-4">
      {/* 标题栏 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Token 使用统计</h2>
          <Badge variant="secondary" className="text-xs">
            每 10s 刷新
          </Badge>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleReset}
          disabled={resetMutation.isPending || data.totalRequests === 0}
        >
          <RotateCcw className="h-4 w-4 mr-1" />
          重置统计
        </Button>
      </div>

      {/* 总计卡片 */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
              <Hash className="h-3.5 w-3.5" />
              总请求数
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(data.totalRequests)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
              <ArrowDownToLine className="h-3.5 w-3.5" />
              输入 Tokens
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{formatNumber(data.totalInputTokens)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
              <ArrowUpFromLine className="h-3.5 w-3.5" />
              输出 Tokens
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatNumber(data.totalOutputTokens)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              总 Tokens
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(totalTokens)}</div>
          </CardContent>
        </Card>
      </div>

      {/* 按模型分组 + 按凭据分组 并排 */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* 按模型分组 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">按模型分组</CardTitle>
          </CardHeader>
          <CardContent>
            {modelEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground">暂无数据</p>
            ) : (
              <div className="space-y-3">
                {modelEntries.map(([model, stats]) => (
                  <div key={model} className="flex items-center justify-between text-sm">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate" title={model}>{model}</div>
                      <div className="text-xs text-muted-foreground">
                        <span className="text-blue-600">{formatNumber(stats.inputTokens)} in</span>
                        {' / '}
                        <span className="text-green-600">{formatNumber(stats.outputTokens)} out</span>
                      </div>
                    </div>
                    <Badge variant="outline" className="ml-2 shrink-0">
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
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">按凭据分组</CardTitle>
          </CardHeader>
          <CardContent>
            {credentialEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground">暂无数据</p>
            ) : (
              <div className="space-y-3">
                {credentialEntries.map(([id, stats]) => (
                  <div key={id} className="flex items-center justify-between text-sm">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">凭据 #{id}</div>
                      <div className="text-xs text-muted-foreground">
                        <span className="text-blue-600">{formatNumber(stats.inputTokens)} in</span>
                        {' / '}
                        <span className="text-green-600">{formatNumber(stats.outputTokens)} out</span>
                      </div>
                    </div>
                    <Badge variant="outline" className="ml-2 shrink-0">
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
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">
            最近请求
            {recentRequests.length > 0 && (
              <span className="text-muted-foreground font-normal ml-2">
                （最近 {recentRequests.length} 条）
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recentRequests.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无请求记录</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-2 pr-4 font-medium">时间</th>
                    <th className="text-left py-2 pr-4 font-medium">模型</th>
                    <th className="text-right py-2 pr-4 font-medium">输入</th>
                    <th className="text-right py-2 pr-4 font-medium">输出</th>
                    <th className="text-right py-2 font-medium">凭据</th>
                  </tr>
                </thead>
                <tbody>
                  {recentRequests.map((req, idx) => {
                    const time = new Date(req.timestamp)
                    const timeStr = time.toLocaleTimeString('zh-CN', { hour12: false })
                    return (
                      <tr key={idx} className="border-b last:border-0">
                        <td className="py-2 pr-4 text-muted-foreground whitespace-nowrap">{timeStr}</td>
                        <td className="py-2 pr-4 truncate max-w-[200px]" title={req.model}>{req.model}</td>
                        <td className="py-2 pr-4 text-right text-blue-600">{formatNumber(req.inputTokens)}</td>
                        <td className="py-2 pr-4 text-right text-green-600">{formatNumber(req.outputTokens)}</td>
                        <td className="py-2 text-right">#{req.credentialId}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
