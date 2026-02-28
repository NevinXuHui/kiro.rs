import { useState, useRef, useCallback } from "react";
import {
  Wifi,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Hash,
  MessageSquare,
  ArrowDownToLine,
  ArrowUpFromLine,
  Circle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTestConnectivity } from "@/hooks/use-credentials";
import { SUPPORTED_MODELS } from "@/constants/models";
import type { ConnectivityTestResponse } from "@/types/api";

type StepStatus = "pending" | "running" | "done" | "error";
interface ProgressStep {
  label: string;
  status: StepStatus;
}

interface TestState {
  status: "idle" | "testing" | "success" | "error";
  result: ConnectivityTestResponse | null;
  steps: ProgressStep[];
  prompt: string;
}

const STEP_LABELS = [
  "初始化测试参数",
  "连接上游服务",
  "等待模型响应",
  "解析返回结果",
];
const MODEL_STORAGE_KEY = "kiro-test-model";

const initialState: TestState = {
  status: "idle",
  result: null,
  steps: [],
  prompt: "Say hello in one short sentence.",
};

function getStoredModel(): string {
  return (
    localStorage.getItem(MODEL_STORAGE_KEY) || "claude-sonnet-4-5-20250929"
  );
}

function makeSteps(active: number): ProgressStep[] {
  return STEP_LABELS.map((label, i) => ({
    label,
    status: (i < active
      ? "done"
      : i === active
        ? "running"
        : "pending") as StepStatus,
  }));
}

function finalizeSteps(errorAt?: number): ProgressStep[] {
  return STEP_LABELS.map((label, i) => ({
    label,
    status: (errorAt != null
      ? i < errorAt
        ? "done"
        : i === errorAt
          ? "error"
          : "pending"
      : "done") as StepStatus,
  }));
}

export function ConnectivityTestPanel() {
  const [anthropicState, setAnthropicState] = useState<TestState>(initialState);
  const [openaiState, setOpenaiState] = useState<TestState>(initialState);
  const [anthropicModel, setAnthropicModel] = useState<string>(getStoredModel);
  const [openaiModel, setOpenaiModel] = useState<string>(getStoredModel);
  const testMutation = useTestConnectivity();
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>[]>>({
    anthropic: [],
    openai: [],
  });

  const clearTimers = useCallback((mode: string) => {
    timersRef.current[mode]?.forEach(clearTimeout);
    timersRef.current[mode] = [];
  }, []);

  const handleModelChange = useCallback(
    (mode: "anthropic" | "openai", model: string) => {
      if (mode === "anthropic") {
        setAnthropicModel(model);
      } else {
        setOpenaiModel(model);
      }
      localStorage.setItem(MODEL_STORAGE_KEY, model);
    },
    [],
  );

  const handlePromptChange = useCallback(
    (mode: "anthropic" | "openai", prompt: string) => {
      if (mode === "anthropic") {
        setAnthropicState((prev) => ({ ...prev, prompt }));
      } else {
        setOpenaiState((prev) => ({ ...prev, prompt }));
      }
    },
    [],
  );

  const runTest = useCallback(
    (mode: "anthropic" | "openai") => {
      const setState =
        mode === "anthropic" ? setAnthropicState : setOpenaiState;
      const state = mode === "anthropic" ? anthropicState : openaiState;
      const model = mode === "anthropic" ? anthropicModel : openaiModel;
      clearTimers(mode);

      setState((prev) => ({
        ...prev,
        status: "testing",
        result: null,
        steps: makeSteps(0),
      }));

      timersRef.current[mode].push(
        setTimeout(
          () => setState((prev) => ({ ...prev, steps: makeSteps(1) })),
          400,
        ),
        setTimeout(
          () => setState((prev) => ({ ...prev, steps: makeSteps(2) })),
          1000,
        ),
      );

      testMutation.mutate(
        { mode, model, prompt: state.prompt },
        {
          onSuccess: (data) => {
            clearTimers(mode);
            setState((prev) => ({ ...prev, steps: makeSteps(3) }));
            setTimeout(() => {
              setState((prev) => ({
                ...prev,
                status: data.success ? "success" : "error",
                result: data,
                steps: finalizeSteps(data.success ? undefined : 3),
              }));
            }, 300);
          },
          onError: (err) => {
            clearTimers(mode);
            setState((prev) => ({
              ...prev,
              status: "error",
              steps: finalizeSteps(2),
              result: {
                success: false,
                mode,
                latencyMs: 0,
                credentialId: null,
                model: null,
                reply: null,
                inputTokens: null,
                outputTokens: null,
                error: (err as Error).message || "请求失败",
              },
            }));
          },
        },
      );
    },
    [
      testMutation,
      clearTimers,
      anthropicModel,
      openaiModel,
      anthropicState,
      openaiState,
    ],
  );

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* 标题栏 */}
      <div className="flex items-center gap-2">
        <Wifi className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-lg font-semibold">接口连通性测试</h2>
      </div>

      {/* 测试卡片 */}
      <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
        <TestCard
          title="Anthropic 模式"
          endpoint="/v1/messages"
          description="测试 Anthropic 兼容接口的上游连通性"
          state={anthropicState}
          model={anthropicModel}
          onModelChange={(m) => handleModelChange("anthropic", m)}
          onPromptChange={(p) => handlePromptChange("anthropic", p)}
          onTest={() => runTest("anthropic")}
        />

        <TestCard
          title="OpenAI 模式"
          endpoint="/v1/chat/completions"
          description="测试 OpenAI 兼容接口的上游连通性"
          state={openaiState}
          model={openaiModel}
          onModelChange={(m) => handleModelChange("openai", m)}
          onPromptChange={(p) => handlePromptChange("openai", p)}
          onTest={() => runTest("openai")}
        />
      </div>
    </div>
  );
}

