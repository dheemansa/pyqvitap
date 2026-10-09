/**
 * Global Maintenance Mode Configuration for PyqVitAp.
 * In production environments/builds, MAINTENANCE_MODE is strictly false.
 * In local development (NODE_ENV === "development"), it can be controlled
 * via NEXT_PUBLIC_MAINTENANCE_MODE (set to "false" to run normal app).
 */
export const MAINTENANCE_MODE =
  process.env.NODE_ENV === "development"
    ? process.env.NEXT_PUBLIC_MAINTENANCE_MODE === "false"
      ? false
      : true
    : false;
