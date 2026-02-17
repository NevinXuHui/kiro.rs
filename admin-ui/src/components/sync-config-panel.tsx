import { useState, useEffect } from 'react'
import { storage } from '@/lib/storage'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Badge } from './ui/badge'
import { Loader2, CheckCircle2, XCircle, RefreshCw, Wifi, WifiOff } from 'lucide-react'

interface SyncConfig {
  serverUrl: string
  authToken: string
  enabled: boolean
  syncInterval: number
  heartbeatInterval: number
}

interface DeviceInfo {
  deviceId: string
  deviceName: string
  deviceType: string
}

interface OnlineDevice {
  deviceId: string
  deviceName: string
  deviceType: string
  userId: number
  userEmail: string
  connectedAt: number
  lastHeartbeat: number
}

export function SyncConfigPanel() {
  const [config, setConfig] = useState<SyncConfig>({
    serverUrl: 'http://localhost:3000',
    authToken: '',
    enabled: false,
    syncInterval: 300,
    heartbeatInterval: 15,
  })
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null)
  const [onlineDevices, setOnlineDevices] = useState<OnlineDevice[]>([])
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null)

  // 加载配置
  useEffect(() => {
    loadConfig()
    loadDeviceInfo()
    loadOnlineDevices()
  }, [])

  const loadConfig = async () => {
    try {
      const response = await fetch('/api/admin/sync/config', { headers: { 'x-api-key': storage.getApiKey() || '' } })
      if (response.ok) {
        const data = await response.json()
        if (data.config) {
          setConfig(data.config)
        }
      }
    } catch (error) {
      console.error('加载同步配置失败:', error)
    }
  }

  const loadDeviceInfo = async () => {
    try {
      const response = await fetch('/api/admin/sync/device', { headers: { 'x-api-key': storage.getApiKey() || '' } })
      if (response.ok) {
        const data = await response.json()
        setDeviceInfo(data.device)
      }
    } catch (error) {
      console.error('加载设备信息失败:', error)
    }
  }

  const loadOnlineDevices = async () => {
    try {
      const response = await fetch('/api/admin/sync/devices', { headers: { 'x-api-key': storage.getApiKey() || '' } })
      if (response.ok) {
        const data = await response.json()
        setOnlineDevices(data.devices || [])
      }
    } catch (error) {
      console.error('加载在线设备失败:', error)
    }
  }

  const handleSaveConfig = async () => {
    try {
      const response = await fetch('/api/admin/sync/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': storage.getApiKey() || '' },
        body: JSON.stringify(config),
      })

      if (response.ok) {
        setTestResult({ success: true, message: '配置保存成功' })
        setTimeout(() => setTestResult(null), 3000)
      } else {
        const error = await response.json()
        setTestResult({ success: false, message: error.error || '保存失败' })
      }
    } catch (error) {
      setTestResult({ success: false, message: '保存失败: ' + error })
    }
  }

  const handleTestConnection = async () => {
    setIsTesting(true)
    setTestResult(null)

    try {
      const response = await fetch('/api/admin/sync/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': storage.getApiKey() || '' },
        body: JSON.stringify(config),
      })

      const data = await response.json()

      if (response.ok && data.success) {
        setTestResult({ success: true, message: '连接测试成功' })
      } else {
        setTestResult({ success: false, message: data.error || '连接失败' })
      }
    } catch (error) {
      setTestResult({ success: false, message: '连接失败: ' + error })
    } finally {
      setIsTesting(false)
    }
  }

  const handleManualSync = async () => {
    setIsSyncing(true)

    try {
      const response = await fetch('/api/admin/sync/now', {
        method: 'POST',
        headers: { 'x-api-key': storage.getApiKey() || '' },
      })

      if (response.ok) {
        setLastSyncTime(new Date().toLocaleString())
        setTestResult({ success: true, message: '同步成功' })
        setTimeout(() => setTestResult(null), 3000)
      } else {
        const error = await response.json()
        setTestResult({ success: false, message: error.error || '同步失败' })
      }
    } catch (error) {
      setTestResult({ success: false, message: '同步失败: ' + error })
    } finally {
      setIsSyncing(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* 同步配置 */}
      <Card>
        <CardHeader>
          <CardTitle>同步配置</CardTitle>
          <CardDescription>
            配置与 kiro-token-manager 服务器的数据同步
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <label className="text-sm font-medium">启用同步</label>
              <p className="text-sm text-muted-foreground">
                启用后将自动与服务器同步凭据数据
              </p>
            </div>
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={(e) =>
                setConfig({ ...config, enabled: e.target.checked })
              }
              className="h-4 w-4"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="serverUrl" className="text-sm font-medium">服务器地址</label>
            <Input
              id="serverUrl"
              placeholder="http://localhost:3000"
              value={config.serverUrl}
              onChange={(e) =>
                setConfig({ ...config, serverUrl: e.target.value })
              }
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="authToken" className="text-sm font-medium">认证 Token (JWT)</label>
            <Input
              id="authToken"
              type="password"
              placeholder="your-jwt-token"
              value={config.authToken}
              onChange={(e) =>
                setConfig({ ...config, authToken: e.target.value })
              }
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label htmlFor="syncInterval" className="text-sm font-medium">同步间隔（秒）</label>
              <Input
                id="syncInterval"
                type="number"
                min="60"
                value={config.syncInterval}
                onChange={(e) =>
                  setConfig({ ...config, syncInterval: parseInt(e.target.value) || 300 })
                }
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="heartbeatInterval" className="text-sm font-medium">心跳间隔（秒）</label>
              <Input
                id="heartbeatInterval"
                type="number"
                min="5"
                value={config.heartbeatInterval}
                onChange={(e) =>
                  setConfig({ ...config, heartbeatInterval: parseInt(e.target.value) || 15 })
                }
              />
            </div>
          </div>

          {testResult && (
            <div
              className={`flex items-center gap-2 p-3 rounded-md ${
                testResult.success
                  ? 'bg-green-50 text-green-900'
                  : 'bg-red-50 text-red-900'
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
              <span className="text-sm">{testResult.message}</span>
            </div>
          )}

          <div className="flex gap-2">
            <Button onClick={handleSaveConfig}>保存配置</Button>
            <Button
              variant="outline"
              onClick={handleTestConnection}
              disabled={isTesting}
            >
              {isTesting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              测试连接
            </Button>
            <Button
              variant="outline"
              onClick={handleManualSync}
              disabled={isSyncing || !config.enabled}
            >
              {isSyncing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <RefreshCw className="mr-2 h-4 w-4" />
              立即同步
            </Button>
          </div>

          {lastSyncTime && (
            <p className="text-sm text-muted-foreground">
              最后同步时间: {lastSyncTime}
            </p>
          )}
        </CardContent>
      </Card>

      {/* 设备信息 */}
      {deviceInfo && (
        <Card>
          <CardHeader>
            <CardTitle>当前设备</CardTitle>
            <CardDescription>本设备的同步信息</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">设备 ID:</span>
                <p className="font-mono">{deviceInfo.deviceId}</p>
              </div>
              <div>
                <span className="text-muted-foreground">设备名称:</span>
                <p>{deviceInfo.deviceName}</p>
              </div>
              <div>
                <span className="text-muted-foreground">设备类型:</span>
                <p>{deviceInfo.deviceType}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 在线设备列表 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>在线设备</CardTitle>
              <CardDescription>
                当前连接到同步服务器的设备
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={loadOnlineDevices}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {onlineDevices.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <WifiOff className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>暂无在线设备</p>
            </div>
          ) : (
            <div className="space-y-3">
              {onlineDevices.map((device) => (
                <div
                  key={device.deviceId}
                  className="flex items-center justify-between p-3 border rounded-lg gap-4"
                >
                  <div className="flex items-center gap-3 min-w-0" style={{ maxWidth: '60%' }}>
                    <Wifi className="h-5 w-5 text-green-500 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{device.deviceName}</p>
                      <p className="text-sm text-muted-foreground truncate" title={device.userEmail}>
                        {device.userEmail}
                      </p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <Badge variant="outline">{device.deviceType}</Badge>
                    <p className="text-xs text-muted-foreground mt-1 whitespace-nowrap">
                      {new Date(device.lastHeartbeat).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
