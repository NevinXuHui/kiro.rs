// 凭据状态响应
export interface CredentialsStatusResponse {
  total: number
  available: number
  currentId: number
  credentials: CredentialStatusItem[]
}

// 单个凭据状态
export interface CredentialStatusItem {
  id: number
  priority: number
  disabled: boolean
  failureCount: number
  isCurrent: boolean
  expiresAt: string | null
  authMethod: string | null
  hasProfileArn: boolean
  email?: string
  refreshTokenHash?: string
  successCount: number
  lastUsedAt: string | null
}

// 余额响应
export interface BalanceResponse {
  id: number
  subscriptionTitle: string | null
  currentUsage: number
  usageLimit: number
  remaining: number
  usagePercentage: number
  nextResetAt: number | null
}

// 成功响应
export interface SuccessResponse {
  success: boolean
  message: string
}

// 错误响应
export interface AdminErrorResponse {
  error: {
    type: string
    message: string
  }
}

// 请求类型
export interface SetDisabledRequest {
  disabled: boolean
}

export interface SetPriorityRequest {
  priority: number
}

// 添加凭据请求
export interface AddCredentialRequest {
  refreshToken: string
  authMethod?: 'social' | 'idc'
  clientId?: string
  clientSecret?: string
  priority?: number
  authRegion?: string
  apiRegion?: string
  machineId?: string
}

// 添加凭据响应
export interface AddCredentialResponse {
  success: boolean
  message: string
  credentialId: number
  email?: string
}

// Token 使用统计 - 分组统计
export interface GroupTokenStats {
  inputTokens: number
  outputTokens: number
  requests: number
}

// Token 使用统计 - 单条请求记录
export interface TokenUsageRecord {
  timestamp: string
  model: string
  credentialId: number
  inputTokens: number
  outputTokens: number
}

// Token 使用统计响应
export interface TokenUsageResponse {
  totalInputTokens: number
  totalOutputTokens: number
  totalRequests: number
  byCredential: Record<string, GroupTokenStats>
  byModel: Record<string, GroupTokenStats>
  recentRequests: TokenUsageRecord[]
}
