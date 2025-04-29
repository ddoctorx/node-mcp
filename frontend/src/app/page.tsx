'use client';

import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import AddMcpTab from '@/components/mcp/add-mcp-tab';
import McpListTab from '@/components/mcp/mcp-list-tab';
import ChatTab from '@/components/chat/chat-tab';
import FunctionCallTab from '@/components/function-call/function-call-tab';
import PoolMonitorTab from '@/components/pool-monitor/pool-monitor-tab';
import PythonMcpTab from '@/components/mcp/python-mcp-tab';
import GitMcpTab from '@/components/mcp/git-mcp-tab';
import useSessionStore from '@/lib/stores/session-store';
import useMcpStore from '@/lib/stores/mcp-store';
import { toast } from 'sonner';
import { createNewSession } from '@/lib/api/session';

export default function Home() {
  const [activeTab, setActiveTab] = useState('add-mcp');
  const { sessionId, setSessionId } = useSessionStore();
  const { mcpList } = useMcpStore();

  useEffect(() => {
    // 恢复会话
    const savedSessionId = localStorage.getItem('mcpSessionId');
    if (savedSessionId) {
      setSessionId(savedSessionId);
    } else {
      handleNewSession();
    }
  }, []);

  const handleNewSession = async () => {
    try {
      toast.loading('正在创建新会话...');
      const newSessionId = await createNewSession();
      setSessionId(newSessionId);
      localStorage.setItem('mcpSessionId', newSessionId);
      toast.success('会话已创建');
    } catch (error) {
      console.error('创建会话失败:', error);
      toast.error(`创建会话失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  return (
    <main className="container mx-auto p-4">
      <header className="flex justify-between items-center mb-8 pb-4 border-b">
        <h1 className="text-2xl font-bold">MCP管理界面</h1>
        <div className="flex items-center gap-4">
          <div className="text-sm text-muted-foreground">
            {sessionId ? `会话ID: ${sessionId}` : '未连接'}
          </div>
          <Button variant="outline" onClick={handleNewSession}>
            新建会话
          </Button>
        </div>
      </header>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="add-mcp">添加MCP</TabsTrigger>
          <TabsTrigger value="list-mcp">
            已连接MCP
            {mcpList.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {mcpList.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="chat">聊天</TabsTrigger>
          <TabsTrigger value="test-function-call">测试Function Call</TabsTrigger>
          <TabsTrigger value="monitor-pool">监控池状态</TabsTrigger>
          <TabsTrigger value="python-mcp">Python MCP</TabsTrigger>
          <TabsTrigger value="git-mcp">Git MCP</TabsTrigger>
        </TabsList>

        <Card>
          <CardContent className="pt-6">
            <TabsContent value="add-mcp">
              <AddMcpTab />
            </TabsContent>
            <TabsContent value="list-mcp">
              <McpListTab />
            </TabsContent>
            <TabsContent value="chat">
              <ChatTab />
            </TabsContent>
            <TabsContent value="test-function-call">
              <FunctionCallTab />
            </TabsContent>
            <TabsContent value="monitor-pool">
              <PoolMonitorTab />
            </TabsContent>
            <TabsContent value="python-mcp">
              <PythonMcpTab />
            </TabsContent>
            <TabsContent value="git-mcp">
              <GitMcpTab />
            </TabsContent>
          </CardContent>
        </Card>
      </Tabs>
    </main>
  );
}
