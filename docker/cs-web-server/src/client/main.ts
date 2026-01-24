import {
  loadGameConfig,
  createGameInstance,
  loadGameAssets,
  setupFileSystem,
  applyGameSettings,
  applyTouchControls,
  applyServerCommands,
} from "./game";
import { hideLoadingLogo, hideScanlineEffect } from "./ui";
import { setupEventHandlers } from "./events";
import type { PlayerSettings } from "./types";

// ============================================
// Main Application
// ============================================

let settingsPromiseResolve: (settings: PlayerSettings) => void;
const settingsPromise = new Promise<PlayerSettings>((resolve) => {
  settingsPromiseResolve = resolve;
});

async function main() {
  const config = await loadGameConfig();
  const game = createGameInstance(config);

  const [assets] = await Promise.all([loadGameAssets(config), game.init()]);
  const [zip, extras] = assets;

  await setupFileSystem(game, zip, extras, config.game_dir);

  hideLoadingLogo();

  const settings = await settingsPromise;
  game.main();
  hideScanlineEffect();

  applyGameSettings(game, settings);
  applyTouchControls(game);
  applyServerCommands(game, config);

  game.Cmd_ExecuteString("connect 127.0.0.1:8080");

  window.addEventListener("beforeunload", (event) => {
    event.preventDefault();
    event.returnValue = "";
    return "";
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      (game as any).SDL2.audioContext.suspend();
    } else {
      (game as any).SDL2.audioContext.resume();
    }
  });
}

function init(): void {
  setupEventHandlers((settings) => {
    settingsPromiseResolve(settings);
  });
  main();
}

init();
