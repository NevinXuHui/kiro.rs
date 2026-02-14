import { useState, useEffect } from 'react'
import { Moon, Sun, Server, LogOut } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { serverStorage } from '@/lib/server-storage'

interface SettingsPanelProps {
  onSwitchServer: () => void
}

export function SettingsPanel({ onSwitchServer }: SettingsPanelProps) {
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return document.documentElement.classList.contains('dark')
    }
    return false
  })

  const currentServer = serverStorage.getCurrentServer()

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark')
      localStorage.setItem('theme', 'dark')
    } else {
      document.documentElement.classList.remove('dark')
      localStorage.setItem('theme', 'light')
    }
  }, [darkMode])

  const handleLogout = () => {
    if (confirm('确定退出当前服务器？')) {
      serverStorage.setCurrentServerId(null)
      window.location.reload()
    }
  }

  return (
    <div className="p-4 space-y-4">
      {/* 当前服务器 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">当前服务器</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {currentServer ? (
            <>
              <div>
                <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">名称</div>
                <div className="font-medium text-gray-900 dark:text-white">
                  {currentServer.name}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">地址</div>
                <div className="font-medium text-gray-900 dark:text-white text-sm break-all">
                  {currentServer.url}
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <Button onClick={onSwitchServer} size="sm" variant="outline" className="flex-1">
                  <Server className="w-4 h-4 mr-2" />
                  切换服务器
                </Button>
                <Button onClick={handleLogout} size="sm" variant="outline" className="flex-1">
                  <LogOut className="w-4 h-4 mr-2" />
                  退出
                </Button>
              </div>
            </>
          ) : (
            <div className="text-center py-4">
              <p className="text-gray-500 dark:text-gray-400 mb-4">未选择服务器</p>
              <Button onClick={onSwitchServer} size="sm">
                <Server className="w-4 h-4 mr-2" />
                选择服务器
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 外观设置 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">外观</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {darkMode ? (
                <Moon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              ) : (
                <Sun className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              )}
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                深色模式
              </span>
            </div>
            <Switch checked={darkMode} onCheckedChange={setDarkMode} />
          </div>
        </CardContent>
      </Card>

      {/* 关于 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">关于</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600 dark:text-gray-400">应用名称</span>
            <span className="font-medium text-gray-900 dark:text-white">Kiro Admin</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600 dark:text-gray-400">版本</span>
            <span className="font-medium text-gray-900 dark:text-white">
              {__APP_VERSION__}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600 dark:text-gray-400">构建时间</span>
            <span className="font-medium text-gray-900 dark:text-white text-xs">
              {new Date(__BUILD_TIME__).toLocaleString('zh-CN')}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
