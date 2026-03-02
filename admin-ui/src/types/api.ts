// 凭据状态响应
export interface CredentialsStatusResponse {
  total: number;
  available: number;
  currentId: number;
  credentials: CredentialStatusItem[];
}

// 单个凭据状态
export interface CredentialStatusItem {
  id: number;
  priority: number;
  disabled: boolean;
  failureCount: number;
  totalFailureCount: number;
  isCurrent: boolean;
  expiresAt: string | null;
  authMethod: string | null;
  hasProfileArn: boolean;
  email?: string;
  refreshTokenHash?: string;
  successCount: number;
  lastUsedAt: string | null;
  hasProxy: boolean;
  proxyUrl?: string;
  createdAt?: string | null;
}

// 余额响应
export interface BalanceResponse {
  id: number;
  subscriptionTitle: string | null;
  currentUsage: number;
  usageLimit: number;
  remaining: number;
  usagePercentage: number;
  nextResetAt: number | null;
}

// 成功响应
export interface SuccessResponse {
  success: boolean;
  message: string;
}

// 错误响应
export interface AdminErrorResponse {
  error: {
    type: string;
    message: string;
  };
}

// 请求类型
export interface SetDisabledRequest {
  disabled: boolean;
}

export interface SetPriorityRequest {
  priority: number;
}

// 添加凭据请求
export interface AddCredentialRequest {
  refreshToken: string;
  authMethod?: "social" | "idc";
  clientId?: string;
  clientSecret?: string;
  priority?: number;
  authRegion?: string;
  apiRegion?: string;
  machineId?: string;
  email?: string;
  proxyUrl?: string;
  proxyUsername?: string;
  proxyPassword?: string;
}

// 添加凭据响应
export interface AddCredentialResponse {
  success: boolean;
  message: string;
  credentialId: number;
  email?: string;
}

// Token 使用统计 - 分组统计
export interface GroupTokenStats {
  inputTokens: number;
  outputTokens: number;
  requests: number;
}

// Token 使用统计 - 单条请求记录
export interface TokenUsageRecord {
  timestamp: string;
  model: string;
  credentialId: number;
  inputTokens: number;
  outputTokens: number;
  apiKeyId?: number;
  clientIp?: string;
  userInput?: string;
}

// Token 使用统计响应
export interface TokenUsageResponse {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalRequests: number;
  byCredential: Record<string, GroupTokenStats>;
  byModel: Record<string, GroupTokenStats>;
  byApiKey: Record<string, GroupTokenStats>;
  recentRequests: TokenUsageRecord[];
}

// 时间段统计数据
export interface TimeRangeStats {
  timeKey: string;
  inputTokens: number;
  outputTokens: number;
  requests: number;
}

// 时间序列统计响应
export interface TokenUsageTimeSeriesResponse {
  granularity: "hour" | "day" | "week";
  data: TimeRangeStats[];
  totalInputTokens: number;
  totalOutputTokens: number;
  totalRequests: number;
}

// API Key 条目视图（脱敏）
export interface ApiKeyEntryView {
  id: number;
  key: string;
  fullKey: string;
  keyLength: number;
  label: string;
  readOnly: boolean;
  allowedModels: string[] | null;
  disabled: boolean;
  boundCredentialIds: number[] | null;
  createdAt: string;
}

// 创建 API Key 请求
export interface CreateApiKeyRequest {
  key?: string;
  label: string;
  readOnly?: boolean;
  allowedModels?: string[];
  boundCredentialIds?: number[];
}

// 创建 API Key 响应
export interface CreateApiKeyResponse {
  success: boolean;
  message: string;
  id: number;
  key: string;
}

// 更新 API Key 请求
export interface UpdateApiKeyRequest {
  key?: string;
  label?: string;
  readOnly?: boolean;
  allowedModels?: string[] | null;
  disabled?: boolean;
  boundCredentialIds?: number[] | null;
}

// ============ 代理配置 ============

// 代理配置响应
export interface ProxyConfigResponse {
  enabled: boolean;
  url: string | null;
  username: string | null;
  hasPassword: boolean;
}

// 更新代理配置请求
export interface UpdateProxyConfigRequest {
  enabled: boolean;
  url?: string | null;
  username?: string | null;
  password?: string | null;
}

// ============ 连通性测试 ============

// 连通性测试请求
export interface ConnectivityTestRequest {
  mode: "anthropic" | "openai";
  model?: string;
  prompt?: string;
}

// 连通性测试响应
export interface ConnectivityTestResponse {
  success: boolean;
  mode: string;
  latencyMs: number;
  credentialId: number | null;
  model: string | null;
  reply: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  error: string | null;
}

// ============ 凭证测试 ============

// 凭证测试请求
export interface TestCredentialsRequest {
  testCount?: number; // 默认 20
  credentialIds?: number[]; // 指定要测试的凭证ID列表（可选）
  model?: string; // 测试使用的模型（可选）
}

// 凭证测试响应
export interface TestCredentialsResponse {
  success: boolean;
  message: string;
  results: CredentialTestResult[];
}

// 单个凭证测试结果
export interface CredentialTestResult {
  credentialId: number;
  successCount: number;
  failedCount: number;
  totalCount: number;
}
