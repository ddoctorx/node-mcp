import { create } from 'zustand';

interface SessionState {
  sessionId: string | null;
  setSessionId: (id: string) => void;
  clearSession: () => void;
}

const useSessionStore = create<SessionState>(set => ({
  sessionId: null,
  setSessionId: id => set({ sessionId: id }),
  clearSession: () => {
    localStorage.removeItem('mcpSessionId');
    set({ sessionId: null });
  },
}));

export default useSessionStore;
