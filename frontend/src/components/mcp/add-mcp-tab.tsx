'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { addMcp } from '@/lib/api/mcp';
import useSessionStore from '@/lib/stores/session-store';
import useMcpStore from '@/lib/stores/mcp-store';
import { toast } from 'sonner';

// MCP预设配置
const MCP_PRESETS = {
  'amap-maps': {
    name: '高德地图 MCP',
    type: 'stdio',
    command: 'npx',
    args: ['-y', '@amap/amap-maps-mcp-server'],
    env: {
      AMAP_MAPS_API_KEY: '您在高德官网上申请的key',
    },
  },
  stripe: {
    name: 'Stripe MCP',
    type: 'stdio',
    command: 'npx',
    args: ['-y', '@stripe/mcp-server'],
    env: {
      STRIPE_API_KEY: '您的Stripe API密钥',
    },
  },
  openai: {
    name: 'OpenAI MCP',
    type: 'stdio',
    command: 'npx',
    args: ['-y', '@openai/mcp-server'],
    env: {
      OPENAI_API_KEY: '您的OpenAI API密钥',
    },
  },
  'docker-mcp': {
    name: 'Docker MCP',
    type: 'stdio',
    command: 'docker',
    args: ['run', '--rm', '-p', '8080:8080', 'your-mcp-server-image:latest'],
    env: {
      MCP_API_KEY: '您的MCP API密钥',
    },
  },
  'python-mcp': {
    name: 'python-fetch',
    type: 'stdio',
    command: 'python',
    args: ['-m', 'mcp_server_fetch'],
    env: {},
  },
};

// 表单验证模式
const formSchema = z.object({
  name: z.string().min(1, { message: '名称不能为空' }),
  type: z.enum(['stdio', 'sse']),
  command: z.string().optional(),
  args: z.string().optional(),
  env: z.string().optional(),
  url: z.string().optional(),
});

// 参数格式化函数
const formatArgs = (argsText: string): string[] => {
  if (!argsText) return [];
  return argsText
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);
};

// 环境变量格式化函数
const formatEnv = (envText: string): Record<string, string> => {
  if (!envText) return {};
  const env: Record<string, string> = {};

  envText
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .forEach(line => {
      const [key, ...valueParts] = line.split('=');
      if (key && valueParts.length > 0) {
        env[key.trim()] = valueParts.join('=').trim();
      }
    });

  return env;
};

export default function AddMcpTab() {
  const { sessionId } = useSessionStore();
  const { addMcp: addMcpToStore } = useMcpStore();
  const [isLoading, setIsLoading] = useState(false);

  // 表单初始化
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      type: 'stdio',
      command: '',
      args: '',
      env: '',
      url: '',
    },
  });

  // 处理预设选择
  const handlePresetSelect = (presetKey: string) => {
    if (!presetKey || presetKey === 'none') return;

    const preset = MCP_PRESETS[presetKey as keyof typeof MCP_PRESETS];
    if (preset) {
      form.setValue('name', preset.name);
      form.setValue('type', preset.type as 'stdio' | 'sse');
      form.setValue('command', preset.command);

      const args = preset.args.join('\n');
      form.setValue('args', args);

      const envEntries = Object.entries(preset.env)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');
      form.setValue('env', envEntries);
    }
  };

  // 处理命令行解析
  const handleCommandParse = () => {
    const commandLine = prompt('请输入MCP启动命令:');
    if (!commandLine) return;

    try {
      // 简单的命令行解析
      const parts = commandLine.split(' ');
      if (parts.length > 0) {
        const command = parts[0];
        const args = parts.slice(1).join('\n');

        form.setValue('command', command);
        form.setValue('args', args);

        toast.success('命令已解析');
      }
    } catch (error) {
      toast.error('解析命令行失败');
    }
  };

  // 提交表单
  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    if (!sessionId) {
      toast.error('未找到有效会话');
      return;
    }

    setIsLoading(true);

    try {
      // 格式化参数和环境变量
      const formattedArgs = formatArgs(values.args || '');
      const formattedEnv = formatEnv(values.env || '');

      const mcpData = {
        name: values.name,
        type: values.type,
        command: values.type === 'stdio' ? values.command : undefined,
        args: values.type === 'stdio' ? formattedArgs : undefined,
        env: values.type === 'stdio' ? formattedEnv : undefined,
        url: values.type === 'sse' ? values.url : undefined,
      };

      // 调用API添加MCP
      const newMcp = await addMcp(sessionId, mcpData);

      // 添加到状态管理
      addMcpToStore(newMcp);

      // 重置表单
      form.reset();

      toast.success(`MCP服务 ${values.name} 已添加`);
    } catch (error) {
      console.error('添加MCP失败:', error);
      toast.error(`添加MCP失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">连接新的MCP服务</h2>

      {/* 快速添加预设 */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-muted-foreground">快速添加常用MCP服务:</h3>
        <Select onValueChange={handlePresetSelect}>
          <SelectTrigger>
            <SelectValue placeholder="选择预设服务..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">选择预设服务...</SelectItem>
            <SelectItem value="amap-maps">高德地图 MCP</SelectItem>
            <SelectItem value="stripe">Stripe MCP</SelectItem>
            <SelectItem value="openai">OpenAI MCP</SelectItem>
            <SelectItem value="docker-mcp">Docker MCP</SelectItem>
            <SelectItem value="python-mcp">Python MCP</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-muted-foreground">或者手动配置</span>
        </div>
      </div>

      {/* 命令行解析 */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-muted-foreground">直接输入命令行:</h3>
        <Button variant="outline" onClick={handleCommandParse} className="w-full">
          解析为配置
        </Button>
        <p className="text-xs text-muted-foreground">
          例如: npx -y @amap/amap-maps-mcp-server --AMAP_MAPS_API_KEY=xxx
        </p>
      </div>

      {/* 主表单 */}
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>名称 *</FormLabel>
                <FormControl>
                  <Input placeholder="例如: Stripe" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>类型 *</FormLabel>
                <Select
                  value={field.value}
                  onValueChange={value => {
                    field.onChange(value);
                    // 清空相关字段
                    if (value === 'stdio') {
                      form.setValue('url', '');
                    } else {
                      form.setValue('command', '');
                      form.setValue('args', '');
                      form.setValue('env', '');
                    }
                  }}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="选择类型" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="stdio">stdio</SelectItem>
                    <SelectItem value="sse">sse</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {form.watch('type') === 'stdio' ? (
            <>
              <FormField
                control={form.control}
                name="command"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>命令 *</FormLabel>
                    <FormControl>
                      <Input placeholder="例如: npx" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="args"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>参数 (每行一个)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="例如:
-y
@stripe/mcp
--api-key=YOUR_KEY"
                        rows={4}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="env"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>环境变量 (每行一个键值对)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="例如:
STRIPE_API_KEY=sk_test_...
STRIPE_ENV=test"
                        rows={4}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </>
          ) : (
            <FormField
              control={form.control}
              name="url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>服务URL *</FormLabel>
                  <FormControl>
                    <Input placeholder="例如: http://localhost:5000" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? '添加中...' : '添加MCP'}
          </Button>
        </form>
      </Form>
    </div>
  );
}
