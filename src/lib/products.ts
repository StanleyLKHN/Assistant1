export type Product = {
  slug: string;
  name: string;
  category: string;
  price: number;
  description: string;
  in_stock: boolean;
};

export const products: Product[] = [
  {
    slug: 'oatmeal-coat',
    name: 'Oatmeal Coat',
    category: 'outerwear',
    price: 480,
    description:
      'A relaxed wool-blend overcoat in soft oatmeal, woven from reclaimed fibers. Tailored for cool-weather layering with a quiet, lived-in elegance.',
    in_stock: true,
  },
  {
    slug: 'zero-waste-shoes',
    name: 'Zero-Waste Shoes',
    category: 'footwear',
    price: 220,
    description:
      'Low-profile sneakers cut and stitched entirely from atelier offcuts so nothing is left behind. Cushioned, durable, and quietly distinctive on foot.',
    in_stock: true,
  },
  {
    slug: 'fabric-light-coat',
    name: 'Fabric Light Coat',
    category: 'outerwear',
    price: 360,
    description:
      'A featherweight transitional coat in a crisp recycled-cotton shell. Cut for movement and easy layering through shoulder seasons.',
    in_stock: true,
  },
  {
    slug: 'reworked-palm-jeans',
    name: 'Reworked Palm Jeans',
    category: 'denim',
    price: 195,
    description:
      'Vintage denim reworked with hand-painted palm motifs along the hem. Each pair is one-of-one and finished by hand in our atelier.',
    in_stock: true,
  },
];
