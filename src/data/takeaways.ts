// Built-in takeaway places, available to every group without typing them in.
// A group can still save its own; if the names match, the group's version wins.
// Details checked against public listings, Nov 2026.
export interface DirectoryPlace {
  name: string;
  cuisine: string; // one of TAKEAWAY in seed.ts, e.g. 'Thai', 'Pizza'
  phone?: string;
  menuUrl?: string;
  suburb?: string;
  /** Other names people use, so "Laws" or "Jeff Laws" finds Laws Chinese. */
  aliases?: string[];
}

export const DIRECTORY: DirectoryPlace[] = [
  { name: 'Kinn Thai', cuisine: 'Thai', suburb: 'Kotara', phone: '02 4956 1572', menuUrl: 'https://www.ubereats.com/au/store/kinn-thai-restaurant-kotara/_UvSfDAfTXicbkNhBcCL8g', aliases: ['Kinn Thai Kotara', 'Kinn'] },
  { name: 'Otter Thai', cuisine: 'Thai', suburb: 'Belmont', phone: '0493 401 276', menuUrl: 'https://www.otterthai.com.au/', aliases: ['Otter Thai Belmont', 'Otter'] },
  { name: 'Laws Chinese', cuisine: 'Chinese', suburb: 'Pelican', phone: '02 4971 2165', menuUrl: 'https://pelicanrsl.com.au/', aliases: ["Jeff Law's", 'Jeff Laws', 'Pelican Chinese'] },
  { name: 'GYG', cuisine: 'Mexican', suburb: 'Belmont', phone: '02 4072 4350', menuUrl: 'https://www.guzmanygomez.com.au/?p=6883', aliases: ['GYG Belmont', 'Guzman y Gomez'] },
  { name: 'Caves Beach Fish and Chips', cuisine: 'Fish and chips', suburb: 'Caves Beach', phone: '02 4971 1978', aliases: ['Caves Beach Takeaway', 'Caves Beach fish'] },
  { name: 'Chicken and Chilli Co', cuisine: 'Takeaway', suburb: 'Swansea', menuUrl: 'https://www.chickenandchilli.co', aliases: ['Chicken & Chilli', 'Chicken and Chilli', 'Chilli Co'] },
];
