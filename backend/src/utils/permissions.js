// Mirrors the frontend's department-scoping rule: Super Admins can touch
// anything; everyone else can only touch rows in their own department (or
// rows that have no department set at all).
export function canEditDepartment(membership, itemDepartment) {
  if (membership.role === 'Super Admin') return true;
  if (!itemDepartment) return true;
  return membership.department === itemDepartment;
}

export function isSuperAdmin(membership) {
  return membership.role === 'Super Admin';
}
