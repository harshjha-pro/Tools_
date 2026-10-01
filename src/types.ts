// In-memory model. Each collection mirrors a table in the V1 PostgreSQL schema
// (2.1.2_digifluence_schema.sql); field names are camelCased column names.
// Dates are ISO `YYYY-MM-DD` strings, timestamps are ISO datetime strings.

export type Role = 'employee' | 'admin';
export type EmployeeStatus = 'active' | 'offboarded';
export type ProjectStatus = 'active' | 'archived';
export type ProjectHealth = 'on_track' | 'at_risk' | 'over_budget' | 'completed';
export type LockStatus = 'unlocked' | 'locked' | 'correction_pending';
export type CorrectionStatus = 'pending' | 'approved' | 'rejected';
export type LeaveType = 'full_day' | 'half_day' | 'multiple_days';
export type LeaveReason = 'personal' | 'sick' | 'holiday' | 'other';
export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface WorkLocation {
  id: number;
  name: string;
  isActive: boolean;
}

export interface InternalCategory {
  id: number;
  name: string;
  isActive: boolean;
}

export interface Employee {
  id: number;
  employeeCode: string;
  fullName: string;
  loginEmail: string;
  role: Role;
  defaultLocationId: number;
  locationEditableByEmployee: boolean;
  status: EmployeeStatus;
  joinDate: string;
  offboardedAt: string | null;
}

export interface StageTemplate {
  id: number;
  name: string;
  isDefault: boolean;
  createdAt: string;
}

/** Stage rows are never rewritten in place, so past entries keep their original stage. */
export interface StageTemplateStage {
  id: number;
  stageTemplateId: number;
  stageName: string;
  sequenceOrder: number;
  isActive: boolean;
}

export interface Project {
  id: number;
  projectCode: string;
  name: string;
  stageTemplateId: number;
  allocatedHours: number;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  status: ProjectStatus;
  archivedAt: string | null;
  createdAt: string;
}

export interface ProjectAssignment {
  id: number;
  projectId: number;
  employeeId: number;
  assignedAt: string;
  assignedBy: number;
  unassignedAt: string | null;
  isActive: boolean;
}

export interface WorkEntry {
  id: number;
  employeeId: number;
  entryDate: string;
  projectId: number | null;
  internalCategoryId: number | null;
  stageId: number | null;
  hours: number;
  minutes: number;
  description: string;
  locationId: number;
  deliverable: string;
  createdBy: number;
  createdAt: string;
  updatedBy: number;
  updatedAt: string;
}

export interface CorrectionRequest {
  id: number;
  workEntryId: number;
  requestedBy: number;
  proposed: { hours: number; minutes: number; description: string };
  reason: string;
  status: CorrectionStatus;
  reviewedBy: number | null;
  reviewedAt: string | null;
  reviewComment: string;
  createdAt: string;
}

export interface LeaveRequest {
  id: number;
  employeeId: number;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  halfDaySession: 'am' | 'pm' | null;
  reason: LeaveReason;
  notes: string;
  status: LeaveStatus;
  submittedAt: string;
  reviewedBy: number | null;
  reviewedAt: string | null;
  rejectionComment: string;
}

export interface OrgSettings {
  /** 0 = Sunday … 6 = Saturday */
  weeklyCutoffDay: number;
  /** `HH:MM`, 24h */
  weeklyCutoffTime: string;
}

export interface CutoffExtension {
  id: number;
  weekStartDate: string;
  extendedUntil: string;
  extendedBy: number;
  reason: string;
  createdAt: string;
}

export interface AuditLogRow {
  id: number;
  entityType: string;
  entityId: number;
  action: 'create' | 'update' | 'lock' | 'unlock' | 'status_change' | 'delete';
  fieldName: string | null;
  oldValue: string | null;
  newValue: string | null;
  performedBy: number;
  performedAt: string;
  notes: string;
}

export interface DB {
  version: number;
  seq: number;
  workLocations: WorkLocation[];
  internalCategories: InternalCategory[];
  employees: Employee[];
  stageTemplates: StageTemplate[];
  stageTemplateStages: StageTemplateStage[];
  projects: Project[];
  projectAssignments: ProjectAssignment[];
  workEntries: WorkEntry[];
  correctionRequests: CorrectionRequest[];
  leaveRequests: LeaveRequest[];
  orgSettings: OrgSettings;
  weeklyCutoffExtensions: CutoffExtension[];
  auditLog: AuditLogRow[];
}
