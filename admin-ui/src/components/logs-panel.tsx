import { useState, useEffect, useRef } from 'react'
import { RefreshCw, Download, Trash2, ChevronLeft, ChevronRight, Search, X } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
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
  const [refreshInterval, setRefreshInterval] = useState(3000)
  const [logLevel, setLogLevel] = useState('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(100)
  const [totalPages, setTotalPages] = useState(1)
  const [totalLines, setTotalLines] = useState(0)
  const [searchKeyword, setSearchKeyword] = useState('')
  const logsEndRef = useRef<HTMLDivElement>(null)
  const intervalRef = useRef<number | null>(null)

  const fetchLogs = async () => {
    setLoading(true)
    try {
      const response = await api.get(`/logs?lines=${lines}&level=${logLevel}&page=${currentPage}&pageSize=${pageSize}`)
      if (response.data.success) {
        setLogs(response.data.content)
        setTotalPages(response.data.totalPages || 1)
        setTotalLines(response.data.totalLines || 0)
        // 自动滚动到顶部
        setTimeout(() => {
          logsEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
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

  // 高亮日志行
  const highlightLog = (line: string) => {
    if (line.includes('ERROR')) {
      return 'text-red-600 dark:text-red-400 font-medium bg-red-50 dark:bg-red-950/30 border-l-2 border-red-500 pl-2 py-0.5'
    } else if (line.includes('WARN')) {
      return 'text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-950/30 border-l-2 border-yellow-500 pl-2 py-0.5'
    } else if (line.includes('INFO')) {
      return 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 border-l-2 border-blue-500 pl-2 py-0.5'
    } else if (line.includes('DEBUG')) {
      return 'text-gray-500 dark:text-gray-400 pl-2 py-0.5'
    }
    return 'pl-2 py-0.5'
  }

  // 解析日志行，提取时间戳、级别、内容
  const parseLogLine = (line: string) => {
    // 匹配格式: 2024-02-22T10:30:45.123456Z  INFO  message
    const match = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z)\s+(ERROR|WARN|INFO|DEBUG|TRACE)\s+(.+)$/)
    if (match) {
      const [, timestamp, level, message] = match
      const time = new Date(timestamp)
      const timeStr = time.toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      })
      return { timestamp: timeStr, level, message, raw: line }
    }
    return { timestamp: null, level: null, message: line, raw: line }
  }

  // 高亮搜索关键词
  const highlightKeyword = (text: string, keyword: string) => {
    if (!keyword) return text
    const parts = text.split(new RegExp(`(${keyword})`, 'gi'))
    return parts.map((part) =>
      part.toLowerCase() === keyword.toLowerCase()
        ? `<mark class="bg-yellow-300 dark:bg-yellow-600 text-black dark:text-white px-0.5 rounded">${part}</mark>`
        : part
    ).join('')
  }

  // 过滤日志
  const filteredLogs = searchKeyword
    ? logs.split('\n').filter(line =>
        line.toLowerCase().includes(searchKeyword.toLowerCase())
      ).join('\n')
    : logs

  // 统计日志级别
  const logStats = {
    error: (logs.match(/ERROR/g) || []).length,
    warn: (logs.match(/WARN/g) || []).length,
    info: (logs.match(/INFO/g) || []).length,
    debug: (logs.match(/DEBUG/g) || []).length,
  }

  useEffect(() => {
    setCurrentPage(1) // 重置到第一页
  }, [lines, logLevel, pageSize])

  useEffect(() => {
    fetchLogs()
  }, [lines, logLevel, currentPage, pageSize])

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = window.setInterval(() => {
        fetchLogs()
      }, refreshInterval)
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
  }, [autoRefresh, lines, refreshInterval, logLevel])

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3 px-3 sm:px-6">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <span className="hidden sm:inline">实时日志</span>
                <span className="sm:hidden">日志</span>
                {logs && (
                  <div className="flex items-center gap-1">
                    {logStats.error > 0 && (
                      <Badge variant="destructive" className="text-[10px] sm:text-xs px-1 sm:px-1.5">
                        <span className="hidden sm:inline">ERROR </span>{logStats.error}
                      </Badge>
                    )}
                    {logStats.warn > 0 && (
                      <Badge variant="outline" className="text-[10px] sm:text-xs text-yellow-600 border-yellow-600 px-1 sm:px-1.5">
                        <span className="hidden sm:inline">WARN </span>{logStats.warn}
                      </Badge>
                    )}
                    {logStats.info > 0 && (
                      <Badge variant="outline" className="text-[10px] sm:text-xs text-blue-600 border-blue-600 px-1 sm:px-1.5">
                        <span className="hidden sm:inline">INFO </span>{logStats.info}
                      </Badge>
                    )}
                  </div>
                )}
              </CardTitle>
              <div className="flex items-center gap-1 sm:gap-2">
                <Button
                  variant={autoRefresh ? 'default' : 'outline'}
                  size="sm"
                  onClick={toggleAutoRefresh}
                  className="h-7 sm:h-8 px-2 sm:px-3"
                >
                  <RefreshCw className={`h-3 sm:h-3.5 w-3 sm:w-3.5 ${autoRefresh ? 'animate-spin' : ''} sm:mr-1`} />
                  <span className="hidden sm:inline">{autoRefresh ? '自动' : '手动'}</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchLogs}
                  disabled={loading || autoRefresh}
                  className="h-7 sm:h-8 px-2 sm:px-3"
                >
                  <RefreshCw className={`h-3 sm:h-3.5 w-3 sm:w-3.5 ${loading ? 'animate-spin' : ''} sm:mr-1`} />
                  <span className="hidden sm:inline">刷新</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownload}
                  disabled={!logs}
                  className="h-7 sm:h-8 px-2 sm:px-3"
                >
                  <Download className="h-3 sm:h-3.5 w-3 sm:w-3.5 sm:mr-1" />
                  <span className="hidden sm:inline">下载</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClear}
                  disabled={!logs}
                  className="h-7 sm:h-8 px-2 sm:px-3"
                >
                  <Trash2 className="h-3 sm:h-3.5 w-3 sm:w-3.5 sm:mr-1" />
                  <span className="hidden sm:inline">清空</span>
                </Button>
              </div>
            </div>

            {/* 控制栏 */}
            <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground whitespace-nowrap">行数:</span>
                <select
                  value={lines}
                  onChange={(e) => setLines(Number(e.target.value))}
                  className="h-7 sm:h-8 rounded-md border border-input bg-background px-2 py-1 text-xs flex-1 sm:flex-initial"
                >
                  <option value={100}>100</option>
                  <option value={200}>200</option>
                  <option value={500}>500</option>
                  <option value={1000}>1000</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground whitespace-nowrap">级别:</span>
                <select
                  value={logLevel}
                  onChange={(e) => setLogLevel(e.target.value)}
                  className="h-7 sm:h-8 rounded-md border border-input bg-background px-2 py-1 text-xs flex-1 sm:flex-initial"
                >
                  <option value="all">全部</option>
                  <option value="error">ERROR</option>
                  <option value="warn">WARN+</option>
                  <option value="info">INFO+</option>
                  <option value="debug">DEBUG+</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground whitespace-nowrap">间隔:</span>
                <select
                  value={refreshInterval}
                  onChange={(e) => setRefreshInterval(Number(e.target.value))}
                  className="h-7 sm:h-8 rounded-md border border-input bg-background px-2 py-1 text-xs flex-1 sm:flex-initial"
                  disabled={!autoRefresh}
                >
                  <option value={1000}>1秒</option>
                  <option value={2000}>2秒</option>
                  <option value={3000}>3秒</option>
                  <option value={5000}>5秒</option>
                  <option value={10000}>10秒</option>
                </select>
              </div>

              {/* 搜索框 */}
              <div className="flex-1 sm:min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="搜索..."
                    value={searchKeyword}
                    onChange={(e) => setSearchKeyword(e.target.value)}
                    className="h-7 sm:h-8 pl-8 pr-8 text-xs"
                  />
                  {searchKeyword && (
                    <button
                      onClick={() => setSearchKeyword('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-3 sm:px-6">
          <div className="relative">
            <div ref={logsEndRef} />
            <div className="bg-slate-950 dark:bg-slate-900 rounded-lg p-2 sm:p-4 overflow-auto max-h-[400px] sm:max-h-[600px] border border-slate-800">
              {filteredLogs ? (
                <div className="text-[10px] sm:text-xs font-mono space-y-0.5">
                  {filteredLogs.split('\n').map((line, idx) => {
                    const parsed = parseLogLine(line)
                    const levelBadgeClass = parsed.level === 'ERROR'
                      ? 'bg-red-600 text-white'
                      : parsed.level === 'WARN'
                      ? 'bg-yellow-600 text-white'
                      : parsed.level === 'INFO'
                      ? 'bg-blue-600 text-white'
                      : parsed.level === 'DEBUG'
                      ? 'bg-gray-600 text-white'
                      : 'bg-gray-700 text-gray-300'

                    return (
                      <div
                        key={idx}
                        className={`${highlightLog(line)} hover:bg-slate-800/50 transition-colors rounded`}
                      >
                        {parsed.timestamp ? (
                          <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-2">
                            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                              <span className="text-slate-400 text-[9px] sm:text-xs select-none">
                                {parsed.timestamp}
                              </span>
                              <span className={`${levelBadgeClass} px-1 sm:px-1.5 py-0.5 rounded text-[8px] sm:text-[10px] font-semibold select-none`}>
                                {parsed.level}
                              </span>
                            </div>
                            <span
                              className="flex-1 break-all text-[10px] sm:text-xs"
                              dangerouslySetInnerHTML={{
                                __html: highlightKeyword(parsed.message, searchKeyword)
                              }}
                            />
                          </div>
                        ) : (
                          <span
                            className="text-[10px] sm:text-xs"
                            dangerouslySetInnerHTML={{
                              __html: highlightKeyword(line || '\u00A0', searchKeyword)
                            }}
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="text-xs sm:text-sm text-slate-400 text-center py-8">
                  {searchKeyword ? '没有匹配的日志' : '暂无日志'}
                </div>
              )}
            </div>
            {totalPages > 1 && (
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 mt-4 pt-4 border-t">
                <div className="text-xs text-muted-foreground text-center sm:text-left">
                  共 {totalLines} 行，第 {currentPage} / {totalPages} 页
                </div>
                <div className="flex items-center justify-center gap-2">
                  <select
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                    className="h-7 sm:h-8 rounded-md border border-input bg-background px-2 py-1 text-xs"
                  >
                    <option value={50}>50/页</option>
                    <option value={100}>100/页</option>
                    <option value={200}>200/页</option>
                  </select>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1 || loading}
                    className="h-7 sm:h-8 w-7 sm:w-8 p-0"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  <span className="text-xs px-2">{currentPage} / {totalPages}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages || loading}
                    className="h-7 sm:h-8 w-7 sm:w-8 p-0"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
