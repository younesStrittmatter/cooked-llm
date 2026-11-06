# cooked-llm

A two-cook cooperative kitchen game where either cook can be played by a person
or by Claude, built for running participant studies.

## Pages

- **`/`** — the player-facing game. Loads whatever was last **published** from the setup page, runs the configured phases, and uploads a full action log at the end. No editor UI.
- **`/setup`** — password-protected developer page. Edit the map, choose who plays each cook, write each cook's own extra instructions (optionally scheduled to change mid-round), set phase durations, and **Publish** to push it all live.

Players never see the editor — they just get whichever config was last published.

## Cooks

Each of the two cooks is set to **Human**, **Claude**, or (for cook 2) **Disabled**:

| Cook 1 | Cook 2 | Use |
| --- | --- | --- |
| Human | Claude | The study setup: a participant paired with the model. |
| Claude | Claude | Watch the model play itself, for tuning prompts and maps. |
| Human | Human | Two people at one keyboard; press `1` / `2` to switch which cook the mouse controls. |
| Human | Disabled | Solo kitchen. |

Both cooks share a score: every delivered salad is one point for the team.

Each cook also has its own **walk speed** (tiles/tick) and **cut speed**
(chopping multiplier, 1 ≈ 3s per chop), set independently in its cook card on
the setup page. Claude is always told both its own speed and its teammate's in
the kitchen block, including an explicit faster/slower comparison, so it can
reason about who should take on which task.

## Phases

Set in **Phases** on the setup page. Each round is preceded by a full-screen
notice the player has to dismiss, and the kitchen (held items, tile contents,
positions, score) is reset when a round starts.

1. **Practice round** — timed, explicitly not scored. The player is told so up front, and told again when it ends that the real game is starting.
2. **Scored round** — timed, counts towards the score.
3. **Free play** — optional, no time limit; the player ends it with a **Stop playing** button.

Set a duration to `0` to skip that round. At least one round must be enabled.

## The Claude agent

Everything the model needs is assembled programmatically each turn; the
free-text boxes on the setup page only *add* instructions on top. The prompt is
built in three layers, which are also the prompt-cache breakpoints:

1. **Rules** (`src/game/llm-rules.js`) — the game rules, machine behaviour, recipe and reply format. Identical for every request.
2. **This kitchen** (`buildKitchenBlock`) — the map as ASCII plus a coordinate list of every dispenser, board, counter, bin and delivery window, the speeds, and your extra instructions. Stable for the whole session.
3. **Turn state** (`buildStateMessage`) — positions, held items, what each cook is doing, board chop progress, counter contents, score, phase and time left, **what the other cook most recently clicked**, and the list of actions currently available.

### It can only choose actions that make sense

The agent does not click arbitrary tiles. Each turn `legalActions()`
(`src/game/agent-actions.js`) enumerates only the moves that would actually
change something for that cook, given what it is holding and where it can walk,
and the model picks one by number:

- Dispensers appear **only when its hands are empty**, since using one otherwise destroys what it carries.
- A counter offers *combine into a salad*, *put down*, *pick up* or *swap* — whichever of those its held item and the counter's contents actually allow.
- A cutting board offers *start chopping*, *carry on chopping*, *pick up the finished chop* or *swap* — never a combination that would be a no-op.
- The bin appears only when it holds something; the delivery window only when it holds a finished salad.
- Anything walled off or otherwise unreachable is filtered out by a reachability search.

So a chosen action can never be rejected or wasted. Typical lists are 3–5
options. Index 0 is always *wait* — a real choice, not just a placeholder: it
tells the model it is reasonable to sit still for about 2 seconds, or until a
counter's contents change, when it expects its teammate to shortly hand it
something or free up space it needs. If *wait* is the only option offered, the
agent skips the request entirely and just sits out the same window rather than
spending tokens on an obvious answer.

Every action names the **stand tile** the cook would end up on, plus walk
distance and a note when the shortest path currently runs through the
teammate. Each turn also includes a live ASCII map with cooks right now
(`Y`/`M`). The prompt is built around spatial reading of that map rather
than "who is closer" comparisons.

