import { useState, useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { serverStorage } from '@/lib/server-storage'
import { ServerListPage } from '@/components/server-list-page'
import { MobileDashboard } from '@/components/mobile-dashboard'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

function App() {
  const [currentServerId, setCurrentServerId] = useState<string | null>(null)
  const [showServerList, setShowServerList] = useState(false)

  useEffect(() => {
    // 初始化：检查是否有当前服务器
    const serverId = serverStorage.getCurrentServerId()
    const servers = serverStorage.getServers()
    
    if (serverId && servers.find(s => s.id === serverId)) {
      setCurrentServerId(serverId)
    } else if (servers.length === 1) {
      // 如果只有一个服务器，自动选择
      serverStorage.setCurrentServerId(servers[0].id)
      setCurrentServerId(servers[0].id)
    } else {
      // 否则显示服务器列表
      setShowServerList(true)
    }

    // 初始化主题
    const theme = localStorage.getItem('theme')
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
    }
  }, [])

  const handleSelectServer = (serverId: string) => {
    setCurrentServerId(serverId)
    setShowServerList(false)
  }

  const handleSwitchServer = () => {
    setShowServerList(true)
  }

  if (showServerList || !currentServerId) {
    return (
      <>
        <ServerListPage onSelectServer={handleSelectServer} />
        <Toaster position="top-center" />
      </>
    )
  }

  return (
    <QueryClientProvider client={queryClient}>
      <MobileDashboard onSwitchServer={handleSwitchServer} />
      <Toaster position="top-center" />
    </QueryClientProvider>
  )
}

export default App