function TestCard({
  title,
  endpoint,
  description,
  state,
  model,
  onModelChange,
  onPromptChange,
  onTest,
}: {
  title: string;
  endpoint: string;
  description: string;
  state: TestState;
  model: string;
  onModelChange: (model: string) => void;
  onPromptChange: (prompt: string) => void;
  onTest: () => void;
}) {
  const isTesting = state.status === "testing";
  return (
    <Card>
      <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          {title}
          <Badge variant="outline" className="text-[10px] sm:text-xs font-mono">
            {endpoint}
          </Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent className="px-3 sm:px-6 space-y-3">
        {/* 模型选择器 */}
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">测试模型</label>
          <select
            value={model}
            onChange={(e) => onModelChange(e.target.value)}
            disabled={isTesting}
            className="w-full h-8 text-xs border rounded px-2 bg-background disabled:opacity-50"
          >
            {SUPPORTED_MODELS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        {/* 提示词输入框 */}
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">测试提示词</label>
          <textarea
            value={state.prompt}
            onChange={(e) => onPromptChange(e.target.value)}
            disabled={isTesting}
            placeholder="输入测试提示词..."
            className="w-full min-h-[60px] text-xs border rounded px-2 py-1.5 bg-background disabled:opacity-50 resize-y"
          />
        </div>

        <Button
          onClick={onTest}
          disabled={isTesting}
          size="sm"
          className="w-full sm:w-auto"
        >
          {isTesting ? (
            <>
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              测试中...
            </>
          ) : (
            "开始测试"
          )}
        </Button>

        {/* 步骤进度 */}
        {state.steps.length > 0 && <StepProgress steps={state.steps} />}

        {/* 结果区域 */}
        {state.result && <TestResult result={state.result} />}
      </CardContent>
    </Card>
  );
}

function StepProgress({ steps }: { steps: ProgressStep[] }) {
  return (
    <div className="space-y-1.5 text-xs">
      {steps.map((step, i) => (
        <div key={i} className="flex items-center gap-2">
          {step.status === "done" && (
            <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
          )}
          {step.status === "running" && (
            <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin shrink-0" />
          )}
          {step.status === "error" && (
            <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
          )}
          {step.status === "pending" && (
            <Circle className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
          )}
          <span
            className={
              step.status === "done"
                ? "text-green-600 dark:text-green-400"
                : step.status === "running"
                  ? "text-foreground font-medium"
                  : step.status === "error"
                    ? "text-red-600 dark:text-red-400"
                    : "text-muted-foreground/50"
            }
          >
            {step.label}
          </span>
        </div>
      ))}
    </div>
  );
}

function TestResult({ result }: { result: ConnectivityTestResponse }) {
  return (
    <div
      className={`rounded-md border p-3 text-xs sm:text-sm space-y-2 ${
        result.success
          ? "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950"
          : "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950"
      }`}
    >
      <div className="flex items-center gap-1.5 font-medium">
        {result.success ? (
          <>
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <span className="text-green-700 dark:text-green-400">连接成功</span>
          </>
        ) : (
          <>
            <XCircle className="h-4 w-4 text-red-600" />
            <span className="text-red-700 dark:text-red-400">连接失败</span>
          </>
        )}
      </div>

      <div className="space-y-1 text-muted-foreground">
        {result.latencyMs > 0 && (
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            <span>延迟: {result.latencyMs} ms</span>
          </div>
        )}
        {result.credentialId != null && (
          <div className="flex items-center gap-1">
            <Hash className="h-3 w-3" />
            <span>凭据: #{result.credentialId}</span>
          </div>
        )}
        {result.model && <div className="truncate">模型: {result.model}</div>}
        {(result.inputTokens != null || result.outputTokens != null) && (
          <div className="flex items-center gap-3">
            {result.inputTokens != null && (
              <span className="flex items-center gap-1 text-blue-600">
                <ArrowDownToLine className="h-3 w-3" />
                输入: {result.inputTokens}
              </span>
            )}
            {result.outputTokens != null && (
              <span className="flex items-center gap-1 text-green-600">
                <ArrowUpFromLine className="h-3 w-3" />
                输出: {result.outputTokens}
              </span>
            )}
          </div>
        )}
      </div>

      {/* 模型回复内容 */}
      {result.reply && (
        <div className="mt-2 rounded border bg-background p-2">
          <div className="flex items-center gap-1 text-[10px] sm:text-xs text-muted-foreground mb-1">
            <MessageSquare className="h-3 w-3" />
            模型回复
          </div>
          <p className="text-xs sm:text-sm whitespace-pre-wrap break-all">
            {result.reply}
          </p>
        </div>
      )}

      {result.error && (
        <div className="text-red-600 dark:text-red-400 break-all">
          {result.error}
        </div>
      )}
    </div>
  );
}
