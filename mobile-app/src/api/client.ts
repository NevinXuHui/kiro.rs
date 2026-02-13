import axios from 'axios'
import { config } from '@/lib/config'

// 创建 axios 实例
const api = axios.create({
  headers: {
    'Content-Type': 'application/json',
  },
})

// 请求拦截器：动态设置 baseURL 和 API Key
api.interceptors.request.use((requestConfig) => {
  const backendUrl = config.getBackendUrl()
  const apiKey = config.getApiKey()

  if (backendUrl) {
    requestConfig.baseURL = `${backendUrl}/api/admin`
  }

  if (apiKey) {
    requestConfig.headers['x-api-key'] = apiKey
  }

  return requestConfig
})

// 响应拦截器：处理错误
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      console.error('认证失败，请检查 API Key')
    }
    return Promise.reject(error)
  }
)

export { api }

// API 类型定义
export interface Credential {
  id: number
  email?: string
  authMethod: 'social' | 'idc'
  priority: number
  disabled: boolean
  failureCount: number
  expiresAt: string
}

export interface CredentialsStatusResponse {
  credentials: Credential[]
}

export interface BalanceResponse {
  balance: number
  currency: string
}

export interface AddCredentialRequest {
  refreshToken: string
  authMethod: 'social' | 'idc'
  clientId?: string
  clientSecret?: string
  priority?: number
}

// API 方法
export async function getCredentials(): Promise<CredentialsStatusResponse> {
  const { data } = await api.get<CredentialsStatusResponse>('/credentials')
  return data
}

export async function getCredentialBalance(id: number): Promise<BalanceResponse> {
  const { data } = await api.get<BalanceResponse>(`/credentials/${id}/balance?force=true`)
  return data
}

export async function addCredential(req: AddCredentialRequest) {
  const { data } = await api.post('/credentials', req)
  return data
}

export async function deleteCredential(id: number) {
  const { data } = await api.delete(`/credentials/${id}`)
  return data
}

export async function setCredentialDisabled(id: number, disabled: boolean) {
  const { data } = await api.post(`/credentials/${id}/disabled`, { disabled })
  return data
}

export async function resetCredentialFailure(id: number) {
  const { data } = await api.post(`/credentials/${id}/reset`)
  return data
}

// 测试连接
export async function testConnection(backendUrl: string, apiKey: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await axios.get(`${backendUrl}/api/admin/credentials`, {
      headers: { 'x-api-key': apiKey },
      timeout: 5000,
    })
    return { ok: response.status === 200 }
  } catch (e: any) {
    const msg = e?.response
      ? `HTTP ${e.response.status}: ${e.response.statusText}`
      : e?.code || e?.message || '未知错误'
    return { ok: false, error: msg }
  }
}
