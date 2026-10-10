import type { Collection } from "./types";

export const collections: Collection[] = [
  {
    slug: "kitchen-dining",
    name: "Kitchen & Dining",
    description: "Stoneware, glass and wood pieces for coffee, prep and the table.",
    image: { src: "/images/collections/kitchen-dining.svg", alt: "Cutting board, glass pour-over set and stoneware mug on a counter", width: 1200, height: 900 },
  },
  {
    slug: "home-living",
    name: "Home & Living",
    description: "Throws, pillow covers and planters in a calm, neutral palette.",
    image: { src: "/images/collections/home-living.svg", alt: "Folded waffle knit throw, pillow cover and ceramic planter", width: 1200, height: 900 },
  },
  {
    slug: "desk-office",
    name: "Desk & Office",
    description: "Practical pieces that keep a workspace organized and comfortable to use.",
    image: { src: "/images/collections/desk-office.svg", alt: "Walnut monitor stand beside a hardcover notebook", width: 1200, height: 900 },
  },
  {
    slug: "travel-carry",
    name: "Travel & Carry",
    description: "Bags and organizers for weekends away and everyday carry.",
    image: { src: "/images/collections/travel-carry.svg", alt: "Waxed canvas weekender bag next to a canvas zip pouch", width: 1200, height: 900 },
  },
];
