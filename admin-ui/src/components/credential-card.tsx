import { useState } from "react";
import { toast } from "sonner";
import {
  RefreshCw,
  ChevronUp,
  ChevronDown,
  Trash2,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { CredentialStatusItem, BalanceResponse } from "@/types/api";
import {
  useSetDisabled,
  useSetPriority,
  useSetPrimary,
  useResetFailure,
  useDeleteCredential,
} from "@/hooks/use-credentials";
import { getCredentialBalance, testCredentials } from "@/api/credentials";
import { getTestModel } from "@/lib/test-config";

interface CredentialCardProps {
  credential: CredentialStatusItem;
  selected: boolean;
  onToggleSelect: () => void;
  balance: BalanceResponse | null;
  loadingBalance: boolean;
  onPrimarySet?: () => void;
  onBalanceRefreshed?: (id: number, balance: BalanceResponse) => void;
  onCredentialTested?: () => void;
}

function formatLastUsed(lastUsedAt: string | null): string {
  if (!lastUsedAt) return "从未使用";
  const date = new Date(lastUsedAt);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  if (diff < 0) return "刚刚";
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds} 秒前`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  return `${days} 天前`;
}

export function CredentialCard({
  credential,
  selected,
  onToggleSelect,
  balance,
  loadingBalance,
  onPrimarySet,
  onBalanceRefreshed,
  onCredentialTested,
}: CredentialCardProps) {
  const [editingPriority, setEditingPriority] = useState(false);
  const [priorityValue, setPriorityValue] = useState(
    String(credential.priority),
  );
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [refreshingBalance, setRefreshingBalance] = useState(false);
  const [testingCredential, setTestingCredential] = useState(false);

  const setDisabled = useSetDisabled();
  const setPriority = useSetPriority();
  const setPrimary = useSetPrimary();
  const resetFailure = useResetFailure();
  const deleteCredential = useDeleteCredential();

  const handleRefreshBalance = async () => {
    setRefreshingBalance(true);
    try {
      const freshBalance = await getCredentialBalance(credential.id, true); // 强制刷新
      onBalanceRefreshed?.(credential.id, freshBalance);
      toast.success("余额已刷新");
    } catch (error) {
      toast.error("刷新失败: " + (error as Error).message);
    } finally {
      setRefreshingBalance(false);
    }
  };

  const handleToggleDisabled = () => {
    setDisabled.mutate(
      { id: credential.id, disabled: !credential.disabled },
      {
        onSuccess: (res) => {
          toast.success(res.message);
        },
        onError: (err) => {
          toast.error("操作失败: " + (err as Error).message);
        },
      },
    );
  };

  const handlePriorityChange = () => {
    const newPriority = parseInt(priorityValue, 10);
    if (isNaN(newPriority) || newPriority < 0) {
      toast.error("优先级必须是非负整数");
      return;
    }
    setPriority.mutate(
      { id: credential.id, priority: newPriority },
      {
        onSuccess: (res) => {
          toast.success(res.message);
          setEditingPriority(false);
        },
        onError: (err) => {
          toast.error("操作失败: " + (err as Error).message);
        },
      },
    );
  };

  const handleReset = () => {
    resetFailure.mutate(credential.id, {
      onSuccess: (res) => {
        toast.success(res.message);
      },
      onError: (err) => {
        toast.error("操作失败: " + (err as Error).message);
      },
    });
  };

  const handleDelete = () => {
    if (!credential.disabled) {
      toast.error("请先禁用凭据再删除");
      setShowDeleteDialog(false);
      return;
    }

    deleteCredential.mutate(credential.id, {
      onSuccess: (res) => {
        toast.success(res.message);
        setShowDeleteDialog(false);
      },
      onError: (err) => {
        toast.error("删除失败: " + (err as Error).message);
      },
    });
  };

  const handleSetPrimary = () => {
    if (credential.isCurrent || credential.disabled) return;
    setPrimary.mutate(credential.id, {
      onSuccess: (res) => {
        toast.success(res.message);
        onPrimarySet?.();
      },
      onError: (err) => toast.error("操作失败: " + (err as Error).message),
    });
  };

  // 测试单个凭证
  const handleTestCredential = async () => {
    if (credential.disabled) {
      toast.error("无法测试已禁用的凭据");
      return;
    }

    setTestingCredential(true);

    try {
      const response = await testCredentials({
        testCount: 20,
        credentialIds: [credential.id],
        model: getTestModel(),
      });

      if (response.success) {
        const result = response.results.find(
          (r) => r.credentialId === credential.id,
        );

        if (result) {
          toast.success(
            `测试完成：成功 ${result.successCount}/${result.totalCount}`,
          );
          // 通知父组件刷新凭证列表
          onCredentialTested?.();
        } else {
          toast.info("该凭据未被测试");
        }
      } else {
        toast.error(`测试失败: ${response.message}`);
      }
    } catch (error) {
      toast.error(`测试失败: ${(error as Error).message}`);
    } finally {
      setTestingCredential(false);
    }
  };

  // 双击卡片设为首选（排除交互元素内的点击）
  const handleCardDoubleClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button, input, [role="switch"], [role="checkbox"], a'))
      return;
    handleSetPrimary();
  };

  return (
    <>
      <Card
        className={`${credential.isCurrent ? "ring-2 ring-primary" : ""} ${
          !credential.isCurrent && !credential.disabled
            ? "cursor-pointer hover:border-primary/50 transition-colors"
            : ""
        }`}
        onDoubleClick={handleCardDoubleClick}
      >
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            {/* 左上角：凭据序号 */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <Checkbox
                checked={selected}
                onCheckedChange={onToggleSelect}
                className="flex-shrink-0"
              />
              <Badge variant="outline" className="font-mono">
                #{credential.id}
              </Badge>
            </div>

            {/* 右上角：启用开关 */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-sm text-muted-foreground">启用</span>
              <Switch
                checked={!credential.disabled}
                onCheckedChange={handleToggleDisabled}
                disabled={setDisabled.isPending}
              />
            </div>
          </div>

          {/* 第二行：邮箱和状态标签 */}
          <div className="flex items-center gap-2 mt-2">
            <CardTitle className="text-lg flex items-center gap-2 min-w-0 flex-1">
              <span
                className="truncate"
                title={credential.email || `凭据 #${credential.id}`}
              >
                {credential.email || `凭据 #${credential.id}`}
              </span>
              <div className="flex items-center gap-2 flex-shrink-0">
                {credential.isCurrent && <Badge variant="success">当前</Badge>}
                {credential.disabled && (
                  <Badge variant="destructive">已禁用</Badge>
                )}
                {!credential.isCurrent && !credential.disabled && (
                  <span className="text-xs text-muted-foreground font-normal whitespace-nowrap">
                    双击设为首选
                  </span>
                )}
              </div>
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 信息网格 */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">优先级：</span>
              {editingPriority ? (
                <div className="inline-flex items-center gap-1 ml-1">
                  <Input
                    type="number"
                    value={priorityValue}
                    onChange={(e) => setPriorityValue(e.target.value)}
                    className="w-16 h-7 text-sm"
                    min="0"
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0"
                    onClick={handlePriorityChange}
                    disabled={setPriority.isPending}
                  >
                    ✓
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0"
                    onClick={() => {
                      setEditingPriority(false);
                      setPriorityValue(String(credential.priority));
                    }}
                  >
                    ✕
                  </Button>
                </div>
              ) : (
                <span
                  className="font-medium cursor-pointer hover:underline ml-1"
                  onClick={() => setEditingPriority(true)}
                >
                  {credential.priority}
                  <span className="text-xs text-muted-foreground ml-1">
                    (点击编辑)
                  </span>
                </span>
              )}
            </div>
            <div>
              <span className="text-muted-foreground">失败次数：</span>
              <span
                className={
                  credential.totalFailureCount > 0
                    ? "text-red-500 font-medium"
                    : ""
                }
              >
                {credential.totalFailureCount}
              </span>
              {credential.failureCount > 0 && (
                <span className="text-red-500 text-xs ml-1">
                  (连续 {credential.failureCount})
                </span>
              )}
            </div>
            <div>
              <span className="text-muted-foreground">订阅等级：</span>
              <span className="font-medium">
                {loadingBalance ? (
                  <Loader2 className="inline w-3 h-3 animate-spin" />
                ) : (
                  balance?.subscriptionTitle?.replace(/^KIRO\s*/i, "") || "未知"
                )}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">成功次数：</span>
              <span className="font-medium">{credential.successCount}</span>
            </div>
            <div className="col-span-2">
              <span className="text-muted-foreground">最后调用：</span>
              <span className="font-medium">
                {formatLastUsed(credential.lastUsedAt)}
              </span>
            </div>
            <div className="col-span-2">
              <span className="text-muted-foreground">导入时间：</span>
              <span className="font-medium">
                {formatLastUsed(credential.createdAt || null)}
              </span>
            </div>
            <div className="col-span-2">
              <span className="text-muted-foreground">剩余用量：</span>
              {loadingBalance ? (
                <span className="text-sm ml-1">
                  <Loader2 className="inline w-3 h-3 animate-spin" /> 加载中...
                </span>
              ) : balance ? (
                <span className="font-medium ml-1">
                  {balance.remaining.toFixed(2)} /{" "}
                  {balance.usageLimit.toFixed(2)}
                  <span className="text-xs text-muted-foreground ml-1">
                    ({(100 - balance.usagePercentage).toFixed(1)}% 剩余)
                  </span>
                </span>
              ) : (
                <span className="text-sm text-muted-foreground ml-1">未知</span>
              )}
            </div>
            {credential.hasProxy && (
              <div className="col-span-2">
                <span className="text-muted-foreground">代理：</span>
                <span className="font-medium">{credential.proxyUrl}</span>
              </div>
            )}
            {credential.hasProfileArn && (
              <div className="col-span-2">
                <Badge variant="secondary">有 Profile ARN</Badge>
              </div>
            )}
          </div>

          {/* 操作按钮 */}
          <div className="flex flex-wrap justify-center gap-2 pt-2 border-t">
            <Button
              size="sm"
              variant="default"
              onClick={handleRefreshBalance}
              disabled={refreshingBalance}
              className="font-medium"
            >
              <RefreshCw
                className={`h-4 w-4 mr-1 ${refreshingBalance ? "animate-spin" : ""}`}
              />
              刷新余额
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleTestCredential}
              disabled={testingCredential || credential.disabled}
              title={credential.disabled ? "无法测试已禁用的凭据" : undefined}
            >
              <CheckCircle2
                className={`h-4 w-4 mr-1 ${testingCredential ? "animate-spin" : ""}`}
              />
              测试凭证
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleReset}
              disabled={resetFailure.isPending || credential.failureCount === 0}
            >
              <RefreshCw className="h-4 w-4 mr-1" />
              重置失败
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const newPriority = Math.max(0, credential.priority - 1);
                setPriority.mutate(
                  { id: credential.id, priority: newPriority },
                  {
                    onSuccess: (res) => toast.success(res.message),
                    onError: (err) =>
                      toast.error("操作失败: " + (err as Error).message),
                  },
                );
              }}
              disabled={setPriority.isPending || credential.priority === 0}
            >
              <ChevronUp className="h-4 w-4 mr-1" />
              提高优先级
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const newPriority = credential.priority + 1;
                setPriority.mutate(
                  { id: credential.id, priority: newPriority },
                  {
                    onSuccess: (res) => toast.success(res.message),
                    onError: (err) =>
                      toast.error("操作失败: " + (err as Error).message),
                  },
                );
              }}
              disabled={setPriority.isPending}
            >
              <ChevronDown className="h-4 w-4 mr-1" />
              降低优先级
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setShowDeleteDialog(true)}
              disabled={!credential.disabled}
              title={
                !credential.disabled ? "需要先禁用凭据才能删除" : undefined
              }
            >
              <Trash2 className="h-4 w-4 mr-1" />
              删除
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 删除确认对话框 */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除凭据</DialogTitle>
            <DialogDescription>
              您确定要删除凭据 #{credential.id} 吗？此操作无法撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
              disabled={deleteCredential.isPending}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteCredential.isPending || !credential.disabled}
            >
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
