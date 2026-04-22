export interface CalendarEvent {
  id: string
  title: string
  start: string
  end: string
  backgroundColor: string
  borderColor: string
  textColor: string
  extendedProps: {
    hostName:  string
    brandName: string
    notes:     string | null
    streamId:  string
    hostId:    string
    brandId:   string
  }
}
