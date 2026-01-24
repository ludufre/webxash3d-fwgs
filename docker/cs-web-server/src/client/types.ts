// ============================================
// Type Definitions
// ============================================

export interface PlayerSettings {
  username: string;
  crosshairSize: string;
  crosshairColor: string;
  crosshairTranslucent: boolean;
  hudCenterId: boolean;
  volume: number;
  sensitivity: number;
}

export interface GameConfig {
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
}
