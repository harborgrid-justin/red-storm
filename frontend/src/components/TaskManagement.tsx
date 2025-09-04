import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { 
  Plus, 
  Calendar, 
  User, 
  Clock, 
  MessageSquare,
  AlertTriangle,
  CheckCircle2,
  Circle,
  MoreHorizontal,
  Edit,
  Trash2,
  Users
} from 'lucide-react';
import { WorkflowService, Task, TaskComment, CreateTaskRequest, UpdateTaskRequest } from '@/services/workflows';

interface TaskManagementProps {
  caseId: string;
}

interface NewTaskFormData {
  title: string;
  description: string;
  type: 'MANUAL' | 'AUTOMATED' | 'APPROVAL' | 'REVIEW' | 'DEADLINE';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  assignedToId: string;
  dueDate: string;
}

const TaskCard: React.FC<{
  task: Task;
  onUpdate: (taskId: string, updates: UpdateTaskRequest) => void;
  onAddComment: (taskId: string, content: string) => void;
}> = ({ task, onUpdate, onAddComment }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<UpdateTaskRequest>>({});
  const [newComment, setNewComment] = useState('');

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'CRITICAL': return 'bg-red-100 text-red-800 border-red-200';
      case 'HIGH': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'MEDIUM': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'LOW': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'COMPLETED': return <CheckCircle2 className="w-4 h-4 text-green-600" />;
      case 'OVERDUE': return <AlertTriangle className="w-4 h-4 text-red-600" />;
      case 'IN_PROGRESS': return <Clock className="w-4 h-4 text-blue-600" />;
      default: return <Circle className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'COMPLETED': return 'bg-green-100 text-green-800';
      case 'IN_PROGRESS': return 'bg-blue-100 text-blue-800';
      case 'OVERDUE': return 'bg-red-100 text-red-800';
      case 'CANCELLED': return 'bg-gray-100 text-gray-800';
      default: return 'bg-yellow-100 text-yellow-800';
    }
  };

  const getUserName = (user?: { firstName?: string; lastName?: string }) => {
    if (!user) return 'Unassigned';
    return `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Unknown User';
  };

  const handleEdit = () => {
    setEditForm({
      title: task.title,
      description: task.description || '',
      status: task.status,
      assignedToId: task.assignedToId,
      dueDate: task.dueDate,
    });
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    onUpdate(task.id, editForm);
    setIsEditing(false);
    setEditForm({});
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditForm({});
  };

  const handleAddComment = () => {
    if (newComment.trim()) {
      onAddComment(task.id, newComment.trim());
      setNewComment('');
    }
  };

  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'COMPLETED';

  return (
    <Card className={`transition-all duration-200 ${isOverdue ? 'border-red-300 bg-red-50' : ''}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            {isEditing ? (
              <Input
                value={editForm.title || ''}
                onChange={(e) => setEditForm(prev => ({ ...prev, title: e.target.value }))}
                className="font-medium text-lg"
              />
            ) : (
              <CardTitle className="text-lg font-medium text-gray-900">
                {task.title}
              </CardTitle>
            )}
            
            <div className="flex items-center gap-3 mt-2 text-sm text-gray-600">
              <span className="flex items-center gap-1">
                {getStatusIcon(task.status)}
                <Badge className={getStatusColor(task.status)} variant="outline">
                  {task.status}
                </Badge>
              </span>
              <Badge className={`${getPriorityColor(task.priority)} border`}>
                {task.priority}
              </Badge>
              <Badge variant="outline">
                {task.type}
              </Badge>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setIsExpanded(!isExpanded)}>
              {isExpanded ? 'Less' : 'More'}
            </Button>
            {!isEditing ? (
              <Button variant="ghost" size="sm" onClick={handleEdit}>
                <Edit className="w-4 h-4" />
              </Button>
            ) : (
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={handleSaveEdit}>
                  Save
                </Button>
                <Button variant="ghost" size="sm" onClick={handleCancelEdit}>
                  Cancel
                </Button>
              </div>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <div className="space-y-3">
          {/* Task details */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-gray-400" />
              <span>
                <span className="font-medium">Assigned to:</span> {getUserName(task.assignedTo)}
              </span>
            </div>
            
            {task.dueDate && (
              <div className={`flex items-center gap-2 ${isOverdue ? 'text-red-600' : ''}`}>
                <Calendar className="w-4 h-4" />
                <span>
                  <span className="font-medium">Due:</span> {new Date(task.dueDate).toLocaleDateString()}
                  {isOverdue && <span className="ml-2 font-medium">(Overdue)</span>}
                </span>
              </div>
            )}
            
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-gray-400" />
              <span>
                <span className="font-medium">Created:</span> {new Date(task.createdAt).toLocaleDateString()}
              </span>
            </div>
            
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-gray-400" />
              <span>
                <span className="font-medium">Created by:</span> {getUserName(task.createdBy)}
              </span>
            </div>
          </div>

          {/* Task description */}
          {(task.description || isEditing) && (
            <div>
              <p className="font-medium text-sm text-gray-700 mb-2">Description:</p>
              {isEditing ? (
                <Textarea
                  value={editForm.description || ''}
                  onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                  rows={3}
                />
              ) : (
                <p className="text-sm text-gray-600">{task.description}</p>
              )}
            </div>
          )}

          {/* Expanded content */}
          {isExpanded && (
            <div className="space-y-4 border-t pt-4">
              {/* Comments section */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <MessageSquare className="w-4 h-4" />
                  <span className="font-medium text-sm">Comments ({task.comments.length})</span>
                </div>
                
                <div className="space-y-3">
                  {task.comments.map((comment) => (
                    <div key={comment.id} className="bg-gray-50 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-sm">{getUserName(comment.user)}</span>
                        <span className="text-xs text-gray-500">
                          {new Date(comment.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700">{comment.content}</p>
                    </div>
                  ))}
                </div>

                {/* Add comment */}
                <div className="mt-3 space-y-2">
                  <Textarea
                    placeholder="Add a comment..."
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    rows={2}
                  />
                  <Button 
                    size="sm" 
                    onClick={handleAddComment}
                    disabled={!newComment.trim()}
                  >
                    Add Comment
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

const TaskManagement: React.FC<TaskManagementProps> = ({ caseId }) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewTaskForm, setShowNewTaskForm] = useState(false);
  const [filter, setFilter] = useState<'all' | 'assigned' | 'pending' | 'completed'>('all');
  const [newTaskForm, setNewTaskForm] = useState<NewTaskFormData>({
    title: '',
    description: '',
    type: 'MANUAL',
    priority: 'MEDIUM',
    assignedToId: '',
    dueDate: '',
  });

  useEffect(() => {
    loadTasks();
  }, [caseId]);

  const loadTasks = async () => {
    try {
      setLoading(true);
      const response = await WorkflowService.getCaseTasks(caseId, { limit: 100 });
      setTasks(response.data);
    } catch (error) {
      console.error('Failed to load tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTask = async () => {
    try {
      const taskData: CreateTaskRequest = {
        title: newTaskForm.title,
        description: newTaskForm.description,
        type: newTaskForm.type,
        priority: newTaskForm.priority,
        assignedToId: newTaskForm.assignedToId || undefined,
        dueDate: newTaskForm.dueDate || undefined,
      };

      await WorkflowService.createTask(caseId, taskData);
      
      // Reset form and reload tasks
      setNewTaskForm({
        title: '',
        description: '',
        type: 'MANUAL',
        priority: 'MEDIUM',
        assignedToId: '',
        dueDate: '',
      });
      setShowNewTaskForm(false);
      await loadTasks();
    } catch (error) {
      console.error('Failed to create task:', error);
    }
  };

  const handleUpdateTask = async (taskId: string, updates: UpdateTaskRequest) => {
    try {
      await WorkflowService.updateTask(taskId, updates);
      await loadTasks(); // Reload to get updated data
    } catch (error) {
      console.error('Failed to update task:', error);
    }
  };

  const handleAddComment = async (taskId: string, content: string) => {
    try {
      await WorkflowService.addTaskComment(taskId, content);
      await loadTasks(); // Reload to get updated comments
    } catch (error) {
      console.error('Failed to add comment:', error);
    }
  };

  const filteredTasks = tasks.filter(task => {
    switch (filter) {
      case 'assigned': return task.assignedToId;
      case 'pending': return task.status === 'PENDING' || task.status === 'IN_PROGRESS';
      case 'completed': return task.status === 'COMPLETED';
      default: return true;
    }
  });

  const getTaskStats = () => {
    const total = tasks.length;
    const completed = tasks.filter(t => t.status === 'COMPLETED').length;
    const pending = tasks.filter(t => ['PENDING', 'IN_PROGRESS'].includes(t.status)).length;
    const overdue = tasks.filter(t => 
      t.dueDate && 
      new Date(t.dueDate) < new Date() && 
      t.status !== 'COMPLETED'
    ).length;

    return { total, completed, pending, overdue };
  };

  const stats = getTaskStats();

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Task Management</h2>
        <Button onClick={() => setShowNewTaskForm(!showNewTaskForm)}>
          <Plus className="w-4 h-4 mr-2" />
          New Task
        </Button>
      </div>

      {/* Task stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
            <div className="text-sm text-gray-600">Total Tasks</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">{stats.pending}</div>
            <div className="text-sm text-gray-600">In Progress</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
            <div className="text-sm text-gray-600">Completed</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-red-600">{stats.overdue}</div>
            <div className="text-sm text-gray-600">Overdue</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-6">
        {(['all', 'assigned', 'pending', 'completed'] as const).map((filterType) => (
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

      {/* New task form */}
      {showNewTaskForm && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Create New Task</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              placeholder="Task title"
              value={newTaskForm.title}
              onChange={(e) => setNewTaskForm(prev => ({ ...prev, title: e.target.value }))}
            />
            <Textarea
              placeholder="Task description"
              value={newTaskForm.description}
              onChange={(e) => setNewTaskForm(prev => ({ ...prev, description: e.target.value }))}
              rows={3}
            />
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Type</label>
                <select
                  value={newTaskForm.type}
                  onChange={(e) => setNewTaskForm(prev => ({ ...prev, type: e.target.value as any }))}
                  className="w-full p-2 border rounded"
                >
                  <option value="MANUAL">Manual</option>
                  <option value="APPROVAL">Approval</option>
                  <option value="REVIEW">Review</option>
                  <option value="DEADLINE">Deadline</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Priority</label>
                <select
                  value={newTaskForm.priority}
                  onChange={(e) => setNewTaskForm(prev => ({ ...prev, priority: e.target.value as any }))}
                  className="w-full p-2 border rounded"
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="CRITICAL">Critical</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Due Date</label>
                <Input
                  type="date"
                  value={newTaskForm.dueDate}
                  onChange={(e) => setNewTaskForm(prev => ({ ...prev, dueDate: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleCreateTask} disabled={!newTaskForm.title}>
                Create Task
              </Button>
              <Button variant="outline" onClick={() => setShowNewTaskForm(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tasks list */}
      <div className="space-y-4">
        {filteredTasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            onUpdate={handleUpdateTask}
            onAddComment={handleAddComment}
          />
        ))}
      </div>

      {filteredTasks.length === 0 && (
        <div className="text-center py-12">
          <div className="text-gray-500">
            <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No tasks found</p>
            <p className="text-sm mt-1">
              {filter !== 'all' ? `Try changing the filter or ` : ''}
              Create a new task to get started.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default TaskManagement;