import axios from 'axios';

const API_BASE_URL = '/api';

export async function createNewSession(): Promise<string> {
  try {
    const response = await axios.post(`${API_BASE_URL}/session`, {
      userId: `user-${Date.now()}`,
    });

    if (!response.data.success) {
      throw new Error(response.data.error || '创建会话失败');
    }

    return response.data.sessionId;
  } catch (error) {
    console.error('创建会话失败:', error);
    if (axios.isAxiosError(error)) {
      throw new Error(`创建会话失败: ${error.response?.status} ${error.response?.statusText}`);
    }
    throw error;
  }
}
