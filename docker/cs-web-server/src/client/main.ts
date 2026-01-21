import xashURL from "xash3d-fwgs/xash.wasm?url";
import gl4esURL from "xash3d-fwgs/libref_webgl2.wasm?url";
import type { Manifest, PreloadFile } from "xash3d-fwgs";
import { Xash3DWebRTC } from "./webrtc";

const touchControls = document.getElementById(
  "touchControls",
) as HTMLInputElement;
touchControls.addEventListener("change", () => {
  localStorage.setItem("touchControls", String(touchControls.checked));
});

let usernamePromiseResolve: (name: string) => void;
const usernamePromise = new Promise<string>((resolve) => {
  usernamePromiseResolve = resolve;
});

/**
 * Fetch essential files that must exist before the engine starts.
 * Since Asyncify conflicts with dlopen, we must preload all critical files.
 * This includes all WADs, configs, HUD definitions, sprites, events, and UI resources.
 */
async function fetchEssentialFiles(manifest: Manifest): Promise<PreloadFile[]> {
  // Files required by exact filename (matched anywhere in path)
  const essentialFilenames = [
    // Game directory detection
    "liblist.gam",
    "gameinfo.txt",
    "delta.lst",
    // WAD files (textures, fonts, graphics)
    "gfx.wad",
    "fonts.wad",
    "spraypaint.wad",
    "cstrike.wad",
    "decals.wad",
    "cached.wad",
    // GFX files
    "palette.lmp",
    "conback.lmp",
    "colormap.lmp",
    // Localization
    "gameui_english.txt",
    "valve_english.txt",
    "cstrike_english.txt",
    // Game config
    "sentences.txt",
    "materials.txt",
    "titles.txt",
    "valve.rc",
    "config.cfg",
    "default.cfg",
    "settings.scr",
    "user.scr",
    "autoexec.cfg",
    "listenserver.cfg",
    "language.cfg",
    // HUD/sprites definitions
    "hud.txt",
    "observer.txt",
    "weapontype.txt",
    // Keyboard bindings
    "kb_act.lst",
    "kb_def.lst",
    "kb_keys.lst",
    // Menu and UI
    "GameMenu.res",
    "ClientScheme.res",
    "TrackerScheme.res",
    "BackgroundLayout.txt",
    "BackgroundLoadingLayout.txt",
    "HD_BackgroundLayout.txt",
    "HD_BackgroundLoadingLayout.txt",
    // Buy menu
    "autobuy.txt",
    "rebuy.txt",
    "commandmenu.txt",
    "spectatormenu.txt",
    "spectcammenu.txt",
    // Font
    "marlett.ttf",
  ];

  // Directory patterns - preload files from these directories
  // Only include truly critical subdirectories
  const preloadDirectories = [
    "gfx/shell/",    // Keyboard bindings
    "gfx/vgui/",     // VGUI elements (but not fonts, handled separately)
  ];

  // Sprite files to preload (definitions and sprite images)
  const preloadSpritePatterns = [
    ".txt",          // HUD/weapon definitions
    ".spr",          // Sprite images (HUD elements, effects)
    "scope_arc",     // Sniper scope textures (critical)
  ];

  const preloadFiles: PreloadFile[] = [];
  const fetched = new Set<string>();

  // Batch fetch for better performance
  const fetchPromises: Array<{
    file: { path: string; url?: string };
    promise: Promise<Response>;
  }> = [];

  for (const file of manifest.files) {
    const filename = file.path.split("/").pop()?.toLowerCase();

    // Get relative path (remove game dir prefix like "valve/" or "cstrike/")
    const parts = file.path.split("/");
    const relativePath = parts.length > 1 ? parts.slice(1).join("/").toLowerCase() : "";

    // Check if filename matches essential list
    const matchesFilename = filename && essentialFilenames.includes(filename);

    // Check if file is in a preload directory
    const matchesDirectory = preloadDirectories.some((dir) =>
      relativePath.startsWith(dir)
    );

    // Check if it's a sprite file that matches our patterns
    const isCriticalSprite =
      relativePath.startsWith("sprites/") &&
      preloadSpritePatterns.some((pattern) => relativePath.includes(pattern));

    // Check if it's a VGUI font file (no extension in filename)
    const isVguiFont =
      relativePath.startsWith("gfx/vgui/fonts/") && filename && !filename.includes(".");

    if (
      (matchesFilename || matchesDirectory || isCriticalSprite || isVguiFont) &&
      !fetched.has(file.path)
    ) {
      fetched.add(file.path);
      const url = file.url || manifest.baseUrl + file.path;
      fetchPromises.push({
        file,
        promise: fetch(url),
      });
    }
  }

  console.log(`[Main] Fetching ${fetchPromises.length} essential files...`);

  // Fetch in parallel batches of 20 to avoid overwhelming the browser
  const batchSize = 20;
  for (let i = 0; i < fetchPromises.length; i += batchSize) {
    const batch = fetchPromises.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(async ({ file, promise }) => {
        try {
          const response = await promise;
          if (response.ok) {
            const data = new Uint8Array(await response.arrayBuffer());
            return {
              path: manifest.basePath + file.path,
              data,
            };
          }
        } catch (e) {
          console.warn(`[Main] Failed to fetch: ${file.path}`, e);
        }
        return null;
      })
    );

    for (const result of results) {
      if (result.status === "fulfilled" && result.value) {
        preloadFiles.push(result.value);
      }
    }
  }

  console.log(`[Main] Preloaded ${preloadFiles.length} essential files`);
  return preloadFiles;
}

