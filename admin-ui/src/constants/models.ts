/**
 * 支持的 Claude 模型列表
 * 与后端 src/anthropic/handlers.rs 中的模型列表保持同步
 */

export interface ModelOption {
  value: string
  label: string
  category: 'sonnet' | 'opus' | 'haiku'
}

export const SUPPORTED_MODELS: ModelOption[] = [
  // Sonnet 系列
  {
    value: 'claude-sonnet-4-5-20250929',
    label: 'Claude Sonnet 4.5',
    category: 'sonnet',
  },
  {
    value: 'claude-sonnet-4-5-20250929-thinking',
    label: 'Claude Sonnet 4.5 (Thinking)',
    category: 'sonnet',
  },
  // Opus 系列
  {
    value: 'claude-opus-4-5-20251101',
    label: 'Claude Opus 4.5',
    category: 'opus',
  },
  {
    value: 'claude-opus-4-5-20251101-thinking',
    label: 'Claude Opus 4.5 (Thinking)',
    category: 'opus',
  },
  {
    value: 'claude-opus-4-6',
    label: 'Claude Opus 4.6',
    category: 'opus',
  },
  {
    value: 'claude-opus-4-6-thinking',
    label: 'Claude Opus 4.6 (Thinking)',
    category: 'opus',
  },
  // Haiku 系列
  {
    value: 'claude-haiku-4-5-20251001',
    label: 'Claude Haiku 4.5',
    category: 'haiku',
  },
  {
    value: 'claude-haiku-4-5-20251001-thinking',
    label: 'Claude Haiku 4.5 (Thinking)',
    category: 'haiku',
  },
]

/**
 * 按类别分组的模型
 */
export const MODELS_BY_CATEGORY = {
  sonnet: SUPPORTED_MODELS.filter((m) => m.category === 'sonnet'),
  opus: SUPPORTED_MODELS.filter((m) => m.category === 'opus'),
  haiku: SUPPORTED_MODELS.filter((m) => m.category === 'haiku'),
}
