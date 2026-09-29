export interface ErrorNoticeProps {
  message: string
  onCopy: (text: string) => Promise<void>
  fontSize?: number
  lineClamp?: number
}
