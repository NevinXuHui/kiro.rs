import { useState, useEffect, useRef } from 'react'
import { RefreshCw, Download, Trash2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import axios from 'axios'
import { storage } from '@/lib/storage'

// 创建 axios 实例
const api = axios.create({
  baseURL: '/api/admin',
  headers: {
    'Content-Type': 'application/json',
  },
})

// 请求拦截器添加 API Key
api.interceptors.request.use((config) => {
  const apiKey = storage.getApiKey()
  if (apiKey) {
    config.headers['x-api-key'] = apiKey
  }
  return config
})

export function LogsPanel() {
  const [logs, setLogs] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [lines, setLines] = useState(200)
  const logsEndRef = useRef<HTMLDivElement>(null)
  const intervalRef = useRef<number | null>(null)

  const fetchLogs = async () => {
    setLoading(true)
    try {
      const response = await api.get(`/logs?lines=${lines}`)
      if (response.data.success) {
        setLogs(response.data.content)
        // 自动滚动到底部
        setTimeout(() => {
          logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
        }, 100)
      } else {
        toast.error('获取日志失败')
      }
    } catch (error) {
      toast.error('获取日志失败: ' + (error as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const handleDownload = () => {
    const blob = new Blob([logs], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `kiro-logs-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.log`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success('日志已下载')
  }

  const handleClear = () => {
    setLogs('')
    toast.success('已清空显示')
  }

  const toggleAutoRefresh = () => {
    setAutoRefresh(!autoRefresh)
  }

  useEffect(() => {
    fetchLogs()
  }, [lines])

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = window.setInterval(() => {
        fetchLogs()
      }, 3000) // 每3秒刷新一次
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [autoRefresh, lines])

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>实时日志</CardTitle>
            <div className="flex items-center gap-2">
              <select
                value={lines}
                onChange={(e) => setLines(Number(e.target.value))}
                className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
              >
                <option value={100}>100 行</option>
                <option value={200}>200 行</option>
                <option value={500}>500 行</option>
                <option value={1000}>1000 行</option>
              </select>
              <Button
                variant={autoRefresh ? 'default' : 'outline'}
                size="sm"
                onClick={toggleAutoRefresh}
              >
                <RefreshCw className={`h-4 w-4 mr-1 ${autoRefresh ? 'animate-spin' : ''}`} />
                {autoRefresh ? '自动刷新' : '手动'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchLogs}
                disabled={loading || autoRefresh}
              >
                <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
                刷新
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownload}
                disabled={!logs}
              >
                <Download className="h-4 w-4 mr-1" />
                下载
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleClear}
                disabled={!logs}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                清空
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <pre className="bg-muted rounded-lg p-4 text-xs font-mono overflow-auto max-h-[600px] whitespace-pre-wrap break-words">
              {logs || '暂无日志'}
              <div ref={logsEndRef} />
            </pre>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
