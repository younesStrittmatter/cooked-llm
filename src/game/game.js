import { TILES, getCell, buildMap, findSpawnTiles } from "./map.js";
import { findPathAvoiding, adjacentWalkable } from "./pathfind.js";
import { drawFrame } from "./render.js";
import { Renderer } from "./renderer.js";
import { TICK_MS } from "./constants.js";
import { clearRecolorCache } from "./sprite-recolor.js";
import { interactCuttingBoard, tickCutting } from "./cutting-board.js";
import { interactCounter } from "./counter.js";
import { interactDispenser } from "./dispenser.js";
import { interactTrash } from "./trash.js";
import { interactDelivery } from "./delivery.js";
import { createPlayer, resetPlayer } from "./player.js";
import { actionsForCell } from "./agent-actions.js";
import { DEFAULT_PLAYERS } from "../../shared/game-defaults.js";

const INTERACT_LABELS = {
  exchange: "counter",
  pickup: "dispenser",
  cut: "cutting board",
  trash: "trash",
  deliver: "delivery",
};

export class Game {
  /**
   * @param {object} options
   * @param {Array<{id: string, controller: string, colors: object, walkSpeed: number, cutSpeed: number}>} options.players
   */
  constructor(map, canvas, viewport, options = {}) {
    this.map = map;
    this.canvas = canvas;
    this.renderer = new Renderer(canvas, map, viewport);
    this.tick = 0;
    this.score = 0;
    this.paused = true;
    this.loop = null;

    this.onDeliver = null;
    /** Fired for every click, interaction and delivery — consumed by the session log. */
    this.onEvent = null;
    this.onActiveHumanChange = null;

    const specs = (options.players ?? DEFAULT_PLAYERS).filter((p) => p.controller !== "none");
    const spawns = findSpawnTiles(map, specs.length);

    this.players = specs.map((spec, index) =>
      createPlayer({ ...spec, index, spawn: spawns[index] }),
    );

    this.activeHumanId = this.humanPlayers[0]?.id ?? null;
    clearRecolorCache();
  }

  get humanPlayers() {
    return this.players.filter((p) => p.controller === "human");
  }

  get llmPlayers() {
    return this.players.filter((p) => p.controller === "llm");
  }

  getPlayer(id) {
    return this.players.find((p) => p.id === id) ?? null;
  }

  /** The other cook, or null solo / in a 3+ cook future. */
  teammateOf(player) {
    return this.players.find((p) => p !== player) ?? null;
  }

  /** Tiles every *other* cook currently stands on — obstacles for `player`'s own routing. */
  blockedTilesFor(player) {
    return new Set(this.players.filter((p) => p !== player).map((p) => `${p.x},${p.y}`));
  }

  setPlayerSpeeds(id, { walkSpeed, cutSpeed }) {
    const player = this.getPlayer(id);
    if (!player) return;
    if (walkSpeed != null) player.walkSpeed = walkSpeed;
    if (cutSpeed != null) player.cutSpeed = cutSpeed;
  }

  setPlayerColors(id, hexColors) {
    const player = this.getPlayer(id);
    if (!player) return;
    const merged = { ...player.colorsHex, ...hexColors };
    const updated = createPlayer({ ...player, colors: merged, spawn: player });
    player.colorsHex = updated.colorsHex;
    player.colors = updated.colors;
    clearRecolorCache();
    this.renderer.resize();
  }

  emit(event) {
    this.onEvent?.({ tick: this.tick, at: Date.now(), ...event });
  }

  start() {
    if (this.loop) return;
    this.paused = false;
    this.loop = setInterval(() => this.step(), TICK_MS);
    this.canvas.addEventListener("click", this.handleCanvasClick);
    this.renderer.start((ctx) => drawFrame(this, ctx));
  }

  stop() {
    clearInterval(this.loop);
    this.loop = null;
    this.paused = true;
    this.canvas.removeEventListener("click", this.handleCanvasClick);
  }

  pause() {
    this.paused = true;
  }

  resume() {
    this.paused = false;
    for (const p of this.players) p.lastStepAt = performance.now();
  }

  handleCanvasClick = (e) => {
    if (!this.activeHumanId) return;
    const { x, y } = this.renderer.toTile(e.clientX, e.clientY);
    this.handleClick(this.activeHumanId, x, y);
  };

  /** Hands the mouse to another human cook — only meaningful when both are human. */
  setActiveHuman(id) {
    const player = this.getPlayer(id);
    if (!player || player.controller !== "human") return false;
    this.activeHumanId = id;
    this.onActiveHumanChange?.(player);
    return true;
  }

