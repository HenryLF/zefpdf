import { useMemo } from "preact/hooks";
import { create } from "zustand";
import {
  EMPTY_SNAPSHOT,
  type Class,
  type ImportRow,
  type LinkKind,
  type PersonFields,
  type Snapshot,
  type Student,
  type StudentLink,
} from "@shared/api";
import { api } from "@/api";
import { errorMessage } from "@/lib/error";

interface DbStore {
  snapshot: Snapshot;
  status: "idle" | "loading" | "error";
  /** the last refused or failed request, shown by the dashboard */
  error: string | null;
  load(): Promise<void>;
  clearError(): void;
  setActiveClass(id: number | null): Promise<boolean>;
  createClass(name: string): Promise<boolean>;
  renameClass(id: number, name: string): Promise<boolean>;
  /** #rrggbb */
  setClassColor(id: number, color: string): Promise<boolean>;
  deleteClass(id: number): Promise<boolean>;
  addStudent(classId: number, person: PersonFields): Promise<boolean>;
  importStudents(classId: number, rows: ImportRow[]): Promise<boolean>;
  updatePerson(id: number, person: PersonFields): Promise<boolean>;
  /** delete a person: out of every class, with their seating links */
  deletePerson(id: number): Promise<boolean>;
  /** take a student out of their class; the person stays */
  removeStudent(enrolmentId: number): Promise<boolean>;
  addLink(classId: number, aId: number, bId: number, kind: LinkKind): Promise<boolean>;
  deleteLink(id: number): Promise<boolean>;
}

/**
 * The app-wide class database. Every write answers with the whole
 * Snapshot, which simply replaces the one held here: no optimistic
 * bookkeeping, nothing to reconcile. Each action resolves to whether it worked;
 * a refusal's message lands in `error`.
 */
export const useDb = create<DbStore>()((set) => {
  const write = async (call: () => Promise<Snapshot>) => {
    try {
      set({ snapshot: await call(), error: null });
      return true;
    } catch (e) {
      set({ error: errorMessage(e) });
      return false;
    }
  };

  return {
    snapshot: EMPTY_SNAPSHOT,
    status: "idle",
    error: null,

    async load() {
      set({ status: "loading", error: null });
      try {
        set({ snapshot: await api.db.get(), status: "idle" });
      } catch (e) {
        set({ status: "error", error: errorMessage(e) });
      }
    },
    clearError: () => set({ error: null }),

    setActiveClass: (id) => write(() => api.db.setActiveClass(id)),
    createClass: (name) => write(() => api.db.createClass(name)),
    renameClass: (id, name) => write(() => api.db.updateClass(id, { name })),
    setClassColor: (id, color) => write(() => api.db.updateClass(id, { color })),
    deleteClass: (id) => write(() => api.db.deleteClass(id)),
    addStudent: (classId, person) => write(() => api.db.addStudent(classId, person)),
    importStudents: (classId, rows) => write(() => api.db.importStudents(classId, rows)),
    updatePerson: (id, person) => write(() => api.db.updatePerson(id, person)),
    deletePerson: (id) => write(() => api.db.deletePerson(id)),
    removeStudent: (id) => write(() => api.db.deleteEnrolment(id)),
    addLink: (classId, aId, bId, kind) => write(() => api.db.addLink({ classId, aId, bId, kind })),
    deleteLink: (id) => write(() => api.db.deleteLink(id)),
  };
});

// The hooks plugins read the database through. The snapshot's arrays are only
// replaced by a write, so filtering them under useMemo stays stable between
// writes — a selector returning a fresh array would re-render forever.

export function useClasses(): Class[] {
  return useDb((s) => s.snapshot.classes);
}

export function useActiveClass(): Class | null {
  return useDb((s) => s.snapshot.classes.find((c) => c.id === s.snapshot.activeClassId) ?? null);
}

/** Every student of every class: each enrolment joined to its person. */
export function useAllStudents(): Student[] {
  const people = useDb((s) => s.snapshot.people);
  const enrolments = useDb((s) => s.snapshot.enrolments);
  return useMemo(() => {
    const byId = new Map(people.map((p) => [p.id, p]));
    return enrolments.map((e) => {
      const { last, first, gender, birthDate } = byId.get(e.personId)!;
      return { ...e, last, first, gender, birthDate };
    });
  }, [people, enrolments]);
}

export function useStudents(classId: number | null | undefined): Student[] {
  const all = useAllStudents();
  return useMemo(() => all.filter((x) => x.classId === classId), [all, classId]);
}

export function useLinks(classId: number | null | undefined): StudentLink[] {
  const all = useDb((s) => s.snapshot.links);
  return useMemo(() => all.filter((x) => x.classId === classId), [all, classId]);
}

/** "First Last", or just the last name when there is no first. */
export const studentName = (s: Pick<Student, "last" | "first">) =>
  s.first ? `${s.first} ${s.last}` : s.last;
