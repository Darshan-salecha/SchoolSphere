/** Client-safe calendar helpers — no database imports, safe in client components. */
export const DAYS = [
  { value: 1, label: 'Monday', short: 'Mon' },
  { value: 2, label: 'Tuesday', short: 'Tue' },
  { value: 3, label: 'Wednesday', short: 'Wed' },
  { value: 4, label: 'Thursday', short: 'Thu' },
  { value: 5, label: 'Friday', short: 'Fri' },
  { value: 6, label: 'Saturday', short: 'Sat' },
];

export function todayDayOfWeek() {
  const js = new Date().getDay(); // 0 = Sunday
  return js === 0 ? 7 : js;
}
