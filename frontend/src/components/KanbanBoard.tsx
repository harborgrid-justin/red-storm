import React, { useState, useEffect } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Plus, Users, Clock, AlertTriangle } from 'lucide-react';
import { CaseService } from '@/services/cases';
import { WorkflowService } from '@/services/workflows';

interface CaseItem {
  id: string;
  title: string;
  caseNumber: string;
  status: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  assignedTo?: {
    id: string;
    firstName?: string;
    lastName?: string;
  };
  createdAt: string;
  evidenceCount?: number;
  taskCount?: number;
  workflowState?: string;
}

interface KanbanColumn {
  id: string;
  title: string;
  status: string;
  cases: CaseItem[];
  color: string;
}

const CaseCard: React.FC<{ case: CaseItem }> = ({ case: caseItem }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: caseItem.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'CRITICAL': return 'bg-red-100 text-red-800 border-red-200';
      case 'HIGH': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'MEDIUM': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'LOW': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getPriorityIcon = (priority: string) => {
    if (priority === 'CRITICAL' || priority === 'HIGH') {
      return <AlertTriangle className="w-3 h-3" />;
    }
    return null;
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`cursor-grab active:cursor-grabbing mb-3 hover:shadow-md transition-shadow ${isDragging ? 'shadow-lg' : ''}`}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-sm font-medium text-gray-900 line-clamp-2">
              {caseItem.title}
            </CardTitle>
            <p className="text-xs text-gray-500 mt-1">{caseItem.caseNumber}</p>
          </div>
          <Badge className={`text-xs ${getPriorityColor(caseItem.priority)} flex items-center gap-1`}>
            {getPriorityIcon(caseItem.priority)}
            {caseItem.priority}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-2">
          {caseItem.assignedTo && (
            <div className="flex items-center gap-1 text-xs text-gray-600">
              <Users className="w-3 h-3" />
              <span>
                {caseItem.assignedTo.firstName || caseItem.assignedTo.lastName
                  ? `${caseItem.assignedTo.firstName || ''} ${caseItem.assignedTo.lastName || ''}`.trim()
                  : 'Assigned User'}
              </span>
            </div>
          )}
          
          <div className="flex items-center justify-between text-xs text-gray-500">
            <div className="flex items-center gap-3">
              {caseItem.evidenceCount !== undefined && (
                <span>{caseItem.evidenceCount} evidence</span>
              )}
              {caseItem.taskCount !== undefined && (
                <span>{caseItem.taskCount} tasks</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              <span>{new Date(caseItem.createdAt).toLocaleDateString()}</span>
            </div>
          </div>

          {caseItem.workflowState && (
            <div className="pt-1">
              <Badge variant="outline" className="text-xs">
                {caseItem.workflowState}
              </Badge>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

const KanbanBoard: React.FC = () => {
  const [columns, setColumns] = useState<KanbanColumn[]>([
    {
      id: 'created',
      title: 'New Cases',
      status: 'ACTIVE',
      cases: [],
      color: 'bg-blue-50 border-blue-200',
    },
    {
      id: 'assigned',
      title: 'Assigned',
      status: 'ACTIVE',
      cases: [],
      color: 'bg-yellow-50 border-yellow-200',
    },
    {
      id: 'investigating',
      title: 'In Progress',
      status: 'ACTIVE',
      cases: [],
      color: 'bg-purple-50 border-purple-200',
    },
    {
      id: 'under_review',
      title: 'Under Review',
      status: 'ACTIVE',
      cases: [],
      color: 'bg-orange-50 border-orange-200',
    },
    {
      id: 'closed',
      title: 'Completed',
      status: 'CLOSED',
      cases: [],
      color: 'bg-green-50 border-green-200',
    },
  ]);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  useEffect(() => {
    loadCases();
  }, []);

  const loadCases = async () => {
    try {
      setLoading(true);
      const response = await CaseService.getCases({ limit: 100 });
      
      // Group cases by workflow state or status
      const casesByColumn = columns.reduce((acc, column) => {
        acc[column.id] = [];
        return acc;
      }, {} as Record<string, CaseItem[]>);

      response.items.forEach((case_: any) => {
        // Map case to appropriate column based on workflow state or status
        const workflowState = case_.workflowState || 'created';
        const columnId = mapWorkflowStateToColumn(workflowState, case_.status);
        
        if (casesByColumn[columnId]) {
          casesByColumn[columnId].push({
            id: case_.id,
            title: case_.title,
            caseNumber: case_.caseNumber,
            status: case_.status,
            priority: case_.priority,
            assignedTo: case_.assignedTo,
            createdAt: case_.createdAt,
            evidenceCount: case_.evidenceItems?.length || 0,
            taskCount: case_.tasks?.filter((t: any) => t.status !== 'COMPLETED').length || 0,
            workflowState,
          });
        }
      });

      setColumns(prev => prev.map(column => ({
        ...column,
        cases: casesByColumn[column.id] || [],
      })));
    } catch (error) {
      console.error('Failed to load cases:', error);
    } finally {
      setLoading(false);
    }
  };

  const mapWorkflowStateToColumn = (workflowState: string, status: string): string => {
    if (status === 'CLOSED' || status === 'ARCHIVED') {
      return 'closed';
    }

    switch (workflowState) {
      case 'created': return 'created';
      case 'assigned': return 'assigned';
      case 'investigating':
      case 'pending_approval':
      case 'approved': return 'investigating';
      case 'under_review':
      case 'charges_filed':
      case 'awaiting_trial': return 'under_review';
      default: return 'created';
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    // Find source and destination columns
    const sourceColumn = columns.find(col => 
      col.cases.some(case_ => case_.id === activeId)
    );
    const destColumn = columns.find(col => col.id === overId) || 
                     columns.find(col => col.cases.some(case_ => case_.id === overId));

    if (!sourceColumn || !destColumn) return;

    const sourceIndex = sourceColumn.cases.findIndex(case_ => case_.id === activeId);
    const caseItem = sourceColumn.cases[sourceIndex];

    if (!caseItem) return;

    // If moving to same column, reorder
    if (sourceColumn.id === destColumn.id) {
      const destIndex = destColumn.cases.findIndex(case_ => case_.id === overId);
      if (destIndex === -1) return;

      setColumns(prev => prev.map(column => {
        if (column.id === sourceColumn.id) {
          const newCases = [...column.cases];
          const [removed] = newCases.splice(sourceIndex, 1);
          newCases.splice(destIndex, 0, removed);
          return { ...column, cases: newCases };
        }
        return column;
      }));
      return;
    }

    // Moving to different column - trigger workflow event
    try {
      const workflowEvent = getWorkflowEventForColumn(destColumn.id);
      if (workflowEvent) {
        await triggerWorkflowEvent(caseItem.id, workflowEvent);
      }

      // Update local state optimistically
      setColumns(prev => prev.map(column => {
        if (column.id === sourceColumn.id) {
          return { ...column, cases: column.cases.filter(case_ => case_.id !== activeId) };
        }
        if (column.id === destColumn.id) {
          return { ...column, cases: [...column.cases, { ...caseItem, workflowState: destColumn.id }] };
        }
        return column;
      }));

      // Reload cases to get updated state
      setTimeout(loadCases, 1000);
    } catch (error) {
      console.error('Failed to update case workflow:', error);
      // Revert optimistic update
      loadCases();
    }
  };

  const getWorkflowEventForColumn = (columnId: string): string | null => {
    switch (columnId) {
      case 'assigned': return 'ASSIGN';
      case 'investigating': return 'START_INVESTIGATION';
      case 'under_review': return 'SUBMIT_FOR_REVIEW';
      case 'closed': return 'CLOSE';
      default: return null;
    }
  };

  const triggerWorkflowEvent = async (caseId: string, event: string) => {
    try {
      // Find workflow instance for this case
      const instances = await WorkflowService.getWorkflowInstances({ caseId, limit: 1 });
      if (instances.data.length > 0) {
        const instanceId = instances.data[0].id;
        await WorkflowService.sendWorkflowEvent(instanceId, event, { caseId });
        console.log('Workflow event triggered successfully:', { caseId, event });
      } else {
        console.warn('No active workflow instance found for case:', caseId);
      }
    } catch (error) {
      console.error('Failed to trigger workflow event:', error);
      throw error;
    }
  };

  const activeCaseItem = activeId 
    ? columns.flatMap(col => col.cases).find(case_ => case_.id === activeId)
    : null;

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="h-full p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Case Board</h1>
        <Button onClick={loadCases}>
          <Plus className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex gap-6 overflow-x-auto pb-4">
          {columns.map((column) => (
            <div key={column.id} className="flex-shrink-0 w-80">
              <div className={`rounded-lg border-2 border-dashed ${column.color} min-h-[600px]`}>
                <div className="p-4 border-b bg-white rounded-t-lg">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium text-gray-900">{column.title}</h3>
                    <Badge variant="secondary" className="text-xs">
                      {column.cases.length}
                    </Badge>
                  </div>
                </div>
                
                <div className="p-4 space-y-3">
                  <SortableContext items={column.cases.map(c => c.id)} strategy={verticalListSortingStrategy}>
                    {column.cases.map((caseItem) => (
                      <CaseCard key={caseItem.id} case={caseItem} />
                    ))}
                  </SortableContext>
                  
                  {column.cases.length === 0 && (
                    <div className="text-center text-gray-500 text-sm py-8">
                      No cases in this stage
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        <DragOverlay>
          {activeCaseItem ? <CaseCard case={activeCaseItem} /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
};

export default KanbanBoard;