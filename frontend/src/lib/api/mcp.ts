import axios from 'axios';
import { McpService } from '../stores/mcp-store';

// 定义API基础URL
const API_BASE_URL = '/api';

// 添加工具接口定义
interface McpBackendTool {
  name: string;
  description?: string;
  parameters?: unknown;
  [key: string]: unknown;
}

// 添加后端MCP数据接口定义
interface McpBackendData {
  id?: string;
  name: string;
  clientType?: string;
  type?: string;
  status?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  tools?: McpBackendTool[]; // 使用明确的工具类型
  error?: string;
  instanceId?: string;
  [key: string]: unknown;
}

// 添加后端响应数据接口定义
interface McpBackendResponse {
  success: boolean;
  error?: string;
  mcp?: McpBackendData;
  mcps?: McpBackendData[];
}

export async function getAllMcps(sessionId: string): Promise<McpService[]> {
  if (!sessionId) {
    console.warn('尝试加载MCP列表，但会话ID不存在');
    return [];
  }

  try {
    const response = await axios.get<McpBackendResponse>(
      `${API_BASE_URL}/mcp?sessionId=${sessionId}`,
    );

    if (!response.data.success) {
      console.warn('获取MCP列表返回失败状态:', response.data.error);
      return []; // 返回空数组而不是抛出异常
    }

    // 确保将后端数据正确映射到前端格式
    return (response.data.mcps || []).map(mcp => ({
      id: mcp.id || mcp.name || '', // 使用name作为备选ID
      name: mcp.name || '',
      // 优先使用clientType作为type，如果没有则使用type，如果都没有则默认为'stdio'
      type: mcp.clientType || mcp.type || 'stdio',
      status: mcp.status || 'disconnected',
      command: mcp.command,
      args: mcp.args,
      env: mcp.env,
      url: mcp.url,
      tools: mcp.tools,
      error: mcp.error,
      instanceId: mcp.instanceId,
    }));
  } catch (error) {
    console.error('获取MCP列表失败:', error);
    // 对于400错误，返回空数组而不是抛出异常
    if (axios.isAxiosError(error) && error.response?.status === 400) {
      console.warn('服务器返回400错误，可能是没有注册的MCP');
      return [];
    }
    throw new Error(
      `获取MCP列表失败: ${
        axios.isAxiosError(error)
          ? error.response?.status + ' ' + error.response?.statusText
          : '未知错误'
      }`,
    );
  }
}

export async function addMcp(
  sessionId: string,
  payload: Omit<McpService, 'id' | 'status' | 'tools' | 'error'>,
): Promise<McpService> {
  try {
    // 创建一个将前端格式转换为后端格式的数据对象
    const requestData = {
      sessionId,
      // 注意：旧版API使用clientType字段，但我们在此使用type字段，确保兼容
      clientType: payload.type || 'stdio',
      name: payload.name,
      command: payload.command,
      args: payload.args,
      env: payload.env,
      url: payload.url,
    };

    console.log('发送到后端的数据:', JSON.stringify(requestData, null, 2));

    const response = await axios.post<McpBackendResponse>(`${API_BASE_URL}/mcp`, requestData);

    if (!response.data.success) {
      throw new Error(response.data.error || '添加MCP失败');
    }

    // 确保将后端返回的数据正确映射到前端格式
    // 首先检查mcp字段，如果没有则尝试mcps数组
    const mcp = response.data.mcp || response.data.mcps?.[0];
    if (!mcp) {
      throw new Error('后端未返回有效的MCP数据');
    }

    return {
      id: mcp.id || mcp.name || '', // 使用name作为备选ID
      name: mcp.name || '',
      type: mcp.clientType || mcp.type || 'stdio',
      status: mcp.status || 'connected',
      command: mcp.command,
      args: mcp.args,
      env: mcp.env,
      url: mcp.url,
      tools: mcp.tools || [],
      error: mcp.error,
      instanceId: mcp.instanceId,
    };
  } catch (error) {
    console.error('添加MCP失败:', error);
    if (axios.isAxiosError(error)) {
      throw new Error(`添加MCP失败: ${error.response?.status} ${error.response?.statusText}`);
    }
    throw error;
  }
}

export async function reconnectMcp(sessionId: string, mcpId: string): Promise<McpService> {
  try {
    const response = await axios.post<McpBackendResponse>(
      `${API_BASE_URL}/mcp/${mcpId}/reconnect`,
      {
        sessionId,
      },
    );

    if (!response.data.success) {
      throw new Error(response.data.error || '重连MCP失败');
    }

    // 确保将后端返回的数据正确映射到前端格式
    const mcp = response.data.mcp || response.data.mcps?.[0];
    if (!mcp) {
      throw new Error('后端未返回有效的MCP数据');
    }

    return {
      id: mcp.id || '',
      name: mcp.name || '',
      type: mcp.clientType || mcp.type || 'stdio',
      status: mcp.status || 'connected',
      command: mcp.command,
      args: mcp.args,
      env: mcp.env,
      url: mcp.url,
      tools: mcp.tools || [],
      error: mcp.error,
      instanceId: mcp.instanceId,
    };
  } catch (error) {
    console.error('重连MCP失败:', error);
    if (axios.isAxiosError(error)) {
      throw new Error(`重连MCP失败: ${error.response?.status} ${error.response?.statusText}`);
    }
    throw error;
  }
}

export async function deleteMcp(sessionId: string, mcpId: string): Promise<void> {
  try {
    // 尝试使用新的API格式 (DELETE /mcp/{mcpId})
    const response = await axios.delete<McpBackendResponse>(
      `${API_BASE_URL}/mcp/${mcpId}?sessionId=${sessionId}`,
    );

    if (!response.data.success) {
      throw new Error(response.data.error || '删除MCP失败');
    }
  } catch (error) {
    console.error('新API删除MCP失败:', error);

    // 如果新的API失败，尝试旧的API格式 (DELETE /mcp with body)
    try {
      const response = await axios.delete<McpBackendResponse>(`${API_BASE_URL}/mcp`, {
        headers: {
          'Content-Type': 'application/json',
        },
        data: {
          sessionId,
          name: mcpId, // 旧版API使用name而不是id
        },
      });

      if (!response.data.success) {
        throw new Error(response.data.error || '删除MCP失败');
      }
    } catch (secondError) {
      console.error('旧API删除MCP也失败:', secondError);
      if (axios.isAxiosError(secondError)) {
        throw new Error(
          `删除MCP失败: ${secondError.response?.status} ${secondError.response?.statusText}`,
        );
      }
      throw secondError;
    }
  }
}

export async function callMcpTool(
  sessionId: string,
  mcpId: string,
  toolName: string,
  params: Record<string, unknown>,
): Promise<unknown> {
  try {
    const response = await axios.post(`${API_BASE_URL}/mcp/${mcpId}/tool/${toolName}`, {
      sessionId,
      params,
    });

    if (!response.data.success) {
      throw new Error(response.data.error || '调用工具失败');
    }

    return response.data.result;
  } catch (error) {
    console.error('调用工具失败:', error);
    if (axios.isAxiosError(error)) {
      throw new Error(`调用工具失败: ${error.response?.status} ${error.response?.statusText}`);
    }
    throw error;
  }
}
