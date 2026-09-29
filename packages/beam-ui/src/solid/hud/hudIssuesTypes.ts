export interface HudIssue {
  key: string
  title: string
  detail: string
  permission?: boolean
}

export interface HudIssueLabels {
  errorTitle: string
  permissionTitle: string
  unavailableTitle: string
  accessDescription: string
}
