/**
 * Folders are the `collections` table: each link is in at most one folder, or in none ("No folder").
 * Ready-made folders let people start organizing in one click.
 */

export type Folder = {
  id: string;
  name: string;
  icon: string;
  /** Locked with the PIN: its links are hidden until the PIN is entered. */
  locked?: boolean;
};

export type FolderPreset = { name: string; icon: string; hint: string };

export const FOLDER_PRESETS: FolderPreset[] = [
  { icon: "💼", name: "Workspace", hint: "Docs, dashboards, team tools" },
  { icon: "⚡", name: "Productivity", hint: "Apps and tips to get more done" },
  { icon: "🛠️", name: "Tools", hint: "Utilities you come back to" },
  { icon: "🎯", name: "Focus", hint: "What matters this week" },
  { icon: "📚", name: "Reading list", hint: "Articles to read later" },
  { icon: "🎓", name: "Learning", hint: "Courses, tutorials, docs" },
  { icon: "💻", name: "Development", hint: "Code, libraries, references" },
  { icon: "🎨", name: "Design", hint: "Inspiration and resources" },
  { icon: "🤖", name: "AI", hint: "Models, prompts, AI tools" },
  { icon: "💡", name: "Ideas", hint: "Things that spark something" },
  { icon: "🎬", name: "Watch later", hint: "Videos and talks" },
  { icon: "💰", name: "Finance", hint: "Banking, investing, taxes" },
  { icon: "🛒", name: "Shopping", hint: "Wishlist and deals" },
  { icon: "✈️", name: "Travel", hint: "Trips, bookings, places" },
  { icon: "🍳", name: "Recipes", hint: "Meals to try" },
  { icon: "🏃", name: "Health", hint: "Fitness and wellbeing" },
];

/** Offered in one click to people who have no folders yet. */
export const QUICK_START_FOLDERS = FOLDER_PRESETS.slice(0, 4);

/** Icons to choose from for your own folders. */
export const FOLDER_ICONS = [
  "📁", "💼", "⚡", "🛠️", "🎯", "📚", "🎓", "💻", "🎨", "🤖", "💡", "🎬",
  "💰", "🛒", "✈️", "🍳", "🏃", "⭐", "🔥", "🧠", "📌", "🏠", "🎵", "🌱",
];

/** Folder names are compared without case or extra spaces when checking what already exists. */
export function folderKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}
