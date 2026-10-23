/** The weekly class's Zoom meeting, from the settings HG keeps in Admin > Settings. */

/** The meeting number in a Zoom link (https://us02web.zoom.us/j/81234567890?pwd=...), or null. */
export function zoomMeetingNumber(link: string): string | null {
  const match = /\/(?:j|w|s|wc\/join|wc)\/(\d{9,12})(?:\b|\/)/.exec(link)
  return match?.[1] ?? null
}

/** A meeting ID as people write it ("812 3456 7890") with only its digits, or null when it is not one. */
export function normalizeMeetingId(value: string): string | null {
  const digits = value.replace(/[\s-]/g, "")
  return /^\d{9,12}$/.test(digits) ? digits : null
}

/** The class meeting: the ID HG entered, or the one in the class link. */
export function classMeetingNumber(settings: { zoomMeetingId: string | null; zoomUrl: string | null }): string | null {
  return settings.zoomMeetingId ?? (settings.zoomUrl ? zoomMeetingNumber(settings.zoomUrl) : null)
}

/** "812 3456 7890": a meeting ID grouped the way Zoom shows it. */
export function formatMeetingId(id: string): string {
  if (id.length === 11) return `${id.slice(0, 3)} ${id.slice(3, 7)} ${id.slice(7)}`
  if (id.length === 10) return `${id.slice(0, 3)} ${id.slice(3, 6)} ${id.slice(6)}`
  return id
}
