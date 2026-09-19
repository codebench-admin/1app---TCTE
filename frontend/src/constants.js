export const DEPARTMENTS = ['Production', 'Artist Relations', 'Sponsorship', 'Marketing', 'Logistics', 'Finance', 'Volunteers'];

export const TIER_DELIVERABLES = {
  Title: [
    'Logo on main stage backdrop', 'Logo on all print & digital collaterals', 'Naming rights mention in press release',
    '10 VIP passes', 'Dedicated social media shoutout', 'Speaking slot at opening ceremony',
  ],
  Gold: [
    'Logo on entry banner', 'Logo on event website', '6 VIP passes', 'Social media mention', '10x10 ft booth space',
  ],
  Silver: ['Logo on event website', '4 passes', '6x6 ft booth space'],
  Bronze: ['Logo on event website', '2 passes'],
};

export const STALL_CATEGORIES = ['Sponsor Stall', 'Paid Stall', 'Promotional Stall', 'Experience Stall'];
export const STALL_STATUSES = ['Planned', 'Allotted', 'Setup In Progress', 'Live'];

export const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

export const formatEventDate = (d) => {
  if (!d) return '';
  try {
    return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch (e) { return d; }
};
