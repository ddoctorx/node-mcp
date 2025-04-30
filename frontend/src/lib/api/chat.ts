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

export interface ChatResponse {
  success: boolean;
  type?: string;
  content?: string;
  message?: Message;
  newSessionId?: string;
  function_calls?: FunctionCall[];
  results?: unknown[];
  final_response?: string;
}

export async function getChatHistory(sessionId: string): Promise<Message[]> {
  try {
    const response = await axios.get(`${API_BASE_URL}/chat`, {
      params: { sessionId },
    });

    if (!response.data.success) {
      console.warn('获取聊天历史返回失败状态:', response.data.error);
      return [];
    }

    return response.data.messages || [];
  } catch (error) {
    console.error('获取聊天历史失败:', error);

    if (axios.isAxiosError(error) && error.response?.status === 404) {
      console.warn('聊天历史不存在，可能是首次使用聊天功能');
      return [];
    }

    if (axios.isAxiosError(error)) {
      throw new Error(`获取聊天历史失败: ${error.response?.status} ${error.response?.statusText}`);
    }
    throw error;
  }
}

export async function sendMessage(sessionId: string, message: string): Promise<ChatResponse> {
  try {
    const response = await axios.post<ChatResponse>(`${API_BASE_URL}/chat`, {
      sessionId,
      message,
    });

    if (!response.data.success) {
      throw new Error(response.data.error || '发送消息失败');
    }

    return response.data;
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
    const response = await axios.delete(`${API_BASE_URL}/chat`, {
      params: { sessionId },
    });

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
