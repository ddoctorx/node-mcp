import axios from 'axios';

const API_BASE_URL = '/api';

export interface PoolStats {
  totalInstances: number;
  activeInstances: number;
  idleInstances: number;
}

export interface InstanceInfo {
  instanceId: string;
  name: string;
  type: string;
  sessionCount: number;
  status: string;
  createdTime: string;
  lastUsedTime: string;
  tools?: Array<{ name: string; description: string }>;
}

export async function getPoolStats(): Promise<PoolStats> {
  try {
    const response = await axios.get(`${API_BASE_URL}/mcp/pool`);

    if (!response.data.success) {
      throw new Error(response.data.error || '获取池状态失败');
    }

    return response.data.stats;
  } catch (error) {
    console.error('获取池状态失败:', error);
    if (axios.isAxiosError(error)) {
      throw new Error(`获取池状态失败: ${error.response?.status} ${error.response?.statusText}`);
    }
    throw error;
  }
}

export async function getAllInstances(): Promise<InstanceInfo[]> {
  try {
    const response = await axios.get(`${API_BASE_URL}/mcp/instances`);

    if (!response.data.success) {
      throw new Error(response.data.error || '获取实例列表失败');
    }

    return response.data.instances || [];
  } catch (error) {
    console.error('获取实例列表失败:', error);
    if (axios.isAxiosError(error)) {
      throw new Error(`获取实例列表失败: ${error.response?.status} ${error.response?.statusText}`);
    }
    throw error;
  }
}

export async function getInstanceDetails(
  sessionId: string,
  instanceId: string,
): Promise<InstanceInfo> {
  try {
    const response = await axios.get(
      `${API_BASE_URL}/proxy/instance/${instanceId}?sessionId=${sessionId}`,
    );

    if (!response.data.success) {
      throw new Error(response.data.error || '获取实例详情失败');
    }

    return response.data.instance;
  } catch (error) {
    console.error('获取实例详情失败:', error);
    if (axios.isAxiosError(error)) {
      throw new Error(`获取实例详情失败: ${error.response?.status} ${error.response?.statusText}`);
    }
    throw error;
  }
}

export async function removeInstance(instanceId: string): Promise<void> {
  try {
    const response = await axios.delete(`${API_BASE_URL}/mcp/instance/${instanceId}`);

    if (!response.data.success) {
      throw new Error(response.data.error || '删除实例失败');
    }
  } catch (error) {
    console.error('删除实例失败:', error);
    if (axios.isAxiosError(error)) {
      throw new Error(`删除实例失败: ${error.response?.status} ${error.response?.statusText}`);
    }
    throw error;
  }
}

export async function cleanupIdleInstances(): Promise<void> {
  try {
    const response = await axios.post(`${API_BASE_URL}/mcp/pool/cleanup`);

    if (!response.data.success) {
      throw new Error(response.data.error || '清理空闲实例失败');
    }
  } catch (error) {
    console.error('清理空闲实例失败:', error);
    if (axios.isAxiosError(error)) {
      throw new Error(`清理空闲实例失败: ${error.response?.status} ${error.response?.statusText}`);
    }
    throw error;
  }
}

export async function createDuplicateInstance(
  name: string,
  command: string,
  args: string,
): Promise<InstanceInfo> {
  try {
    const response = await axios.post(`${API_BASE_URL}/mcp/instance/duplicate`, {
      name,
      command,
      args: args.split(',').map(arg => arg.trim()),
    });

    if (!response.data.success) {
      throw new Error(response.data.error || '创建重复实例失败');
    }

    return response.data.instance;
  } catch (error) {
    console.error('创建重复实例失败:', error);
    if (axios.isAxiosError(error)) {
      throw new Error(`创建重复实例失败: ${error.response?.status} ${error.response?.statusText}`);
    }
    throw error;
  }
}
