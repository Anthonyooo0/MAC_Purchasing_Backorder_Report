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
    id: 'backorder',
    name: 'Purchasing Backorder Report',
    shortName: 'Backorder',
    description: 'Open POs with outstanding backorder qty (ZPOPH replacement)',
    reportCode: 'ZPOPH',
    allowedDomains: ['macproducts.net'],
  },
  {
    id: 'impulse-shipments',
    name: 'Impulse Shipping Report',
    shortName: 'Impulse Ships',
    description: 'MAC Impulse shipment history with tracking and totals',
    reportCode: 'IMPSHIP',
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
