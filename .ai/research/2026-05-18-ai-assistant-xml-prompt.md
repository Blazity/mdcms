# AI assistant XML-style prompt envelope

## Recommendation

Use a light XML-style envelope for MDCMS Studio chat prompts, but only for
section boundaries. Keep tool schemas, authorization, proposal validation, and
audit records as server-side controls.

The implementation should:

- Wrap trusted prompt sections in stable tags such as `<assistant_role>`,
  `<instructions>`, `<project_knowledge>`, `<available_tools>`,
  `<action_availability>`, `<hard_limits>`, and `<chat_context>`.
- Keep Markdown and MDX document content as escaped text inside those sections
  instead of trying to make document bodies valid XML.
- Escape XML-significant characters in user-authored text, document bodies,
  document frontmatter, excerpts, and conversation history before injection.
- Treat XML tags as organization, not security. Prompt injection is still
  handled by scope-gated tools and server-side validators.

## Research basis

- OpenAI prompt engineering guidance recommends putting instructions first and
  using delimiters to separate instructions from context:
  https://help.openai.com/en/articles/6654000-best-practices-for-prompt-engineering-with-openai-api
- Anthropic recommends XML tags for complex prompts because named sections make
  prompt parts easier for the model to parse and reference:
  https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/use-xml-tags
- Google Vertex AI guidance also lists XML tags and other delimiters as a way to
  structure complex prompts:
  https://cloud.google.com/vertex-ai/generative-ai/docs/learn/prompts/structure-prompts
- Prompt-formatting research shows that model output can be sensitive to prompt
  templates, which argues for a stable, tested prompt envelope rather than ad hoc
  prose changes:
  https://arxiv.org/abs/2411.10541
- OpenAI and AWS prompt-injection guidance frame the problem as separating
  trusted instructions from untrusted content. Delimiters help organization, but
  trusted tool and validation boundaries are still required:
  https://openai.com/safety/prompt-injections/
  https://docs.aws.amazon.com/prescriptive-guidance/latest/llm-prompt-engineering-best-practices/common-attacks.html
