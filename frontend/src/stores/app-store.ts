import { create } from 'zustand'
import { subscribeWithSelector, devtools, persist } from 'zustand/middleware'

interface AppState {
  // UI State
  sidebarOpen: boolean
  theme: 'light' | 'dark' | 'system'
  
  // Evidence Management State
  selectedEvidence: string[]
  draggedEvidence: string | null
  uploadProgress: Record<string, number>
  
  // Case Management State  
  selectedCase: string | null
  caseFilters: {
    status?: string
    assignee?: string
    dateRange?: [Date, Date]
  }
  
  // User Preferences
  itemsPerPage: number
  sortBy: string
  sortOrder: 'asc' | 'desc'
  
  // Actions
  setSidebarOpen: (open: boolean) => void
  setTheme: (theme: 'light' | 'dark' | 'system') => void
  
  // Evidence Actions
  setSelectedEvidence: (evidence: string[]) => void
  toggleEvidenceSelection: (evidenceId: string) => void
  clearEvidenceSelection: () => void
  setDraggedEvidence: (evidenceId: string | null) => void
  updateUploadProgress: (fileId: string, progress: number) => void
  removeUploadProgress: (fileId: string) => void
  
  // Case Actions
  setSelectedCase: (caseId: string | null) => void
  setCaseFilters: (filters: Partial<AppState['caseFilters']>) => void
  clearCaseFilters: () => void
  
  // Preference Actions
  setItemsPerPage: (count: number) => void
  setSorting: (sortBy: string, sortOrder: 'asc' | 'desc') => void
}

export const useAppStore = create<AppState>()(
  devtools(
    persist(
      subscribeWithSelector((set, get) => ({
        // Initial State
        sidebarOpen: true,
        theme: 'system',
        selectedEvidence: [],
        draggedEvidence: null,
        uploadProgress: {},
        selectedCase: null,
        caseFilters: {},
        itemsPerPage: 25,
        sortBy: 'createdAt',
        sortOrder: 'desc',
        
        // UI Actions
        setSidebarOpen: (open) => set({ sidebarOpen: open }),
        setTheme: (theme) => set({ theme }),
        
        // Evidence Actions
        setSelectedEvidence: (evidence) => set({ selectedEvidence: evidence }),
        toggleEvidenceSelection: (evidenceId) => {
          const selected = get().selectedEvidence
          const isSelected = selected.includes(evidenceId)
          
          if (isSelected) {
            set({ selectedEvidence: selected.filter(id => id !== evidenceId) })
          } else {
            set({ selectedEvidence: [...selected, evidenceId] })
          }
        },
        clearEvidenceSelection: () => set({ selectedEvidence: [] }),
        setDraggedEvidence: (evidenceId) => set({ draggedEvidence: evidenceId }),
        updateUploadProgress: (fileId, progress) => 
          set(state => ({ 
            uploadProgress: { ...state.uploadProgress, [fileId]: progress } 
          })),
        removeUploadProgress: (fileId) => {
          const progress = { ...get().uploadProgress }
          delete progress[fileId]
          set({ uploadProgress: progress })
        },
        
        // Case Actions
        setSelectedCase: (caseId) => set({ selectedCase: caseId }),
        setCaseFilters: (filters) => 
          set(state => ({ 
            caseFilters: { ...state.caseFilters, ...filters } 
          })),
        clearCaseFilters: () => set({ caseFilters: {} }),
        
        // Preference Actions
        setItemsPerPage: (count) => set({ itemsPerPage: count }),
        setSorting: (sortBy, sortOrder) => set({ sortBy, sortOrder }),
      })),
      {
        name: 'evidence-platform-store',
        partialize: (state) => ({
          // Only persist user preferences, not temporary state
          theme: state.theme,
          sidebarOpen: state.sidebarOpen,
          itemsPerPage: state.itemsPerPage,
          sortBy: state.sortBy,
          sortOrder: state.sortOrder,
        }),
      }
    ),
    { name: 'evidence-platform' }
  )
)

// Separate store for real-time notifications
interface NotificationState {
  notifications: Array<{
    id: string
    type: 'info' | 'success' | 'warning' | 'error'
    title: string
    message: string
    timestamp: Date
    read: boolean
  }>
  
  addNotification: (notification: Omit<NotificationState['notifications'][0], 'id' | 'timestamp' | 'read'>) => void
  markAsRead: (id: string) => void
  markAllAsRead: () => void
  removeNotification: (id: string) => void
  clearNotifications: () => void
}

export const useNotificationStore = create<NotificationState>()(
  devtools((set, get) => ({
    notifications: [],
    
    addNotification: (notification) => {
      const id = Math.random().toString(36).substr(2, 9)
      set(state => ({
        notifications: [{
          ...notification,
          id,
          timestamp: new Date(),
          read: false,
        }, ...state.notifications].slice(0, 100) // Keep max 100 notifications
      }))
    },
    
    markAsRead: (id) => 
      set(state => ({
        notifications: state.notifications.map(n => 
          n.id === id ? { ...n, read: true } : n
        )
      })),
    
    markAllAsRead: () => 
      set(state => ({
        notifications: state.notifications.map(n => ({ ...n, read: true }))
      })),
    
    removeNotification: (id) => 
      set(state => ({
        notifications: state.notifications.filter(n => n.id !== id)
      })),
    
    clearNotifications: () => set({ notifications: [] }),
  }), { name: 'notifications' })
)