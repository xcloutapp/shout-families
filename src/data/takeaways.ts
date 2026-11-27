// Built-in takeaway places, available to every group without typing them in.
// A group can still save its own; if the names match, the group's version wins.
export interface DirectoryPlace {
  name: string;
  cuisine: string; // one of TAKEAWAY in seed.ts, e.g. 'Thai', 'Pizza'
  phone?: string;
  menuUrl?: string;
  suburb?: string;
}

export const DIRECTORY: DirectoryPlace[] = [];
