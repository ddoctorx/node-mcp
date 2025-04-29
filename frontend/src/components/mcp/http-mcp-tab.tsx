'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { addMcp } from '@/lib/api/mcp';
import useSessionStore from '@/lib/stores/session-store';
import useMcpStore from '@/lib/stores/mcp-store';

export default function HttpMcpTab() {
  const { sessionId } = useSessionStore();
  const { addMcp: addMcpToStore } = useMcpStore();
  const [isLoading, setIsLoading] = useState(false);

  // HTTP服务器配置
  const [mcpName, setMcpName] = useState('');
  const [apiUrl, setApiUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [headers, setHeaders] = useState('');
  const [authMethod, setAuthMethod] = useState('header');
  const [requiresBasicAuth, setRequiresBasicAuth] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // 配置预览
  const [configPreview, setConfigPreview] = useState('');

  // 更新配置预览
  useEffect(() => {
    updatePreview();
  }, [mcpName, apiUrl, apiKey, headers, authMethod, requiresBasicAuth, username, password]);

  const updatePreview = () => {
    if (!mcpName || !apiUrl) {
      setConfigPreview('');
      return;
    }

    // 构建HTTP服务配置
    const config = {
      mcpServers: {
        [mcpName]: {
          url: apiUrl,
          httpHeaders: parseHeaders(),
          description: 'HTTP MCP服务',
        },
      },
    };

    // 更新预览
    setConfigPreview(JSON.stringify(config, null, 2));
  };

  const parseHeaders = () => {
    const result: Record<string, string> = {};

    // 添加API密钥（如果有）
    if (apiKey) {
      if (authMethod === 'header') {
        result['Authorization'] = `Bearer ${apiKey}`;
      } else if (authMethod === 'x-api-key') {
        result['X-API-Key'] = apiKey;
      }
    }

    // 添加基本认证
    if (requiresBasicAuth && username) {
      const auth = btoa(`${username}:${password}`);
      result['Authorization'] = `Basic ${auth}`;
    }

    // 解析自定义标头
    if (headers) {
      const headerLines = headers
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);

      for (const line of headerLines) {
        // 查找第一个冒号位置
        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
          const key = line.substring(0, colonIndex).trim();
          const value = line.substring(colonIndex + 1).trim();
          result[key] = value;
        }
      }
    }

    return result;
  };

  const createHttpMcp = async () => {
    if (!sessionId) {
      toast.error('未找到有效会话');
      return;
    }

    if (!mcpName || !apiUrl) {
      toast.error('请填写必填字段');
      return;
    }

    setIsLoading(true);

    try {
      // 准备HTTP MCP数据
      const mcpData = {
        name: mcpName,
        type: 'http' as const,
        url: apiUrl,
        httpHeaders: parseHeaders(),
        env: {},
      };

      // 调用API添加MCP
      const newMcp = await addMcp(sessionId, mcpData);

      // 添加到状态管理
      addMcpToStore(newMcp);

      toast.success(`HTTP MCP服务 ${mcpName} 已创建`);

      // 重置表单（可选）
      setMcpName('');
      setApiUrl('');
      setApiKey('');
      setHeaders('');
      setAuthMethod('header');
      setRequiresBasicAuth(false);
      setUsername('');
      setPassword('');
    } catch (error) {
      console.error('创建HTTP MCP失败:', error);
      toast.error(`创建失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">创建HTTP MCP服务</h2>
      <p className="text-muted-foreground">
        使用此表单可以创建连接到HTTP API的MCP服务。适用于已有的OpenAI兼容API或其他HTTP MCP服务。
      </p>

      <div className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="http-mcp-name" className="text-sm font-medium">
            MCP名称 *
          </label>
          <Input
            id="http-mcp-name"
            value={mcpName}
            onChange={e => setMcpName(e.target.value)}
            placeholder="例如: my-http-mcp"
            required
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="http-api-url" className="text-sm font-medium">
            API URL *
          </label>
          <Input
            id="http-api-url"
            value={apiUrl}
            onChange={e => setApiUrl(e.target.value)}
            placeholder="例如: https://api.example.com/v1"
            required
          />
        </div>

        <div className="space-y-4">
          <h3 className="text-sm font-medium">API认证</h3>

          <div className="space-y-2">
            <label htmlFor="http-api-key" className="text-sm font-medium">
              API密钥
            </label>
            <Input
              id="http-api-key"
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="例如: sk-xxxxxxxxxxxxx"
            />
          </div>

          {apiKey && (
            <div className="space-y-2">
              <label htmlFor="http-auth-method" className="text-sm font-medium">
                认证方式
              </label>
              <Select value={authMethod} onValueChange={setAuthMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="header">Bearer Token</SelectItem>
                  <SelectItem value="x-api-key">X-API-Key</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex items-center space-x-2">
            <Switch
              id="http-basic-auth"
              checked={requiresBasicAuth}
              onCheckedChange={setRequiresBasicAuth}
            />
            <Label htmlFor="http-basic-auth">使用HTTP基本认证</Label>
          </div>

          {requiresBasicAuth && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label htmlFor="http-username" className="text-sm font-medium">
                  用户名
                </label>
                <Input
                  id="http-username"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="用户名"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="http-password" className="text-sm font-medium">
                  密码
                </label>
                <Input
                  id="http-password"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="密码"
                />
              </div>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <label htmlFor="http-headers" className="text-sm font-medium">
            自定义HTTP标头（每行一个，格式：Key: Value）
          </label>
          <Textarea
            id="http-headers"
            value={headers}
            onChange={e => setHeaders(e.target.value)}
            placeholder="Content-Type: application/json&#10;User-Agent: MCP-Client/1.0"
            rows={3}
          />
        </div>

        <div className="space-y-2 border rounded-md p-4">
          <h3 className="text-sm font-medium">配置预览</h3>
          <pre className="text-xs bg-muted p-3 rounded overflow-x-auto">
            {configPreview || '填写必填字段查看配置预览'}
          </pre>
        </div>

        <Button
          onClick={createHttpMcp}
          disabled={isLoading || !mcpName || !apiUrl}
          className="w-full"
        >
          {isLoading ? '创建中...' : '创建HTTP MCP服务'}
        </Button>
      </div>
    </div>
  );
}
