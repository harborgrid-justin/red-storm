import { prisma } from '@/config/database';
import { logger } from '@/config/logger';
import { io } from '@/app';

// Simple workflow state machine (simplified without XState for now)
export const defaultCaseWorkflowDefinition = {
  id: 'case_workflow',
  initial: 'created',
  states: {
    created: {
      transitions: { ASSIGN: 'assigned', ARCHIVE: 'archived' }
    },
    assigned: {
      transitions: { START_INVESTIGATION: 'investigating', REASSIGN: 'assigned', CLOSE: 'closed' }
    },
    investigating: {
      transitions: { ADD_EVIDENCE: 'investigating', REQUEST_APPROVAL: 'pending_approval', COMPLETE_INVESTIGATION: 'investigation_complete' }
    },
    pending_approval: {
      transitions: { APPROVE: 'approved', REJECT: 'investigating' }
    },
    approved: {
      transitions: { FILE_CHARGES: 'charges_filed', CLOSE: 'closed' }
    },
    investigation_complete: {
      transitions: { SUBMIT_FOR_REVIEW: 'under_review', CLOSE: 'closed' }
    },
    under_review: {
      transitions: { APPROVE_CLOSURE: 'closed', REQUEST_MORE_WORK: 'investigating' }
    },
    charges_filed: {
      transitions: { COURT_DATE_SET: 'awaiting_trial', PLEA_BARGAIN: 'closed' }
    },
    awaiting_trial: {
      transitions: { TRIAL_COMPLETE: 'closed' }
    },
    closed: { final: true },
    archived: { final: true }
  }
};

// Simple workflow engine implementation
export class WorkflowEngine {
  private static instance: WorkflowEngine;

  private constructor() {}

  static getInstance(): WorkflowEngine {
    if (!WorkflowEngine.instance) {
      WorkflowEngine.instance = new WorkflowEngine();
    }
    return WorkflowEngine.instance;
  }

  // Create a new workflow instance
  async createWorkflowInstance(
    workflowId: string,
    caseId: string,
    context?: Record<string, any>
  ): Promise<string> {
    try {
      const workflowDef = await prisma.workflowDefinition.findUnique({
        where: { id: workflowId },
      });

      if (!workflowDef) {
        throw new Error(`Workflow definition ${workflowId} not found`);
      }

      const definition = workflowDef.definition as any;
      const initialState = definition.initial || 'created';

      // Create workflow instance in database
      const instance = await prisma.workflowInstance.create({
        data: {
          workflowId,
          caseId,
          currentState: initialState,
          context: context || {},
          status: 'ACTIVE',
        },
      });

      // Emit real-time update
      if (io) {
        io.to(`case-${caseId}`).emit('workflow-created', {
          instanceId: instance.id,
          workflowId,
          caseId,
          state: initialState,
          timestamp: new Date(),
        });
      }

      logger.info('Workflow instance created', {
        instanceId: instance.id,
        workflowId,
        caseId,
      });

      return instance.id;
    } catch (error) {
      logger.error('Failed to create workflow instance', {
        error: error instanceof Error ? error.message : String(error),
        workflowId,
        caseId,
      });
      throw error;
    }
  }

  // Send event to workflow instance
  async sendEvent(instanceId: string, event: string, payload?: any): Promise<void> {
    try {
      const instance = await prisma.workflowInstance.findUnique({
        where: { id: instanceId },
        include: { workflow: true },
      });

      if (!instance) {
        throw new Error(`Workflow instance ${instanceId} not found`);
      }

      if (instance.status !== 'ACTIVE') {
        throw new Error(`Workflow instance ${instanceId} is not active`);
      }

      const definition = instance.workflow.definition as any;
      const currentState = definition.states[instance.currentState];

      if (!currentState) {
        throw new Error(`Invalid current state: ${instance.currentState}`);
      }

      const nextState = currentState.transitions?.[event];
      if (!nextState) {
        throw new Error(`Invalid transition: ${event} from ${instance.currentState}`);
      }

      // Update instance state
      const updatedInstance = await prisma.workflowInstance.update({
        where: { id: instanceId },
        data: {
          currentState: nextState,
          context: { 
            ...(typeof instance.context === 'object' && instance.context !== null ? instance.context as Record<string, any> : {}), 
            ...(typeof payload === 'object' && payload !== null ? payload : {})
          },
          ...(definition.states[nextState]?.final ? {
            status: 'COMPLETED',
            completedAt: new Date(),
          } : {}),
        },
      });

      // Execute state actions
      await this.executeStateActions(instanceId, event, nextState, payload);

      // Emit real-time update
      if (io) {
        io.to(`case-${instance.caseId}`).emit('workflow-state-changed', {
          instanceId,
          caseId: instance.caseId,
          state: nextState,
          context: updatedInstance.context,
          timestamp: new Date(),
        });
      }

      logger.info('Event sent to workflow', {
        instanceId,
        event,
        fromState: instance.currentState,
        toState: nextState,
      });
    } catch (error) {
      logger.error('Failed to send event to workflow', {
        error: error instanceof Error ? error.message : String(error),
        instanceId,
        event,
      });
      throw error;
    }
  }

