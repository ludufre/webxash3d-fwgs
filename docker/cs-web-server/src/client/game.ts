import JSZip from "jszip";
import xashURL from "xash3d-fwgs/xash.wasm?url";
import gl4esURL from "xash3d-fwgs/libref_webgl2.wasm?url";
import { Xash3DWebRTC } from "./webrtc";
import { domManager } from "./dom";
import { updateProgressBar, hideProgressBar, showError } from "./ui";
import type { GameConfig, PlayerSettings } from "./types";

// ============================================
// Game Initialization
// ============================================

/**
 * Loads game configuration from server
 */
export async function loadGameConfig(): Promise<GameConfig> {
  return await fetch("/config").then((res) => res.json());
}

/**
 * Creates a new game instance with the provided configuration
 */
export function createGameInstance(config: GameConfig): Xash3DWebRTC {
  return new Xash3DWebRTC({
    canvas: domManager.elements.canvas,
    arguments: config.arguments || ["-windowed"],
    libraries: {
      filesystem: config.libraries.filesystem,
      xash: xashURL,
      menu: config.libraries.menu,
      server: config.libraries.server,
      client: config.libraries.client,
      render: {
        gl4es: gl4esURL,
      },
    },
    dynamicLibraries: config.dynamic_libraries,
    filesMap: config.files_map,
  });
}

/**
 * Loads game assets (valve.zip and extras)
 */
export async function loadGameAssets(
  config: GameConfig
): Promise<[JSZip, ArrayBuffer]> {
  // Download with progress (0-50%)
  const response = await fetch("valve.zip");

  if (!response.ok) {
    showError(
      "Error",
      "Failed to load valve.zip. Make sure the file exists in the correct location."
    );
    throw new Error("Failed to load valve.zip");
  }

  const contentLength = response.headers.get("content-length");
  const total = contentLength ? parseInt(contentLength, 10) : null;
  const reader = response.body!.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    if (total) {
      updateProgressBar((loaded / total) * 50);
    }
  }

  const buffer = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.length;
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    showError(
      "Error",
      "Failed to load valve.zip. The file appears to be missing or corrupted."
    );
    throw new Error("Invalid valve.zip file");
  }

  const extras = await fetch(config.libraries.extras).then((res) =>
    res.arrayBuffer()
  );

  return [zip, extras];
}

/**
 * Sets up the game file system with loaded assets
 */
export async function setupFileSystem(
  game: Xash3DWebRTC,
  zip: JSZip,
  extras: ArrayBuffer,
  gameDir: string
): Promise<void> {
  const entries = Object.entries(zip.files).filter(([, file]) => !file.dir);
  const total = entries.length;

  // Extraction with progress (50-100%)
  for (let i = 0; i < entries.length; i++) {
    const [path, file] = entries[i];
    const data = await file.async("uint8array");

    const fullPath = "/rodir/" + path;
    const dir = fullPath.substring(0, fullPath.lastIndexOf("/"));
    game.em.FS.mkdirTree(dir);
    game.em.FS.writeFile(fullPath, data);

    updateProgressBar(50 + ((i + 1) / total) * 50);
  }

  game.em.FS.writeFile(`/rodir/${gameDir}/extras.pk3`, new Uint8Array(extras));
  game.em.FS.chdir("/rodir");
  hideProgressBar();
}

// ============================================
// Game Configuration
// ============================================

/**
 * Applies player settings to the game
 */
export function applyGameSettings(
  game: Xash3DWebRTC,
  settings: PlayerSettings
): void {
  // Apply player name
  game.Cmd_ExecuteString(`name "${settings.username}"`);

  // Apply crosshair settings
  game.Cmd_ExecuteString(`cl_dynamiccrosshair 1`);
  game.Cmd_ExecuteString(`cl_crosshair_size ${settings.crosshairSize}`);
  game.Cmd_ExecuteString(`cl_crosshair_color "${settings.crosshairColor}"`);
  game.Cmd_ExecuteString(
    `cl_crosshair_translucent ${settings.crosshairTranslucent ? "1" : "0"}`
  );

  // Apply HUD settings
  game.Cmd_ExecuteString(`hud_centerid ${settings.hudCenterId ? "1" : "0"}`);

  // Apply volume
  game.Cmd_ExecuteString(`volume ${settings.volume / 100}`);

  // Apply sensitivity
  game.Cmd_ExecuteString(`sensitivity ${settings.sensitivity}`);
}

/**
 * Applies touch controls if enabled
 */
export function applyTouchControls(game: Xash3DWebRTC): void {
  const touchControls = domManager.elements.touchControls;
  if (touchControls.checked) {
    game.Cmd_ExecuteString("touch_enable 1");
  }
}

/**
 * Executes custom server commands from configuration
 */
export function applyServerCommands(
  game: Xash3DWebRTC,
  config: GameConfig
): void {
  if (config.console && Array.isArray(config.console)) {
    config.console.forEach((cmd: string) => {
      game.Cmd_ExecuteString(cmd);
    });
  }
}
