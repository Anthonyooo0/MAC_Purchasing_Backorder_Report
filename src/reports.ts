// Registry of available reports. Add new reports here as they're built.

export interface ReportDef {
  id: string;
  name: string;
  shortName: string;
  description: string;
  reportCode: string;
  // Domains allowed to view this report. Empty array = all authenticated users.
  allowedDomains: string[];
  // Specific user emails granted access (in addition to allowedDomains).
  allowedEmails?: string[];
}

export const REPORTS: ReportDef[] = [
  {
    id: 'impulse-shipments',
    name: 'Impulse Shipping Report',
    shortName: 'Impulse Ships',
    description: 'MAC Impulse shipment history with tracking and totals',
    reportCode: 'IMPSHIP',
    allowedDomains: ['macproducts.net', 'macimpulse.net'],
  },
  {
    id: 'impulse-backlog',
    name: 'Impulse Backlog',
    shortName: 'Impulse Backlog',
    description: 'Open MAC Impulse SO releases with backlog value and supply linkage',
    reportCode: 'IMPBACK',
    allowedDomains: ['macproducts.net', 'macimpulse.net'],
  },
];

export function reportsForUser(email: string | null): ReportDef[] {
  if (!email) return [];
  const lower = email.toLowerCase();
  return REPORTS.filter(r => {
    if (r.allowedEmails?.includes(lower)) return true;
    return r.allowedDomains.some(d => lower.endsWith(`@${d}`));
  });
}
