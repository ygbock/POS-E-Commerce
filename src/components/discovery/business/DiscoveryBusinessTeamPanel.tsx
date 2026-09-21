import React, { useEffect, useState } from 'react';
import { CheckCircle2, MailPlus, RefreshCw, Shield, UserMinus, Users, X } from 'lucide-react';
import { discoveryApi, DiscoveryApiError } from '../../../services/discoveryApi';
import type { DiscoveryBusinessTeamWorkspace } from '../../../types/discovery';

interface Props {
  businessId: string;
}

export const DiscoveryBusinessTeamPanel: React.FC<Props> = ({ businessId }) => {
  const [workspace, setWorkspace] = useState<DiscoveryBusinessTeamWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'MANAGER' | 'STAFF'>('STAFF');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setWorkspace(await discoveryApi.getBusinessTeam(businessId));
    } catch (err) {
      setError(err instanceof DiscoveryApiError ? err.message : 'Unable to load business team.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [businessId]);

  const currentRole = workspace?.currentUserRole || null;
  const canManage = currentRole === 'OWNER' || currentRole === 'MANAGER';
  const canManageRoles = currentRole === 'OWNER';

  const invite = async () => {
    if (!email.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await discoveryApi.inviteBusinessTeamMember(businessId, email.trim(), role);
      setEmail('');
      await load();
    } catch (err) {
      setError(err instanceof DiscoveryApiError ? err.message : 'Unable to create invitation.');
    } finally {
      setBusy(false);
    }
  };

  const changeRole = async (userId: string, nextRole: 'MANAGER' | 'STAFF') => {
    setBusy(true);
    setError(null);
    try {
      await discoveryApi.updateBusinessTeamMemberRole(businessId, userId, nextRole);
      await load();
    } catch (err) {
      setError(err instanceof DiscoveryApiError ? err.message : 'Unable to change team role.');
    } finally {
      setBusy(false);
    }
  };

  const deactivate = async (userId: string) => {
    if (!window.confirm('Deactivate this team member? They will lose access to this business.')) return;
    setBusy(true);
    setError(null);
    try {
      await discoveryApi.deactivateBusinessTeamMember(businessId, userId);
      await load();
    } catch (err) {
      setError(err instanceof DiscoveryApiError ? err.message : 'Unable to deactivate team member.');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (invitationId: string) => {
    setBusy(true);
    setError(null);
    try {
      await discoveryApi.revokeBusinessTeamInvitation(businessId, invitationId);
      await load();
    } catch (err) {
      setError(err instanceof DiscoveryApiError ? err.message : 'Unable to revoke invitation.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[240px] items-center justify-center gap-2 text-xs text-slate-500">
        <RefreshCw className="h-4 w-4 animate-spin" /> Loading business team…
      </div>
    );
  }

  if (error && !workspace) {
    return <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-xs text-red-700">{error}</div>;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-indigo-600" />
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Business team</h2>
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Give trusted staff access without sharing the business owner's account.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {workspace?.members.filter((m) => m.is_active).length || 0} active members
          </span>
        </div>

        {error && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{error}</div>}

        {canManage && (
          <div className="mt-6 grid gap-3 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4 dark:border-indigo-900 dark:bg-indigo-950/20 md:grid-cols-[1fr_auto_auto]">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="team.member@example.com"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
            <select value={role} onChange={(e) => setRole(e.target.value as 'MANAGER' | 'STAFF')} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold dark:border-slate-700 dark:bg-slate-900 dark:text-white">
              <option value="STAFF">Staff</option>
              <option value="MANAGER">Manager</option>
            </select>
            <button
              type="button"
              disabled={busy || !email.trim()}
              onClick={() => void invite()}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              <MailPlus className="h-4 w-4" /> Invite
            </button>
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-100 px-6 py-4 dark:border-slate-800">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Members</h3>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {(workspace?.members || []).map((member) => (
            <div key={member.user_id} className="flex flex-col justify-between gap-3 px-6 py-4 sm:flex-row sm:items-center">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {(member.name || member.email).slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-slate-900 dark:text-white">{member.name || 'Unnamed user'}</span>
                    <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[9px] font-bold text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">{member.role}</span>
                    {member.role === 'OWNER' && <Shield className="h-3.5 w-3.5 text-amber-500" />}
                    {member.email_verified_at && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">{member.email}</p>
                </div>
              </div>

              {member.role !== 'OWNER' && canManage && (
                <div className="flex items-center gap-2">
                  {canManageRoles && <select
                    value={member.role}
                    disabled={busy}
                    onChange={(e) => void changeRole(member.user_id, e.target.value as 'MANAGER' | 'STAFF')}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  >
                    <option value="MANAGER">Manager</option>
                    <option value="STAFF">Staff</option>
                  </select>}
                  <button type="button" disabled={busy} onClick={() => void deactivate(member.user_id)} className="inline-flex items-center gap-1 rounded-xl border border-red-200 px-3 py-2 text-[11px] font-bold text-red-600 disabled:opacity-50">
                    <UserMinus className="h-3.5 w-3.5" /> Deactivate
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {(workspace?.invitations.length || 0) > 0 && (
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-100 px-6 py-4 dark:border-slate-800">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Pending invitations</h3>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {workspace?.invitations.map((invitation) => (
              <div key={invitation.id} className="flex flex-col justify-between gap-3 px-6 py-4 sm:flex-row sm:items-center">
                <div>
                  <p className="text-xs font-bold text-slate-900 dark:text-white">{invitation.invited_email}</p>
                  <p className="text-[11px] text-slate-500">{invitation.role} · expires {new Date(invitation.expires_at).toLocaleDateString()}</p>
                </div>
                <button type="button" disabled={busy} onClick={() => void revoke(invitation.id)} className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-[11px] font-bold text-slate-600 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300">
                  <X className="h-3.5 w-3.5" /> Revoke
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
