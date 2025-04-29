import axios from 'axios';
import { McpService } from '@/lib/stores/mcp-store';

const API_BASE_URL = '/api';

interface McpResponse {
  success: boolean;
  error?: string;
  mcp?: McpService;
  mcps?: McpService[];
}

export async function getAllMcps(sessionId: string): Promise<McpService[]> {
  try {
    const response = await axios.get<McpResponse>(`${API_BASE_URL}/mcp?sessionId=${sessionId}`);

    if (!response.data.success) {
      throw new Error(response.data.error || '获取MCP列表失败');
    }

    return response.data.mcps || [];
  } catch (error) {
    console.error('获取MCP列表失败:', error);
    if (axios.isAxiosError(error)) {
      throw new Error(`获取MCP列表失败: ${error.response?.status} ${error.response?.statusText}`);
    }
    throw error;
  }
}

export async function addMcp(sessionId: string, mcpData: Partial<McpService>): Promise<McpService> {
  try {
    const response = await axios.post<McpResponse>(`${API_BASE_URL}/mcp`, {
      ...mcpData,
      sessionId,
    });

    if (!response.data.success || !response.data.mcp) {
      throw new Error(response.data.error || '添加MCP失败');
    }

    return response.data.mcp;
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
    const response = await axios.post<McpResponse>(`${API_BASE_URL}/mcp/${mcpId}/reconnect`, {
      sessionId,
    });

    if (!response.data.success || !response.data.mcp) {
      throw new Error(response.data.error || '重连MCP失败');
    }

    return response.data.mcp;
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
    const response = await axios.delete<McpResponse>(
      `${API_BASE_URL}/mcp/${mcpId}?sessionId=${sessionId}`,
    );

    if (!response.data.success) {
      throw new Error(response.data.error || '删除MCP失败');
    }
  } catch (error) {
    console.error('删除MCP失败:', error);
    if (axios.isAxiosError(error)) {
      throw new Error(`删除MCP失败: ${error.response?.status} ${error.response?.statusText}`);
    }
    throw error;
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