  /**
   * Routes a click for one player. Returns `{ ok, reason }` so LLM callers can be
   * told why an action was rejected.
   */
  handleClick(playerId, x, y) {
    const player = this.getPlayer(playerId);
    if (!player) return { ok: false, reason: "unknown player" };
    if (this.paused) return { ok: false, reason: "game is paused" };

    const cell = getCell(this.map, x, y);
    if (!cell) {
      this.emit({ type: "click", playerId, x, y, ok: false, reason: "off the map" });
      return { ok: false, reason: "off the map" };
    }

    const tile = TILES[cell.type];
    const target = tile.interact ? INTERACT_LABELS[tile.interact] : cell.type;
    player.lastClick = { x, y, tileType: cell.type, target, tick: this.tick };

    if (tile.walkable) {
      const path = findPathAvoiding(this.map, player.x, player.y, x, y, this.blockedTilesFor(player));
      if (!path) {
        this.emit({ type: "click", playerId, x, y, target, ok: false, reason: "no path there" });
        return { ok: false, reason: "no path there" };
      }
      player.pendingInteract = null;
      player.activeCut = null;
      player.path = path;
      this.emit({ type: "click", playerId, x, y, target, ok: true, intent: "walk" });
      return { ok: true };
    }

    if (!tile.interact) {
      this.emit({ type: "click", playerId, x, y, target, ok: false, reason: "wall — nothing to do" });
      return { ok: false, reason: "wall — nothing to do" };
    }

    const blocked = this.blockedTilesFor(player);
    const stand = adjacentWalkable(this.map, x, y, player.x, player.y, blocked);
    if (!stand) {
      this.emit({ type: "click", playerId, x, y, target, ok: false, reason: "nowhere to stand next to it" });
      return { ok: false, reason: "nowhere to stand next to it" };
    }

    const path = findPathAvoiding(this.map, player.x, player.y, stand.x, stand.y, blocked);
    if (!path) {
      this.emit({ type: "click", playerId, x, y, target, ok: false, reason: "cannot reach it" });
      return { ok: false, reason: "cannot reach it" };
    }

    // Captured now so a later tick can notice someone else changed this tile
    // before this cook arrived — see `revalidatePlans()`.
    const actionKind = actionsForCell(cell, player.item, this.teammateOf(player))[0]?.kind ?? null;
    player.pendingInteract = { x, y, actionKind };
    player.path = path;
    this.emit({ type: "click", playerId, x, y, target, ok: true, intent: `use ${target}` });
    return { ok: true };
  }

  step() {
    if (this.paused) return;
    this.tick++;

    this.reroutePaths();
    this.revalidatePlans();

    for (const player of this.players) {
      player.lastStepAt = performance.now();
      tickCutting(player, this.map, getCell);
      this.stepPlayer(player);
    }
  }

  /**
   * Re-plans every cook's remaining walk around where its teammate stands
   * *right now*, every tick — not just the route chosen at click time. A
   * teammate is a moving obstacle: a path that was clear when this cook set
   * off can become blocked, and one that was blocked can open up, so this
   * keeps the route current instead of only reacting once the cook actually
   * bumps into someone (see `stepPlayer`'s collision handling, which is still
   * the backstop for when no detour exists at all).
   */
  reroutePaths() {
    for (const player of this.players) {
      if (player.path.length === 0) continue;

      const dest = player.path[player.path.length - 1];
      const blocked = this.blockedTilesFor(player);
      const rerouted = findPathAvoiding(this.map, player.x, player.y, dest.x, dest.y, blocked);
      if (rerouted) player.path = rerouted;
    }
  }

  /** Ticks left before this cook's current walk finishes, ignoring the interact itself. */
  etaTicks(player) {
    if (player.path.length === 0) return 0;
    const remaining = player.path.length - player.walkProgress;
    return player.walkSpeed > 0 ? remaining / player.walkSpeed : Infinity;
  }

  /**
   * Re-checks every cook still walking toward a queued interaction against what
   * that tile actually offers right now. Two ways a plan can go stale before a
   * cook arrives:
   *
   * - Reactive: something already changed — the item was picked up, swapped, or
   *   (for a board) a teammate has since claimed the knife — so the action this
   *   cook committed to no longer matches what is actually available there.
   * - Anticipatory: the teammate is heading to that exact same tile and is on
   *   track to get there first, so the tile is *about* to change underneath
   *   this cook even though nothing has happened yet — no point walking the
   *   rest of the way just to find that out on arrival.
   *
   * Either way the walk is cancelled — same treatment as a collision — so an
   * idle LLM agent is asked for a fresh decision instead of wasting the rest
   * of the trip or performing a no-op once it gets there.
   *
   * LLM-only: a human who clicked a tile made their own call and should see
   * it through — walking all the way there and finding it's now a no-op is
   * normal, expected feedback for a person, whereas silently cancelling their
   * walk out from under them (with no way to be "asked again") would just be
   * confusing. LLM agents get a fresh decision instead because they're the
   * ones actually re-consulted when a plan goes stale.
   */
  revalidatePlans() {
    for (const player of this.players) {
      if (player.controller !== "llm") continue;

      const pending = player.pendingInteract;
      if (!pending) continue;

      const cell = getCell(this.map, pending.x, pending.y);
      if (!cell) continue;

      const teammate = this.teammateOf(player);
      const currentKind = actionsForCell(cell, player.item, teammate)[0]?.kind ?? null;

      if (currentKind !== pending.actionKind) {
        this.invalidatePlan(player, pending, "the situation there changed");
        continue;
      }

      // Only counters and boards have single-slot state that arrival order can
      // actually change — racing for a dispenser, trash or delivery window is
      // completely harmless, since nothing about them depends on who gets there
      // first.
      const contested = cell.type === "counter" || cell.type === "cuttingBoard";
      const raceLoss =
        contested &&
        teammate?.pendingInteract &&
        teammate.pendingInteract.x === pending.x &&
        teammate.pendingInteract.y === pending.y &&
        this.etaTicks(teammate) <= this.etaTicks(player);

      if (raceLoss) {
        this.invalidatePlan(player, pending, "your teammate is about to get there first");
      }
    }
  }

