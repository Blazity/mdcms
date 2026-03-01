export type StudioConfig = {
  project: string;
  serverUrl: string;
};

export type StudioProps = {
  config: StudioConfig;
};

/**
 * Studio is the host-embedded entrypoint for MDCMS Studio.
 * CMS-8 intentionally keeps this as a minimal shell for embed smoke coverage.
 */
export function Studio({ config }: StudioProps) {
  return (
    <section
      data-testid="mdcms-studio-root"
      data-mdcms-project={config.project}
      data-mdcms-server-url={config.serverUrl}
    >
      <h1>MDCMS Studio</h1>
      <p>Embed scaffold ready.</p>
    </section>
  );
}
