'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Project, ProjectRole, User } from '@/types/project';
import {
  fetchProjects,
  fetchSystemUsers,
  assignProjectMember,
  removeProjectMember,
} from '@/services/projectService';

export default function ProjectDetailsPage({
  params,
}: {
  params: Promise<{ id: string }> | { id: string };
}) {
  const router = useRouter();
  const [projectId, setProjectId] = useState<string>('');
  const [project, setProject] = useState<Project | null>(null);
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [selectedRole, setSelectedRole] = useState<ProjectRole>('Member');
  const [loading, setLoading] = useState<boolean>(true);
  const [notification, setNotification] = useState<string | null>(null);

  useEffect(() => {
    Promise.resolve(params).then((resolvedParams) => {
      setProjectId(resolvedParams.id);
    });
  }, [params]);

  useEffect(() => {
    if (projectId) {
      loadData();
    }
  }, [projectId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const allProjects = await fetchProjects();
      const current = allProjects.find((p) => p.id === projectId);
      if (current) {
        setProject(current);
      }
      const users = await fetchSystemUsers();
      setAvailableUsers(users);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAssignMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId || !project) return;

    try {
      const newMember = await assignProjectMember(project.id, selectedUserId, selectedRole);
      
      const updatedMembers = [...(project.members || []), newMember];
      setProject({ ...project, members: updatedMembers });

      const assignedUser = availableUsers.find((u) => u.id === selectedUserId);
      setNotification(`In-app notification sent to ${assignedUser?.name || 'user'} for role assignment.`);
      setTimeout(() => setNotification(null), 4000);

      setSelectedUserId('');
    } catch (err) {
      console.error(err);
      alert('Failed to assign member');
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!project) return;
    try {
      await removeProjectMember(project.id, memberId);
      setProject({
        ...project,
        members: project.members?.filter((m) => m.id !== memberId),
      });
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Loading project details...</div>;
  }

  if (!project) {
    return (
      <div className="p-8 text-center text-slate-500">
        <p>Project not found.</p>
        <Link href="/projects" className="text-[#08086F] underline mt-2 inline-block">
          Back to Projects
        </Link>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-6xl mx-auto font-sans" style={{ minHeight: '100vh', backgroundColor: '#F5F7FF' }}>
      <div className="mb-6 flex justify-between items-center">
        <div>
          <span className="text-xs font-mono px-3 py-1 bg-blue-100 text-blue-800 rounded-full font-medium">
            {project.status}
          </span>
          <h1 className="text-3xl font-light text-slate-900 mt-2">{project.name}</h1>
          <p className="text-sm font-mono text-slate-500 mt-1">{project.description}</p>
        </div>
        <Link href="/projects" className="text-sm font-mono text-slate-600 hover:underline">
          &larr; Back to Projects
        </Link>
      </div>

      {notification && (
        <div className="mb-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-medium">
          🔔 {notification}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-white p-5 rounded-xl border border-slate-200">
          <p className="text-xs font-mono text-slate-400 uppercase">Start Date</p>
          <p className="text-lg font-semibold text-slate-800 mt-1">{project.startDate || 'N/A'}</p>
        </div>
        <div className="bg-white p-5 rounded-xl border border-slate-200">
          <p className="text-xs font-mono text-slate-400 uppercase">End Date</p>
          <p className="text-lg font-semibold text-slate-800 mt-1">{project.endDate || 'N/A'}</p>
        </div>
        <div className="bg-white p-5 rounded-xl border border-slate-200">
          <p className="text-xs font-mono text-slate-400 uppercase">Budget</p>
          <p className="text-lg font-semibold text-slate-800 mt-1">${project.budget?.toLocaleString()}</p>
        </div>
      </div>

      <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900 mb-4">Project Team Members</h2>

        <form onSubmit={handleAssignMember} className="flex flex-wrap gap-4 items-end mb-8 p-4 bg-slate-50 rounded-xl">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-mono font-semibold uppercase text-slate-700 mb-1">Select User</label>
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-slate-900 text-sm"
              required
            >
              <option value="">-- Choose User --</option>
              {availableUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.systemRole})
                </option>
              ))}
            </select>
          </div>

          <div className="w-48">
            <label className="block text-xs font-mono font-semibold uppercase text-slate-700 mb-1">Assign Role</label>
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value as ProjectRole)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-slate-900 text-sm"
            >
              <option value="Owner">Owner</option>
              <option value="Member">Member</option>
              <option value="Contributor">Contributor</option>
            </select>
          </div>

          <button
            type="submit"
            className="px-5 py-2 rounded-lg text-white font-medium text-sm transition"
            style={{ backgroundColor: '#08086F' }}
          >
            Assign to Project
          </button>
        </form>

        {!project.members || project.members.length === 0 ? (
          <p className="text-sm text-slate-500 italic py-4">No team members assigned to this project yet.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {project.members.map((member) => (
              <div key={member.id} className="py-3 flex justify-between items-center">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{member.name}</p>
                  <p className="text-xs text-slate-500">{member.email}</p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs font-mono px-2.5 py-1 bg-slate-100 text-slate-700 rounded-md">
                    {member.projectRole}
                  </span>
                  <button
                    onClick={() => handleRemoveMember(member.id)}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}