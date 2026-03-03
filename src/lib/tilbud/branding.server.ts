import { existsSync, readFileSync } from "fs";
import { join } from "path";

const CANDIDATE_LOGO_PATHS = [
  "C:/Users/sebas/.cursor/projects/c-Users-sebas-Desktop-Ejendom-AI/assets/c__Users_sebas_AppData_Roaming_Cursor_User_workspaceStorage_859cfa0ea01a7c541157952b97315c5d_images_output-onlinepngtools__1_-29079fd3-9511-4364-8099-f35134e4ae2a.png",
  join(process.cwd(), "public", "hyde-logo.png"),
];

export function getHydeLogoBuffer(): Buffer | null {
  for (const path of CANDIDATE_LOGO_PATHS) {
    try {
      if (existsSync(path)) {
        return readFileSync(path);
      }
    } catch {
      // Try next candidate
    }
  }
  return null;
}
