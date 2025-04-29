'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import axios from 'axios';
import useSessionStore from '@/lib/stores/session-store';
import useMcpStore from '@/lib/stores/mcp-store';
import { useSocket } from '@/lib/socket';
import { FunctionCall } from '@/lib/api/chat';

interface TestResult {
  response: string;
  functionCalls: FunctionCall[];
  finalResponse?: string;
}

export default function FunctionCallTab() {
  const { sessionId } = useSessionStore();
  const { mcpList } = useMcpStore();
  const [testMessage, setTestMessage] = useState('');
  const [testStatus, setTestStatus] = useState('等待连接MCP服务');
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { isConnected } = useSocket(sessionId);

  // 检查功能可用性
  useEffect(() => {
    checkAvailability();
  }, [mcpList, isConnected]);

  const checkAvailability = () => {
    if (!isConnected) {
      setTestStatus('WebSocket未连接');
      return false;
    }

    const hasOpenAi = mcpList.some(
      mcp => mcp.name.toLowerCase().includes('openai') && mcp.status === 'connected',
    );

    if (!hasOpenAi) {
      setTestStatus('未找到可用的OpenAI MCP服务');
      return false;
    }

    const hasTools = mcpList.some(
      mcp => mcp.status === 'connected' && mcp.tools && mcp.tools.length > 0,
    );

    if (!hasTools) {
      setTestStatus('未找到可用的MCP工具');
      return false;
    }

    setTestStatus('已连接');
    return true;
  };

  const runTest = async () => {
    if (!testMessage.trim() || !sessionId || !checkAvailability()) return;

    setIsLoading(true);
    setTestResult(null);

    try {
      const response = await axios.post('/api/function-test', {
        sessionId,
        message: testMessage,
      });

      if (response.data.success) {
        setTestResult(response.data.result);
      } else {
        throw new Error(response.data.error || '测试失败');
      }
    } catch (error) {
      console.error('运行测试失败:', error);
      toast.error(`测试失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const clearResult = () => {
    setTestResult(null);
  };

  const isDisabled = testStatus !== '已连接' || isLoading;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">测试OpenAI函数调用</h2>
        <div className="text-sm flex items-center gap-2">
          <span className="text-muted-foreground">MCP状态:</span>
          <span
            className={`font-medium ${
              testStatus === '已连接' ? 'text-success' : 'text-destructive'
            }`}
          >
            {testStatus}
          </span>
        </div>
      </div>

      <p className="text-muted-foreground">
        使用此界面测试OpenAI的Function
        Call功能与MCP工具的集成。输入提示OpenAI调用工具的消息，查看结果。
      </p>

      <div className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="function-test-message" className="text-sm font-medium">
            测试消息 (尝试请求使用工具)
          </label>
          <Textarea
            id="function-test-message"
            placeholder="例如：'生成一张猫的图片' 或 '翻译 Hello World 到中文'"
            rows={3}
            value={testMessage}
            onChange={e => setTestMessage(e.target.value)}
            disabled={isDisabled}
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={clearResult} disabled={!testResult}>
            清除结果
          </Button>
          <Button onClick={runTest} disabled={isDisabled || !testMessage.trim()}>
            运行测试
          </Button>
        </div>
      </div>

      {testResult && (
        <div className="space-y-4">
          <h3 className="text-lg font-medium">测试结果:</h3>

          <Card>
            <CardContent className="p-4 space-y-4">
              <div className="space-y-2">
                <h4 className="text-sm font-medium">OpenAI初始响应:</h4>
                <div className="p-3 bg-muted rounded-md text-sm">{testResult.response}</div>
              </div>

              {testResult.functionCalls && testResult.functionCalls.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-sm font-medium">函数调用:</h4>

                  {testResult.functionCalls.map((call, index) => (
                    <div key={index} className="border rounded-md p-3 space-y-3 text-sm">
                      <div className="font-medium text-primary">{call.name}</div>

                      <div className="space-y-1">
                        <div className="text-xs font-medium text-muted-foreground">参数:</div>
                        <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                          {JSON.stringify(call.params, null, 2)}
                        </pre>
                      </div>

                      {call.result && (
                        <div className="space-y-1">
                          <div className="text-xs font-medium text-muted-foreground">结果:</div>
                          <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                            {JSON.stringify(call.result, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {testResult.finalResponse && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">最终响应:</h4>
                  <div className="p-3 bg-primary/10 rounded-md text-sm">
                    {testResult.finalResponse}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {!testResult && !isLoading && testStatus === '已连接' && (
        <div className="flex items-center justify-center p-12 text-center border rounded-md text-muted-foreground">
          <p>请连接MCP服务并运行测试</p>
        </div>
      )}

      {isLoading && (
        <div className="flex items-center justify-center p-12 text-center border rounded-md">
          <p>正在运行测试...</p>
        </div>
      )}
    </div>
  );
}
