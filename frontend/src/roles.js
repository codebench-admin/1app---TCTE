import { ShieldCheck, Building2, UserCog } from 'lucide-react';

export const ROLES = ['Super Admin', 'Department Head', 'General User'];

export const ROLE_INFO = {
  'Super Admin': { icon: ShieldCheck, desc: 'Add, edit, and delete across every department' },
  'Department Head': { icon: Building2, desc: 'Add, edit, and approve anything in their own department' },
  'General User': { icon: UserCog, desc: 'Add and edit anything in their own department' },
};