  invalidatePlan(player, pending, reason) {
    player.path = [];
    player.pendingInteract = null;
    player.walkProgress = 0;
    player.staleTarget = { x: pending.x, y: pending.y, reason };
    this.emit({ type: "plan-stale", playerId: player.id, x: pending.x, y: pending.y, reason });
  }

  stepPlayer(player) {
    if (player.path.length > 0) {
      player.walkProgress += player.walkSpeed;
      while (player.walkProgress >= 1 && player.path.length > 0) {
        const next = player.path[0];
        if (this.isOccupied(next, player)) {
          this.handleCollision(player, next);
          return;
        }
        player.walkProgress -= 1;
        player.path.shift();
        player.x = next.x;
        player.y = next.y;
      }

      if (player.path.length === 0 && player.pendingInteract) {
        this.interact(player, player.pendingInteract.x, player.pendingInteract.y);
        player.pendingInteract = null;
      }
      return;
    }

    player.walkProgress = 0;

    if (player.pendingInteract) {
      this.interact(player, player.pendingInteract.x, player.pendingInteract.y);
      player.pendingInteract = null;
    }
  }

  /** True while some other cook currently stands on this tile. */
  isOccupied(tile, ignorePlayer) {
    return this.players.some((p) => p !== ignorePlayer && p.x === tile.x && p.y === tile.y);
  }

  /**
   * A cook walks right up to the tile another cook occupies and stops one step
   * short, rather than pushing through — it got as far towards its target as it
   * could. Clearing the path makes the blocked cook idle immediately (same state
   * as finishing an action), which is exactly what triggers an LLM agent to be
   * asked for a fresh decision instead of repeatedly bumping into its teammate.
   */
  handleCollision(player, blockedTile) {
    const wasHeadingTo = player.pendingInteract ? { ...player.pendingInteract } : null;
    player.path = [];
    player.pendingInteract = null;
    player.walkProgress = 0;
    player.collidedWith = { x: blockedTile.x, y: blockedTile.y };
    this.emit({
      type: "collision",
      playerId: player.id,
      x: blockedTile.x,
      y: blockedTile.y,
      wasHeadingTo,
    });
  }

  interact(player, x, y) {
    const cell = getCell(this.map, x, y);
    if (!cell) return;

    const tile = TILES[cell.type];
    const before = { held: player.item, onTile: cell.item ?? null };

    if (tile.interact === "exchange") interactCounter(player, cell);
    if (tile.interact === "pickup") interactDispenser(player, cell);
    if (tile.interact === "trash") interactTrash(player);
    if (tile.interact === "cut") interactCuttingBoard(player, cell, this.players);

    let delivered = null;
    if (tile.interact === "deliver") {
      delivered = interactDelivery(player);
      if (delivered) {
        this.score++;
        this.onDeliver?.(this.score, delivered);
      }
    }

    const after = { held: player.item, onTile: cell.item ?? null };

    // The counter now holds what this cook walked up carrying — they set it
    // down (or swapped it in). Remembered so the action list can warn against
    // pointlessly picking it right back up. The mirror case — this cook now
    // holds what was on the counter — is remembered too, to warn against
    // putting it back down somewhere without ever using it.
    if (tile.interact === "exchange" && before.held && after.onTile === before.held) {
      player.lastPlaced = { x, y, item: before.held, tick: this.tick };
    }
    if (tile.interact === "exchange" && before.onTile && after.held === before.onTile) {
      player.lastTaken = { x, y, item: before.onTile, tick: this.tick };
    }

    this.emit({
      type: delivered ? "deliver" : "interact",
      playerId: player.id,
      x,
      y,
      target: INTERACT_LABELS[tile.interact] ?? cell.type,
      before,
      after,
      delivered,
      score: this.score,
    });
  }

  /** Clears held items, tile contents, positions and score — used between phases. */
  resetRound() {
    for (const row of this.map.cells) {
      for (const cell of row) {
        cell.item = null;
        cell.cutProgress = 0;
      }
    }

    const spawns = findSpawnTiles(this.map, this.players.length);
    this.players.forEach((player, i) => resetPlayer(player, spawns[i]));

    this.score = 0;
    this.tick = 0;
    this.onDeliver?.(0, null);
    this.emit({ type: "reset" });
  }

  loadMap(layoutText) {
    this.map = buildMap(layoutText);
    this.renderer.map = this.map;
    this.renderer.resize();
    this.resetRound();
  }
}
