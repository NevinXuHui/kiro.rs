import axios from 'axios'
import { storage } from '@/lib/storage'
import type {
  CredentialsStatusResponse,
  BalanceResponse,
  SuccessResponse,
  SetDisabledRequest,
  SetPriorityRequest,
  AddCredentialRequest,
  AddCredentialResponse,
  TokenUsageResponse,
  TokenUsageTimeSeriesResponse,
  ApiKeyEntryView,
  CreateApiKeyRequest,
  CreateApiKeyResponse,
  UpdateApiKeyRequest,
  ProxyConfigResponse,
  UpdateProxyConfigRequest,
  ConnectivityTestRequest,
  ConnectivityTestResponse,
} from '@/types/api'

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

// 获取所有凭据状态
export async function getCredentials(): Promise<CredentialsStatusResponse> {
  const { data } = await api.get<CredentialsStatusResponse>('/credentials')
  return data
}

// 设置凭据禁用状态
export async function setCredentialDisabled(
  id: number,
  disabled: boolean
): Promise<SuccessResponse> {
  const { data } = await api.post<SuccessResponse>(
    `/credentials/${id}/disabled`,
    { disabled } as SetDisabledRequest
  )
  return data
}

// 设置凭据优先级
export async function setCredentialPriority(
  id: number,
  priority: number
): Promise<SuccessResponse> {
  const { data } = await api.post<SuccessResponse>(
    `/credentials/${id}/priority`,
    { priority } as SetPriorityRequest
  )
  return data
}

// 将凭据设为首选
export async function setCredentialPrimary(
  id: number
): Promise<SuccessResponse> {
  const { data } = await api.post<SuccessResponse>(
    `/credentials/${id}/set-primary`
  )
  return data
}

// 重置失败计数
export async function resetCredentialFailure(
  id: number
): Promise<SuccessResponse> {
  const { data } = await api.post<SuccessResponse>(`/credentials/${id}/reset`)
  return data
}

// 获取凭据余额（默认使用服务器缓存）
export async function getCredentialBalance(id: number, force = false): Promise<BalanceResponse> {
  const { data } = await api.get<BalanceResponse>(`/credentials/${id}/balance${force ? '?force=true' : ''}`)
  return data
}

// 添加新凭据
export async function addCredential(
  req: AddCredentialRequest
): Promise<AddCredentialResponse> {
  const { data } = await api.post<AddCredentialResponse>('/credentials', req)
  return data
}

// 删除凭据
export async function deleteCredential(id: number): Promise<SuccessResponse> {
  const { data } = await api.delete<SuccessResponse>(`/credentials/${id}`)
  return data
}

// 获取负载均衡模式
export async function getLoadBalancingMode(): Promise<{ mode: 'priority' | 'balanced' }> {
  const { data } = await api.get<{ mode: 'priority' | 'balanced' }>('/config/load-balancing')
  return data
}

// 设置负载均衡模式
export async function setLoadBalancingMode(mode: 'priority' | 'balanced'): Promise<{ mode: 'priority' | 'balanced' }> {
  const { data } = await api.put<{ mode: 'priority' | 'balanced' }>('/config/load-balancing', { mode })
  return data
}

// 获取 token 使用统计
export async function getTokenUsage(): Promise<TokenUsageResponse> {
  const { data } = await api.get<TokenUsageResponse>('/token-usage')
  return data
}

// 重置 token 使用统计
export async function resetTokenUsage(): Promise<SuccessResponse> {
  const { data } = await api.post<SuccessResponse>('/token-usage/reset')
  return data
}

// 获取时间序列统计数据
export async function getTokenUsageTimeseries(
  granularity: 'hour' | 'day' | 'week'
): Promise<TokenUsageTimeSeriesResponse> {
  const { data } = await api.get<TokenUsageTimeSeriesResponse>(
    `/token-usage/timeseries?granularity=${granularity}`
  )
  return data
}

// ============ API Key 管理 ============

// 获取所有 API Key
export async function getApiKeys(): Promise<ApiKeyEntryView[]> {
  const { data } = await api.get<ApiKeyEntryView[]>('/api-keys')
  return data
}

// 获取单个 API Key
export async function getApiKey(id: number): Promise<ApiKeyEntryView> {
  const { data } = await api.get<ApiKeyEntryView>(`/api-keys/${id}`)
  return data
}

// 创建 API Key
export async function createApiKey(req: CreateApiKeyRequest): Promise<CreateApiKeyResponse> {
  const { data } = await api.post<CreateApiKeyResponse>('/api-keys', req)
  return data
}

// 更新 API Key
export async function updateApiKey(id: number, req: UpdateApiKeyRequest): Promise<SuccessResponse> {
  const { data } = await api.put<SuccessResponse>(`/api-keys/${id}`, req)
  return data
}

// 删除 API Key
export async function deleteApiKey(id: number): Promise<SuccessResponse> {
  const { data } = await api.delete<SuccessResponse>(`/api-keys/${id}`)
  return data
}

// ============ 代理配置 ============

// 获取代理配置
export async function getProxyConfig(): Promise<ProxyConfigResponse> {
  const { data } = await api.get<ProxyConfigResponse>('/config/proxy')
  return data
}

// 更新代理配置
export async function updateProxyConfig(req: UpdateProxyConfigRequest): Promise<ProxyConfigResponse> {
  const { data } = await api.put<ProxyConfigResponse>('/config/proxy', req)
  return data
}

// ============ 连通性测试 ============

// 测试 API 连通性
export async function testConnectivity(req: ConnectivityTestRequest): Promise<ConnectivityTestResponse> {
  const { data } = await api.post<ConnectivityTestResponse>('/connectivity/test', req)
  return data
}
