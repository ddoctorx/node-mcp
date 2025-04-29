'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  getPoolStats,
  getAllInstances,
  cleanupIdleInstances,
  removeInstance,
  getInstanceDetails,
  createDuplicateInstance,
  InstanceInfo,
} from '@/lib/api/pool';
import useSessionStore from '@/lib/stores/session-store';

export default function PoolMonitorTab() {
  const { sessionId } = useSessionStore();
  const [poolStats, setPoolStats] = useState({
    totalInstances: 0,
    activeInstances: 0,
    idleInstances: 0,
  });
  const [instances, setInstances] = useState<InstanceInfo[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<InstanceInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdateTime, setLastUpdateTime] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  // 测试表单状态
  const [testName, setTestName] = useState('test-mcp');
  const [testCommand, setTestCommand] = useState('node');
  const [testArgs, setTestArgs] = useState('examples/stdio-mcp-server.js');
  const [testResult, setTestResult] = useState('');

  // 加载数据
  useEffect(() => {
    refreshPoolStats();
    refreshInstanceList();
  }, []);

  // 自动刷新
  useEffect(() => {
    let refreshTimer: NodeJS.Timeout | null = null;

    if (autoRefresh) {
      refreshTimer = setInterval(() => {
        refreshPoolStats();
        refreshInstanceList();
      }, 10000); // 10秒刷新一次
    }

    return () => {
      if (refreshTimer) {
        clearInterval(refreshTimer);
      }
    };
  }, [autoRefresh]);

  const refreshPoolStats = async () => {
    try {
      const stats = await getPoolStats();
      setPoolStats(stats);
      setLastUpdateTime(new Date());
    } catch (error) {
      console.error('获取池状态失败:', error);
      toast.error(`获取池状态失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  const refreshInstanceList = async () => {
    setIsLoading(true);
    try {
      const allInstances = await getAllInstances();
      setInstances(allInstances);
    } catch (error) {
      console.error('获取实例列表失败:', error);
      toast.error(`获取实例列表失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = () => {
    refreshPoolStats();
    refreshInstanceList();
  };

  const handleCleanupIdleInstances = async () => {
    if (!window.confirm('确定要清理所有空闲实例吗？')) {
      return;
    }

    try {
      setIsLoading(true);
      await cleanupIdleInstances();
      toast.success('空闲实例已清理');
      handleRefresh();
    } catch (error) {
      console.error('清理空闲实例失败:', error);
      toast.error(`清理失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveInstance = async (instanceId: string) => {
    if (!window.confirm(`确定要删除实例 ${instanceId} 吗？`)) {
      return;
    }

    try {
      setIsLoading(true);
      await removeInstance(instanceId);
      toast.success('实例已删除');
      handleRefresh();
    } catch (error) {
      console.error('删除实例失败:', error);
      toast.error(`删除失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleViewInstance = async (instanceId: string) => {
    if (!sessionId) {
      toast.error('未找到有效会话');
      return;
    }

    try {
      setIsLoading(true);
      const instance = await getInstanceDetails(sessionId, instanceId);
      setSelectedInstance(instance);
    } catch (error) {
      console.error('获取实例详情失败:', error);
      toast.error(`获取实例详情失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateDuplicateInstance = async () => {
    try {
      setIsLoading(true);
      setTestResult('');

      const instance = await createDuplicateInstance(testName, testCommand, testArgs);

      setTestResult(`成功创建实例: ${instance.instanceId}`);
      handleRefresh();

      toast.success('重复实例已创建');
    } catch (error) {
      console.error('创建重复实例失败:', error);
      setTestResult(`创建失败: ${error instanceof Error ? error.message : '未知错误'}`);
      toast.error(`创建失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const formatDateTime = (dateString: string) => {
    try {
      return format(new Date(dateString), 'yyyy-MM-dd HH:mm:ss');
    } catch {
      return '无效日期';
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">MCP服务池监控</h2>

      {/* 池状态概览 */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium">池状态概览</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">总实例数</div>
              <div className="text-3xl font-bold mt-1">{poolStats.totalInstances}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">活跃实例</div>
              <div className="text-3xl font-bold mt-1 text-success">
                {poolStats.activeInstances}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">空闲实例</div>
              <div className="text-3xl font-bold mt-1 text-warning">{poolStats.idleInstances}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">最后更新</div>
              <div className="text-sm font-medium mt-1">
                {lastUpdateTime ? format(lastUpdateTime, 'HH:mm:ss') : '-'}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={handleRefresh} disabled={isLoading}>
            刷新状态
          </Button>
          <Button variant="outline" onClick={handleCleanupIdleInstances} disabled={isLoading}>
            清理空闲实例
          </Button>
          <div className="ml-auto flex items-center gap-2">
            <label className="text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={e => setAutoRefresh(e.target.checked)}
                className="mr-2"
              />
              自动刷新 (10秒)
            </label>
          </div>
        </div>
      </div>

      {/* 实例列表 */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium">实例列表</h3>

        {instances.length === 0 ? (
          <div className="border rounded-md p-16 text-center text-muted-foreground">
            <p>暂无MCP实例</p>
          </div>
        ) : (
          <div className="border rounded-md overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名称</TableHead>
                  <TableHead>实例ID</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead>会话数</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>创建时间</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {instances.map(instance => (
                  <TableRow key={instance.instanceId}>
                    <TableCell className="font-medium">{instance.name}</TableCell>
                    <TableCell className="font-mono text-xs">{instance.instanceId}</TableCell>
                    <TableCell>{instance.type}</TableCell>
                    <TableCell>{instance.sessionCount}</TableCell>
                    <TableCell>
                      <div
                        className={`inline-flex items-center px-2 py-1 rounded text-xs ${
                          instance.status === 'connected'
                            ? 'bg-success/20 text-success'
                            : instance.status === 'error'
                            ? 'bg-destructive/20 text-destructive'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {instance.status}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">
                      {formatDateTime(instance.createdTime)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewInstance(instance.instanceId)}
                        >
                          查看
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleRemoveInstance(instance.instanceId)}
                          disabled={instance.sessionCount > 0}
                        >
                          删除
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* 实例复用测试 */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium">实例复用测试</h3>
        <Card>
          <CardContent className="pt-6 space-y-4">
            <p className="text-sm text-muted-foreground">
              此工具可以创建相同配置的MCP实例，用于测试实例复用功能。
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label htmlFor="test-server-name" className="text-sm font-medium">
                  服务名称
                </label>
                <Input
                  id="test-server-name"
                  value={testName}
                  onChange={e => setTestName(e.target.value)}
                  placeholder="例如: test-mcp"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="test-server-command" className="text-sm font-medium">
                  命令
                </label>
                <Input
                  id="test-server-command"
                  value={testCommand}
                  onChange={e => setTestCommand(e.target.value)}
                  placeholder="例如: node"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="test-server-args" className="text-sm font-medium">
                  参数 (逗号分隔)
                </label>
                <Input
                  id="test-server-args"
                  value={testArgs}
                  onChange={e => setTestArgs(e.target.value)}
                  placeholder="例如: index.js"
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Button
                onClick={handleCreateDuplicateInstance}
                disabled={isLoading || !testName || !testCommand}
              >
                创建重复实例
              </Button>

              {testResult && (
                <div
                  className={`text-sm px-4 py-2 rounded ${
                    testResult.startsWith('成功')
                      ? 'bg-success/20 text-success'
                      : 'bg-destructive/20 text-destructive'
                  }`}
                >
                  {testResult}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 实例详情对话框 */}
      <Dialog open={!!selectedInstance} onOpenChange={open => !open && setSelectedInstance(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>实例详情</DialogTitle>
            <DialogDescription>
              {selectedInstance?.name} ({selectedInstance?.instanceId})
            </DialogDescription>
          </DialogHeader>

          {selectedInstance && (
            <div className="space-y-4 py-4">
              <table className="w-full text-sm">
                <tbody>
                  <tr>
                    <td className="py-1 font-medium text-muted-foreground">实例ID:</td>
                    <td className="py-1 font-mono">{selectedInstance.instanceId}</td>
                  </tr>
                  <tr>
                    <td className="py-1 font-medium text-muted-foreground">名称:</td>
                    <td className="py-1">{selectedInstance.name}</td>
                  </tr>
                  <tr>
                    <td className="py-1 font-medium text-muted-foreground">类型:</td>
                    <td className="py-1">{selectedInstance.type}</td>
                  </tr>
                  <tr>
                    <td className="py-1 font-medium text-muted-foreground">状态:</td>
                    <td className="py-1">{selectedInstance.status}</td>
                  </tr>
                  <tr>
                    <td className="py-1 font-medium text-muted-foreground">关联会话数:</td>
                    <td className="py-1">{selectedInstance.sessionCount}</td>
                  </tr>
                  <tr>
                    <td className="py-1 font-medium text-muted-foreground">创建时间:</td>
                    <td className="py-1">{formatDateTime(selectedInstance.createdTime)}</td>
                  </tr>
                  <tr>
                    <td className="py-1 font-medium text-muted-foreground">最后使用:</td>
                    <td className="py-1">{formatDateTime(selectedInstance.lastUsedTime)}</td>
                  </tr>
                  <tr>
                    <td className="py-1 font-medium text-muted-foreground">工具数量:</td>
                    <td className="py-1">
                      {selectedInstance.tools ? selectedInstance.tools.length : 0}
                    </td>
                  </tr>
                </tbody>
              </table>

              {selectedInstance.tools && selectedInstance.tools.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">可用工具:</h4>
                  <ul className="text-sm space-y-1 bg-muted p-2 rounded">
                    {selectedInstance.tools.map((tool, index) => (
                      <li key={index}>
                        <span className="font-medium">{tool.name}</span>
                        {tool.description && (
                          <span className="text-muted-foreground ml-2">- {tool.description}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedInstance(null)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
