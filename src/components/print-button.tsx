'use client';
import { Button } from '@/components/ui/button';

/** Browser print — also the "save as PDF" path, with no PDF engine to ship. */
export function PrintButton({ label = 'Print', icon }: { label?: string; icon?: React.ReactNode }) {
  return (
    <Button variant="outline" onClick={() => window.print()}>
      {icon} {label}
    </Button>
  );
}
