import { RefreshCw, Trash2 } from 'lucide-react'
import { useTokenUsage, useResetTokenUsage } from '@/hooks/use-credentials'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

export function TokenUsagePanel() {
  const { data, isLoading, refetch } = useTokenUsage()
  const resetUsage = useResetTokenUsage()

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
              {data?.totalRequests.toLocaleString() || 0}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-400">输入 Token</span>
            <span className="text-lg font-semibold text-blue-600">
              {data?.totalInputTokens.toLocaleString() || 0}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-400">输出 Token</span>
            <span className="text-lg font-semibold text-green-600">
              {data?.totalOutputTokens.toLocaleString() || 0}
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
                      {stats.inputTokens.toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-500 dark:text-gray-400">输出</div>
                    <div className="font-medium text-green-600">
                      {stats.outputTokens.toLocaleString()}
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
                      {stats.inputTokens.toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-500 dark:text-gray-400">输出</div>
                    <div className="font-medium text-green-600">
                      {stats.outputTokens.toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
