import { useState } from 'react'
import { BarChart3, RotateCcw, RefreshCw, ArrowDownToLine, ArrowUpFromLine, Hash, Loader2, ChevronLeft, ChevronRight, TrendingUp, List } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useTokenUsage, useResetTokenUsage, useApiKeys, useTokenUsageTimeseries } from '@/hooks/use-credentials'
import { formatNumber } from '@/lib/utils'
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const
const PAGE_SIZE_KEY = 'kiro-admin-page-size'

function getStoredPageSize(): number {
  const v = Number(localStorage.getItem(PAGE_SIZE_KEY))
  return PAGE_SIZE_OPTIONS.includes(v as typeof PAGE_SIZE_OPTIONS[number]) ? v : 20
}

// 时间格式化函数
function formatTimeKey(timeKey: string, granularity: 'hour' | 'day' | 'week'): string {
  const date = new Date(timeKey)
  if (granularity === 'hour') {
    return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
  } else if (granularity === 'day') {
    return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit' })
  } else {
    // 周：显示为 "02/10"
    return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit' })
  }
}

// 图表组件
function TokenUsageChart({ granularity }: { granularity: 'hour' | 'day' | 'week' }) {
  const { data, isLoading } = useTokenUsageTimeseries(granularity)

  if (isLoading) {
    return (
      <div className="h-[250px] sm:h-[350px] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!data || data.data.length === 0) {
    return (
      <div className="h-[250px] sm:h-[350px] flex flex-col items-center justify-center text-muted-foreground">
        <BarChart3 className="h-12 w-12 mb-2 opacity-20" />
        <p className="text-sm">暂无统计数据</p>
      </div>
    )
  }

  // 转换数据格式并倒序（最旧的在左边）
  const chartData = [...data.data].reverse().map(item => ({
    time: formatTimeKey(item.timeKey, granularity),
    fullTime: item.timeKey,
    inputTokens: item.inputTokens,
    outputTokens: item.outputTokens,
    requests: item.requests,
  }))

  return (
    <div className="space-y-4">
      <ResponsiveContainer width="100%" height={350}>
        <ComposedChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="inputGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(217 91% 60%)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="hsl(217 91% 60%)" stopOpacity={0.05} />
            </linearGradient>
            <linearGradient id="outputGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(142 71% 45%)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="hsl(142 71% 45%)" stopOpacity={0.05} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />

          <XAxis
            dataKey="time"
            stroke="hsl(var(--muted-foreground))"
            tick={{ fontSize: 11 }}
            tickMargin={8}
            angle={-45}
            textAnchor="end"
            height={60}
          />

          <YAxis
            yAxisId="tokens"
            stroke="hsl(var(--muted-foreground))"
            tick={{ fontSize: 11 }}
            tickFormatter={(value) => formatNumber(value)}
          />

          <YAxis
            yAxisId="requests"
            orientation="right"
            stroke="hsl(262 83% 58%)"
            tick={{ fontSize: 11 }}
          />

          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '0.5rem',
              fontSize: '12px',
            }}
            formatter={(value: number, name: string) => {
              if (name === '输入 Tokens' || name === '输出 Tokens') {
                return formatNumber(value)
              }
              return value
            }}
          />

          <Legend wrapperStyle={{ fontSize: '12px' }} iconType="line" />

          <Area
            yAxisId="tokens"
            type="monotone"
            dataKey="inputTokens"
            name="输入 Tokens"
            stroke="hsl(217 91% 60%)"
            fill="url(#inputGradient)"
            strokeWidth={2}
          />

          <Area
            yAxisId="tokens"
            type="monotone"
            dataKey="outputTokens"
            name="输出 Tokens"
            stroke="hsl(142 71% 45%)"
            fill="url(#outputGradient)"
            strokeWidth={2}
          />

          <Line
            yAxisId="requests"
            type="monotone"
            dataKey="requests"
            name="请求次数"
            stroke="hsl(262 83% 58%)"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        </ComposedChart>
      </ResponsiveContainer>

      {/* 数据表格 */}
      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto max-w-full" style={{ WebkitOverflowScrolling: 'touch' }}>
          <table className="text-xs sm:text-sm w-full">
            <thead className="bg-muted/50">
              <tr className="border-b">
                <th className="text-left py-2 px-3 font-medium whitespace-nowrap">时间</th>
                <th className="text-right py-2 px-3 font-medium whitespace-nowrap">输入 Tokens</th>
                <th className="text-right py-2 px-3 font-medium whitespace-nowrap">输出 Tokens</th>
                <th className="text-right py-2 px-3 font-medium whitespace-nowrap">总计</th>
                <th className="text-right py-2 px-3 font-medium whitespace-nowrap">请求次数</th>
              </tr>
            </thead>
            <tbody>
              {chartData.map((item, idx) => (
                <tr key={idx} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="py-2 px-3 text-muted-foreground whitespace-nowrap" title={item.fullTime}>
                    {item.time}
                  </td>
                  <td className="py-2 px-3 text-right text-blue-600 whitespace-nowrap">
                    {formatNumber(item.inputTokens)}
                  </td>
                  <td className="py-2 px-3 text-right text-green-600 whitespace-nowrap">
                    {formatNumber(item.outputTokens)}
                  </td>
                  <td className="py-2 px-3 text-right font-medium whitespace-nowrap">
                    {formatNumber(item.inputTokens + item.outputTokens)}
                  </td>
                  <td className="py-2 px-3 text-right text-purple-600 whitespace-nowrap">
                    {item.requests}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export function TokenUsagePanel() {
  const { data, isLoading, error, refetch, isFetching } = useTokenUsage()
  const { data: apiKeys } = useApiKeys()
  const resetMutation = useResetTokenUsage()
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(getStoredPageSize)
  const [timeDimension, setTimeDimension] = useState<'hour' | 'day' | 'week'>('day')
  const [activeSubTab, setActiveSubTab] = useState<'chart' | 'ranking' | 'requests'>('requests')

  // 创建 API Key ID 到标签的映射
  const apiKeyMap = new Map(apiKeys?.map(key => [key.id, key.label]) || [])

  // 为每个 API Key 分配颜色
  const keyColors = [
    'bg-blue-600',
    'bg-green-600',
    'bg-purple-600',
    'bg-orange-600',
    'bg-pink-600',
    'bg-cyan-600',
    'bg-yellow-600',
    'bg-red-600',
    'bg-indigo-600',
    'bg-teal-600',
  ]

  const getKeyColor = (keyId: number | undefined) => {
    if (!keyId) return 'bg-gray-600'
    const index = keyId % keyColors.length
    return keyColors[index]
  }

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
  const apiKeyEntries = Object.entries(data.byApiKey).sort((a, b) =>
    (b[1].inputTokens + b[1].outputTokens) - (a[1].inputTokens + a[1].outputTokens)
  )

  const allRequests = [...data.recentRequests].sort((a, b) => {
    const aTime = typeof a.timestamp === 'number' ? a.timestamp : new Date(a.timestamp).getTime()
    const bTime = typeof b.timestamp === 'number' ? b.timestamp : new Date(b.timestamp).getTime()
    return bTime - aTime
  })
  const totalPages = Math.ceil(allRequests.length / pageSize)
  const safePage = Math.max(1, Math.min(currentPage, totalPages || 1))
  const recentRequests = allRequests.slice((safePage - 1) * pageSize, safePage * pageSize)

  return (
    <div className="space-y-4">
      {/* 顶部操作栏 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h2 className="text-lg md:text-xl font-semibold">Token 使用统计</h2>
        <div className="flex gap-2">
          <Button
            onClick={() => refetch()}
            size="sm"
            variant="outline"
            disabled={isFetching}
            className="h-8 text-xs"
          >
            <RefreshCw className={`h-3 w-3 mr-1 ${isFetching ? 'animate-spin' : ''}`} />
            刷新
          </Button>
          <Button
            onClick={handleReset}
            size="sm"
            variant="outline"
            disabled={resetMutation.isPending}
            className="h-8 text-xs text-destructive hover:text-destructive"
          >
            <RotateCcw className="h-3 w-3 mr-1" />
            重置
          </Button>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
        <Card>
          <CardHeader className="pb-1 sm:pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center gap-1">
              <ArrowDownToLine className="h-3 w-3" />
              输入 Tokens
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
            <div className="text-xl sm:text-2xl font-bold text-blue-600">
              {formatNumber(data.totalInputTokens)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 sm:pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center gap-1">
              <ArrowUpFromLine className="h-3 w-3" />
              输出 Tokens
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
            <div className="text-xl sm:text-2xl font-bold text-green-600">
              {formatNumber(data.totalOutputTokens)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 sm:pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center gap-1">
              <Hash className="h-3 w-3" />
              总计
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
            <div className="text-xl sm:text-2xl font-bold">
              {formatNumber(totalTokens)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 sm:pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center gap-1">
              <BarChart3 className="h-3 w-3" />
              请求次数
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
            <div className="text-xl sm:text-2xl font-bold text-purple-600">
              {data.totalRequests}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 子标签页导航 */}
      <Tabs value={activeSubTab} onValueChange={(v) => setActiveSubTab(v as typeof activeSubTab)} className="space-y-4">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="requests" className="flex items-center gap-1">
            <List className="h-3 w-3" />
            <span className="hidden sm:inline">最近</span>请求
          </TabsTrigger>
          <TabsTrigger value="chart" className="flex items-center gap-1">
            <TrendingUp className="h-3 w-3" />
            <span className="hidden sm:inline">趋势</span>图表
          </TabsTrigger>
          <TabsTrigger value="ranking" className="flex items-center gap-1">
            <BarChart3 className="h-3 w-3" />
            <span className="hidden sm:inline">使用</span>排行
          </TabsTrigger>
        </TabsList>

        {/* 最近请求 */}
        <TabsContent value="requests">
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
                          <th className="text-right py-1 sm:py-1.5 pr-3 font-medium whitespace-nowrap">凭据</th>
                          <th className="text-left py-1 sm:py-1.5 font-medium whitespace-nowrap">IP</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recentRequests.map((req, idx) => {
                          const time = new Date(req.timestamp)
                          const timeStr = time.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
                          const apiKeyLabel = req.apiKeyId ? apiKeyMap.get(req.apiKeyId) : null
                          const keyColor = getKeyColor(req.apiKeyId)
                          return (
                            <tr key={idx} className="border-b last:border-0">
                              <td className="py-1 sm:py-1.5 pr-3 text-muted-foreground whitespace-nowrap">{timeStr}</td>
                              <td className="py-1 sm:py-1.5 pr-3 whitespace-nowrap" title={req.model}>{req.model}</td>
                              <td className="py-1 sm:py-1.5 pr-3 text-right text-blue-600 whitespace-nowrap">{formatNumber(req.inputTokens)}</td>
                              <td className="py-1 sm:py-1.5 pr-3 text-right text-green-600 whitespace-nowrap">{formatNumber(req.outputTokens)}</td>
                              <td className="py-1 sm:py-1.5 pr-3 text-center whitespace-nowrap">
                                {apiKeyLabel ? (
                                  <Badge className={`${keyColor} text-white border-0 text-[10px] sm:text-xs px-1 py-0`}>{apiKeyLabel}</Badge>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </td>
                              <td className="py-1 sm:py-1.5 pr-3 text-right whitespace-nowrap">#{req.credentialId}</td>
                              <td className="py-1 sm:py-1.5 text-muted-foreground whitespace-nowrap font-mono text-[10px] sm:text-xs">
                                {req.clientIp || '-'}
                              </td>
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
        </TabsContent>

        {/* 趋势图表 */}
        <TabsContent value="chart" className="space-y-4">
          <Card>
            <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs sm:text-sm font-medium">使用趋势</CardTitle>
                <Tabs value={timeDimension} onValueChange={(v) => setTimeDimension(v as typeof timeDimension)}>
                  <TabsList className="h-7">
                    <TabsTrigger value="hour" className="text-xs px-2 py-1">小时</TabsTrigger>
                    <TabsTrigger value="day" className="text-xs px-2 py-1">天</TabsTrigger>
                    <TabsTrigger value="week" className="text-xs px-2 py-1">周</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </CardHeader>
            <CardContent className="px-3 sm:px-6">
              <TokenUsageChart granularity={timeDimension} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* 使用排行 */}
        <TabsContent value="ranking" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {/* 按模型统计 */}
            <Card>
              <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6">
                <CardTitle className="text-xs sm:text-sm font-medium">按模型统计</CardTitle>
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

            {/* 按凭据统计 */}
            <Card>
              <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6">
                <CardTitle className="text-xs sm:text-sm font-medium">按凭据统计</CardTitle>
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

            {/* 按 API Key 统计 */}
            <Card>
              <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6">
                <CardTitle className="text-xs sm:text-sm font-medium">按 API Key 统计</CardTitle>
              </CardHeader>
              <CardContent className="px-3 sm:px-6">
                {apiKeyEntries.length === 0 ? (
                  <p className="text-sm text-muted-foreground">暂无数据</p>
                ) : (
                  <div className="space-y-2 sm:space-y-3">
                    {apiKeyEntries.map(([keyId, stats]) => {
                      const keyLabel = apiKeyMap.get(Number(keyId)) || `Key #${keyId}`
                      return (
                        <div key={keyId} className="flex items-center justify-between text-xs sm:text-sm">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate" title={keyLabel}>{keyLabel}</div>
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
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