  // Execute actions based on state transitions
  private async executeStateActions(
    instanceId: string,
    event: string,
    newState: string,
    payload?: any
  ): Promise<void> {
    try {
      const instance = await prisma.workflowInstance.findUnique({
        where: { id: instanceId },
        include: { case: true },
      });

      if (!instance) return;

      const context = { 
        ...(typeof instance.context === 'object' && instance.context !== null ? instance.context as Record<string, any> : {}), 
        ...(typeof payload === 'object' && payload !== null ? payload : {})
      };

      switch (newState) {
        case 'assigned':
          if (payload?.assignedTo) {
            await this.createTask({
              caseId: instance.caseId,
              title: 'Case Assigned',
              description: `Case has been assigned to investigator`,
              type: 'MANUAL',
              assignedToId: payload.assignedTo,
              createdById: payload.userId || context.userId,
            });

            // Update case assignment
            await prisma.case.update({
              where: { id: instance.caseId },
              data: { assignedToId: payload.assignedTo },
            });
          }
          break;

        case 'investigating':
          await this.createTask({
            caseId: instance.caseId,
            title: 'Begin Investigation',
            description: 'Start investigating the case and gathering evidence',
            type: 'MANUAL',
            assignedToId: instance.case.assignedToId!,
            createdById: payload.userId || context.userId,
            priority: 'HIGH',
          });
          break;

        case 'pending_approval':
          await this.createTask({
            caseId: instance.caseId,
            title: 'Approval Required',
            description: payload.reason || 'Case requires supervisory approval',
            type: 'APPROVAL',
            assignedToId: payload.approverIds?.[0],
            createdById: payload.userId || context.userId,
            priority: 'HIGH',
          });
          break;

        case 'closed':
        case 'archived':
          await prisma.case.update({
            where: { id: instance.caseId },
            data: {
              status: newState === 'archived' ? 'ARCHIVED' : 'CLOSED',
              closedAt: new Date(),
            },
          });
          break;
      }
    } catch (error) {
      logger.error('Failed to execute state actions', {
        error: error instanceof Error ? error.message : String(error),
        instanceId,
        event,
        newState,
      });
    }
  }

  // Helper method to create tasks
  private async createTask(taskData: {
    caseId: string;
    title: string;
    description?: string;
    type: 'MANUAL' | 'AUTOMATED' | 'APPROVAL' | 'REVIEW' | 'DEADLINE';
    assignedToId?: string;
    createdById: string;
    priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    dueDate?: Date;
  }): Promise<string> {
    const task = await prisma.task.create({
      data: {
        ...taskData,
        status: 'PENDING',
      },
    });

    // Send notification to assigned user if available
    if (taskData.assignedToId) {
      try {
        await prisma.notification.create({
          data: {
            userId: taskData.assignedToId,
            title: 'New Task Assigned',
            message: `You have been assigned a new task: ${taskData.title}`,
            type: 'TASK_ASSIGNED',
            channel: ['in_app'],
            metadata: {
              taskId: task.id,
              caseId: taskData.caseId,
            },
          },
        });

        // Send real-time notification
        if (io) {
          io.to(`user-${taskData.assignedToId}`).emit('task-assigned', {
            taskId: task.id,
            title: taskData.title,
            caseId: taskData.caseId,
            timestamp: new Date(),
          });
        }
      } catch (error) {
        logger.warn('Failed to create notification for task assignment', {
          error: error instanceof Error ? error.message : String(error),
          taskId: task.id,
        });
      }
    }

    return task.id;
  }

  // Get workflow instance status
  async getInstanceStatus(instanceId: string) {
    return await prisma.workflowInstance.findUnique({
      where: { id: instanceId },
      include: {
        workflow: true,
        case: true,
        tasks: {
          include: {
            assignedTo: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
            createdBy: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
          },
        },
      },
    });
  }

  // Stop workflow instance
  async stopInstance(instanceId: string): Promise<void> {
    await prisma.workflowInstance.update({
      where: { id: instanceId },
      data: {
        status: 'CANCELLED',
        completedAt: new Date(),
      },
    });

    logger.info('Workflow instance stopped', { instanceId });
  }

  // Get available transitions for current state
  async getAvailableTransitions(instanceId: string): Promise<string[]> {
    const instance = await prisma.workflowInstance.findUnique({
      where: { id: instanceId },
      include: { workflow: true },
    });

    if (!instance) return [];

    const definition = instance.workflow.definition as any;
    const currentState = definition.states[instance.currentState];
    
    return currentState?.transitions ? Object.keys(currentState.transitions) : [];
  }
}

// Export singleton instance
export const workflowEngine = WorkflowEngine.getInstance();