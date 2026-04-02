export type CurrentPrincipalCapabilities = {
  schema: {
    read: boolean;
    write: boolean;
  };
  content: {
    read: boolean;
    readDraft: boolean;
    write: boolean;
    publish: boolean;
    unpublish: boolean;
    delete: boolean;
  };
  users: {
    manage: boolean;
  };
  settings: {
    manage: boolean;
  };
};

export type CurrentPrincipalCapabilitiesResponse = {
  project: string;
  environment: string;
  capabilities: CurrentPrincipalCapabilities;
};

export function createEmptyCurrentPrincipalCapabilities(): CurrentPrincipalCapabilities {
  return {
    schema: {
      read: false,
      write: false,
    },
    content: {
      read: false,
      readDraft: false,
      write: false,
      publish: false,
      unpublish: false,
      delete: false,
    },
    users: {
      manage: false,
    },
    settings: {
      manage: false,
    },
  };
}
