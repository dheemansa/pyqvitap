"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import axios from "axios";
import {
  type ICourse,
  type ICourseCount,
  type ICourseWithCount,
} from "@/interface";

import { type ApiResponse } from "@/interface";
import { MAINTENANCE_MODE } from "@/config/maintenance";

interface CoursesContextType {
  courses: ICourseWithCount[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

const CoursesContext = createContext<CoursesContextType | undefined>(undefined);

export function CoursesProvider({ children }: { children: React.ReactNode }) {
  const [courses, setCourses] = useState<ICourseWithCount[]>([]);
  const [loading, setLoading] = useState(!MAINTENANCE_MODE);
  const [error, setError] = useState<string | null>(null);

  const fetchCourses = useCallback(async () => {
    if (MAINTENANCE_MODE) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    // 1. Fetch course-list independently
    let rawCourses: ICourse[] = [];
    try {
      const res = await axios.get<ApiResponse<ICourse[]>>("/api/course-list");
      rawCourses = res.data.data ?? [];
      const initialCourses: ICourseWithCount[] = rawCourses.map((course) => ({
        _id: course._id,
        name: course.name,
        count: 0,
      }));
      setCourses(initialCourses);
    } catch (err: unknown) {
      if (axios.isAxiosError<ApiResponse<never>>(err)) {
        setError(err.response?.data?.message ?? err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("An unknown error occurred");
      }
      setLoading(false);
      return;
    }

    // 2. Fetch /api/papers/count independently
    try {
      const countRes =
        await axios.get<ApiResponse<ICourseCount[]>>("/api/papers/count");
      const countMap = new Map<string, number>(
        (countRes.data.data ?? []).map((c) => [c.name, c.count]),
      );

      setCourses((prevCourses) =>
        prevCourses.map((course) => ({
          ...course,
          count: countMap.get(course.name) ?? course.count ?? 0,
        })),
      );
    } catch (countErr: unknown) {
      console.warn(
        "Failed to fetch paper counts, retaining course list with default counts:",
        countErr,
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (MAINTENANCE_MODE) {
      setLoading(false);
      return;
    }
    void fetchCourses();
  }, [fetchCourses]);

  const value = useMemo(
    () => ({ courses, loading, error, refetch: fetchCourses }),
    [courses, loading, error, fetchCourses],
  );

  return (
    <CoursesContext.Provider value={value}>{children}</CoursesContext.Provider>
  );
}

export function useCourses() {
  const context = useContext(CoursesContext);
  if (!context) {
    throw new Error("useCourses must be used within a CoursesProvider");
  }
  return context;
}