async function main() {
  // Load dynamic configuration from server (environment variables)
  const config = (await fetch("/config").then((res) => res.json())) as Awaited<{
    arguments: string[];
    console: string[];
    game_dir: string;
    libraries: {
      client: string;
      server: string;
      extras: string;
      menu: string;
      filesystem: string;
    };
    dynamic_libraries: string[];
    files_map: Record<string, string>;
  }>;

  // Load manifest and fetch essential files before engine initialization
  const manifest: Manifest = await fetch("/manifest.json").then((r) =>
    r.json(),
  );
  const preloadFiles = await fetchEssentialFiles(manifest);

  // Use URLs directly from server config (no imports needed)
  const x = new Xash3DWebRTC({
    canvas: document.getElementById("canvas") as HTMLCanvasElement,
    manifest,
    preloadFiles,
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
    module: {
      print: (text: string) => {
        console.log(`[Xash3D Log] ${text}`);
      },
      printErr: (text: string) => {
        console.error(`[Xash3D Err] ${text}`);
      },
    },
  });

  const extras = await fetch(config.libraries.extras).then((r) =>
    r.arrayBuffer(),
  );
  await x.init();

  x.em.FS.mkdirTree(`/rodir/${config.game_dir}`);
  x.em.FS.writeFile(
    `/rodir/${config.game_dir}/extras.pk3`,
    new Uint8Array(extras),
  );
  x.em.FS.chdir("/rodir");

  document.getElementById("logo")!.style.animationName = "pulsate-end";
  document.getElementById("logo")!.style.animationFillMode = "forwards";
  document.getElementById("logo")!.style.animationIterationCount = "1";
  document.getElementById("logo")!.style.animationDirection = "normal";

  const username = await usernamePromise;
  x.main();
  if (touchControls.checked) {
    x.Cmd_ExecuteString("touch_enable 1");
  }
  x.Cmd_ExecuteString(`name "${username}"`);

  // Execute custom server commands
  if (config.console && Array.isArray(config.console)) {
    config.console.forEach((cmd: string) => {
      x.Cmd_ExecuteString(cmd);
    });
  }

  x.Cmd_ExecuteString("connect 127.0.0.1:8080");

  window.addEventListener("beforeunload", (event) => {
    event.preventDefault();
    event.returnValue = "";
    return "";
  });
}
const enableTouch = localStorage.getItem("touchControls");
if (enableTouch === null) {
  const isMobile = !window.matchMedia("(hover: hover)").matches;
  touchControls.checked = isMobile;
  localStorage.setItem("touchControls", String(isMobile));
} else {
  touchControls.checked = enableTouch === "true";
}

const username = localStorage.getItem("username");
if (username) {
  (document.getElementById("username") as HTMLInputElement).value = username;
}

(document.getElementById("form") as HTMLFormElement).addEventListener(
  "submit",
  (e) => {
    e.preventDefault();
    const username = (document.getElementById("username") as HTMLInputElement)
      .value;
    localStorage.setItem("username", username);
    (document.getElementById("form") as HTMLFormElement).style.display = "none";
    (document.getElementById("social") as HTMLDivElement).style.display =
      "none";
    usernamePromiseResolve(username);
  },
);

main();
