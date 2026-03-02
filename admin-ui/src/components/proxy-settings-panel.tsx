import { useState, useEffect } from "react";
import { Globe, Loader2, Save, X, TestTube } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useProxyConfig, useUpdateProxyConfig } from "@/hooks/use-credentials";
import { extractErrorMessage } from "@/lib/utils";
import {
  getTestModel,
  setTestModel,
  getAutoTestOnStartup,
  setAutoTestOnStartup,
} from "@/lib/test-config";

const PROXY_HISTORY_KEY = "kiro-admin-proxy-history";
const MAX_HISTORY = 10;

// 可用的测试模型列表
const AVAILABLE_MODELS = [
  { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
  { value: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet" },
  { value: "claude-3-5-haiku-20241022", label: "Claude 3.5 Haiku" },
  { value: "claude-3-opus-20240229", label: "Claude 3 Opus" },
];

function getProxyHistory(): string[] {
  try {
    const raw = localStorage.getItem(PROXY_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function addProxyHistory(url: string) {
  if (!url.trim()) return;
  const history = getProxyHistory().filter((h) => h !== url);
  history.unshift(url);
  localStorage.setItem(
    PROXY_HISTORY_KEY,
    JSON.stringify(history.slice(0, MAX_HISTORY)),
  );
}

function removeProxyHistory(url: string) {
  const history = getProxyHistory().filter((h) => h !== url);
  localStorage.setItem(PROXY_HISTORY_KEY, JSON.stringify(history));
}

export function ProxySettingsPanel() {
  const { data, isLoading, error } = useProxyConfig();
  const updateMutation = useUpdateProxyConfig();

  const [enabled, setEnabled] = useState(false);
  const [url, setUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [dirty, setDirty] = useState(false);
  const [proxyHistory, setProxyHistory] = useState<string[]>(getProxyHistory);
  const [testModel, setTestModelState] = useState(getTestModel());
  const [testModelDirty, setTestModelDirty] = useState(false);
  const [autoTestOnStartup, setAutoTestOnStartupState] = useState(
    getAutoTestOnStartup(),
  );
  const [autoTestDirty, setAutoTestDirty] = useState(false);

  // 从服务端数据初始化表单
  useEffect(() => {
    if (data) {
      setEnabled(data.enabled);
      setUrl(data.url || "");
      setUsername(data.username || "");
      setPassword("");
      setDirty(false);
    }
  }, [data]);

  const handleFieldChange =
    <T,>(setter: (v: T) => void) =>
    (v: T) => {
      setter(v);
      setDirty(true);
    };

  const handleSave = () => {
    updateMutation.mutate(
      {
        enabled,
        url: enabled ? url : null,
        username: enabled && username ? username : null,
        password: enabled && password ? password : null,
      },
      {
        onSuccess: () => {
          toast.success(enabled ? "代理配置已更新并生效" : "代理已禁用");
          if (enabled && url.trim()) {
            addProxyHistory(url.trim());
            setProxyHistory(getProxyHistory());
          }
          setPassword("");
          setDirty(false);
        },
        onError: (err) => {
          toast.error(`保存失败: ${extractErrorMessage(err)}`);
        },
      },
    );
  };

  const handleSaveTestModel = () => {
    setTestModel(testModel);
    setTestModelDirty(false);
    toast.success("测试模型配置已保存");
  };

  const handleSaveAutoTest = () => {
    setAutoTestOnStartup(autoTestOnStartup);
    setAutoTestDirty(false);
    toast.success("自动测试配置已保存");
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">加载代理配置...</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-sm text-muted-foreground">代理配置不可用</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Globe className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-lg font-semibold">网络代理</h2>
        <Badge variant={enabled ? "default" : "secondary"} className="text-xs">
          {enabled ? "已启用" : "已禁用"}
        </Badge>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">代理配置</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 启用开关 */}
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">启用代理</label>
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              onClick={() => handleFieldChange(setEnabled)(!enabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                enabled ? "bg-primary" : "bg-muted"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  enabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          {/* 代理地址 */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">代理地址</label>
            <div className="relative">
              <input
                type="text"
                list="proxy-history-list"
                value={url}
                onChange={(e) => handleFieldChange(setUrl)(e.target.value)}
                disabled={!enabled}
                placeholder="http://127.0.0.1:7890"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
              <datalist id="proxy-history-list">
                {proxyHistory.map((h) => (
                  <option key={h} value={h} />
                ))}
              </datalist>
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              <p className="text-xs text-muted-foreground">
                支持 http、https、socks5 协议
              </p>
              {proxyHistory.length > 0 && (
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="text-xs text-muted-foreground">· 历史:</span>
                  {proxyHistory.map((h) => (
                    <span
                      key={h}
                      className="inline-flex items-center gap-0.5 text-xs bg-muted px-1.5 py-0.5 rounded"
                    >
                      <button
                        type="button"
                        className="hover:underline text-foreground disabled:opacity-50"
                        disabled={!enabled}
                        onClick={() => {
                          handleFieldChange(setUrl)(h);
                        }}
                      >
                        {h}
                      </button>
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-red-500"
                        onClick={() => {
                          removeProxyHistory(h);
                          setProxyHistory(getProxyHistory());
                        }}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 认证信息 */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">用户名（可选）</label>
              <input
                type="text"
                value={username}
                onChange={(e) => handleFieldChange(setUsername)(e.target.value)}
                disabled={!enabled}
                placeholder="代理认证用户名"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                密码（可选）
                {data?.hasPassword && !password && (
                  <span className="text-xs text-muted-foreground ml-1">
                    （已设置，留空保持不变）
                  </span>
                )}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => handleFieldChange(setPassword)(e.target.value)}
                disabled={!enabled}
                placeholder={data?.hasPassword ? "••••••••" : "代理认证密码"}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
          </div>

          {/* 保存按钮 */}
          <div className="flex justify-end pt-2">
            <Button
              onClick={handleSave}
              disabled={updateMutation.isPending || !dirty}
              size="sm"
            >
              {updateMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-1" />
              )}
              保存并生效
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 测试模型配置 */}
      <div className="flex items-center gap-2 mt-6">
        <TestTube className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-lg font-semibold">测试配置</h2>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">凭证测试模型</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">测试使用的模型</label>
            <select
              value={testModel}
              onChange={(e) => {
                setTestModelState(e.target.value);
                setTestModelDirty(true);
              }}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {AVAILABLE_MODELS.map((model) => (
                <option key={model.value} value={model.value}>
                  {model.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              用于凭证测试和连通性测试的默认模型
            </p>
          </div>

          {/* 启动时自动测试 */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <label className="text-sm font-medium">启动时自动测试凭证</label>
              <p className="text-xs text-muted-foreground">
                应用启动时自动测试所有可用凭证
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={autoTestOnStartup}
              onClick={() => {
                setAutoTestOnStartupState(!autoTestOnStartup);
                setAutoTestDirty(true);
              }}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                autoTestOnStartup ? "bg-primary" : "bg-muted"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  autoTestOnStartup ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          {/* 保存按钮 */}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              onClick={handleSaveTestModel}
              disabled={!testModelDirty}
              size="sm"
            >
              <Save className="h-4 w-4 mr-1" />
              保存模型配置
            </Button>
            <Button
              onClick={handleSaveAutoTest}
              disabled={!autoTestDirty}
              size="sm"
            >
              <Save className="h-4 w-4 mr-1" />
              保存自动测试配置
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
