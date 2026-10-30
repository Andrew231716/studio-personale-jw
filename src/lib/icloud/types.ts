import type {
  AiMessage,
  AppSettings,
  BibleReadingPlan,
  DecisionItem,
  MinistryAssistNote,
  SavedResource,
  SavedSearch,
  ScheduledStudy,
  StudySessionDraft,
  StudySessionLog,
  StudyTopic,
} from '../../types'

/** Snapshot sincronizzato nel database privato iCloud (CloudKit). */
export interface ICloudSnapshot {
  version: 1
  updatedAt: string
  settings: AppSettings
  topics: StudyTopic[]
  decisions: DecisionItem[]
  activeTopicId: string | null
  activeDecisionId: string | null
  aiMessages: AiMessage[]
  sessionDraft: StudySessionDraft | null
  sessionLogs: StudySessionLog[]
  schedules: ScheduledStudy[]
  savedResources?: SavedResource[]
  savedSearches?: SavedSearch[]
  bibleReadingPlans?: BibleReadingPlan[]
  ministryNotes?: MinistryAssistNote[]
}

export interface ICloudConfig {
  enabled: boolean
  containerId: string
  apiToken: string
  environment: 'development' | 'production'
}

export type ICloudSyncStatus =
  | 'unconfigured'
  | 'signed_out'
  | 'ready'
  | 'syncing'
  | 'error'

export const ICLOUD_RECORD_TYPE = 'StudioData'
export const ICLOUD_RECORD_NAME = 'jw-studio-snapshot'

declare global {
  interface Window {
    CloudKit?: CloudKitGlobal
  }
}

export interface CloudKitGlobal {
  configure: (config: unknown) => void
  getDefaultContainer: () => CloudKitContainer
}

export interface CloudKitContainer {
  setUpAuth: () => Promise<CloudKitUserIdentity | null>
  whenUserSignsIn: () => Promise<CloudKitUserIdentity>
  whenUserSignsOut: () => Promise<void>
  privateCloudDatabase: CloudKitDatabase
}

export interface CloudKitUserIdentity {
  userRecordName?: string
  nameComponents?: {
    givenName?: string
    familyName?: string
  }
  emailAddress?: string
}

export interface CloudKitDatabase {
  fetchRecords: (names: string | string[]) => Promise<CloudKitRecordsResponse>
  saveRecords: (records: CloudKitRecord | CloudKitRecord[]) => Promise<CloudKitRecordsResponse>
}

export interface CloudKitRecord {
  recordName?: string
  recordType?: string
  recordChangeTag?: string
  fields?: Record<string, { value: unknown }>
  deleted?: boolean
}

export interface CloudKitRecordsResponse {
  records: Array<CloudKitRecord & { serverErrorCode?: string; reason?: string }>
}
