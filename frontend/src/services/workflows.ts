import { apiService } from './api'
import { ApiResponse, PaginatedResponse } from '@/types'

export interface WorkflowDefinition {
  id: string
  name: string
  description?: string
  version: string
  isActive: boolean
  definition: Record<string, any>
  metadata?: Record<string, any>
  createdAt: string
  updatedAt: string
}

export interface WorkflowInstance {
  id: string
  workflowId: string
  caseId: string
  currentState: string
  context?: Record<string, any>
  status: 'ACTIVE' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'PAUSED'
  startedAt: string
  completedAt?: string
  metadata?: Record<string, any>
  workflow: {
    name: string
    description?: string
  }
  case: {
    id: string
    title: string
    caseNumber: string
    status: string
  }
  tasks: Task[]
}

export interface Task {
  id: string
  title: string
  description?: string
  type: 'MANUAL' | 'AUTOMATED' | 'APPROVAL' | 'REVIEW' | 'DEADLINE'
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'OVERDUE'
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  assignedToId?: string
  createdById: string
  dueDate?: string
  completedAt?: string
  metadata?: Record<string, any>
  createdAt: string
  updatedAt: string
  assignedTo?: {
    id: string
    firstName?: string
    lastName?: string
    email: string
  }
  createdBy: {
    id: string
    firstName?: string
    lastName?: string
    email: string
  }
  comments: TaskComment[]
}

export interface TaskComment {
  id: string
  taskId: string
  userId: string
  content: string
  metadata?: Record<string, any>
  createdAt: string
  updatedAt: string
  user: {
    id: string
    firstName?: string
    lastName?: string
  }
}

export interface CreateWorkflowRequest {
  name: string
  description?: string
  definition: Record<string, any>
  metadata?: Record<string, any>
}

export interface CreateInstanceRequest {
  workflowId: string
  caseId: string
  context?: Record<string, any>
}

export interface CreateTaskRequest {
  title: string
  description?: string
  type?: 'MANUAL' | 'AUTOMATED' | 'APPROVAL' | 'REVIEW' | 'DEADLINE'
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  assignedToId?: string
  dueDate?: string
  metadata?: Record<string, any>
}

export interface UpdateTaskRequest {
  title?: string
  description?: string
  status?: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'OVERDUE'
  assignedToId?: string
  dueDate?: string
}

class WorkflowServiceClass {
  // Workflow Definition methods
  async getWorkflowDefinitions(): Promise<WorkflowDefinition[]> {
    const response = await apiService.get<ApiResponse<WorkflowDefinition[]>>('/workflows/definitions')
    return response.data.data
  }

  async createWorkflowDefinition(data: CreateWorkflowRequest): Promise<WorkflowDefinition> {
    const response = await apiService.post<ApiResponse<WorkflowDefinition>>('/workflows/definitions', data)
    return response.data.data
  }

  async createDefaultCaseWorkflow(): Promise<WorkflowDefinition> {
    const response = await apiService.post<ApiResponse<WorkflowDefinition>>('/workflows/definitions/default-case-workflow')
    return response.data.data
  }

  // Workflow Instance methods
  async getWorkflowInstances(params?: {
    page?: number
    limit?: number
    caseId?: string
    status?: string
  }): Promise<PaginatedResponse<WorkflowInstance>> {
    const response = await apiService.get<ApiResponse<PaginatedResponse<WorkflowInstance>>>('/workflows/instances', params)
    return response.data.data
  }

  async createWorkflowInstance(data: CreateInstanceRequest): Promise<WorkflowInstance> {
    const response = await apiService.post<ApiResponse<WorkflowInstance>>('/workflows/instances', data)
    return response.data.data
  }

  async getWorkflowInstance(instanceId: string): Promise<WorkflowInstance> {
    const response = await apiService.get<ApiResponse<WorkflowInstance>>(`/workflows/instances/${instanceId}`)
    return response.data.data
  }

  async sendWorkflowEvent(instanceId: string, event: string, payload?: Record<string, any>): Promise<WorkflowInstance> {
    const response = await apiService.post<ApiResponse<WorkflowInstance>>(
      `/workflows/instances/${instanceId}/events`,
      { event, payload }
    )
    return response.data.data
  }

  async stopWorkflowInstance(instanceId: string): Promise<{ instanceId: string }> {
    const response = await apiService.delete<ApiResponse<{ instanceId: string }>>(`/workflows/instances/${instanceId}`)
    return response.data.data
  }

  // Task methods
  async getCaseTasks(caseId: string, params?: {
    page?: number
    limit?: number
    status?: string
    assignedTo?: string
  }): Promise<PaginatedResponse<Task>> {
    const response = await apiService.get<ApiResponse<PaginatedResponse<Task>>>(`/workflows/cases/${caseId}/tasks`, params)
    return response.data.data
  }

  async createTask(caseId: string, data: CreateTaskRequest): Promise<Task> {
    const response = await apiService.post<ApiResponse<Task>>(`/workflows/cases/${caseId}/tasks`, data)
    return response.data.data
  }

  async updateTask(taskId: string, data: UpdateTaskRequest): Promise<Task> {
    const response = await apiService.put<ApiResponse<Task>>(`/workflows/tasks/${taskId}`, data)
    return response.data.data
  }

  async addTaskComment(taskId: string, content: string, metadata?: Record<string, any>): Promise<TaskComment> {
    const response = await apiService.post<ApiResponse<TaskComment>>(
      `/workflows/tasks/${taskId}/comments`,
      { content, metadata }
    )
    return response.data.data
  }

  // Utility methods
  async getAvailableTransitions(instanceId: string): Promise<string[]> {
    // This would be implemented on the backend
    const instance = await this.getWorkflowInstance(instanceId)
    // For now, return hardcoded transitions based on current state
    const stateTransitions: Record<string, string[]> = {
      created: ['ASSIGN', 'ARCHIVE'],
      assigned: ['START_INVESTIGATION', 'REASSIGN', 'CLOSE'],
      investigating: ['ADD_EVIDENCE', 'REQUEST_APPROVAL', 'COMPLETE_INVESTIGATION'],
      pending_approval: ['APPROVE', 'REJECT'],
      approved: ['FILE_CHARGES', 'CLOSE'],
      investigation_complete: ['SUBMIT_FOR_REVIEW', 'CLOSE'],
      under_review: ['APPROVE_CLOSURE', 'REQUEST_MORE_WORK'],
      charges_filed: ['COURT_DATE_SET', 'PLEA_BARGAIN'],
      awaiting_trial: ['TRIAL_COMPLETE'],
    }
    
    return stateTransitions[instance.currentState] || []
  }
}

export const WorkflowService = new WorkflowServiceClass()
export default WorkflowService