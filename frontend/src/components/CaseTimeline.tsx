import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Calendar, 
  FileText, 
  Image, 
  Video, 
  Music, 
  Folder,
  User,
  Clock,
  CheckCircle,
  AlertCircle,
  Circle,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import { CaseService } from '@/services/cases';
import { WorkflowService, Task } from '@/services/workflows';

interface TimelineEvent {
  id: string;
  type: 'evidence' | 'task' | 'milestone' | 'workflow';
  title: string;
  description?: string;
  timestamp: string;
  user?: {
    id: string;
    firstName?: string;
    lastName?: string;
  };
  metadata?: Record<string, any>;
  status?: string;
  priority?: string;
}

interface CaseTimelineProps {
  caseId: string;
}

const CaseTimeline: React.FC<CaseTimelineProps> = ({ caseId }) => {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<'all' | 'evidence' | 'tasks' | 'milestones'>('all');

  useEffect(() => {
    if (caseId) {
      loadTimelineEvents();
    }
  }, [caseId]);

  const loadTimelineEvents = async () => {
    try {
      setLoading(true);
      const [caseData, tasksData] = await Promise.all([
        CaseService.getCase(caseId),
        WorkflowService.getCaseTasks(caseId, { limit: 100 })
      ]);

      const timelineEvents: TimelineEvent[] = [];

      // Add case creation milestone
      timelineEvents.push({
        id: `case-created-${caseData.id}`,
        type: 'milestone',
        title: 'Case Created',
        description: `Case "${caseData.title}" was created`,
        timestamp: caseData.createdAt,
        user: caseData.createdBy,
        status: 'completed',
      });

      // Add evidence items
      if (caseData.evidenceItems) {
        caseData.evidenceItems.forEach((evidence: any) => {
          timelineEvents.push({
            id: `evidence-${evidence.id}`,
            type: 'evidence',
            title: evidence.title,
            description: evidence.description,
            timestamp: evidence.collectedAt || evidence.createdAt,
            user: evidence.collectedBy,
            metadata: {
              type: evidence.type,
              location: evidence.location,
              fileSize: evidence.fileSize,
              status: evidence.status,
            },
          });
        });
      }

      // Add tasks
      tasksData.data.forEach((task) => {
        timelineEvents.push({
          id: `task-${task.id}`,
          type: 'task',
          title: task.title,
          description: task.description,
          timestamp: task.createdAt,
          user: task.createdBy,
          metadata: {
            assignedTo: task.assignedTo,
            priority: task.priority,
            status: task.status,
            dueDate: task.dueDate,
          },
        });

        // Add task completion event if completed
        if (task.completedAt) {
          timelineEvents.push({
            id: `task-completed-${task.id}`,
            type: 'milestone',
            title: `Task Completed: ${task.title}`,
            description: 'Task marked as completed',
            timestamp: task.completedAt,
            user: task.assignedTo,
            status: 'completed',
          });
        }
      });

      // Add case status changes (would need audit log from backend)
      if (caseData.closedAt) {
        timelineEvents.push({
          id: `case-closed-${caseData.id}`,
          type: 'milestone',
          title: 'Case Closed',
          description: `Case was closed`,
          timestamp: caseData.closedAt,
          status: 'completed',
        });
      }

      // Sort events by timestamp (most recent first)
      timelineEvents.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      setEvents(timelineEvents);
    } catch (error) {
      console.error('Failed to load timeline events:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleEventExpansion = (eventId: string) => {
    setExpandedEvents(prev => {
      const newSet = new Set(prev);
      if (newSet.has(eventId)) {
        newSet.delete(eventId);
      } else {
        newSet.add(eventId);
      }
      return newSet;
    });
  };

  const getEventIcon = (event: TimelineEvent) => {
    switch (event.type) {
      case 'evidence':
        const evidenceType = event.metadata?.type;
        switch (evidenceType) {
          case 'PHOTO': return <Image className="w-4 h-4" />;
          case 'VIDEO': return <Video className="w-4 h-4" />;
          case 'AUDIO': return <Music className="w-4 h-4" />;
          case 'DOCUMENT': return <FileText className="w-4 h-4" />;
          default: return <Folder className="w-4 h-4" />;
        }
      case 'task':
        const taskStatus = event.metadata?.status;
        switch (taskStatus) {
          case 'COMPLETED': return <CheckCircle className="w-4 h-4 text-green-600" />;
          case 'OVERDUE': return <AlertCircle className="w-4 h-4 text-red-600" />;
          case 'IN_PROGRESS': return <Clock className="w-4 h-4 text-blue-600" />;
          default: return <Circle className="w-4 h-4 text-gray-400" />;
        }
      case 'milestone':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'workflow':
        return <Calendar className="w-4 h-4 text-purple-600" />;
      default:
        return <Circle className="w-4 h-4 text-gray-400" />;
    }
  };

  const getEventColor = (event: TimelineEvent) => {
    switch (event.type) {
      case 'evidence': return 'border-blue-200 bg-blue-50';
      case 'task':
        const priority = event.metadata?.priority;
        switch (priority) {
          case 'CRITICAL': return 'border-red-200 bg-red-50';
          case 'HIGH': return 'border-orange-200 bg-orange-50';
          case 'MEDIUM': return 'border-yellow-200 bg-yellow-50';
          default: return 'border-gray-200 bg-gray-50';
        }
      case 'milestone': return 'border-green-200 bg-green-50';
      case 'workflow': return 'border-purple-200 bg-purple-50';
      default: return 'border-gray-200 bg-gray-50';
    }
  };

  const filteredEvents = events.filter(event => {
    if (filter === 'all') return true;
    if (filter === 'evidence') return event.type === 'evidence';
    if (filter === 'tasks') return event.type === 'task';
    if (filter === 'milestones') return event.type === 'milestone';
    return true;
  });

  const getUserName = (user?: { firstName?: string; lastName?: string }) => {
    if (!user) return 'System';
    return `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Unknown User';
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Case Timeline</h2>
        <div className="flex gap-2">
          {(['all', 'evidence', 'tasks', 'milestones'] as const).map((filterType) => (
            <Button
              key={filterType}
              variant={filter === filterType ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter(filterType)}
              className="capitalize"
            >
              {filterType}
            </Button>
          ))}
        </div>
      </div>

      <div className="relative">
        {/* Timeline line */}
        <div className="absolute left-8 top-0 bottom-0 w-0.5 bg-gray-200"></div>

        <div className="space-y-6">
          {filteredEvents.map((event, index) => (
            <div key={event.id} className="relative flex items-start">
              {/* Timeline dot */}
              <div className="flex-shrink-0 w-16 flex justify-center">
                <div className="w-8 h-8 bg-white border-2 border-gray-300 rounded-full flex items-center justify-center relative z-10">
                  {getEventIcon(event)}
                </div>
              </div>

              {/* Event content */}
              <div className="flex-1 min-w-0 ml-4">
                <Card className={`${getEventColor(event)} border-l-4`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg font-medium text-gray-900">
                          {event.title}
                        </CardTitle>
                        <div className="flex items-center gap-3 mt-1 text-sm text-gray-600">
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {getUserName(event.user)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {new Date(event.timestamp).toLocaleString()}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="capitalize">
                          {event.type}
                        </Badge>
                        {(event.description || event.metadata) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleEventExpansion(event.id)}
                          >
                            {expandedEvents.has(event.id) ? (
                              <ChevronDown className="w-4 h-4" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>

                  {expandedEvents.has(event.id) && (
                    <CardContent className="pt-0">
                      {event.description && (
                        <p className="text-gray-700 mb-3">{event.description}</p>
                      )}
                      
                      {event.metadata && (
                        <div className="space-y-2">
                          {event.type === 'evidence' && (
                            <div className="grid grid-cols-2 gap-4 text-sm">
                              {event.metadata.type && (
                                <div>
                                  <span className="font-medium">Type:</span> {event.metadata.type}
                                </div>
                              )}
                              {event.metadata.location && (
                                <div>
                                  <span className="font-medium">Location:</span> {event.metadata.location}
                                </div>
                              )}
                              {event.metadata.fileSize && (
                                <div>
                                  <span className="font-medium">Size:</span> {(Number(event.metadata.fileSize) / 1024 / 1024).toFixed(2)} MB
                                </div>
                              )}
                              {event.metadata.status && (
                                <div>
                                  <span className="font-medium">Status:</span>
                                  <Badge className="ml-2" variant="outline">{event.metadata.status}</Badge>
                                </div>
                              )}
                            </div>
                          )}
                          
                          {event.type === 'task' && (
                            <div className="grid grid-cols-2 gap-4 text-sm">
                              {event.metadata.assignedTo && (
                                <div>
                                  <span className="font-medium">Assigned to:</span> {getUserName(event.metadata.assignedTo)}
                                </div>
                              )}
                              {event.metadata.priority && (
                                <div>
                                  <span className="font-medium">Priority:</span>
                                  <Badge className="ml-2" variant="outline">{event.metadata.priority}</Badge>
                                </div>
                              )}
                              {event.metadata.status && (
                                <div>
                                  <span className="font-medium">Status:</span>
                                  <Badge className="ml-2" variant="outline">{event.metadata.status}</Badge>
                                </div>
                              )}
                              {event.metadata.dueDate && (
                                <div>
                                  <span className="font-medium">Due:</span> {new Date(event.metadata.dueDate).toLocaleDateString()}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  )}
                </Card>
              </div>
            </div>
          ))}
        </div>

        {filteredEvents.length === 0 && (
          <div className="text-center py-12">
            <div className="text-gray-500">
              <Calendar className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No timeline events found</p>
              <p className="text-sm mt-1">
                {filter !== 'all' ? `Try changing the filter or ` : ''}
                Events will appear here as they are added to the case.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CaseTimeline;