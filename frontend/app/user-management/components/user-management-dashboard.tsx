"use client";
import "../styles/user-management-dashboard.css";
import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import Image from "next/image";
import {
  ApiError,
  createUser,
  deleteUser,
  getUsers,
  resendWelcomeEmail,
  setUserStatus,
  updateUser,
} from "../users-api";
import {
  SYSTEM_ROLES,
  USER_POSITIONS,
  type AccountStatus,
  type SystemRole,
  type ToastKind,
  type UserInput,
  type UserRecord,
} from "../user-types";
import { Us18EmailToast } from "./us18-email-toast";

type DialogState =
  | { kind: "create" }
  | { kind: "edit"; user: UserRecord }
  | { kind: "view"; user: UserRecord }
  | { kind: "delete"; user: UserRecord }
  | null;

type ToastState = {
  id: string;
  kind: ToastKind;
  title: string;
  message?: string;
  retryUserId?: string;
  retrying?: boolean;
};

type FormErrors = Partial<Record<keyof UserInput, string>>;

const EMPTY_FORM: UserInput = {
  name: "",
  email: "",
  position: USER_POSITIONS[0],
  yearsOfExperience: 0,
  role: "Worker",
};
const PAGE_SIZE = 8;

const PERMISSIONS: { label: string; access: Record<SystemRole, boolean> }[] = [
  { label: "View permitted projects", access: { Admin: true, "Project Manager": true, Worker: true, Viewer: true } },
  { label: "Create and edit projects", access: { Admin: true, "Project Manager": true, Worker: false, Viewer: false } },
  { label: "Assign team members", access: { Admin: true, "Project Manager": true, Worker: false, Viewer: false } },
  { label: "Manage user accounts", access: { Admin: true, "Project Manager": false, Worker: false, Viewer: false } },
  { label: "Change system roles", access: { Admin: true, "Project Manager": false, Worker: false, Viewer: false } },
  { label: "View project reports", access: { Admin: true, "Project Manager": true, Worker: true, Viewer: true } },
];

function Icon({ name, className = "h-4 w-4" }: { name: "users" | "shield" | "search" | "plus" | "refresh" | "grid" | "list" | "eye" | "edit" | "ban" | "trash" | "chevron-left" | "chevron-right" | "close" | "briefcase" | "clock"; className?: string }) {
  const common = { className, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const };
  const paths: Record<string, ReactNode> = {
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
    shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.5 9A7 7 0 0 1 18 6l2 2M4 16l2 2a7 7 0 0 0 12.5-3"/></>,
    grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    list: <><path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/></>,
    eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></>,
    edit: <><path d="m15 5 4 4M4 20l4-.8L19 8a2.1 2.1 0 0 0-3-3L5 16l-1 4Z"/></>,
    ban: <><circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/></>,
    trash: <><path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m4 4v6m6-6v6"/></>,
    "chevron-left": <path d="m15 18-6-6 6-6"/>,
    "chevron-right": <path d="m9 18 6-6-6-6"/>,
    close: <path d="m18 6-12 12M6 6l12 12"/>,
    briefcase: <><rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V4h8v3M3 12h18M10 12v2h4v-2"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  };
  return <svg {...common}>{paths[name]}</svg>;
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "U";
}

function formatDate(value: string | null) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-MY", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function statusClasses(status: AccountStatus) {
  return status === "Active"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : "border-slate-200 bg-slate-100 text-slate-600";
}

function roleClasses(role: SystemRole) {
  if (role === "Admin") return "bg-indigo-50 text-indigo-700";
  if (role === "Project Manager") return "bg-blue-50 text-blue-700";
  if (role === "Worker") return "bg-slate-100 text-slate-700";
  return "bg-amber-50 text-amber-700";
}

function friendlyError(error: unknown) {
  if (error instanceof ApiError) return error.message;
  return error instanceof Error ? error.message : "An unexpected error occurred. Please try again.";
}

function FieldLabel({ children, required }: { children: ReactNode; required?: boolean }) {
  return <span className="mb-1.5 block text-xs font-semibold text-slate-700">{children}{required ? <span className="ml-1 text-rose-600">*</span> : null}</span>;
}

