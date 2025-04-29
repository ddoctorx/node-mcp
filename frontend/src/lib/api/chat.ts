import axios from 'axios';

const API_BASE_URL = '/api';

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  time: string;
  functionCalls?: FunctionCall[];
}

export interface FunctionCall {
  name: string;
  params: Record<string, unknown>;
  result?: unknown;
}

export async function getChatHistory(sessionId: string): Promise<Message[]> {
  try {
    const response = await axios.get(`${API_BASE_URL}/chat/history?sessionId=${sessionId}`);

    if (!response.data.success) {
      throw new Error(response.data.error || '获取聊天历史失败');
    }

    return response.data.messages || [];
  } catch (error) {
    console.error('获取聊天历史失败:', error);
    if (axios.isAxiosError(error)) {
      throw new Error(`获取聊天历史失败: ${error.response?.status} ${error.response?.statusText}`);
    }
    throw error;
  }
}

export async function sendMessage(sessionId: string, message: string): Promise<Message> {
  try {
    const response = await axios.post(`${API_BASE_URL}/chat/message`, {
      sessionId,
      message,
    });

    if (!response.data.success) {
      throw new Error(response.data.error || '发送消息失败');
    }

    return response.data.message;
  } catch (error) {
    console.error('发送消息失败:', error);
    if (axios.isAxiosError(error)) {
      throw new Error(`发送消息失败: ${error.response?.status} ${error.response?.statusText}`);
    }
    throw error;
  }
}

export async function clearChat(sessionId: string): Promise<void> {
  try {
    const response = await axios.delete(`${API_BASE_URL}/chat/history?sessionId=${sessionId}`);

    if (!response.data.success) {
      throw new Error(response.data.error || '清除聊天记录失败');
    }
  } catch (error) {
    console.error('清除聊天记录失败:', error);
    if (axios.isAxiosError(error)) {
      throw new Error(`清除聊天记录失败: ${error.response?.status} ${error.response?.statusText}`);
    }
    throw error;
  }
}
