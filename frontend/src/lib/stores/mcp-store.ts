import { create } from 'zustand';

export interface McpService {
  id: string;
  name: string;
  type: string;
  status: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  tools?: McpTool[];
  error?: string;
  instanceId?: string;
}

export interface McpTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

interface McpState {
  mcpList: McpService[];
  addMcp: (mcp: McpService) => void;
  updateMcp: (id: string, data: Partial<McpService>) => void;
  removeMcp: (id: string) => void;
  setMcpList: (list: McpService[]) => void;
}

const useMcpStore = create<McpState>(set => ({
  mcpList: [],

  addMcp: mcp =>
    set(state => ({
      mcpList: [...state.mcpList, mcp],
    })),

  updateMcp: (id, data) =>
    set(state => ({
      mcpList: state.mcpList.map(mcp => (mcp.id === id ? { ...mcp, ...data } : mcp)),
    })),

  removeMcp: id =>
    set(state => ({
      mcpList: state.mcpList.filter(mcp => mcp.id !== id),
    })),

  setMcpList: list =>
    set(() => ({
      mcpList: list,
    })),
}));

export default useMcpStore;
