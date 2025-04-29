'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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

export default function GitMcpTab() {
  const { sessionId } = useSessionStore();
  const { addMcp: addMcpToStore } = useMcpStore();
  const [isLoading, setIsLoading] = useState(false);

  // 表单状态
  const [mcpName, setMcpName] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [repoToken, setRepoToken] = useState('');
  const [runScript, setRunScript] = useState('run.sh');
  const [scriptType, setScriptType] = useState('shell');
  const [extraArgs, setExtraArgs] = useState('');

  // 配置预览
  const [configPreview, setConfigPreview] = useState('');

  // 更新配置预览
  useEffect(() => {
    updatePreview();
  }, [mcpName, repoUrl, repoToken, runScript, scriptType, extraArgs]);

  const updatePreview = () => {
    if (!mcpName || !repoUrl || !runScript) {
      setConfigPreview('');
      return;
    }

    // 确定脚本执行命令
    let command = 'sh';
    if (scriptType === 'node') {
      command = 'node';
    } else if (scriptType === 'python') {
      command = 'python';
    }

    // 格式化参数
    const formattedExtraArgs = extraArgs
      ? extraArgs
          .split('\n')
          .map(line => line.trim())
          .filter(line => line.length > 0)
      : [];

    // 构建Git克隆参数
    const cloneArgs = ['clone'];

    // 处理私有仓库
    let cloneUrl = repoUrl;
    if (repoToken) {
      // 添加token到URL（假设是GitHub）
      if (repoUrl.startsWith('https://github.com/')) {
        cloneUrl = repoUrl.replace('https://github.com/', `https://${repoToken}@github.com/`);
      }
    }

    cloneArgs.push(cloneUrl);
    cloneArgs.push('.');

    // 构建配置
    const config = {
      mcpServers: {
        [mcpName]: {
          command,
          args: [runScript, ...formattedExtraArgs],
          description: 'Git仓库MCP服务',
          setup: {
            command: 'git',
            args: cloneArgs,
            description: '克隆Git仓库',
          },
        },
      },
    };

    // 更新预览
    setConfigPreview(JSON.stringify(config, null, 2));
  };

  const createGitMcp = async () => {
    if (!sessionId) {
      toast.error('未找到有效会话');
      return;
    }

    if (!mcpName || !repoUrl || !runScript) {
      toast.error('请填写必填字段');
      return;
    }

    setIsLoading(true);

    try {
      // 确定脚本执行命令
      let command = 'sh';
      if (scriptType === 'node') {
        command = 'node';
      } else if (scriptType === 'python') {
        command = 'python';
      }

      // 格式化参数
      const formattedExtraArgs = extraArgs
        ? extraArgs
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
        : [];

      // 构建Git克隆参数
      const cloneArgs = ['clone'];

      // 处理私有仓库
      let cloneUrl = repoUrl;
      if (repoToken) {
        // 添加token到URL（假设是GitHub）
        if (repoUrl.startsWith('https://github.com/')) {
          cloneUrl = repoUrl.replace('https://github.com/', `https://${repoToken}@github.com/`);
        }
      }

      cloneArgs.push(cloneUrl);
      cloneArgs.push('.');

      // 准备MCP数据
      const mcpData = {
        name: mcpName,
        type: 'stdio' as const,
        command,
        args: [runScript, ...formattedExtraArgs],
        env: {},
        setup: {
          command: 'git',
          args: cloneArgs,
          description: '克隆Git仓库',
        },
      };

      // 调用API添加MCP
      const newMcp = await addMcp(sessionId, mcpData);

      // 添加到状态管理
      addMcpToStore(newMcp);

      toast.success(`Git MCP服务 ${mcpName} 已创建`);

      // 重置表单（可选）
      setMcpName('');
      setRepoUrl('');
      setRepoToken('');
      setRunScript('run.sh');
      setScriptType('shell');
      setExtraArgs('');
    } catch (error) {
      console.error('创建Git MCP失败:', error);
      toast.error(`创建失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">创建Git仓库MCP服务</h2>
      <p className="text-muted-foreground">
        使用此表单可以从Git仓库创建MCP服务，系统将自动克隆仓库并运行服务。
      </p>

      <div className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="git-mcp-name" className="text-sm font-medium">
            MCP名称 *
          </label>
          <Input
            id="git-mcp-name"
            value={mcpName}
            onChange={e => setMcpName(e.target.value)}
            placeholder="例如: my-git-mcp"
            required
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="git-repo-url" className="text-sm font-medium">
            Git仓库地址 *
          </label>
          <Input
            id="git-repo-url"
            value={repoUrl}
            onChange={e => setRepoUrl(e.target.value)}
            placeholder="例如: https://github.com/username/repo.git"
            required
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="git-repo-token" className="text-sm font-medium">
            Git仓库Token (如果是私有仓库)
          </label>
          <Input
            id="git-repo-token"
            type="password"
            value={repoToken}
            onChange={e => setRepoToken(e.target.value)}
            placeholder="例如: ghp_xxxxxxxxxxxxxxxx"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="git-run-script" className="text-sm font-medium">
            运行脚本路径 *
          </label>
          <Input
            id="git-run-script"
            value={runScript}
            onChange={e => setRunScript(e.target.value)}
            placeholder="例如: run.sh 或 scripts/start.js"
            required
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="git-script-type" className="text-sm font-medium">
            脚本类型
          </label>
          <Select value={scriptType} onValueChange={setScriptType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="shell">Shell脚本</SelectItem>
              <SelectItem value="node">Node.js脚本</SelectItem>
              <SelectItem value="python">Python脚本</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label htmlFor="git-extra-args" className="text-sm font-medium">
            额外参数 (每行一个)
          </label>
          <Textarea
            id="git-extra-args"
            value={extraArgs}
            onChange={e => setExtraArgs(e.target.value)}
            placeholder="例如:&#10;--api-key=YOUR_KEY&#10;--debug=true"
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
          onClick={createGitMcp}
          disabled={isLoading || !mcpName || !repoUrl || !runScript}
          className="w-full"
        >
          {isLoading ? '创建中...' : '创建Git MCP服务'}
        </Button>
      </div>
    </div>
  );
}
