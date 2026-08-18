Audit and improve how well ravewellness.org serves AI agents: markdown for agents, agent discovery documents, WebMCP, and the agentic-commerce protocols.

**Usage:**
- `/agent-ready audit` — check current state against each standard and output a prioritised punch list
- `/agent-ready fix markdown` — implement markdown content negotiation
- `/agent-ready fix skills` — publish the agent skills discovery index
- `/agent-ready fix webmcp` — register WebMCP tools
- `/agent-ready scan` — run the external validator and report results

---

## Read this first: what applies to this site and what does not

This site is a **static Astro build on Vercel**. It publishes harm reduction information and earns via **affiliate links**. It has **no checkout, no inventory, no payment processing, and no fulfilment**. That single fact decides most of what follows.

| Standard | Applies here? | Why |
|---|---|---|
| **Markdown for agents** | **Yes, highest value** | The site's traffic is overwhelmingly AI retrieval. This directly serves that. |
| **Agent Skills Discovery** | Yes, cheap and honest | The site has real reusable procedures (drug checking, interaction lookup) worth publishing. |
| **WebMCP** | Maybe, and early | There is a genuine tool to expose (the interaction checker). The API is at Chrome origin-trial stage, so treat as experimental. |
| **MCP Server Card** | Not yet | Requires actually running an MCP server. That is real infrastructure, not a static file. Only do this if someone builds and hosts the server. |
| **ACP (Agentic Commerce Protocol)** | **No. Do not implement.** | See below. |

### Why ACP must not be implemented here

ACP describes a **merchant** that an agent can buy from. Its discovery document requires `capabilities.services` listing services you actually offer, plus an `api_base_url` backing a real commerce API.

Rave Wellness sells nothing. Publishing `/.well-known/acp.json` would advertise a checkout that does not exist. An agent that discovered it and attempted a purchase would fail, and the site would have made a false claim about itself in a machine-readable format. **That is worse than being invisible to commerce agents.**

If DanceSafe implements ACP, the commerce integration belongs on their domain, not this one.

### And the related question: can we get agents to attach our affiliate links to purchases?

**No, and none of these protocols provide that.** ACP lets an agent transact with *you*. WebMCP exposes *your* site's tools. MCP server cards advertise *your* server. There is no mechanism in any of them for a third-party content site to inject its affiliate tracking into an agent's purchase of someone else's product. If such a mechanism existed it would be trivially abused, which is why it does not.

This matches what is already true of AI citations: assistants link the **page**, not the outbound links inside it. The affiliate link fires when a human lands on the site and clicks. Everything in this skill is therefore about **getting cited and getting the click-through**, not about riding along inside an agent's transaction.

---

## 1. Markdown for agents (do this first)

**Goal:** hand agents clean text instead of making them parse the page shell, nav, and inline styles.

**Two complementary pieces. Ship the first even if the second is deferred.**

### a. Emit `.md` variants at build time

The site is static, so the cheapest correct approach is generating a markdown representation alongside each HTML page. In Astro, add an endpoint that renders the collection entry body as `text/markdown`:

- `src/pages/blog/[...slug].md.ts` returning the raw entry body with frontmatter flattened into a short header
- Set `Content-Type: text/markdown; charset=utf-8`
- Keep the same slug so the mapping is guessable: `/blog/foo.html` ↔ `/blog/foo.md`

This works with a pure static build and requires no adapter change.

### b. Content negotiation on `Accept: text/markdown`

True negotiation needs something running per-request. On **Vercel** that is Edge Middleware at the project root (not Cloudflare Workers, and not the Cloudflare docs' approach, which do not apply to this deployment):

- If the request `Accept` header includes `text/markdown`, rewrite to the `.md` variant
- Otherwise serve HTML unchanged
- Always send `Vary: Accept` so caches do not serve markdown to browsers

**Verify after implementing:**
```
curl -H "Accept: text/markdown" -sI https://www.ravewellness.org/blog/<slug>.html
curl -sI https://www.ravewellness.org/blog/<slug>.html
```
The first should return markdown, the second HTML, and both should carry `Vary: Accept`.

**Content rules for the markdown representation:**
- Include the title, description, publication and `lastmod` dates, and author
- Keep the `## Sources` section. Citations are the site's main credibility signal and an agent should see them
- Keep internal links as absolute URLs so an agent can follow them
- Do **not** strip the affiliate disclosure. It must travel with the content

---

## 2. Agent Skills Discovery Index

Serve `/.well-known/agent-skills/index.json` (HTTP 200) per the Agent Skills Discovery RFC v0.2.0.

Required shape:
- `$schema`: `https://schemas.agentskills.io/discovery/0.2.0/schema.json`
- `skills[]`, each with `name` (lowercase alphanumeric and hyphens), `type` (`skill-md` or `archive`), `description`, `url`, and `digest` as `sha256:{hex}` of the artifact

**Only publish skills that are genuinely useful to a third party and that we can stand behind.** Candidates grounded in content that already exists:
- `reagent-testing` — which reagent for which substance, how to read a result, what reagents cannot do
- `drug-interaction-check` — the interaction checker's logic
- `fentanyl-test-strips` — the protocol, including that one line is positive

**The digest must match the artifact.** Compute it at build time, not by hand, or it will drift the first time a skill is edited and every validator will fail.

**Honesty constraint:** a published skill is content we are handing to an agent to act on. Everything in the standing rules applies: no product recommended for something it does not fix, no purchase prompts in emergency guidance, doses carry evidence tiers, and the fentanyl strip direction is stated explicitly.

---

## 3. WebMCP (experimental)

Register tools via `navigator.modelContext.registerTool()` so an agent operating a browser can use the site's functionality directly.

- Each tool needs `name`, `description`, `inputSchema` (JSON Schema), and an `execute` callback
- Register on page load; the API is detected by loading the page
- Use an `AbortController` signal to unregister when no longer needed
- **Feature-detect.** `navigator.modelContext` will be undefined in nearly every browser today, so guard before calling and never let it throw

The natural first tool is the **interaction checker**, since it is genuine site functionality rather than a wrapper around a search box. A second candidate is a which-kit lookup keyed by substance.

Treat this as experimental: it is at Chrome origin-trial stage, and it should never regress the normal page for human visitors.

---

## 4. MCP Server Card (defer)

`/.well-known/mcp/server-card.json` advertises a running MCP server with `serverInfo`, a transport `endpoint`, and `capabilities`.

**Do not publish this until a server actually exists and responds.** A card pointing at a dead endpoint is a broken promise in a machine-readable file, the same failure mode as the ACP document. Revisit only if someone decides to build and host the server.

---

## Validate

```
POST https://isitagentready.com/api/scan
Content-Type: application/json
{"url": "https://www.ravewellness.org"}
```

Check these paths in the response:
- `checks.discovery.agentSkills.status`
- `checks.discovery.webMcp.status`
- `checks.discovery.mcpServerCard.status`
- `checks.commerce.acp.status` — **expected to fail here, and that is correct.** Do not "fix" it.

Report the real result. A failing check that should fail is not a problem to be papered over.

---

## Standing constraints

- **Never publish a discovery document describing a capability the site does not have.** This is the central rule of this skill.
- Markdown output must carry the affiliate disclosure and the `## Sources` section.
- Nothing here may degrade the human page. Agent readiness is additive.
- Do not add `.well-known` files without checking that Vercel serves them from `public/` with the right content type.
- If an agent-facing artifact contains harm reduction guidance, it is subject to `/harm-reduction-expert` review like any other content.
