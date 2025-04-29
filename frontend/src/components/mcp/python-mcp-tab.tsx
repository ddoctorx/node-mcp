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

export default function PythonMcpTab() {
  const { sessionId } = useSessionStore();
  const { addMcp: addMcpToStore } = useMcpStore();
  const [isLoading, setIsLoading] = useState(false);

  // Python MCP配置
  const [mcpName, setMcpName] = useState('');
  const [pythonPath, setPythonPath] = useState('python');
  const [pythonScript, setPythonScript] = useState('');
  const [pythonModule, setPythonModule] = useState('');
  const [scriptType, setScriptType] = useState<'script' | 'module'>('script');
  const [virtualEnv, setVirtualEnv] = useState('');
  const [args, setArgs] = useState('');
  const [envVars, setEnvVars] = useState('');

  // 配置预览
  const [configPreview, setConfigPreview] = useState('');

  // 更新配置预览
  useEffect(() => {
    updatePreview();
  }, [mcpName, pythonPath, pythonScript, pythonModule, scriptType, virtualEnv, args, envVars]);

  const updatePreview = () => {
    if (
      !mcpName ||
      (scriptType === 'script' && !pythonScript) ||
      (scriptType === 'module' && !pythonModule)
    ) {
      setConfigPreview('');
      return;
    }

    // 构建运行命令
    let runCommand = [];

    // 构建Python路径
    if (virtualEnv) {
      if (virtualEnv.endsWith('/') || virtualEnv.endsWith('\\')) {
        runCommand.push(`${virtualEnv}bin/python`);
      } else {
        runCommand.push(`${virtualEnv}/bin/python`);
      }
    } else {
      runCommand.push(pythonPath);
    }

    // 添加脚本或模块参数
    if (scriptType === 'script') {
      runCommand.push(pythonScript);
    } else {
      runCommand.push('-m');
      runCommand.push(pythonModule);
    }

    // 添加额外参数
    if (args) {
      const argsList = args.split(/\s+/);
      runCommand = runCommand.concat(argsList);
    }

    // 解析环境变量
    const parsedEnv: Record<string, string> = {};
    if (envVars) {
      const lines = envVars.split('\n');
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine && !trimmedLine.startsWith('#')) {
          const equalIndex = trimmedLine.indexOf('=');
          if (equalIndex > 0) {
            const key = trimmedLine.substring(0, equalIndex).trim();
            const value = trimmedLine.substring(equalIndex + 1).trim();
            parsedEnv[key] = value;
          }
        }
      }
    }

    // 构建配置预览
    const config = {
      mcpServers: {
        [mcpName]: {
          command: runCommand.join(' '),
          env: parsedEnv,
          description: 'Python MCP服务',
        },
      },
    };

    // 更新预览
    setConfigPreview(JSON.stringify(config, null, 2));
  };

  const createPythonMcp = async () => {
    if (!sessionId) {
      toast.error('未找到有效会话');
      return;
    }

    if (!mcpName) {
      toast.error('请输入MCP名称');
      return;
    }

    if (scriptType === 'script' && !pythonScript) {
      toast.error('请输入Python脚本路径');
      return;
    }

    if (scriptType === 'module' && !pythonModule) {
      toast.error('请输入Python模块名称');
      return;
    }

    setIsLoading(true);

    try {
      // 构建运行命令
      let runCommand = [];

      // 设置Python路径
      if (virtualEnv) {
        if (virtualEnv.endsWith('/') || virtualEnv.endsWith('\\')) {
          runCommand.push(`${virtualEnv}bin/python`);
        } else {
          runCommand.push(`${virtualEnv}/bin/python`);
        }
      } else {
        runCommand.push(pythonPath);
      }

      // 添加脚本或模块
      if (scriptType === 'script') {
        runCommand.push(pythonScript);
      } else {
        runCommand.push('-m');
        runCommand.push(pythonModule);
      }

      // 添加额外参数
      if (args) {
        const argsList = args.split(/\s+/);
        runCommand = runCommand.concat(argsList);
      }

      // 解析环境变量
      const parsedEnv: Record<string, string> = {};
      if (envVars) {
        const lines = envVars.split('\n');
        for (const line of lines) {
          const trimmedLine = line.trim();
          if (trimmedLine && !trimmedLine.startsWith('#')) {
            const equalIndex = trimmedLine.indexOf('=');
            if (equalIndex > 0) {
              const key = trimmedLine.substring(0, equalIndex).trim();
              const value = trimmedLine.substring(equalIndex + 1).trim();
              parsedEnv[key] = value;
            }
          }
        }
      }

      // 准备MCP数据
      const mcpData = {
        name: mcpName,
        type: 'process' as const,
        command: runCommand.join(' '),
        env: parsedEnv,
      };

      // 调用API添加MCP
      const newMcp = await addMcp(sessionId, mcpData);

      // 添加到状态管理
      addMcpToStore(newMcp);

      toast.success(`Python MCP服务 ${mcpName} 已创建`);

      // 重置表单（可选）
      setMcpName('');
      setPythonPath('python');
      setPythonScript('');
      setPythonModule('');
      setScriptType('script');
      setVirtualEnv('');
      setArgs('');
      setEnvVars('');
    } catch (error) {
      console.error('创建Python MCP失败:', error);
      toast.error(`创建失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">创建Python MCP服务</h2>
      <p className="text-muted-foreground">使用此表单可以创建运行Python脚本或模块的MCP服务。</p>

      <div className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="python-mcp-name" className="text-sm font-medium">
            MCP名称 *
          </label>
          <Input
            id="python-mcp-name"
            value={mcpName}
            onChange={e => setMcpName(e.target.value)}
            placeholder="例如: my-python-mcp"
            required
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="python-script-type" className="text-sm font-medium">
            运行类型
          </label>
          <Select
            value={scriptType}
            onValueChange={value => setScriptType(value as 'script' | 'module')}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="script">Python脚本文件</SelectItem>
              <SelectItem value="module">Python模块</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {scriptType === 'script' ? (
          <div className="space-y-2">
            <label htmlFor="python-script" className="text-sm font-medium">
              Python脚本路径 *
            </label>
            <Input
              id="python-script"
              value={pythonScript}
              onChange={e => setPythonScript(e.target.value)}
              placeholder="例如: /path/to/script.py"
              required
            />
          </div>
        ) : (
          <div className="space-y-2">
            <label htmlFor="python-module" className="text-sm font-medium">
              Python模块名称 *
            </label>
            <Input
              id="python-module"
              value={pythonModule}
              onChange={e => setPythonModule(e.target.value)}
              placeholder="例如: mcp.server"
              required
            />
          </div>
        )}

        <div className="space-y-2">
          <label htmlFor="python-path" className="text-sm font-medium">
            Python解释器路径
          </label>
          <Input
            id="python-path"
            value={pythonPath}
            onChange={e => setPythonPath(e.target.value)}
            placeholder="例如: python3 或 /usr/bin/python3"
          />
          <p className="text-xs text-muted-foreground">如果使用虚拟环境，可以保留默认值</p>
        </div>

        <div className="space-y-2">
          <label htmlFor="python-venv" className="text-sm font-medium">
            虚拟环境路径（可选）
          </label>
          <Input
            id="python-venv"
            value={virtualEnv}
            onChange={e => setVirtualEnv(e.target.value)}
            placeholder="例如: /path/to/venv/"
          />
          <p className="text-xs text-muted-foreground">如果指定，将使用此虚拟环境的Python解释器</p>
        </div>

        <div className="space-y-2">
          <label htmlFor="python-args" className="text-sm font-medium">
            命令行参数（可选）
          </label>
          <Input
            id="python-args"
            value={args}
            onChange={e => setArgs(e.target.value)}
            placeholder="例如: --port 8000 --host 0.0.0.0"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="python-env" className="text-sm font-medium">
            环境变量（每行一个，格式：KEY=VALUE）
          </label>
          <Textarea
            id="python-env"
            value={envVars}
            onChange={e => setEnvVars(e.target.value)}
            placeholder="OPENAI_API_KEY=sk-xxxx&#10;PORT=8000"
            rows={4}
          />
        </div>

        <div className="space-y-2 border rounded-md p-4">
          <h3 className="text-sm font-medium">配置预览</h3>
          <pre className="text-xs bg-muted p-3 rounded overflow-x-auto">
            {configPreview || '填写必填字段查看配置预览'}
          </pre>
        </div>

        <Button
          onClick={createPythonMcp}
          disabled={
            isLoading ||
            !mcpName ||
            (scriptType === 'script' && !pythonScript) ||
            (scriptType === 'module' && !pythonModule)
          }
          className="w-full"
        >
          {isLoading ? '创建中...' : '创建Python MCP服务'}
        </Button>
      </div>
    </div>
  );
}
