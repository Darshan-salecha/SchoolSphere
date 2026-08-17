export function GET() {
  return Response.json({
    name: 'SchoolSphere',
    short_name: 'SchoolSphere',
    description: 'School management for admins, teachers, parents and students.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f8fafc',
    theme_color: '#4f46e5',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
    ],
    orientation: 'portrait-primary',
    categories: ['education', 'productivity'],
    shortcuts: [
      { name: 'Attendance', url: '/school/attendance' },
      { name: 'School bus', url: '/parent/transport' },
      { name: 'Notifications', url: '/notifications' },
    ],
  });
}
