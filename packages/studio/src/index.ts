"use client";

export {
  Studio,
  StudioShellFrame,
  type MdcmsConfig,
  type StudioProps,
  type StudioShellFrameProps,
  type StudioStartupState,
} from "./lib/studio-component.js";
export { resolveStudioDocumentRouteSchemaCapability } from "./lib/document-route-schema.js";
export type { StudioDocumentRouteSchemaCapability } from "./lib/document-route-schema.js";
export type {
  PropsEditorComponent,
  PropsEditorComponentProps,
} from "./lib/mdx-props-editor-host.js";
export {
  createStudioAiRouteApi,
  type StudioAiInlineAction,
  type StudioAiInlineTransformRequest,
  type StudioAiInlineTransformResult,
  type StudioAiApplyRequest,
  type StudioAiApplyResult,
  type StudioAiProposal,
  type StudioAiProposalOperation,
  type StudioAiProposalValidation,
  type StudioAiRouteApi,
  type StudioAiRouteApiOptions,
  type StudioAiRouteConfig,
} from "./lib/ai-route-api.js";
export {
  InlineAiPanel,
  type InlineAiPanelProps,
} from "./lib/runtime-ui/components/editor/inline-ai-panel.js";
export {
  useInlineAiTransform,
  type InlineAiAppliedSignal,
  type InlineAiSelection,
  type InlineAiState,
  type InlineAiTransformIntent,
  type InlineAiTransformOptions,
  type UseInlineAiTransformInput,
  type UseInlineAiTransformResult,
} from "./lib/runtime-ui/hooks/use-inline-ai-transform.js";
