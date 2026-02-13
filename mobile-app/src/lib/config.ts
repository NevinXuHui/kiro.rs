// 移动应用配置
export const config = {
  // 从 localStorage 获取后端地址
  getBackendUrl: (): string => {
    return localStorage.getItem('backend_url') || ''
  },

  // 设置后端地址
  setBackendUrl: (url: string) => {
    localStorage.setItem('backend_url', url.replace(/\/$/, ''))
  },

  // 获取 API Key
  getApiKey: (): string => {
    return localStorage.getItem('admin_api_key') || ''
  },

  // 设置 API Key
  setApiKey: (key: string) => {
    localStorage.setItem('admin_api_key', key)
  },

  // 检查是否已配置
  isConfigured: (): boolean => {
    return !!config.getBackendUrl() && !!config.getApiKey()
  },
}
