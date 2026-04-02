"use client";

import { createContext, useContext, type PropsWithChildren } from "react";

export type AdminCapabilitiesValue = {
  canReadSchema: boolean;
};

const DEFAULT_ADMIN_CAPABILITIES: AdminCapabilitiesValue = {
  canReadSchema: false,
};

const AdminCapabilitiesContext = createContext<AdminCapabilitiesValue>(
  DEFAULT_ADMIN_CAPABILITIES,
);

export function AdminCapabilitiesProvider({
  value,
  children,
}: PropsWithChildren<{
  value: AdminCapabilitiesValue;
}>) {
  return (
    <AdminCapabilitiesContext.Provider value={value}>
      {children}
    </AdminCapabilitiesContext.Provider>
  );
}

export function useAdminCapabilities(): AdminCapabilitiesValue {
  return useContext(AdminCapabilitiesContext);
}

export function useCanReadSchema(): boolean {
  return useAdminCapabilities().canReadSchema;
}