export function UserManagementDashboard() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [positionFilter, setPositionFilter] = useState("All positions");
  const [roleFilter, setRoleFilter] = useState("All roles");
  const [statusFilter, setStatusFilter] = useState("All statuses");
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [activeTab, setActiveTab] = useState<"users" | "roles">("users");
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [form, setForm] = useState<UserInput>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [rowActionId, setRowActionId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [profilePictureFile, setProfilePictureFile] = useState<File | null>(null);
  const [profilePicturePreview, setProfilePicturePreview] = useState<string | null>(null);
  const [pictureError, setPictureError] = useState("");

  const clearProfilePicture = useCallback(() => {
    setProfilePictureFile(null);
    setProfilePicturePreview((current) => {
      if (current?.startsWith("blob:")) URL.revokeObjectURL(current);
      return null;
    });
    setPictureError("");
  }, []);

  const handleProfilePictureChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;

    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      setPictureError("Please select a JPG, PNG or WEBP image.");
      event.currentTarget.value = "";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setPictureError("Image size must not exceed 5 MB.");
      event.currentTarget.value = "";
      return;
    }

    setPictureError("");
    setProfilePictureFile(file);
    setProfilePicturePreview((current) => {
      if (current?.startsWith("blob:")) URL.revokeObjectURL(current);
      return URL.createObjectURL(file);
    });
  };

  useEffect(() => () => {
    if (profilePicturePreview?.startsWith("blob:")) URL.revokeObjectURL(profilePicturePreview);
  }, [profilePicturePreview]);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const result = await getUsers();
      setUsers(result.users);
    } catch (error) {
      setLoadError(friendlyError(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- WIP prototype; rewritten in STAB-US02
    void loadUsers();
  }, [loadUsers]);

  const clearToast = useCallback(() => setToast(null), []);
  const showToast = useCallback((kind: ToastKind, title: string, message?: string, retryUserId?: string) => {
    setToast({ id: `${Date.now()}-${Math.random()}`, kind, title, message, retryUserId });
  }, []);

  const filteredUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return users.filter((user) => {
      const matchesQuery = !normalizedQuery || `${user.name} ${user.email} ${user.id}`.toLowerCase().includes(normalizedQuery);
      const matchesPosition = positionFilter === "All positions" || user.position === positionFilter;
      const matchesRole = roleFilter === "All roles" || user.role === roleFilter;
      const matchesStatus = statusFilter === "All statuses" || user.status === statusFilter;
      return matchesQuery && matchesPosition && matchesRole && matchesStatus;
    });
  }, [users, query, positionFilter, roleFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
  const visibleUsers = filteredUsers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const activeCount = users.filter((user) => user.status === "Active").length;
  const inactiveCount = users.length - activeCount;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- WIP prototype; rewritten in STAB-US02
    setPage(1);
  }, [query, positionFilter, roleFilter, statusFilter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- WIP prototype; rewritten in STAB-US02
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setFormErrors({});
    clearProfilePicture();
    setDialog({ kind: "create" });
  };

  const openEdit = (user: UserRecord) => {
    setForm({
      name: user.name,
      email: user.email,
      position: user.position as UserInput["position"],
      yearsOfExperience: user.yearsOfExperience ?? 0,
      role: user.role,
    });
    setFormErrors({});
    // A stored profile image URL must be supplied by the backend before it can be shown here.
    clearProfilePicture();
    setDialog({ kind: "edit", user });
  };

  const validateForm = (editingUser?: UserRecord): boolean => {
    const errors: FormErrors = {};
    if (form.name.trim().length < 2) errors.name = "Enter a name with at least 2 characters.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errors.email = "Enter a valid email address.";
    const duplicate = users.some((user) => user.email.toLowerCase() === form.email.trim().toLowerCase() && user.id !== editingUser?.id);
    if (duplicate) errors.email = "This email address is already registered.";
    if (!form.position) errors.position = "Select an employee position.";
    if (!Number.isInteger(form.yearsOfExperience) || form.yearsOfExperience < 0 || form.yearsOfExperience > 60) {
      errors.yearsOfExperience = "Experience must be a whole number between 0 and 60.";
    }
    if (!form.role) errors.role = "Select a system role.";
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSaveUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    const editingUser = dialog?.kind === "edit" ? dialog.user : undefined;
    if (!validateForm(editingUser)) return;

    setSubmitting(true);
    try {
      if (dialog?.kind === "create") {
        const result = await createUser({ ...form, name: form.name.trim(), email: form.email.trim() });
        setUsers((current) => [result.user, ...current]);
        setDialog(null);
        if (result.welcomeEmailStatus === "sent") {
          showToast("success", "User created successfully! Welcome email sent.");
        } else if (result.welcomeEmailStatus === "failed") {
          showToast(
            "error",
            "User created, but the welcome email could not be sent.",
            "The account is saved. Retry the email without creating another account.",
            result.user.id,
          );
        } else {
          showToast("info", "User created; welcome email is pending confirmation.", "The account is saved. Delivery has not yet been confirmed by the backend.");
        }
      } else if (dialog?.kind === "edit") {
        const userId = dialog.user.id;
        const updatedFields = { ...form, name: form.name.trim(), email: form.email.trim() };
        await updateUser(userId, updatedFields);
        setUsers((current) => current.map((user) => user.id === userId ? { ...user, ...updatedFields } : user));
        setDialog(null);
        showToast("success", "User details updated successfully.");
      }
    } catch (error) {
      const message = friendlyError(error);
      if (error instanceof ApiError && (error.status === 409 || error.code === "DUPLICATE_EMAIL")) {
        setFormErrors((current) => ({ ...current, email: "This email address is already registered." }));
      } else {
        showToast("error", dialog?.kind === "create" ? "Unable to create user." : "Unable to update user.", message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (user: UserRecord) => {
    const nextStatus: AccountStatus = user.status === "Active" ? "Inactive" : "Active";
    setRowActionId(user.id);
    try {
      await setUserStatus(user.id, nextStatus);
      setUsers((current) => current.map((entry) => entry.id === user.id ? { ...entry, status: nextStatus } : entry));
      showToast("success", `Account ${nextStatus.toLowerCase()} successfully.`);
    } catch (error) {
      showToast("error", "Unable to update account status.", friendlyError(error));
    } finally {
      setRowActionId(null);
    }
  };

  const handleDelete = async () => {
    if (dialog?.kind !== "delete") return;
    const user = dialog.user;
    setRowActionId(user.id);
    try {
      await deleteUser(user.id);
      setUsers((current) => current.filter((entry) => entry.id !== user.id));
      setDialog(null);
      showToast("success", "User account deleted.");
    } catch (error) {
      showToast("error", "Unable to delete user account.", friendlyError(error));
    } finally {
      setRowActionId(null);
    }
  };

  const handleRetryEmail = useCallback(async () => {
    const userId = toast?.retryUserId;
    if (!userId || toast?.retrying) return;
    setToast((current) => current ? { ...current, retrying: true } : current);
    try {
      const status = await resendWelcomeEmail(userId);
      if (status === "sent") {
        setToast({ id: `${Date.now()}`, kind: "success", title: "Welcome email sent successfully." });
      } else if (status === "pending") {
        setToast({ id: `${Date.now()}`, kind: "info", title: "Welcome email is still pending.", message: "The backend has not confirmed delivery yet." });
      } else {
        setToast({
          id: `${Date.now()}`,
          kind: "error",
          title: "Welcome email retry failed.",
          message: "The account remains active. You can retry the email again.",
          retryUserId: userId,
        });
      }
    } catch (error) {
      setToast({
        id: `${Date.now()}`,
        kind: "error",
        title: "Welcome email retry failed.",
        message: friendlyError(error),
        retryUserId: userId,
      });
    }
  }, [toast?.retryUserId, toast?.retrying]);

  const renderUserActions = (user: UserRecord) => (
    <div className="flex items-center justify-end gap-1.5">
      <button type="button" onClick={() => setDialog({ kind: "view", user })} className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-[#152d55]" title="View user" aria-label={`View ${user.name}`}>
        <Icon name="eye" />
      </button>
      <button type="button" onClick={() => openEdit(user)} className="rounded-lg p-2 text-slate-500 transition hover:bg-blue-50 hover:text-blue-700" title="Edit user" aria-label={`Edit ${user.name}`}>
        <Icon name="edit" />
      </button>
      <button type="button" disabled={rowActionId === user.id} onClick={() => void handleStatusChange(user)} className="rounded-lg p-2 text-slate-500 transition hover:bg-amber-50 hover:text-amber-700 disabled:opacity-50" title={user.status === "Active" ? "Deactivate user" : "Reactivate user"} aria-label={`${user.status === "Active" ? "Deactivate" : "Reactivate"} ${user.name}`}>
        <Icon name="ban" />
      </button>
      <button type="button" onClick={() => setDialog({ kind: "delete", user })} className="rounded-lg p-2 text-slate-500 transition hover:bg-rose-50 hover:text-rose-700" title="Delete user" aria-label={`Delete ${user.name}`}>
        <Icon name="trash" />
      </button>
    </div>
  );

  const renderUserCard = (user: UserRecord) => (
    <article key={user.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-900/[0.02]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#e8eef7] text-sm font-bold text-[#1b3b68]">{initials(user.name)}</div>
          <div className="min-w-0"><h3 className="truncate text-sm font-semibold text-slate-900">{user.name}</h3><p className="truncate text-xs text-slate-500">{user.email}</p></div>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusClasses(user.status)}`}>{user.status}</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 text-xs">
        <div><p className="text-slate-400">Position</p><p className="mt-1 font-medium text-slate-700">{user.position}</p></div>
        <div><p className="text-slate-400">Experience</p><p className="mt-1 font-medium text-slate-700">{user.yearsOfExperience ?? 0} years</p></div>
        <div><p className="text-slate-400">System role</p><p className="mt-1"><span className={`inline-flex rounded-full px-2 py-0.5 font-semibold ${roleClasses(user.role)}`}>{user.role}</span></p></div>
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2"><span className="text-[11px] text-slate-400">{user.id}</span>{renderUserActions(user)}</div>
    </article>
  );

  return (
    <div className="min-h-screen bg-[#f4f6fa] text-slate-800">
      <div className="flex min-h-screen">
        <aside className="hidden w-[250px] shrink-0 flex-col bg-[#142b50] text-white lg:flex">
          <div className="flex h-[86px] items-center gap-3 border-b border-white/10 px-6">
            <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg bg-white p-1"><Image src="/raf-consult-logo.png" alt="RAF CONSULT logo" width={44} height={44} className="h-full w-full object-contain" /></div>
            <div><p className="text-sm font-bold tracking-[0.13em]">RAF CONSULT</p><p className="mt-0.5 text-[10px] font-medium tracking-[0.16em] text-blue-200">PROJECT MANAGEMENT</p></div>
          </div>
          <div className="px-4 pt-7">
            <p className="px-3 pb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-blue-200/70">Workspace</p>
            <button type="button" onClick={() => setActiveTab("users")} className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-semibold transition ${activeTab === "users" ? "bg-white/10 text-white shadow-inner shadow-white/5" : "text-blue-100/75 hover:bg-white/5 hover:text-white"}`}>
              <Icon name="users" className="h-[18px] w-[18px]" /> User Management
            </button>
            <button type="button" onClick={() => setActiveTab("roles")} className={`mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-semibold transition ${activeTab === "roles" ? "bg-white/10 text-white shadow-inner shadow-white/5" : "text-blue-100/75 hover:bg-white/5 hover:text-white"}`}>
              <Icon name="shield" className="h-[18px] w-[18px]" /> Roles &amp; Permissions
            </button>
          </div>
          <div className="mt-auto border-t border-white/10 px-6 py-5"><p className="text-xs font-semibold text-white/90">RAF CONSULT</p><p className="mt-1 text-[11px] leading-5 text-blue-200/65">Civil · Structural · Geotechnical Engineering</p></div>
        </aside>

        <main className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 flex h-[70px] items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-7 lg:px-9">
            <div className="flex items-center gap-3 lg:hidden"><div className="h-9 w-9 overflow-hidden rounded-md bg-white"><Image src="/raf-consult-logo.png" alt="RAF CONSULT" width={36} height={36} className="h-full w-full object-contain" /></div><span className="text-xs font-bold tracking-wider text-[#152d55]">RAF CONSULT</span></div>
            <div className="hidden items-center gap-2 text-xs text-slate-400 sm:flex"><span>Workspace</span><span>/</span><span className="font-semibold text-slate-600">{activeTab === "users" ? "User Management" : "Roles & Permissions"}</span></div>
            <div className="ml-auto flex items-center gap-2 sm:gap-4"><span className="hidden text-xs text-slate-500 md:inline">Administration</span><div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#e8eef7] text-xs font-bold text-[#18365f]">AD</div><div className="hidden sm:block"><p className="text-xs font-semibold text-slate-800">Administrator</p><p className="text-[10px] text-slate-400">System access</p></div></div>
          </header>

          <nav aria-label="Administration sections" className="flex gap-2 border-b border-slate-200 bg-white px-4 py-2 lg:hidden">
            <button type="button" onClick={() => setActiveTab("users")} aria-current={activeTab === "users" ? "page" : undefined} className={`rounded-lg px-3 py-2 text-xs font-semibold ${activeTab === "users" ? "bg-[#eaf0f8] text-[#18365f]" : "text-slate-500 hover:bg-slate-50"}`}>User Management</button>
            <button type="button" onClick={() => setActiveTab("roles")} aria-current={activeTab === "roles" ? "page" : undefined} className={`rounded-lg px-3 py-2 text-xs font-semibold ${activeTab === "roles" ? "bg-[#eaf0f8] text-[#18365f]" : "text-slate-500 hover:bg-slate-50"}`}>Roles &amp; Permissions</button>
          </nav>

          <div className="mx-auto w-full max-w-[1480px] px-4 py-6 sm:px-7 sm:py-8 lg:px-9">
            {activeTab === "users" ? (
              <>
                <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                  <div><p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[#54708f]">Administration / Accounts</p><h1 className="text-2xl font-bold tracking-tight text-[#142b50] sm:text-[28px]">User Management</h1><p className="mt-1.5 max-w-2xl text-sm text-slate-500">Manage employee access, account status and system roles across RAF CONSULT.</p></div>
                  <div className="flex items-center gap-2"><button type="button" onClick={() => void loadUsers()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"><Icon name="refresh" /> Refresh</button><button type="button" onClick={openCreate} className="inline-flex items-center gap-2 rounded-lg bg-[#18365f] px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#234875]"><Icon name="plus" /> Add User</button></div>
                </div>

                {loadError ? <div className="mb-5 flex flex-col gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold text-rose-900">Could not load users</p><p className="mt-1 text-xs text-rose-700">{loadError}</p></div><button type="button" onClick={() => void loadUsers()} className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100">Try again</button></div> : null}

                <section className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <StatCard label="Total registered users" value={users.length} icon={<Icon name="users" className="h-5 w-5" />} detail="All system accounts" />
                  <StatCard label="Active users" value={activeCount} icon={<span className="text-lg">✓</span>} detail="Currently enabled" tone="green" />
                  <StatCard label="Inactive users" value={inactiveCount} icon={<Icon name="clock" className="h-5 w-5" />} detail="Access disabled" tone="amber" />
                  <StatCard label="System roles" value={SYSTEM_ROLES.length} icon={<Icon name="shield" className="h-5 w-5" />} detail="Defined permission groups" tone="purple" />
                </section>

                <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm shadow-slate-900/[0.025]">
                  <div className="flex flex-col gap-4 border-b border-slate-100 p-4 sm:p-5 xl:flex-row xl:items-center xl:justify-between">
                    <div><h2 className="text-sm font-bold text-slate-900">Registered users</h2><p className="mt-1 text-xs text-slate-500">{filteredUsers.length} {filteredUsers.length === 1 ? "account" : "accounts"} match the current filters</p></div>
                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                      <div className="relative min-w-0 sm:w-56"><Icon name="search" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, email or ID" aria-label="Search users" className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-xs outline-none transition placeholder:text-slate-400 focus:border-[#58779d] focus:ring-2 focus:ring-blue-100" /></div>
                      <select value={positionFilter} onChange={(event) => setPositionFilter(event.target.value)} aria-label="Filter by position" className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-600 outline-none focus:border-[#58779d]"><option>All positions</option>{USER_POSITIONS.map((position) => <option key={position}>{position}</option>)}</select>
                      <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} aria-label="Filter by system role" className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-600 outline-none focus:border-[#58779d]"><option>All roles</option>{SYSTEM_ROLES.map((role) => <option key={role}>{role}</option>)}</select>
                      <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter by status" className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-600 outline-none focus:border-[#58779d]"><option>All statuses</option><option>Active</option><option>Inactive</option></select>
                      <div className="flex items-center rounded-lg border border-slate-200 p-0.5"><button type="button" onClick={() => setViewMode("table")} aria-label="Table view" aria-pressed={viewMode === "table"} className={`rounded-md p-1.5 ${viewMode === "table" ? "bg-[#eaf0f8] text-[#18365f]" : "text-slate-400 hover:text-slate-700"}`}><Icon name="list" /></button><button type="button" onClick={() => setViewMode("cards")} aria-label="Card view" aria-pressed={viewMode === "cards"} className={`rounded-md p-1.5 ${viewMode === "cards" ? "bg-[#eaf0f8] text-[#18365f]" : "text-slate-400 hover:text-slate-700"}`}><Icon name="grid" /></button></div>
                    </div>
                  </div>

                  {loading ? (
                    <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 text-slate-400"><span className="h-7 w-7 animate-spin rounded-full border-2 border-slate-200 border-t-[#18365f]" /><p className="text-xs">Loading user accounts…</p></div>
                  ) : filteredUsers.length === 0 ? (
                    <div className="flex min-h-[260px] flex-col items-center justify-center px-5 text-center"><div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400"><Icon name="users" className="h-5 w-5" /></div><h3 className="mt-3 text-sm font-semibold text-slate-800">No users found</h3><p className="mt-1 max-w-sm text-xs text-slate-500">Try changing your search or filters, or add a new employee account.</p><button type="button" onClick={openCreate} className="mt-4 rounded-lg bg-[#18365f] px-4 py-2 text-xs font-semibold text-white hover:bg-[#234875]">Add User</button></div>
                  ) : viewMode === "table" ? (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[900px] border-collapse text-left">
                        <thead><tr className="bg-[#f8fafc] text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400"><th className="px-5 py-3.5">Employee</th><th className="px-4 py-3.5">Position</th><th className="px-4 py-3.5">Experience</th><th className="px-4 py-3.5">System role</th><th className="px-4 py-3.5">Status</th><th className="px-4 py-3.5">Joined</th><th className="px-4 py-3.5">Last active</th><th className="px-5 py-3.5 text-right">Actions</th></tr></thead>
                        <tbody className="divide-y divide-slate-100">{visibleUsers.map((user) => <tr key={user.id} className="transition hover:bg-slate-50/70"><td className="px-5 py-3.5"><div className="flex items-center gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e8eef7] text-[11px] font-bold text-[#1b3b68]">{initials(user.name)}</div><div className="min-w-0"><p className="max-w-[190px] truncate text-xs font-semibold text-slate-800">{user.name}</p><p className="max-w-[190px] truncate text-[11px] text-slate-400">{user.email}</p><p className="mt-0.5 text-[10px] text-slate-400">{user.id}</p></div></div></td><td className="px-4 py-3.5 text-xs text-slate-600">{user.position}</td><td className="px-4 py-3.5 text-xs text-slate-600">{user.yearsOfExperience ?? 0} years</td><td className="px-4 py-3.5"><span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold ${roleClasses(user.role)}`}>{user.role}</span></td><td className="px-4 py-3.5"><span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${statusClasses(user.status)}`}><span className={`h-1.5 w-1.5 rounded-full ${user.status === "Active" ? "bg-emerald-500" : "bg-slate-400"}`} />{user.status}</span></td><td className="px-4 py-3.5 text-xs text-slate-500">{formatDate(user.joinedAt)}</td><td className="px-4 py-3.5 text-xs text-slate-500">{formatDate(user.lastActiveAt)}</td><td className="px-5 py-3.5">{renderUserActions(user)}</td></tr>)}</tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">{visibleUsers.map(renderUserCard)}</div>
                  )}

                  {!loading && filteredUsers.length > 0 ? <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5"><p className="text-[11px] text-slate-500">Showing <span className="font-semibold text-slate-700">{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filteredUsers.length)}</span> of <span className="font-semibold text-slate-700">{filteredUsers.length}</span> users</p><div className="flex items-center gap-1"><button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1} className="rounded-md border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Previous page"><Icon name="chevron-left" /></button><span className="px-2 text-[11px] text-slate-500">Page <strong className="text-slate-800">{page}</strong> of {totalPages}</span><button type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page === totalPages} className="rounded-md border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Next page"><Icon name="chevron-right" /></button></div></div> : null}
                </section>
                <p className="text-center text-[10px] text-slate-400">RAF CONSULT · Internal user administration</p>
              </>
            ) : (
              <>
                <div className="mb-7"><p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[#54708f]">Administration / Access Control</p><h1 className="text-2xl font-bold tracking-tight text-[#142b50] sm:text-[28px]">Roles &amp; Permissions</h1><p className="mt-1.5 text-sm text-slate-500">A reference view of the access levels used in the RAF CONSULT application.</p></div>
                <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-100 p-5"><div className="flex items-start gap-3"><div className="rounded-lg bg-[#eaf0f8] p-2.5 text-[#18365f]"><Icon name="shield" className="h-5 w-5" /></div><div><h2 className="text-sm font-bold text-slate-900">Permission matrix</h2><p className="mt-1 text-xs text-slate-500">The matrix below describes the intended UI access model for each system role.</p></div></div></div>
                  <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left"><thead><tr className="bg-[#f8fafc] text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400"><th className="px-5 py-4">Permission</th>{SYSTEM_ROLES.map((role) => <th key={role} className="px-4 py-4 text-center">{role}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{PERMISSIONS.map((permission) => <tr key={permission.label}><td className="px-5 py-4 text-xs font-medium text-slate-700">{permission.label}</td>{SYSTEM_ROLES.map((role) => <td key={role} className="px-4 py-4 text-center">{permission.access[role] ? <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-50 text-xs font-bold text-emerald-700" aria-label="Allowed">✓</span> : <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-xs text-slate-400" aria-label="Not allowed">—</span>}</td>)}</tr>)}</tbody></table></div>
                  <div className="m-4 rounded-lg border border-amber-200 bg-amber-50 p-4"><p className="text-xs font-bold text-amber-950">Important · Frontend display only</p><p className="mt-1 text-xs leading-5 text-amber-900">This matrix controls how the frontend presents available actions. It is not a security boundary. NestJS must enforce every permission on the API using authenticated identity checks and backend guards. Never rely on hidden buttons or client-side role checks to protect data.</p></div>
                </section>
              </>
            )}
          </div>
        </main>
      </div>

      {toast ? (
        <div className="pointer-events-none fixed right-4 top-4 z-[80] flex w-[calc(100%-2rem)] max-w-md flex-col gap-2 sm:right-6 sm:top-6">
          <Us18EmailToast key={toast.id} kind={toast.kind} title={toast.title} message={toast.message} retryLabel={toast.retryUserId ? "Retry Email" : undefined} retrying={toast.retrying} onRetry={toast.retryUserId ? handleRetryEmail : undefined} onDismiss={clearToast} />
        </div>
      ) : null}

      {dialog?.kind === "create" || dialog?.kind === "edit" ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[#0b1d37]/55 p-4 backdrop-blur-[2px]" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !submitting) setDialog(null); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="user-form-title" className="my-auto w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl shadow-slate-950/25">
            <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5"><div><p className="text-[10px] font-bold uppercase tracking-[0.17em] text-[#54708f]">User administration</p><h2 id="user-form-title" className="mt-1 text-lg font-bold text-[#142b50]">{dialog.kind === "create" ? "Add new user" : "Edit user details"}</h2><p className="mt-1 text-xs text-slate-500">Employee information and application access are managed separately.</p></div><button type="button" onClick={() => setDialog(null)} disabled={submitting} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50" aria-label="Close dialog"><Icon name="close" /></button></div>
            <form onSubmit={handleSaveUser} noValidate>
              <div className="grid grid-cols-1 gap-4 px-6 py-5 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <FieldLabel>Profile picture</FieldLabel>
                  <div className="flex items-center gap-4">
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100">
                      {profilePicturePreview ? (
                        <Image src={profilePicturePreview} alt="Selected profile picture preview" width={80} height={80} unoptimized className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-2xl font-semibold text-slate-400">{dialog.kind === "edit" ? initials(dialog.user.name) : "+"}</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <label htmlFor="profile-picture-upload" className="inline-flex cursor-pointer items-center rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-[#18365f] transition hover:bg-slate-50">
                        Upload picture
                      </label>
                      <input id="profile-picture-upload" type="file" accept="image/jpeg,image/png,image/webp" onChange={handleProfilePictureChange} className="sr-only" />
                      <p className="mt-1.5 text-[10px] text-slate-400">JPG, PNG or WEBP · Maximum 5 MB</p>
                      {profilePictureFile ? <p className="mt-1 max-w-[240px] truncate text-[10px] text-slate-500">{profilePictureFile.name}</p> : null}
                      {profilePicturePreview ? <button type="button" onClick={clearProfilePicture} className="mt-1 text-[10px] font-medium text-rose-600 hover:underline">Remove picture</button> : null}
                    </div>
                  </div>
                  {pictureError ? <span className="mt-2 block text-[11px] text-rose-600">{pictureError}</span> : null}
                  <p className="mt-2 text-[10px] text-slate-400">Photo preview only. Permanent storage requires a profile-picture upload endpoint in the backend.</p>
                </div>
                <label className="sm:col-span-2"><FieldLabel required>Full name</FieldLabel><input autoFocus value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="e.g. John Smith" className={`h-10 w-full rounded-lg border px-3 text-sm outline-none focus:ring-2 ${formErrors.name ? "border-rose-300 focus:ring-rose-100" : "border-slate-200 focus:border-[#58779d] focus:ring-blue-100"}`} />{formErrors.name ? <span className="mt-1 block text-[11px] text-rose-600">{formErrors.name}</span> : null}</label>
                <label className="sm:col-span-2"><FieldLabel required>Email address</FieldLabel><input type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} placeholder="name@rafconsult.my" autoComplete="email" className={`h-10 w-full rounded-lg border px-3 text-sm outline-none focus:ring-2 ${formErrors.email ? "border-rose-300 focus:ring-rose-100" : "border-slate-200 focus:border-[#58779d] focus:ring-blue-100"}`} />{formErrors.email ? <span className="mt-1 block text-[11px] text-rose-600">{formErrors.email}</span> : null}</label>
                <label className="sm:col-span-2"><FieldLabel required>Position</FieldLabel><select value={form.position} onChange={(event) => setForm((current) => ({ ...current, position: event.target.value as UserInput["position"] }))} className={`h-10 w-full rounded-lg border bg-white px-3 text-sm outline-none focus:ring-2 ${formErrors.position ? "border-rose-300 focus:ring-rose-100" : "border-slate-200 focus:border-[#58779d] focus:ring-blue-100"}`}>{USER_POSITIONS.map((position) => <option key={position} value={position}>{position}</option>)}</select><span className="mt-1 block text-[10px] text-slate-400">Employee&apos;s actual job title.</span>{formErrors.position ? <span className="mt-1 block text-[11px] text-rose-600">{formErrors.position}</span> : null}</label>
                <label><FieldLabel required>Years of Experience</FieldLabel><input type="number" min="0" max="60" step="1" value={form.yearsOfExperience} onChange={(event) => setForm((current) => ({ ...current, yearsOfExperience: event.target.value === "" ? 0 : Number(event.target.value) }))} placeholder="e.g. 5" className={`h-10 w-full rounded-lg border bg-white px-3 text-sm outline-none focus:ring-2 ${formErrors.yearsOfExperience ? "border-rose-300 focus:ring-rose-100" : "border-slate-200 focus:border-[#58779d] focus:ring-blue-100"}`} /><span className="mt-1 block text-[10px] text-slate-400">Total professional working experience in years.</span>{formErrors.yearsOfExperience ? <span className="mt-1 block text-[11px] text-rose-600">{formErrors.yearsOfExperience}</span> : null}</label>
                <label><FieldLabel required>System role</FieldLabel><select value={form.role} onChange={(event) => setForm((current) => ({ ...current, role: event.target.value as SystemRole }))} className={`h-10 w-full rounded-lg border bg-white px-3 text-sm outline-none focus:ring-2 ${formErrors.role ? "border-rose-300 focus:ring-rose-100" : "border-slate-200 focus:border-[#58779d] focus:ring-blue-100"}`}>{SYSTEM_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}</select><span className="mt-1 block text-[10px] text-slate-400">Controls application permissions.</span>{formErrors.role ? <span className="mt-1 block text-[11px] text-rose-600">{formErrors.role}</span> : null}</label>
              </div>
              <div className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50/70 px-6 py-4 sm:flex-row sm:justify-end"><button type="button" onClick={() => setDialog(null)} disabled={submitting} className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">Cancel</button><button type="submit" disabled={submitting} className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#18365f] px-5 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-[#234875] disabled:cursor-not-allowed disabled:opacity-60">{submitting ? <><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />{dialog.kind === "create" ? "Creating user…" : "Saving changes…"}</> : dialog.kind === "create" ? "Create User" : "Save Changes"}</button></div>
            </form>
          </section>
        </div>
      ) : null}

      {dialog?.kind === "view" ? (
        <ModalShell title="User profile" subtitle="Account information and access details" onClose={() => setDialog(null)}>
          <div className="flex items-center gap-4"><div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#e8eef7] text-lg font-bold text-[#1b3b68]">{initials(dialog.user.name)}</div><div className="min-w-0"><h3 className="text-base font-bold text-slate-900">{dialog.user.name}</h3><p className="break-all text-xs text-slate-500">{dialog.user.email}</p><p className="mt-1 text-[10px] text-slate-400">{dialog.user.id}</p></div></div>
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">{[
            ["Position", dialog.user.position], ["Years of experience", `${dialog.user.yearsOfExperience ?? 0} years`], ["System role", dialog.user.role], ["Account status", dialog.user.status], ["Joined date", formatDate(dialog.user.joinedAt)], ["Last active", formatDate(dialog.user.lastActiveAt)],
          ].map(([label, value]) => <div key={label} className="rounded-lg border border-slate-100 bg-slate-50/70 p-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p><p className="mt-1 text-sm font-medium text-slate-800">{value}</p></div>)}</div>
          <div className="mt-5 flex justify-end"><button type="button" onClick={() => openEdit(dialog.user)} className="rounded-lg bg-[#18365f] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#234875]">Edit user</button></div>
        </ModalShell>
      ) : null}

      {dialog?.kind === "delete" ? (
        <ModalShell title="Delete user account?" subtitle="This action cannot be undone." onClose={() => setDialog(null)}>
          <div className="rounded-lg border border-rose-100 bg-rose-50 p-4"><p className="text-sm font-semibold text-rose-950">{dialog.user.name}</p><p className="mt-1 text-xs text-rose-800">{dialog.user.email}</p><p className="mt-3 text-xs leading-5 text-rose-800">The account will be permanently removed from the system. Consider deactivating the account instead if access may be needed later.</p></div>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={() => setDialog(null)} className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">Cancel</button><button type="button" onClick={() => void handleDelete()} disabled={rowActionId === dialog.user.id} className="rounded-lg bg-rose-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-60">{rowActionId === dialog.user.id ? "Deleting…" : "Delete account"}</button></div>
        </ModalShell>
      ) : null}
    </div>
  );
}

function StatCard({ label, value, icon, detail, tone = "blue" }: { label: string; value: number; icon: ReactNode; detail: string; tone?: "blue" | "green" | "amber" | "purple" }) {
  const tones = {
    blue: "bg-blue-50 text-blue-700",
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    purple: "bg-violet-50 text-violet-700",
  };
  return <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-900/[0.02]"><div className="flex items-start justify-between"><div><p className="text-xs font-medium text-slate-500">{label}</p><p className="mt-2 text-[27px] font-bold tracking-tight text-[#142b50]">{value}</p></div><div className={`flex h-10 w-10 items-center justify-center rounded-lg ${tones[tone]}`}>{icon}</div></div><p className="mt-2 text-[10px] text-slate-400">{detail}</p></article>;
}

function ModalShell({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: ReactNode }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[#0b1d37]/55 p-4 backdrop-blur-[2px]" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section role="dialog" aria-modal="true" aria-labelledby="modal-title" className="my-auto w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl shadow-slate-950/25"><div className="flex items-start justify-between gap-3"><div><h2 id="modal-title" className="text-lg font-bold text-[#142b50]">{title}</h2><p className="mt-1 text-xs text-slate-500">{subtitle}</p></div><button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close dialog"><Icon name="close" /></button></div><div className="mt-5">{children}</div></section></div>;
}

// Keep the default export because the existing app/page.tsx imports this component by default.
export default UserManagementDashboard;

