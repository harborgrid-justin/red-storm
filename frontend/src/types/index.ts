export interface User {
  id: string
  email: string
  username?: string
  firstName?: string
  lastName?: string
  isActive: boolean
  lastLogin?: string
  createdAt: string
  updatedAt: string
  roles: Role[]
}

export interface Role {
  id: string
  name: string
  description?: string
  permissions: Record<string, any>
}

export interface Case {
  id: string
  caseNumber: string
  title: string
  description?: string
  status: CaseStatus
  priority: Priority
  assignedTo?: User
  createdBy: User
  evidenceItems: EvidenceItem[]
  tags: Tag[]
  createdAt: string
  updatedAt: string
}

export interface EvidenceItem {
  id: string
  itemNumber: string
  title: string
  description?: string
  type: EvidenceType
  status: EvidenceStatus
  filename?: string
  originalFilename?: string
  size?: number
  mimeType?: string
  hash?: string
  location?: string
  collectedAt: string
  collectedBy: User
  caseId: string
  case: Case
  chainOfCustody: ChainOfCustodyEntry[]
  tags: Tag[]
  metadata?: Record<string, any>
  createdAt: string
  updatedAt: string
}

export interface ChainOfCustodyEntry {
  id: string
  action: string
  userId: string
  user: User
  timestamp: string
  location: string
  notes?: string
  digitalSignature?: string
}

export interface Tag {
  id: string
  name: string
  description?: string
  color?: string
  createdAt: string
  updatedAt: string
}

export interface CustodyTransfer {
  id: string
  evidenceId: string
  fromUserId: string
  toUserId: string
  reason: string
  location: string
  status: TransferStatus
  requestedAt: string
  reviewedAt?: string
  completedAt?: string
  scheduledAt?: string
  notes?: string
  approvers: string[]
  approvals: Approval[]
}

export interface Approval {
  userId: string
  status: 'APPROVED' | 'REJECTED' | 'PENDING'
  timestamp?: string
  notes?: string
}

// Enums
export enum CaseStatus {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
  PENDING = 'PENDING',
  ARCHIVED = 'ARCHIVED'
}

export enum Priority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

export enum EvidenceType {
  PHOTO = 'PHOTO',
  VIDEO = 'VIDEO',
  AUDIO = 'AUDIO',
  DOCUMENT = 'DOCUMENT',
  PHYSICAL = 'PHYSICAL',
  DIGITAL = 'DIGITAL'
}

export enum EvidenceStatus {
  COLLECTED = 'COLLECTED',
  PROCESSING = 'PROCESSING',
  ANALYZED = 'ANALYZED',
  STORED = 'STORED',
  ARCHIVED = 'ARCHIVED'
}

export enum TransferStatus {
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED'
}

// API Response types
export interface ApiResponse<T> {
  success: boolean
  data: T
  message?: string
  errors?: string[]
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  limit: number
  hasNextPage: boolean
  hasPrevPage: boolean
}

export interface AuthResponse {
  user: User
  accessToken: string
  refreshToken: string
  expiresIn: number
}

export interface LoginRequest {
  email: string
  password: string
}

export interface CreateCaseRequest {
  title: string
  description?: string
  priority: Priority
  assignedToId?: string
  tags?: string[]
}

export interface CreateEvidenceRequest {
  caseId: string
  title: string
  description?: string
  type: EvidenceType
  location?: string
  tags?: string[]
}

export interface FileUploadRequest {
  caseId: string
  title: string
  description?: string
  type: EvidenceType
  location?: string
  tags?: string[]
  files: FileList
}

// Component prop types
export interface TableColumn<T> {
  key: keyof T | string
  title: string
  render?: (value: any, item: T) => React.ReactNode
  sortable?: boolean
  width?: string
}

export interface TableProps<T> {
  data: T[]
  columns: TableColumn<T>[]
  loading?: boolean
  pagination?: {
    page: number
    limit: number
    total: number
    onPageChange: (page: number) => void
  }
}