The model replies with `{"reasoning": "...", "action": <number>}`. The reply is
prefilled with `{` so it can't wander into prose, and a truncated reply is still
salvaged by regex.

### Cooperative reasoning, not a script

`src/game/llm-rules.js` deliberately avoids telling the model the "correct"
response to specific board states (it does not say things like *"if your
teammate is already chopping, go fetch a plate"* or *"if a salad is finished,
deliver it"*). Rules like that make an agent look competent in the exact
situations someone thought to write down, and brittle everywhere else, and
they crowd out the model actually reasoning about the situation in front of
it. Instead, **"Spatial cooperation"** and **"Reading the kitchen layout"**
explain what information the model has and why it matters — stand tiles,
choke points, relative walking/chopping speed, what the teammate is
doing *right now*, and how the map itself (how many boards, how they're laid
out) tends to suggest a natural split — and leave the actual call to the
model, turn by turn. The worked examples reinforce this: several explicitly
have more than one defensible choice, and say so, rather than presenting a
single "right answer" for the model to pattern-match against in a nearly
identical live situation.

The teammate-distance and speed-comparison data described above is exactly
what this reasoning runs on — the rules text tells the model *how to use*
that data, not what conclusion to draw from any one instance of it.

### Personality is per-cook, and can change mid-round on a schedule

Each cook's card on the setup page has its own **Claude personality** field —
two Claude cooks in the same game can be given completely different
instructions, and it has no effect at all for a Human-controlled cook. This is
independent of everything else on the card (speed, colour, controller).

The **Personality schedule** field below it optionally changes that same
cook's instructions partway through a round, without restarting the game or
losing progress. Write one or more blocks:

```
@90
From now on, prioritize your own deliveries over helping your teammate.

@150
Go back to normal cooperative play.
```

A line matching `@<seconds>` starts a block; everything after it up to the
next `@` line is the instructions to switch to once that many seconds of the
round have elapsed (`src/game/instruction-schedule.js`). Timing restarts at 0
at the start of every phase — `LlmAgent.start()`/`refreshKitchen()` rewind and
replay the same schedule from scratch each phase, so a practice round and the
scored round that follows it each get a full run of it. Changes are checked
every 100ms (`LlmAgent.tickSchedule()`), independent of whether the cook
happens to be idle, and every change is written to the session log
(`instructions_change` event) and shown live in the setup page's test log.

This works identically whether the *other* cook is a human or another Claude
agent, and the two cooks' schedules are entirely independent — nothing about
this feature requires them to be synchronized. Changing one cook's
instructions only ever invalidates that cook's own (small) kitchen cache
block; the shared rules-block cache, which is the bulk of the cached tokens,
is completely unaffected since it never contains per-agent data.

`node dev/check-instructions.js` exercises the parser and the live-swap
behaviour with no network calls, if you change any of this.

### It is asked once per completed action — or on a collision

There is no polling interval. The agent watches its cook and requests a decision
when that cook is **idle** — done walking, done interacting, done chopping
(`isBusy()` in `src/game/player.js`) — or the instant it **collides** with its
teammate. One request therefore corresponds to one completed action rather than
to a stretch of wall-clock time, and the model never has to reason about
interruptions or timing on its own.

Cooks can no longer walk through each other. `Game.stepPlayer()` walks a cook as
far along its path as it can and stops one tile short if the next step would
land on the other cook, clearing its path and firing a `collision` event
(`Game.handleCollision()`). That leaves the cook idle immediately, which is what
naturally triggers the next decision — the agent is told in its prompt that this
just happened so it can pick a different task or wait a beat and retry.

**Pause between decisions** on the setup page is a cooldown, not a tick rate: it
only throttles decisions when actions complete faster than that. It is skipped
for a collision, so the agent reacts immediately rather than after a pause. A
safety net asks anyway if a cook somehow stays busy for over a minute.

Choosing *wait* (deliberately, or automatically when it's the only option) uses
a separate, fixed 2-second window instead of that cooldown, and wakes up early
the moment any counter's contents change (`counterSignature()` in
`src/game/llm-agent.js` fingerprints every counter each poll) — so a cook that
is waiting for a handoff notices it immediately rather than sitting out the
full 2 seconds.

### About caching, and keeping this affordable under concurrency

**Claude Haiku 4.5 only caches prefixes of 4,096 tokens or more** — anything
shorter is silently sent uncached, no error. `src/game/llm-rules.js` is
deliberately written long enough (worked examples, a glossary, a discussion
of how to weigh trade-offs, ~4,900 tokens on its own) to clear that floor by
itself, so both cache breakpoints — rules alone, and rules + kitchen combined
— actually cache. Padding a prompt just to hit a token threshold would be a
bad trade, so the extra length is genuine guidance for a small model — see
"Cooperative reasoning, not a script" below — not filler; if you trim the
rules text back down below 4,096 tokens, caching silently stops working
again.

This matters most **because games run concurrently**: Anthropic's cache is
keyed by the exact bytes of the cached blocks, not by session or by which
`LlmAgent` instance sent the request, so it is automatically shared across
*every* concurrent game and every `LlmAgent` instance that happens to send
identical text — you don't need to share agent instances or coordinate games
for this; it falls out of the prompt being identical. Two independent
`dev/test-agent-turn.js` runs in a row demonstrate it: the second process's
very first request already reads the cache the first process wrote.

The two cache breakpoints get shared at different scopes, which matters now
that each cook can have its own personality (see below):

- **Rules block** — never varies at all, for any cook, in any game, with any
  map or personality. Every single request across your entire deployment
  shares this one cache entry. This is the large majority of the cached
  tokens (~4,400 of ~4,550).
- **Kitchen block** — varies by map, per-player speeds, and that cook's
  current personality text. Concurrent games/cooks with all three identical
  (e.g. every participant on the same published map and settings, with no
  personality customization) share this too; a cook with unique instructions
  just gets its own small extra cache entry for that block specifically,
  which costs little since the block itself is only ~150–400 tokens.

Only the first request anywhere in a rolling 5-minute window for a given
cache entry pays the (1.25×) write cost; every other request against that
same entry pays the cheap (0.1×) read rate instead.

Requests are also **stateless**: no conversation history is resent between
turns, only the current turn's state message. Each state message already
fully describes the game (position, holdings, board/counter contents, the
action list), so a rolling history mostly duplicated tokens that were never
cached and would otherwise grow the input size, and therefore the cost, on
every turn for the rest of the round.

**Inspect the exact prompt & test one turn** on the setup page shows all three
blocks including the current action list, estimates their token counts against
the current model's cache floor, and sends one real request so you can see the
reply, the latency and the `cache read` / `cache write` token counts.

Two dev scripts check the agent from the terminal:

```bash
node dev/check-actions.js              # prints the action list for a range of states, no API calls
node dev/test-agent-turn.js 14         # plays a headless round against localhost:8789, reports cache write/read totals
node dev/check-instructions.js         # checks the "@seconds" schedule parser and live personality swaps, no API calls
```

Claude cooks stay idle in the setup page's test game unless you tick **Let
Claude cooks play the test game**, so previewing a map costs nothing. Since
decisions are per-action, cost scales with how much the cooks get done rather
than with round length — a full salad takes about 8 decisions at roughly 30
output tokens each, and with the cache warm each decision costs on the order
of a few hundred cached-prefix tokens at 10% price plus a few hundred fresh
tokens at full price, not the full ~4,500-token prefix every time.

## Session logs

Every visit to `/` is recorded and uploaded to KV when the session ends. Browse
and download them under **Recorded sessions** on the setup page.

Each log holds the metadata needed to reproduce the run — map text and name,
each cook's walk/cut speed, which cook was human vs. Claude, the model, each
cook's own extra instructions and personality schedule, the phase durations —
plus per-phase scores, token usage per agent, and every event: clicks
(including rejected ones and why), collisions (which cook, at which tile),
interactions with before/after held and tile items, deliveries, resets, phase
transitions, scheduled personality changes (`instructions_change`, with the
cook, the time it fired, and the new text), and each LLM turn with its prompt,
reply, reasoning, usage, **the full set of actions it was offered and which
one it chose**.

If the upload fails, the player is offered a download button instead so the run
isn't lost. `replaySession()` in `src/game/session-log.js` feeds a stored log's
clicks back into a fresh game.

## Setup

Install [Node.js](https://nodejs.org/) (includes npm). Works on macOS, Linux, and Windows.

```bash
git clone https://github.com/younesStrittmatter/cooked-llm.git
cd cooked-llm
npm run setup
npm run dev
```

Open http://localhost:8788 (player page) or http://localhost:8788/setup.html (developer page).

For local LLM calls and the setup password, ask the project owner for `.dev.vars`.

### Testing the full backend locally (map storage, publish, password)

`npm run dev` (plain Vite) is fastest for UI work, but `/setup` save/load/publish need the Cloudflare Functions + KV storage, which Vite alone doesn't run. For that, use:

```bash
npm run dev:cf
```

This builds the site and serves it through `wrangler pages dev` with a local KV emulation and your `.dev.vars` secrets, at http://localhost:8789. Re-run it after making changes (no live reload).

## Deploy

You must be invited to the Cloudflare account first.

```bash
npx wrangler login   # once
npm run deploy
```

Live site: https://cooked-llm.pages.dev

## One-time project owner setup

### 1. API key (Anthropic)

One shared Anthropic API key — stored in Cloudflare, not in Git.

1. Go to https://dash.cloudflare.com
2. **Workers & Pages** → **cooked-llm**
3. **Settings** → **Variables and Secrets**
4. **Add** → choose **Secret** (encrypted)
   - Name: `ANTHROPIC_API_KEY`
   - Value: your `sk-ant-...` key
   - Environment: **Production**
5. **Save**, then redeploy: `npm run deploy`

### 2. Setup page password

Protects `/setup` in production so only you (and invited collaborators) can edit the live map/settings.

1. Same **Variables and Secrets** page as above
2. **Add** → **Secret**
   - Name: `ADMIN_PASSWORD`
   - Value: a password of your choice
   - Environment: **Production** (and **Preview** if you use branch/preview URLs)
3. **Save**, then redeploy

### 3. Storage (Cloudflare KV)

Published configs, saved maps and session logs all live in one Cloudflare KV namespace.

1. **Workers & Pages** → **KV** → **Create a namespace** (e.g. `cooked-llm-maps`)
2. Go back to **cooked-llm** → **Settings** → **Functions** → **KV namespace bindings**
3. **Add binding**
   - Variable name: `MAPS_KV`
   - KV namespace: the one you just created
4. **Save**, then redeploy

Without this binding, `/setup` still works for playtesting locally, but Save/Load/Publish will show a storage error, `/` always falls back to the built-in defaults, and session logs cannot be stored (players get the download fallback instead).

## API routes

| Route | Auth | Purpose |
| --- | --- | --- |
| `GET /api/config` | public | Live config for the play page. |
| `POST /api/config` | admin | Publish a config. |
| `GET`/`POST` `/api/maps` | admin | List / save named maps. |
| `GET`/`DELETE` `/api/maps/:name` | admin | Load / delete one map. |
| `POST /api/llm` | public | Proxies one Claude request, adding cache breakpoints and returning usage. |
| `POST /api/sessions` | public | Upload a finished session log. |
| `GET /api/sessions` | admin | Index of stored sessions. |
| `GET`/`DELETE` `/api/sessions/:key` | admin | Fetch / delete one full log. |

Admin routes take the setup password in an `x-admin-key` header.

### Local dev secrets

```bash
cp .dev.vars.example .dev.vars
```

Fill in:

```
ANTHROPIC_API_KEY=sk-ant-...
ADMIN_PASSWORD=choose-a-password
```

Share this file privately with your collaborator (never commit it). `npm run dev:cf` emulates `MAPS_KV` locally automatically — no extra setup needed for local map storage.
