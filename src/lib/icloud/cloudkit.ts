import {
  ICLOUD_RECORD_NAME,
  ICLOUD_RECORD_TYPE,
  type CloudKitContainer,
  type CloudKitGlobal,
  type CloudKitUserIdentity,
  type ICloudConfig,
  type ICloudSnapshot,
} from './types'

const SCRIPT_URL = 'https://cdn.apple-cloudkit.com/ck/2/cloudkit.js'

let scriptPromise: Promise<CloudKitGlobal> | null = null
let configuredKey = ''
let changeTag: string | undefined

function loadScript(): Promise<CloudKitGlobal> {
  if (window.CloudKit) return Promise.resolve(window.CloudKit)
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-cloudkit]')
    if (existing) {
      existing.addEventListener('load', () =>
        window.CloudKit ? resolve(window.CloudKit) : reject(new Error('CloudKit non disponibile')),
      )
      existing.addEventListener('error', () => reject(new Error('Impossibile caricare CloudKit JS')))
      return
    }
    const script = document.createElement('script')
    script.src = SCRIPT_URL
    script.async = true
    script.dataset.cloudkit = '1'
    script.onload = () =>
      window.CloudKit ? resolve(window.CloudKit) : reject(new Error('CloudKit non disponibile'))
    script.onerror = () => reject(new Error('Impossibile caricare CloudKit JS'))
    document.head.appendChild(script)
  })
  return scriptPromise
}

export function isICloudConfigured(config: ICloudConfig): boolean {
  return Boolean(
    config.enabled !== false && config.containerId.trim() && config.apiToken.trim(),
  )
}

export async function configureCloudKit(config: ICloudConfig): Promise<CloudKitContainer> {
  if (!isICloudConfigured(config)) {
    throw new Error('Configura Container ID e API Token iCloud in Impostazioni.')
  }
  const CloudKit = await loadScript()
  const key = `${config.containerId}|${config.apiToken}|${config.environment}`
  if (key !== configuredKey) {
    CloudKit.configure({
      containers: [
        {
          containerIdentifier: config.containerId.trim(),
          apiTokenAuth: {
            apiToken: config.apiToken.trim(),
            persist: true,
            signInButton: {
              id: 'apple-sign-in-button',
              theme: 'black',
            },
            signOutButton: {
              id: 'apple-sign-out-button',
              theme: 'black',
            },
          },
          environment: config.environment,
        },
      ],
    })
    configuredKey = key
    changeTag = undefined
  }
  return CloudKit.getDefaultContainer()
}

export async function setupICloudAuth(
  config: ICloudConfig,
): Promise<CloudKitUserIdentity | null> {
  const container = await configureCloudKit(config)
  return container.setUpAuth()
}

export function describeUser(user: CloudKitUserIdentity | null): string {
  if (!user) return ''
  const name = [user.nameComponents?.givenName, user.nameComponents?.familyName]
    .filter(Boolean)
    .join(' ')
  return name || user.emailAddress || user.userRecordName || 'Account iCloud'
}

export async function fetchICloudSnapshot(
  config: ICloudConfig,
): Promise<ICloudSnapshot | null> {
  const container = await configureCloudKit(config)
  const response = await container.privateCloudDatabase.fetchRecords(ICLOUD_RECORD_NAME)
  const record = response.records[0]
  if (!record || record.serverErrorCode === 'NOT_FOUND' || record.deleted) {
    changeTag = undefined
    return null
  }
  if (record.serverErrorCode) {
    throw new Error(record.reason || record.serverErrorCode)
  }
  changeTag = record.recordChangeTag
  const raw = record.fields?.payload?.value
  if (typeof raw !== 'string' || !raw) return null
  const parsed = JSON.parse(raw) as ICloudSnapshot
  if (!parsed || parsed.version !== 1) return null
  return parsed
}

export async function saveICloudSnapshot(
  config: ICloudConfig,
  snapshot: ICloudSnapshot,
): Promise<void> {
  const container = await configureCloudKit(config)
  const payload = JSON.stringify(snapshot)
  const response = await container.privateCloudDatabase.saveRecords({
    recordName: ICLOUD_RECORD_NAME,
    recordType: ICLOUD_RECORD_TYPE,
    recordChangeTag: changeTag,
    fields: {
      payload: { value: payload },
      revision: { value: Date.now() },
      updatedAt: { value: snapshot.updatedAt },
    },
  })
  const record = response.records[0]
  if (!record || record.serverErrorCode) {
    // Conflitto: ricarica change tag e riprova una volta
    if (record?.serverErrorCode === 'CONFLICT' || record?.serverErrorCode === 'ATOMIC_ERROR') {
      await fetchICloudSnapshot(config)
      const retry = await container.privateCloudDatabase.saveRecords({
        recordName: ICLOUD_RECORD_NAME,
        recordType: ICLOUD_RECORD_TYPE,
        recordChangeTag: changeTag,
        fields: {
          payload: { value: payload },
          revision: { value: Date.now() },
          updatedAt: { value: snapshot.updatedAt },
        },
      })
      const saved = retry.records[0]
      if (!saved || saved.serverErrorCode) {
        throw new Error(saved?.reason || saved?.serverErrorCode || 'Salvataggio iCloud non riuscito')
      }
      changeTag = saved.recordChangeTag
      return
    }
    throw new Error(record?.reason || record?.serverErrorCode || 'Salvataggio iCloud non riuscito')
  }
  changeTag = record.recordChangeTag
}
