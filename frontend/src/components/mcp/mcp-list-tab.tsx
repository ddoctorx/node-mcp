'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { McpService, McpTool } from '@/lib/stores/mcp-store';
import useSessionStore from '@/lib/stores/session-store';
import useMcpStore from '@/lib/stores/mcp-store';
import { getAllMcps, reconnectMcp, deleteMcp, callMcpTool } from '@/lib/api/mcp';

export default function McpListTab() {
  const { sessionId } = useSessionStore();
  const { mcpList, setMcpList, updateMcp, removeMcp } = useMcpStore();
  const [isLoading, setIsLoading] = useState(false);
  const [selectedMcp, setSelectedMcp] = useState<McpService | null>(null);
  const [selectedTool, setSelectedTool] = useState<McpTool | null>(null);
  const [toolParams, setToolParams] = useState<Record<string, string>>({});
  const [toolResult, setToolResult] = useState<string>('');

  // 加载MCP列表
  useEffect(() => {
    if (sessionId) {
      loadMcpList();
    }
  }, [sessionId]);

  const loadMcpList = async () => {
    if (!sessionId) return;

    setIsLoading(true);
    try {
      const mcps = await getAllMcps(sessionId);
      setMcpList(mcps);
    } catch (error) {
      console.error('加载MCP列表失败:', error);
      toast.error(`加载MCP列表失败: ${error instanceof Error ? error.message : '未知错误'}`);
      // 确保在API错误时设置一个空数组，避免使用旧数据
      setMcpList([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReconnect = async (mcp: McpService) => {
    if (!sessionId) {
      toast.error('未找到有效会话');
      return;
    }

    try {
      toast.loading(`正在重新连接 ${mcp.name}...`);
      const updatedMcp = await reconnectMcp(sessionId, mcp.id);
      updateMcp(mcp.id, updatedMcp);
      toast.success(`重新连接 ${mcp.name} 成功`);
    } catch (error) {
      console.error('重新连接MCP失败:', error);
      toast.error(`重新连接失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  const handleDelete = async (mcp: McpService) => {
    if (!sessionId) {
      toast.error('未找到有效会话');
      return;
    }

    if (!window.confirm(`确定要删除 ${mcp.name} 吗？`)) {
      return;
    }

    try {
      toast.loading(`正在删除 ${mcp.name}...`);
      await deleteMcp(sessionId, mcp.id);
      removeMcp(mcp.id);
      toast.success(`${mcp.name} 已删除`);
    } catch (error) {
      console.error('删除MCP失败:', error);
      toast.error(`删除失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  const openToolDialog = (mcp: McpService, tool: McpTool) => {
    setSelectedMcp(mcp);
    setSelectedTool(tool);
    setToolParams({});
    setToolResult('');
  };

  const closeToolDialog = () => {
    setSelectedMcp(null);
    setSelectedTool(null);
    setToolParams({});
    setToolResult('');
  };

  const handleToolParamChange = (key: string, value: string) => {
    setToolParams(prev => ({ ...prev, [key]: value }));
  };

  const executeTool = async () => {
    if (!sessionId || !selectedMcp || !selectedTool) return;

    try {
      setToolResult('执行中...');

      // 将字符串值转换为可能的数字、布尔值等
      const processedParams: Record<string, unknown> = {};

      Object.entries(toolParams).forEach(([key, value]) => {
        // 尝试转换为数字
        if (!isNaN(Number(value)) && value.trim() !== '') {
          processedParams[key] = Number(value);
        }
        // 尝试转换为布尔值
        else if (value.toLowerCase() === 'true') {
          processedParams[key] = true;
        } else if (value.toLowerCase() === 'false') {
          processedParams[key] = false;
        }
        // 保持字符串
        else {
          processedParams[key] = value;
        }
      });

      const result = await callMcpTool(
        sessionId,
        selectedMcp.id,
        selectedTool.name,
        processedParams,
      );

      setToolResult(JSON.stringify(result, null, 2));
    } catch (error) {
      console.error('执行工具失败:', error);
      setToolResult(`执行失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  // 无会话ID处理
  if (!sessionId) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <h2 className="text-2xl font-bold mb-4">已连接的MCP服务</h2>
        <p className="text-muted-foreground mb-4">未找到有效会话</p>
        <Button onClick={() => window.location.reload()}>刷新页面</Button>
      </div>
    );
  }

  // 加载中显示
  if (isLoading && mcpList.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <h2 className="text-2xl font-bold mb-4">已连接的MCP服务</h2>
        <p className="text-muted-foreground mb-4">正在加载MCP服务列表...</p>
      </div>
    );
  }

  // 空状态显示
  if (mcpList.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <h2 className="text-2xl font-bold mb-4">已连接的MCP服务</h2>
        <p className="text-muted-foreground mb-4">暂无已连接的MCP</p>
        <Button onClick={() => document.querySelector('[data-tab="add-mcp"]')?.click()}>
          添加您的第一个MCP服务
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">已连接的MCP服务</h2>
        <Button variant="outline" onClick={loadMcpList} disabled={isLoading}>
          {isLoading ? '加载中...' : '刷新'}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {mcpList.map(mcp => (
          <Card key={mcp.id} className="overflow-hidden">
            <CardContent className="p-0">
              <div className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-bold text-lg">{mcp.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline">{mcp.type}</Badge>
                      <Badge
                        variant={
                          mcp.status === 'connected'
                            ? 'success'
                            : mcp.status === 'error'
                            ? 'destructive'
                            : 'secondary'
                        }
                      >
                        {mcp.status === 'connected'
                          ? '已连接'
                          : mcp.status === 'error'
                          ? '错误'
                          : '已断开'}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleReconnect(mcp)}
                      title="重新连接"
                    >
                      重连
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDelete(mcp)}
                      title="删除"
                    >
                      删除
                    </Button>
                  </div>
                </div>

                {mcp.error && (
                  <div className="bg-destructive/10 text-destructive p-2 rounded text-sm mb-4">
                    错误: {mcp.error}
                  </div>
                )}

                {mcp.tools && mcp.tools.length > 0 ? (
                  <div>
                    <h4 className="text-sm font-medium mb-2">可用工具:</h4>
                    <div className="flex flex-wrap gap-2">
                      {mcp.tools.map(tool => (
                        <Button
                          key={tool.name}
                          variant="secondary"
                          size="sm"
                          onClick={() => openToolDialog(mcp, tool)}
                        >
                          {tool.name}
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">无可用工具</p>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 工具调用对话框 */}
      <Dialog open={!!selectedTool} onOpenChange={open => !open && closeToolDialog()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{selectedTool?.name}</DialogTitle>
            <DialogDescription>{selectedTool?.description}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {selectedTool?.parameters &&
              Object.entries(selectedTool.parameters).map(([key, schema]) => (
                <div key={key} className="space-y-2">
                  <label htmlFor={key} className="text-sm font-medium">
                    {key} {schema.required && <span className="text-destructive">*</span>}
                  </label>
                  <input
                    id={key}
                    type="text"
                    className="w-full p-2 border rounded"
                    placeholder={`输入 ${key}`}
                    value={toolParams[key] || ''}
                    onChange={e => handleToolParamChange(key, e.target.value)}
                  />
                  {schema.description && (
                    <p className="text-xs text-muted-foreground">{schema.description}</p>
                  )}
                </div>
              ))}

            {toolResult && (
              <div className="mt-4 space-y-2">
                <h4 className="text-sm font-medium">结果:</h4>
                <pre className="p-2 bg-muted rounded text-xs overflow-auto max-h-60">
                  {toolResult}
                </pre>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeToolDialog}>
              关闭
            </Button>
            <Button onClick={executeTool}>执行</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
