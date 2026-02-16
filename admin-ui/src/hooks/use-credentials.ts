import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getCredentials,
  setCredentialDisabled,
  setCredentialPriority,
  setCredentialPrimary,
  resetCredentialFailure,
  getCredentialBalance,
  addCredential,
  deleteCredential,
  getLoadBalancingMode,
  setLoadBalancingMode,
  getTokenUsage,
  getTokenUsageTimeseries,
  resetTokenUsage,
  getApiKeys,
  createApiKey,
  updateApiKey,
  deleteApiKey,
  getProxyConfig,
  updateProxyConfig,
  testConnectivity,
} from '@/api/credentials'
import type { AddCredentialRequest, CreateApiKeyRequest, UpdateApiKeyRequest, UpdateProxyConfigRequest, ConnectivityTestRequest, CredentialsStatusResponse } from '@/types/api'

// 查询凭据列表
export function useCredentials() {
  return useQuery({
    queryKey: ['credentials'],
    queryFn: getCredentials,
    refetchInterval: 30000, // 每 30 秒刷新一次
    staleTime: 0,
  })
}

// 查询凭据余额（不缓存，每次都发真实请求）
export function useCredentialBalance(id: number | null) {
  return useQuery({
    queryKey: ['credential-balance', id],
    queryFn: () => getCredentialBalance(id!),
    enabled: id !== null,
    retry: false, // 余额查询失败时不重试（避免重复请求被封禁的账号）
    staleTime: 0,
    gcTime: 0,
  })
}

// 设置禁用状态
export function useSetDisabled() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, disabled }: { id: number; disabled: boolean }) =>
      setCredentialDisabled(id, disabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credentials'] })
    },
  })
}

// 设置优先级
export function useSetPriority() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, priority }: { id: number; priority: number }) =>
      setCredentialPriority(id, priority),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credentials'] })
    },
  })
}

// 设为首选（乐观更新：双击后立即刷新 UI）
export function useSetPrimary() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => setCredentialPrimary(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['credentials'] })
      const previous = queryClient.getQueryData<CredentialsStatusResponse>(['credentials'])
      if (previous) {
        queryClient.setQueryData<CredentialsStatusResponse>(['credentials'], {
          ...previous,
          currentId: id,
          credentials: previous.credentials.map(c => ({
            ...c,
            isCurrent: c.id === id,
            priority: c.id === id ? 0 : (c.priority === 0 ? 1 : c.priority),
          })),
        })
      }
      return { previous }
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['credentials'], context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['credentials'] })
    },
  })
}

// 重置失败计数
export function useResetFailure() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => resetCredentialFailure(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credentials'] })
    },
  })
}

// 添加新凭据
export function useAddCredential() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (req: AddCredentialRequest) => addCredential(req),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credentials'] })
    },
  })
}

// 删除凭据
export function useDeleteCredential() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => deleteCredential(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credentials'] })
    },
  })
}

// 获取负载均衡模式
export function useLoadBalancingMode() {
  return useQuery({
    queryKey: ['loadBalancingMode'],
    queryFn: getLoadBalancingMode,
  })
}

// 设置负载均衡模式
export function useSetLoadBalancingMode() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: setLoadBalancingMode,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loadBalancingMode'] })
    },
  })
}

// 查询 token 使用统计
export function useTokenUsage() {
  return useQuery({
    queryKey: ['tokenUsage'],
    queryFn: getTokenUsage,
    refetchInterval: 10000, // 每 10 秒刷新一次
  })
}

// 重置 token 使用统计
export function useResetTokenUsage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: resetTokenUsage,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tokenUsage'] })
      queryClient.invalidateQueries({ queryKey: ['tokenUsageTimeseries'] })
    },
  })
}

// 查询时间序列统计数据
export function useTokenUsageTimeseries(granularity: 'hour' | 'day' | 'week') {
  return useQuery({
    queryKey: ['tokenUsageTimeseries', granularity],
    queryFn: () => getTokenUsageTimeseries(granularity),
    refetchInterval: 30000, // 每 30 秒刷新一次
  })
}

// ============ API Key 管理 ============

// 查询 API Key 列表
export function useApiKeys() {
  return useQuery({
    queryKey: ['apiKeys'],
    queryFn: getApiKeys,
    refetchInterval: 30000,
  })
}

// 创建 API Key
export function useCreateApiKey() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (req: CreateApiKeyRequest) => createApiKey(req),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apiKeys'] })
    },
  })
}

// 更新 API Key
export function useUpdateApiKey() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...req }: UpdateApiKeyRequest & { id: number }) => updateApiKey(id, req),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apiKeys'] })
    },
  })
}

// 删除 API Key
export function useDeleteApiKey() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => deleteApiKey(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apiKeys'] })
    },
  })
}

// ============ 代理配置 ============

// 获取代理配置
export function useProxyConfig() {
  return useQuery({
    queryKey: ['proxyConfig'],
    queryFn: getProxyConfig,
  })
}

// 更新代理配置
export function useUpdateProxyConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (req: UpdateProxyConfigRequest) => updateProxyConfig(req),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proxyConfig'] })
    },
  })
}

// ============ 连通性测试 ============

// 测试 API 连通性
export function useTestConnectivity() {
  return useMutation({
    mutationFn: (req: ConnectivityTestRequest) => testConnectivity(req),
  })
}
