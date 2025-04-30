'use client';

import { useEffect, useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Message, FunctionCall, getChatHistory, sendMessage, clearChat } from '@/lib/api/chat';
import useSessionStore from '@/lib/stores/session-store';
import useMcpStore from '@/lib/stores/mcp-store';
import { getSocket, useSocket } from '@/lib/socket';
import axios from 'axios';

export default function ChatTab() {
  const { sessionId } = useSessionStore();
  const { mcpList } = useMcpStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [chatStatus, setChatStatus] = useState('等待连接MCP服务');
  const { isConnected } = useSocket(sessionId);

  // 检查聊天可用性
  useEffect(() => {
    checkChatAvailability();
  }, [mcpList, isConnected]);

  // 加载聊天历史
  useEffect(() => {
    if (sessionId) {
      loadChatHistory();
    }
  }, [sessionId]);

  // 设置WebSocket监听器
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    // 监听新消息
    const handleNewMessage = (data: { message: Message }) => {
      setMessages(prev => [...prev, data.message]);
    };

    // 监听函数调用
    const handleFunctionCall = (data: { functionCall: FunctionCall; messageId: string }) => {
      setMessages(prev =>
        prev.map(msg => {
          if (msg.id === data.messageId) {
            return {
              ...msg,
              functionCalls: [...(msg.functionCalls || []), data.functionCall],
            };
          }
          return msg;
        }),
      );
    };

    socket.on('chat:message', handleNewMessage);
    socket.on('chat:function_call', handleFunctionCall);

    return () => {
      socket.off('chat:message', handleNewMessage);
      socket.off('chat:function_call', handleFunctionCall);
    };
  }, []);

  // 滚动到底部
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const checkChatAvailability = () => {
    if (!isConnected) {
      setChatStatus('WebSocket未连接');
      return false;
    }

    // 检查是否有OpenAI MCP，但即使没有也允许聊天
    const hasOpenAi = mcpList.some(
      mcp => mcp.name.toLowerCase().includes('openai') && mcp.status === 'connected',
    );

    if (hasOpenAi) {
      setChatStatus('已连接到OpenAI MCP');
      return true;
    }

    // 使用内置的OpenAI服务
    setChatStatus('使用内置OpenAI服务');
    return true;
  };

  const loadChatHistory = async () => {
    if (!sessionId) return;

    setIsLoading(true);
    try {
      const history = await getChatHistory(sessionId);
      setMessages(history);
    } catch (error) {
      console.error('加载聊天历史失败:', error);
      // 仅在非404错误时显示错误消息
      if (!(axios.isAxiosError(error) && error.response?.status === 404)) {
        toast.error(`加载聊天历史失败: ${error instanceof Error ? error.message : '未知错误'}`);
      }
      // 确保即使出错也设置为空消息列表
      setMessages([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || !sessionId) return;

    // 检查WebSocket是否连接
    if (!isConnected) {
      toast.error('WebSocket未连接，无法发送消息');
      return;
    }

    try {
      setIsLoading(true);

      // 添加用户消息到本地状态
      const userMessage: Message = {
        id: `temp-${Date.now()}`,
        role: 'user',
        content: inputMessage,
        time: new Date().toISOString(),
      };

      setMessages(prev => [...prev, userMessage]);
      setInputMessage('');

      // 发送消息到服务器
      await sendMessage(sessionId, inputMessage);
    } catch (error) {
      console.error('发送消息失败:', error);
      toast.error(`发送消息失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearChat = async () => {
    if (!sessionId) return;

    if (!window.confirm('确定要清除所有聊天记录吗？')) {
      return;
    }

    try {
      setIsLoading(true);
      await clearChat(sessionId);
      setMessages([]);
      toast.success('聊天记录已清除');
    } catch (error) {
      console.error('清除聊天记录失败:', error);
      toast.error(`清除聊天记录失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const formatTime = (timeString: string) => {
    try {
      return format(new Date(timeString), 'HH:mm:ss');
    } catch {
      return '时间错误';
    }
  };

  const isDisabled =
    (chatStatus !== '已连接' &&
      chatStatus !== '已连接到OpenAI MCP' &&
      chatStatus !== '使用内置OpenAI服务') ||
    isLoading;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">与OpenAI聊天</h2>
        <div className="text-sm flex items-center gap-2">
          <span className="text-muted-foreground">状态:</span>
          <span
            className={`font-medium ${
              chatStatus === '已连接' ||
              chatStatus === '已连接到OpenAI MCP' ||
              chatStatus === '使用内置OpenAI服务'
                ? 'text-success'
                : 'text-destructive'
            }`}
          >
            {chatStatus}
          </span>
        </div>
      </div>

      <div className="relative h-[400px] bg-muted/30 rounded-md border">
        <div className="absolute inset-0 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <p>请连接MCP服务并开始聊天</p>
            </div>
          ) : (
            messages.map(message => (
              <div
                key={message.id}
                className={`space-y-2 ${message.role === 'user' ? '' : 'pl-4'}`}
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium">
                    {message.role === 'user'
                      ? '用户'
                      : message.role === 'assistant'
                      ? '助手'
                      : '系统'}
                  </span>
                  <span className="text-xs text-muted-foreground">{formatTime(message.time)}</span>
                </div>

                <div
                  className={`p-3 rounded-lg ${
                    message.role === 'user'
                      ? 'bg-primary/10'
                      : message.role === 'assistant'
                      ? 'bg-muted'
                      : 'bg-warning/10'
                  }`}
                >
                  {message.content}
                </div>

                {message.functionCalls && message.functionCalls.length > 0 && (
                  <div className="space-y-3 ml-4">
                    {message.functionCalls.map((call, index) => (
                      <Card key={index} className="p-3 text-sm">
                        <h4 className="font-medium mb-1">
                          函数调用: <span className="text-primary">{call.name}</span>
                        </h4>

                        <div className="mb-2">
                          <div className="text-xs font-medium text-muted-foreground mb-1">
                            参数:
                          </div>
                          <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                            {JSON.stringify(call.params, null, 2)}
                          </pre>
                        </div>

                        {call.result !== undefined && call.result !== null && (
                          <div>
                            <div className="text-xs font-medium text-muted-foreground mb-1">
                              结果:
                            </div>
                            <pre className="p-2 bg-muted rounded-md text-xs overflow-auto max-h-[200px]">
                              {typeof call.result === 'object'
                                ? JSON.stringify(call.result, null, 2)
                                : String(call.result)}
                            </pre>
                          </div>
                        )}
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="flex gap-2">
        <Textarea
          value={inputMessage}
          onChange={e => setInputMessage(e.target.value)}
          placeholder="在这里输入消息..."
          className="min-h-[80px] resize-none"
          disabled={isDisabled}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSendMessage();
            }
          }}
        />
        <div className="flex flex-col gap-2">
          <Button onClick={handleSendMessage} disabled={isDisabled || !inputMessage.trim()}>
            发送
          </Button>
          <Button variant="outline" onClick={handleClearChat} disabled={isLoading}>
            清除
          </Button>
        </div>
      </div>
    </div>
  );
}
