import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function useSocket(sessionId: string | null) {
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // 如果没有会话ID，不初始化Socket
    if (!sessionId) return;

    // 如果已经有Socket连接，则重新连接
    if (socket) {
      socket.disconnect();
    }

    // 创建新的Socket连接
    socket = io({
      query: { sessionId },
    });

    // 监听连接事件
    socket.on('connect', () => {
      console.log('WebSocket连接成功');
      setIsConnected(true);
    });

    // 监听断开连接事件
    socket.on('disconnect', () => {
      console.log('WebSocket连接断开');
      setIsConnected(false);
    });

    // 监听连接错误事件
    socket.on('connect_error', error => {
      console.error('WebSocket连接错误:', error);
      setIsConnected(false);
    });

    // 组件卸载时断开连接
    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, [sessionId]);

  return { socket, isConnected };
}

export function getSocket(): Socket | null {
  return socket;
}
