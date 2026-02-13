import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { config } from '@/lib/config'
import { getCredentials, testConnection } from '@/api/client'
import { Toaster, toast } from 'sonner'
import { Settings } from 'lucide-react'

// 简单的 UI 组件
function Button({ children, onClick, variant = 'primary', className = '', disabled = false }: any) {
  const baseClass = 'px-4 py-2 rounded-lg font-medium transition-colors'
  const variants: Record<string, string> = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700',
    secondary: 'bg-gray-200 text-gray-800 hover:bg-gray-300',
    danger: 'bg-red-600 text-white hover:bg-red-700',
  }
  return (
    <button onClick={onClick} disabled={disabled} className={`${baseClass} ${variants[variant]} ${className}`}>
      {children}
    </button>
  )
}

function Input({ label, ...props }: any) {
  return (
    <div className="space-y-1">
      {label && <label className="block text-sm font-medium text-gray-700">{label}</label>}
      <input
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        {...props}
      />
    </div>
  )
}

function Card({ children, className = '' }: any) {
  return <div className={`bg-white rounded-lg shadow p-4 ${className}`}>{children}</div>
}

// 设置页面
function SettingsPage({ onSave }: { onSave: () => void }) {
  const [backendUrl, setBackendUrl] = useState(config.getBackendUrl())
  const [apiKey, setApiKey] = useState(config.getApiKey())
  const [testing, setTesting] = useState(false)

  const handleSave = async () => {
    if (!backendUrl || !apiKey) {
      toast.error('请填写完整信息')
      return
    }

    setTesting(true)
    const result = await testConnection(backendUrl, apiKey)
    setTesting(false)

    if (result.ok) {
      config.setBackendUrl(backendUrl)
      config.setApiKey(apiKey)
      toast.success('配置已保存')
      onSave()
    } else {
      toast.error(`连接失败: ${result.error || '未知错误'}`)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-md mx-auto space-y-4">
        <h1 className="text-2xl font-bold text-gray-900">服务器设置</h1>

        <Card>
          <div className="space-y-4">
            <Input
              label="后端地址"
              type="url"
              placeholder="https://100.92.138.107:9443"
              value={backendUrl}
              onChange={(e: any) => setBackendUrl(e.target.value)}
            />

            <Input
              label="Admin API Key"
              type="password"
              placeholder="sk-admin-..."
              value={apiKey}
              onChange={(e: any) => setApiKey(e.target.value)}
            />

            <div className="text-sm text-gray-600">
              <p>示例后端地址：</p>
              <ul className="list-disc list-inside mt-1">
                <li>http://192.168.1.100:8080</li>
                <li>https://api.example.com</li>
              </ul>
            </div>

            <Button onClick={handleSave} className="w-full" disabled={testing}>
              {testing ? '测试连接中...' : '保存并测试连接'}
            </Button>
          </div>
        </Card>

        <div className="text-center text-xs text-gray-400 mt-6">
          <p>Kiro Admin v{__APP_VERSION__}</p>
          <p>Build: {__BUILD_TIME__}</p>
        </div>
      </div>
    </div>
  )
}

// 凭据列表页面
function CredentialsPage({ onSettings }: { onSettings: () => void }) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['credentials'],
    queryFn: getCredentials,
    refetchInterval: 10000,
  })

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">加载中...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-md mx-auto">
          <Card className="text-center space-y-4">
            <p className="text-red-600">连接失败</p>
            <Button onClick={() => refetch()}>重试</Button>
            <Button onClick={onSettings} variant="secondary">检查设置</Button>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-4 py-3 flex items-center justify-between">
        <h1 className="text-xl font-bold">凭据管理</h1>
        <button onClick={onSettings} className="p-2">
          <Settings className="w-5 h-5" />
        </button>
      </div>

      <div className="p-4 space-y-3">
        {data?.credentials.map((cred) => (
          <Card key={cred.id}>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-medium">{cred.email || `凭据 #${cred.id}`}</span>
                <span className={`text-sm px-2 py-1 rounded ${cred.disabled ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                  {cred.disabled ? '已禁用' : '正常'}
                </span>
              </div>
              <div className="text-sm text-gray-600">
                <p>认证方式: {cred.authMethod}</p>
                <p>优先级: {cred.priority}</p>
                <p>失败次数: {cred.failureCount}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}

// 主应用
export default function App() {
  const [showSettings, setShowSettings] = useState(!config.isConfigured())

  return (
    <>
      <Toaster position="top-center" />
      {showSettings ? (
        <SettingsPage onSave={() => setShowSettings(false)} />
      ) : (
        <CredentialsPage onSettings={() => setShowSettings(true)} />
      )}
    </>
  )
}
