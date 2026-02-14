import { useState } from 'react'
import { ChevronDown, Server, Key, BarChart3, Settings } from 'lucide-react'
import { serverStorage } from '@/lib/server-storage'
import { CredentialsPanel } from './credentials-panel'
import { TokenUsagePanel } from './token-usage-panel'
import { ApiKeyPanel } from './api-key-panel'
import { SettingsPanel } from './settings-panel'

interface MobileDashboardProps {
  onSwitchServer: () => void
}

export function MobileDashboard({ onSwitchServer }: MobileDashboardProps) {
  const [activeTab, setActiveTab] = useState<'credentials' | 'usage' | 'apikeys' | 'settings'>('credentials')
  const currentServer = serverStorage.getCurrentServer()

  const tabs = [
    { id: 'credentials' as const, label: '凭据', icon: Key },
    { id: 'usage' as const, label: 'Token', icon: BarChart3 },
    { id: 'apikeys' as const, label: 'API Key', icon: Server },
    { id: 'settings' as const, label: '设置', icon: Settings },
  ]

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-900">
      {/* 顶部栏 */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Server className="w-5 h-5 text-gray-500 flex-shrink-0" />
          <button
            onClick={onSwitchServer}
            className="flex items-center gap-1 text-sm font-medium text-gray-900 dark:text-white truncate"
          >
            <span className="truncate">{currentServer?.name || '未选择服务器'}</span>
            <ChevronDown className="w-4 h-4 flex-shrink-0" />
          </button>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'credentials' && <CredentialsPanel />}
        {activeTab === 'usage' && <TokenUsagePanel />}
        {activeTab === 'apikeys' && <ApiKeyPanel />}
        {activeTab === 'settings' && <SettingsPanel onSwitchServer={onSwitchServer} />}
      </div>

      {/* 底部导航 */}
      <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-2 py-2 safe-area-bottom">
        <div className="flex items-center justify-around">
          {tabs.map(tab => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex flex-col items-center gap-1 px-4 py-2 rounded-lg transition-colors ${
                  isActive
                    ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
                    : 'text-gray-600 dark:text-gray-400'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-xs font-medium">{tab.label}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
